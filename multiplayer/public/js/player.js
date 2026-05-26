const socket = io();

// APE ARISTOCRACY DEFAULT NAMES
const DEFAULT_NAMES = [
  "Archduke Orangutan", "Duchess Chimpanzee", "Baroness Baboon", 
  "Count Gibbon", "Lord Gorilla", "Viscount Mandrill", 
  "Lady Lemur", "Sir Chimp", "Countess Marmoset", "Marquise Macaque",
  "Baron Capuchin", "Duke Mandrill", "Lady Tamarin", "Earl Baboon"
];

// STATE OBJECT
const clientState = {
  playerId: null,
  playerName: null,
  avatar: "🦁", // Default selected avatar
  hand: [],
  selectedCards: [],
  isMyTurn: false,
  myBidTotal: 0,
  highestBid: 0,
  auctionType: null,
  status: "waiting",
  hadTurn: false // Lock to play turn audio chime only once
};

// HTML ELEMENTS BINDINGS
const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const playerNameInput = document.getElementById('player-name');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');
const avatarItems = document.querySelectorAll('.avatar-item');
const lobbyRosterSection = document.getElementById('lobby-roster-section');
const lobbyPlayersList = document.getElementById('lobby-players-list');
const lobbyActionRow = document.getElementById('lobby-action-row');

const deckCountBadge = document.getElementById('deck-count-badge');
const triggersCountBadge = document.getElementById('triggers-count-badge');
const playersDashboard = document.getElementById('players-dashboard');
const auctionStageInfo = document.getElementById('auction-stage-info');
const cardStage = document.getElementById('card-stage');
const highestBidBadge = document.getElementById('highest-bid-badge');
const turnTimerContainer = document.getElementById('turn-timer-container');
const turnTimerBar = document.getElementById('turn-timer-bar');
const turnTimerText = document.getElementById('turn-timer-text');

const turnBanner = document.getElementById('turn-banner');
const selectedBillsTray = document.getElementById('selected-bills-tray');
const selectedBidTotal = document.getElementById('selected-bid-total');
const submitBidBtn = document.getElementById('submit-bid-btn');
const passBtn = document.getElementById('pass-btn');
const actionErrorMsg = document.getElementById('action-error-msg');
const myTheftStatus = document.getElementById('my-theft-status');
const billsContainer = document.getElementById('bills-container');
const logTicker = document.getElementById('log-ticker');

const finishScreen = document.getElementById('finish-screen');
const resultsTbody = document.getElementById('results-tbody');
const restartBtn = document.getElementById('restart-btn');

let countdownInterval = null;

// ==========================================================================
// SESSION MANAGEMENT (LOBBY / RECONNECT)
// ==========================================================================

window.addEventListener('DOMContentLoaded', () => {
  // Pre-populate with random fun name
  const cachedName = localStorage.getItem('highSocietyPlayerName');
  if (cachedName) {
    playerNameInput.value = cachedName;
  } else {
    const randomName = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
    playerNameInput.value = randomName;
  }

  // Pre-select avatar from cache if exists
  const cachedAvatar = localStorage.getItem('highSocietyPlayerAvatar');
  if (cachedAvatar) {
    clientState.avatar = cachedAvatar;
    avatarItems.forEach(item => {
      if (item.getAttribute('data-avatar') === cachedAvatar) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });
  }

  // Auto reconnect
  const cachedId = localStorage.getItem('highSocietyPlayerId');
  if (cachedId && cachedName) {
    clientState.playerId = cachedId;
    clientState.playerName = cachedName;
    socket.emit('joinPlayer', { name: cachedName, playerId: cachedId, avatar: clientState.avatar });
  }
});

// Avatar selection click grid triggers
avatarItems.forEach(item => {
  item.addEventListener('click', () => {
    avatarItems.forEach(i => i.classList.remove('selected'));
    item.classList.add('selected');
    clientState.avatar = item.getAttribute('data-avatar');
    localStorage.setItem('highSocietyPlayerAvatar', clientState.avatar);
  });
});

joinBtn.addEventListener('click', joinGame);
playerNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinGame();
});

function joinGame() {
  const name = playerNameInput.value.trim();
  if (name === "") {
    showJoinError("Please enter a valid name.");
    return;
  }
  joinBtn.disabled = true;
  socket.emit('joinPlayer', { name, avatar: clientState.avatar });
}

function showJoinError(msg) {
  joinError.textContent = msg;
  joinError.style.display = 'block';
  joinBtn.disabled = false;
}

// Socket responses
socket.on('joinSuccess', ({ playerId, name, avatar }) => {
  localStorage.setItem('highSocietyPlayerId', playerId);
  localStorage.setItem('highSocietyPlayerName', name);
  localStorage.setItem('highSocietyPlayerAvatar', avatar);
  clientState.playerId = playerId;
  clientState.playerName = name;
  clientState.avatar = avatar;

  joinError.style.display = 'none';
  lobbyRosterSection.style.display = 'block';
  joinBtn.style.display = 'none';
  playerNameInput.disabled = true;
});

socket.on('joinFailed', (msg) => {
  showJoinError(msg);
  localStorage.removeItem('highSocietyPlayerId');
  localStorage.removeItem('highSocietyPlayerName');
});

socket.on('kicked', () => {
  localStorage.removeItem('highSocietyPlayerId');
  localStorage.removeItem('highSocietyPlayerName');
  clientState.playerId = null;
  clientState.playerName = null;
  clientState.selectedCards = [];

  gameView.style.display = 'none';
  joinView.style.display = 'block';
  lobbyRosterSection.style.display = 'none';
  joinBtn.style.display = 'block';
  joinBtn.disabled = false;
  playerNameInput.disabled = false;
  
  // Pick new name
  playerNameInput.value = DEFAULT_NAMES[Math.floor(Math.random() * DEFAULT_NAMES.length)];
  
  showJoinError("You were kicked from the lobby by the host.");
});

socket.on('actionError', (msg) => {
  actionErrorMsg.textContent = msg;
  actionErrorMsg.style.display = 'block';
  setTimeout(() => {
    actionErrorMsg.style.display = 'none';
  }, 4000);
});

// ==========================================================================
// AUDIO SYNTHESIS cue (WEB AUDIO API)
// ==========================================================================

function playTurnChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play dual oscillator tone bell chord
    const playTone = (freq, delay, duration, volume) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
      
      gain.gain.setValueAtTime(0, ctx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + duration);
    };
    
    // synthesized elegant crystal chord strike: E5 & B5 & E6
    playTone(659.25, 0, 1.4, 0.2); // E5
    playTone(987.77, 0.05, 1.2, 0.15); // B5
    playTone(1318.51, 0.1, 1.0, 0.1); // E6
  } catch (e) {
    console.warn("Audio context chime was blocked or not supported:", e);
  }
}

// ==========================================================================
// REAL-TIME RENDER ENGINE
// ==========================================================================

socket.on('playerStateUpdate', (state) => {
  clientState.hand = state.hand;
  clientState.isMyTurn = state.isMyTurn;
  clientState.myBidTotal = state.myBidTotal;
  clientState.highestBid = state.highestBid;
  clientState.auctionType = state.auctionType;
  clientState.status = state.status;

  // Lobby rendering if waiting
  if (state.status === "waiting") {
    joinView.style.display = 'block';
    gameView.style.display = 'none';
    finishScreen.style.display = 'none';
    renderLobbyRoster(state.players);
    return;
  }

  // Active game view trigger
  joinView.style.display = 'none';
  gameView.style.display = 'flex';

  // Chime trigger exactly once when turn starts, toggle active turn body glow class
  if (state.isMyTurn || state.isMyDiscardTurn) {
    document.body.classList.add('my-turn-active');
    if (!clientState.hadTurn) {
      clientState.hadTurn = true;
      playTurnChime();
    }
  } else {
    document.body.classList.remove('my-turn-active');
    clientState.hadTurn = false;
  }

  // Clear local selected cards buffer if bidding turn transitions away or status isn't in_progress
  if (!state.isMyTurn || state.status !== "in_progress") {
    clientState.selectedCards = [];
  }

  // 1. Header counts
  deckCountBadge.textContent = `Cards: ${state.deckCount}`;
  triggersCountBadge.textContent = `Triggers: ${state.endGameTriggersRevealed}/4`;

  // 2. Collapsible Chronicles Logs
  renderLogsTicker(state.gameLog);

  // 3. Leaderboard Overlay if Finished
  if (state.status === "finished") {
    renderLeaderboard(state.gameResults);
    clearInterval(countdownInterval);
    turnTimerContainer.style.display = 'none';
    return;
  } else {
    finishScreen.style.display = 'none';
  }

  // 4. Seats Dashboard Grid (Upper Deck)
  renderPlayerSeats(state.players, state.currentPlayerIndex);

  // 5. Central Card rendering
  renderAuctionCard(state.currentCard, state.auctionType, state.status, state.players);

  // 6. Turn countdown ticking
  startCountdown(state.turnEndsAt, state.status);

  // 7. Console action updating
  renderTurnBanner(state.isMyTurn, state.currentPlayerName, state.status, state.isMyDiscardTurn, state.discardPlayerName);
  
  if (state.isMyDiscardTurn) {
    renderDiscardChoices(state.players[state.myIndex]);
  } else {
    renderHand(state.hand, state.isMyTurn);
  }
  
  updateBiddingControls();
});

// Render waiting roster
function renderLobbyRoster(players) {
  // Update roster players
  lobbyPlayersList.innerHTML = players.map(p => `
    <div class="mini-card" style="padding: 6px 12px; font-size: 0.9rem; display: flex; align-items: center; gap: 6px;">
      <span>${p.avatar} ${p.name}</span>
      ${p.id !== clientState.playerId && players[0].id === clientState.playerId
        ? `<span class="kick-btn" data-id="${p.id}" style="color: #ff4d4d; font-weight: bold; cursor: pointer; margin-left: 4px;">&times;</span>`
        : ''
      }
    </div>
  `).join("");

  // Kick buttons hook
  const kickBtns = lobbyPlayersList.querySelectorAll('.kick-btn');
  kickBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pId = e.target.getAttribute('data-id');
      socket.emit('kickPlayer', { playerId: pId });
    });
  });

  // Start game controls
  const isLeader = players.length > 0 && players[0].id === clientState.playerId;
  if (isLeader) {
    let actionHTML = '';
    if (players.length >= 3) {
      actionHTML += `<button id="start-game-btn" class="btn-primary" style="padding: 12px 30px; font-size: 0.95rem; margin-bottom: 8px;">Start Game Session</button>`;
    } else {
      actionHTML += `<div style="font-size: 0.8rem; color: var(--gold-primary); font-weight:600; text-transform: uppercase; margin-bottom: 8px;">Awaiting Players (${players.length}/5)...</div>`;
    }
    
    if (players.length < 5) {
      actionHTML += `<button id="add-cpu-btn" class="btn-secondary" style="padding: 8px 16px; font-size: 0.85rem; background: rgba(223, 186, 89, 0.05); border: 1px dashed var(--gold-primary); color: var(--gold-light); cursor: pointer; border-radius: 6px; transition: all 0.2s;">Add AI Player</button>`;
    }
    
    lobbyActionRow.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">${actionHTML}</div>`;
    
    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => socket.emit('startGame'));
    }
    
    const addCpuBtn = document.getElementById('add-cpu-btn');
    if (addCpuBtn) {
      addCpuBtn.addEventListener('click', () => socket.emit('addCpuPlayer'));
    }
  } else {
    lobbyActionRow.innerHTML = `<div style="font-size: 0.8rem; opacity: 0.7;">Waiting for lobby leader ${players[0] ? players[0].name : ''} to start...</div>`;
  }
}

function formatCardLabel(c) {
  if (c.name === 'Passé') return '—';
  return c.name;
}

// Render player seats dashboard
function renderPlayerSeats(players, currentPlayerIndex) {
  playersDashboard.innerHTML = "";
  
  players.forEach((p, idx) => {
    const isCurrentTurn = idx === currentPlayerIndex;
    const seatCard = document.createElement('div');
    seatCard.className = `player-seat-card${isCurrentTurn ? ' active-turn' : ''}${p.hasPassed ? ' passed' : ''}`;
    
    // Online dot
    const connDot = `<span class="dot-status${p.connected ? '' : ' offline'}"></span>`;
    
    // tableau HTML
    const tableauHTML = p.tableau.map(c => {
      const isPenalty = c.type === 'penalty';
      const label = formatCardLabel(c);
      return `<span class="player-seat-mini-card${isPenalty ? ' penalty' : ''}" title="${c.name}">${label}</span>`;
    }).join("");

    // Render committed bills list
    let billsListHTML = "";
    if (p.currentBid.length > 0) {
      billsListHTML = p.currentBid.map(val => `
        <span class="player-seat-mini-card" style="border-color: #60a5fa; background: rgba(96,165,250,0.1); color: #93c5fd; font-size: 0.55rem; padding: 1px 3px;">
          $${val/1000}k
        </span>
      `).join(" ");
    }

    seatCard.innerHTML = `
      ${connDot}
      <div class="player-seat-avatar">${p.avatar}</div>
      <div class="player-seat-name">${p.name}</div>
      <div class="player-seat-bid">${p.bidTotal > 0 ? `$${p.bidTotal/1000}k` : '$0'}</div>
      ${p.currentBid.length > 0 ? `<div style="display:flex; gap:2px; flex-wrap:wrap; justify-content:center; margin-bottom:4px; max-width:90px;">${billsListHTML}</div>` : ''}
      <div style="font-size: 0.6rem; color: var(--gold-primary); font-weight: 700; margin-top: 2px;">Score: ${p.score} pts</div>
      <div class="player-seat-cards" style="width: 100%; margin-top: 4px;">
        ${tableauHTML || '<span style="font-size:0.55rem; opacity:0.35; font-style:italic;">No assets</span>'}
      </div>
      <div style="font-size: 0.55rem; opacity: 0.6; margin-top: 4px; font-weight: bold;">Hand: ${p.cardsCount} cards</div>
      ${p.pendingTheft > 0 ? `<div style="color:#ff9999; font-size:0.5rem; font-weight:bold; margin-top:2px;">THEFT: ${p.pendingTheft}</div>` : ''}
    `;

    playersDashboard.appendChild(seatCard);
  });
}

// Render active card Stage
function renderAuctionCard(card, type, status, players) {
  if (!card) {
    cardStage.innerHTML = `<div style="font-size: 0.9rem; opacity: 0.6; padding: 15px;">Preparing next round...</div>`;
    highestBidBadge.style.display = 'none';
    return;
  }

  highestBidBadge.style.display = 'block';

  // Find who has the highest bid
  let bidderName = "No one";
  if (clientState.highestBid > 0) {
    const topBidder = players.find(p => p.bidTotal === clientState.highestBid && !p.hasPassed);
    if (topBidder) bidderName = topBidder.name;
  }

  highestBidBadge.innerHTML = `
    Highest Bid on Table: <strong style="color: #60a5fa;">$${clientState.highestBid / 1000}k</strong> (by <strong>${bidderName}</strong>)<br>
    Your Committed Bid: <strong>$${clientState.myBidTotal / 1000}k</strong>
  `;

  const isPositive = type === 'positive';
  auctionStageInfo.textContent = isPositive ? "Bidding to ACQUIRE" : "Bidding to AVOID";
  
  let typeText = "Luxury Point";
  if (card.type === 'multiplier') typeText = "Multiplier (Double)";
  if (card.type === 'penalty') {
    if (card.name === 'Scandal') typeText = "Disgrace (Halve Score)";
    else if (card.name === 'Passé') typeText = "Disgrace (Discard Card)";
    else typeText = "Disgrace (-5 points)";
  }

  const cardClass = isPositive ? 'positive' : 'negative';
  
  // Format central value
  let valDisplay = card.value;
  if (card.type === 'point') valDisplay = `+${card.value}`;
  if (card.type === 'multiplier') valDisplay = `x2`;
  if (card.name === 'Scandal') valDisplay = `x½`;
  if (card.name === 'Passé') valDisplay = `—`;
  if (card.name === 'Faux Pas') valDisplay = `-5`;

  cardStage.innerHTML = `
    <div class="auction-card ${cardClass} float-animation">
      <div class="card-top">${typeText}</div>
      <div class="card-center">${valDisplay}</div>
      <div class="card-bottom">${card.name}</div>
    </div>
  `;
}

// 30s COUNTDOWN SYSTEM
function startCountdown(turnEndsAt, status) {
  if (countdownInterval) clearInterval(countdownInterval);
  
  if (!turnEndsAt || (status !== "in_progress" && status !== "pending_discard")) {
    turnTimerContainer.style.display = 'none';
    return;
  }

  turnTimerContainer.style.display = 'block';

  const tick = () => {
    const remaining = Math.max(0, turnEndsAt - Date.now());
    const pct = (remaining / 30000) * 100;
    const sec = Math.ceil(remaining / 1000);
    
    turnTimerBar.style.width = `${pct}%`;
    turnTimerText.textContent = `Time Left: ${sec}s`;
    
    if (sec <= 8) {
      turnTimerBar.style.background = '#ff4d4d';
      turnTimerText.style.color = '#ff9999';
    } else {
      turnTimerBar.style.background = 'linear-gradient(90deg, #5cd699 0%, #dfba59 60%, #ff4d4d 100%)';
      turnTimerText.style.color = '#fff';
    }
    
    if (remaining <= 0) {
      clearInterval(countdownInterval);
    }
  };

  tick();
  countdownInterval = setInterval(tick, 100);
}

// Render player controls
function renderTurnBanner(isMyTurn, activeName, status, isMyDiscardTurn, discardPlayerName) {
  turnBanner.className = "turn-banner";
  
  if (status === "round_over") {
    turnBanner.textContent = "Round resolved! Processing payouts...";
    turnBanner.classList.add("turn-waiting");
    return;
  }

  if (status === "pending_discard") {
    if (isMyDiscardTurn) {
      turnBanner.textContent = "DISCARD A POINT CARD! SELECT A CARD FROM YOUR TABLEAU TO DISCARD.";
      turnBanner.classList.add("turn-mine");
    } else {
      turnBanner.textContent = `Waiting for ${discardPlayerName || "player"} to discard a Point card...`;
      turnBanner.classList.add("turn-waiting");
    }
    return;
  }

  if (isMyTurn) {
    turnBanner.textContent = "YOUR TURN! RAISE THE BID OR PASS.";
    turnBanner.classList.add("turn-mine");
  } else {
    turnBanner.textContent = `Waiting for ${activeName || "another player"}...`;
    turnBanner.classList.add("turn-waiting");
  }
}

function renderHand(hand, isMyTurn) {
  billsContainer.innerHTML = "";
  
  if (hand.length === 0) {
    billsContainer.innerHTML = `<div style="font-size: 0.8rem; opacity: 0.5; padding: 10px;">Empty hand</div>`;
    return;
  }

  hand.forEach((cardVal, index) => {
    const duplicateCountInHand = hand.filter(v => v === cardVal).length;
    const occurrenceIndexInHand = hand.slice(0, index + 1).filter(v => v === cardVal).length;
    const occurrenceSelectedCount = clientState.selectedCards.filter(v => v === cardVal).length;
    
    const selected = occurrenceIndexInHand <= occurrenceSelectedCount;

    const bill = document.createElement('div');
    bill.className = `banknote${selected ? ' selected' : ''}${!isMyTurn ? ' disabled' : ''}`;
    
    bill.innerHTML = `
      <div class="bill-val-small">$${cardVal / 1000}k</div>
      <div class="bill-val-center">$${cardVal / 1000}k</div>
      <div class="bill-val-small" style="text-align: right;">$${cardVal / 1000}k</div>
    `;

    bill.addEventListener('click', () => {
      if (!isMyTurn || clientState.status !== "in_progress") return;
      toggleBillSelection(cardVal, selected);
    });

    billsContainer.appendChild(bill);
  });
}

function renderDiscardChoices(me) {
  billsContainer.innerHTML = "";
  if (!me) return;
  
  const pointCards = me.tableau.filter(c => c.type === 'point');
  if (pointCards.length === 0) {
    billsContainer.innerHTML = `<div style="font-size: 0.8rem; opacity: 0.5; padding: 10px;">No point cards to discard. Waiting for server...</div>`;
    return;
  }

  pointCards.forEach((card) => {
    const discardCard = document.createElement('div');
    discardCard.className = `banknote discard-choice`;
    // Gorgeous custom crimson glow styling
    discardCard.style.border = "2px solid #ef4444";
    discardCard.style.background = "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(127, 29, 29, 0.4) 100%)";
    discardCard.style.color = "#fca5a5";
    discardCard.style.boxShadow = "0 0 12px rgba(239, 68, 68, 0.4)";
    
    discardCard.innerHTML = `
      <div class="bill-val-small" style="color: #fca5a5;">+${card.value}</div>
      <div class="bill-val-center" style="font-size: 1.5rem; text-shadow: 0 0 5px rgba(239, 68, 68, 0.6); color: #fca5a5;">+${card.value}</div>
      <div class="bill-val-small" style="text-align: right; color: #fca5a5;">DISCARD</div>
    `;

    discardCard.addEventListener('click', () => {
      socket.emit('selectDiscard', { cardName: card.name });
    });

    billsContainer.appendChild(discardCard);
  });
}

function toggleBillSelection(value, isAlreadySelected) {
  if (isAlreadySelected) {
    const idx = clientState.selectedCards.indexOf(value);
    if (idx !== -1) {
      clientState.selectedCards.splice(idx, 1);
    }
  } else {
    clientState.selectedCards.push(value);
  }
  
  renderHand(clientState.hand, clientState.isMyTurn);
  updateBiddingControls();
}

function updateBiddingControls() {
  selectedBillsTray.innerHTML = "";
  
  const increaseSum = clientState.selectedCards.reduce((sum, val) => sum + val, 0);
  const totalProposedBid = clientState.myBidTotal + increaseSum;

  selectedBidTotal.innerHTML = `$${increaseSum / 1000}k <span style="font-size: 0.75rem; font-weight: normal; opacity: 0.7;">(Total Bid: $${totalProposedBid / 1000}k)</span>`;

  if (clientState.selectedCards.length === 0) {
    selectedBillsTray.innerHTML = `<div style="font-size: 0.75rem; opacity: 0.4;">Select money cards below to add to your bid...</div>`;
    submitBidBtn.disabled = true;
  } else {
    clientState.selectedCards.sort((a,b) => a - b).forEach(val => {
      const miniBill = document.createElement('div');
      miniBill.className = 'mini-card';
      miniBill.textContent = `$${val / 1000}k`;
      miniBill.addEventListener('click', () => {
        if (!clientState.isMyTurn) return;
        toggleBillSelection(val, true);
      });
      selectedBillsTray.appendChild(miniBill);
    });

    if (clientState.isMyTurn && clientState.status === "in_progress") {
      submitBidBtn.disabled = totalProposedBid <= clientState.highestBid;
    } else {
      submitBidBtn.disabled = true;
    }
  }

  if (clientState.isMyTurn && clientState.status === "in_progress") {
    passBtn.disabled = false;
  } else {
    submitBidBtn.disabled = true;
    passBtn.disabled = true;
  }
}

// LOGS RENDERING
function renderLogsTicker(logs) {
  logTicker.innerHTML = "";
  if (logs.length === 0) {
    logTicker.innerHTML = `<div style="font-size: 0.75rem; opacity: 0.4;">Chronicle entries will populate as bidding triggers...</div>`;
    return;
  }
  logs.forEach(log => {
    const item = document.createElement('div');
    item.className = `log-entry ${log.type}`;
    item.innerHTML = `
      <span class="time">${log.timestamp}</span>
      <span>${log.text}</span>
    `;
    logTicker.appendChild(item);
  });
  logTicker.scrollTop = logTicker.scrollHeight;
}

socket.on('logUpdate', (log) => {
  // If collapsible logger is rendered, append log
  const existingLogItems = logTicker.querySelectorAll('.log-entry');
  if (existingLogItems.length > 50) {
    logTicker.removeChild(existingLogItems[0]);
  }
  
  const item = document.createElement('div');
  item.className = `log-entry ${log.type}`;
  item.innerHTML = `
    <span class="time">${log.timestamp}</span>
    <span>${log.text}</span>
  `;
  logTicker.appendChild(item);
  logTicker.scrollTop = logTicker.scrollHeight;
});

// ==========================================================================
// RESULTS / LEADERBOARD SCOREBOARD
// ==========================================================================

function renderLeaderboard(results) {
  if (!results) return;

  resultsTbody.innerHTML = "";
  finishScreen.style.display = 'flex';

  results.rankings.forEach(p => {
    const assetsHTML = p.tableau.map(c => `
      <span class="mini-card${c.type === 'penalty' ? ' penalty' : ''}">${c.name}</span>
    `).join(" ");

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>#${p.rank}</strong></td>
      <td style="color: var(--gold-primary); font-weight: 700;">${p.avatar} ${p.name}</td>
      <td style="font-weight: 800;">${p.score} pts</td>
      <td>$${p.cash / 1000}k</td>
      <td><div style="display:flex; gap:3px; flex-wrap:wrap;">${assetsHTML || '<span style="opacity:0.4;">None</span>'}</div></td>
    `;
    resultsTbody.appendChild(row);
  });

  results.eliminated.forEach(p => {
    const assetsHTML = p.tableau.map(c => `
      <span class="mini-card${c.type === 'penalty' ? ' penalty' : ''}">${c.name}</span>
    `).join(" ");

    const row = document.createElement('tr');
    row.className = "eliminated-row";
    row.innerHTML = `
      <td><span class="badge-eliminated">OUT</span></td>
      <td style="text-decoration: line-through;">💀 ${p.avatar} ${p.name}</td>
      <td>${p.score} pts</td>
      <td style="font-weight: bold; color: #ff9999;">$${p.cash / 1000}k (Least Cash)</td>
      <td><div style="display:flex; gap:3px; flex-wrap:wrap; filter: grayscale(1);">${assetsHTML || '<span style="opacity:0.4;">None</span>'}</div></td>
    `;
    resultsTbody.appendChild(row);
  });
}

// Bind Action click handlers
submitBidBtn.addEventListener('click', () => {
  if (!clientState.isMyTurn || clientState.selectedCards.length === 0) return;
  socket.emit('submitBid', { addedCards: clientState.selectedCards });
  clientState.selectedCards = [];
});

passBtn.addEventListener('click', () => {
  if (!clientState.isMyTurn) return;
  socket.emit('passAuction');
  clientState.selectedCards = [];
});

restartBtn.addEventListener('click', () => {
  socket.emit('startGame');
});
