const socket = io();

// HTML ELEMENT BINDINGS
const deckCountEl = document.getElementById('deck-count');
const triggersCountEl = document.getElementById('triggers-count');
const stageContent = document.getElementById('stage-content');
const playersRow = document.getElementById('players-row');
const logTicker = document.getElementById('log-ticker');

const finishScreen = document.getElementById('finish-screen');
const resultsTbody = document.getElementById('results-tbody');
const restartBtn = document.getElementById('restart-btn');

// Register as board screen
socket.emit('registerBoard');

// ==========================================================================
// RENDER & UI COORDINATION
// ==========================================================================

socket.on('boardStateUpdate', (state) => {
  // 1. Header indicators
  deckCountEl.textContent = `Cards Left: ${state.deckCount}`;
  triggersCountEl.textContent = `Triggers: ${state.endGameTriggersRevealed}/4`;

  // 2. Render Log Chronicles
  renderLogTicker(state.gameLog);

  // 3. Central Stage (Lobby vs Arena vs Finished)
  if (state.status === "waiting") {
    finishScreen.style.display = 'none';
    renderLobby(state.players);
    playersRow.innerHTML = ""; // No seats in lobby
  } else if (state.status === "finished") {
    renderLeaderboard(state.gameResults);
  } else {
    // Active Game (in_progress or round_over)
    finishScreen.style.display = 'none';
    renderArena(state.currentCard, state.auctionType, state.highestBid, state.players, state.status);
    renderPlayerSeats(state.players, state.currentPlayerIndex, state.status);
  }
});

// Real-time incremental logs
socket.on('logUpdate', (log) => {
  appendLogEntry(log);
});

// Render the Lobby phase inside the central arena
function renderLobby(players) {
  const readyToStart = players.length >= 3;
  
  let playersListHTML = players.map(p => `
    <div class="mini-card" style="padding: 8px 16px; font-size: 1rem; border-radius: 8px; display: flex; align-items: center; gap: 8px;">
      👑 ${p.name}
      <span class="kick-btn" data-id="${p.id}" style="color: #ff4d4d; cursor: pointer; font-weight: bold; font-size: 1.1rem; padding: 0 4px; margin-left: 4px; transition: transform 0.2s ease; user-select: none;">&times;</span>
    </div>
  `).join("");

  if (players.length === 0) {
    playersListHTML = `<div style="font-size: 1rem; opacity: 0.5;">No aristocratic players have joined yet...</div>`;
  }

  stageContent.innerHTML = `
    <div style="text-align: center; max-width: 500px; width: 100%;">
      <h2 class="gold-text" style="font-size: 2.2rem; margin-bottom: 20px;">Lobby Entrance</h2>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-bottom: 30px; min-height: 50px;">
        ${playersListHTML}
      </div>
      
      ${readyToStart 
        ? `<button id="start-game-btn" class="btn-primary" style="padding: 15px 45px; font-size: 1.2rem; margin-top: 10px;">Start Game Session</button>`
        : `<div style="color: var(--gold-primary); font-size: 0.95rem; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Awaiting at least 3 players (${players.length}/5 joined)</div>`
      }
    </div>
  `;

  // Bind start action dynamically
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      socket.emit('startGame');
    });
  }

  // Bind kick buttons dynamically
  const kickBtns = stageContent.querySelectorAll('.kick-btn');
  kickBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const pId = e.target.getAttribute('data-id');
      socket.emit('kickPlayer', { playerId: pId });
    });
    
    // Tiny hover transition
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.2)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
  });
}

// Render the Active Bidding Arena (drawn card + highest table bid)
function renderArena(card, type, highestBid, players, status) {
  if (!card) {
    stageContent.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 1.2rem; opacity: 0.6; padding: 25px;">Preparing next round...</div>
      </div>
    `;
    return;
  }

  const isPositive = type === 'positive';
  const cardClass = isPositive ? 'positive' : 'negative';

  let typeText = "Luxury Point Card";
  if (card.type === 'multiplier') typeText = "Multiplier Card (Double Score)";
  if (card.type === 'penalty') {
    if (card.name === 'Scandal') typeText = "Disgrace Penalty (Halve Score)";
    else if (card.name === 'Passé') typeText = "Disgrace Penalty (Discard Card)";
    else typeText = "Disgrace Penalty (-5 points)";
  }

  // Format central value
  let valDisplay = card.value;
  if (card.type === 'point') valDisplay = `+${card.value}`;
  if (card.type === 'multiplier') valDisplay = `x2`;
  if (card.name === 'Scandal') valDisplay = `x½`;
  if (card.name === 'Passé') valDisplay = `Vol`;
  if (card.name === 'Faux Pas') valDisplay = `-5`;

  // Find who has the highest bid right now
  let bidderName = "No one";
  if (highestBid > 0) {
    const topBidder = players.find(p => p.bidTotal === highestBid && !p.hasPassed);
    if (topBidder) bidderName = topBidder.name;
  }

  stageContent.innerHTML = `
    <div class="active-card-container">
      <div class="arena-card ${cardClass} float-animation">
        <div class="card-top">${typeText}</div>
        <div class="card-center">${valDisplay}</div>
        <div class="card-bottom">${card.name}</div>
      </div>
    </div>
    
    <div class="bidding-summary">
      <div class="arena-badge">
        <label>Active Auction Type</label>
        <div class="value gold-text" style="font-size: 1.3rem;">
          ${isPositive ? "Bidding to ACQUIRE" : "Bidding to AVOID"}
        </div>
      </div>
      
      <div class="arena-badge" style="border-color: rgba(59, 130, 246, 0.3);">
        <label>Current Table High Bid</label>
        <div class="value" style="color: #60a5fa;">$${highestBid / 1000}k</div>
        <div style="font-size: 0.8rem; opacity: 0.7; margin-top: 2px;">Committed by: <strong>${bidderName}</strong></div>
      </div>
      
      ${status === "round_over" 
        ? `<div class="arena-badge" style="background: rgba(92, 214, 153, 0.15); border-color: #5cd699; text-align: center; animation: pulse 1s infinite;">
             <span style="color: #5cd699; font-weight: 700; font-size: 0.9rem;">ROUND RESOLVED!</span>
           </div>`
        : ''
      }
    </div>
  `;
}

// Render the 5 Seats for Players in play
function renderPlayerSeats(players, currentPlayerIndex, status) {
  playersRow.innerHTML = "";

  players.forEach((p, idx) => {
    const isCurrentTurn = status === "in_progress" && idx === currentPlayerIndex;
    
    // Seat panel
    const panel = document.createElement('div');
    panel.className = `player-panel glass-panel${isCurrentTurn ? ' active-turn' : ''}${p.hasPassed ? ' passed' : ''}`;
    
    // Status dot (offline check)
    const connDot = `<span class="dot-status${p.connected ? '' : ' offline'}"></span>`;
    
    // Render Tableau won cards
    const tableauHTML = p.tableau.map(c => {
      const isPenalty = c.type === 'penalty';
      return `<div class="mini-card${isPenalty ? ' penalty' : ''}">${c.name}</div>`;
    }).join("");

    // Render committed bills list
    let billsListHTML = "";
    if (p.currentBid.length > 0) {
      billsListHTML = p.currentBid.map(val => `<span class="mini-card" style="border-color: #60a5fa; background: rgba(96,165,250,0.1); color:#93c5fd;">$${val/1000}k</span>`).join(" ");
    }

    panel.innerHTML = `
      <div class="player-panel-header">
        <div class="player-title">
          ${connDot}
          <span>${p.name}</span>
        </div>
        <span style="font-size: 0.75rem; opacity: 0.7; font-weight: 600;">Hand: ${p.cardsCount} bills</span>
      </div>
      
      <div class="player-bid-display">
        <label>Active Table Bid</label>
        <div class="val gold-text">$${p.bidTotal / 1000}k</div>
      </div>
      
      ${p.currentBid.length > 0 ? `<div style="margin-top: -8px; margin-bottom: 12px; display:flex; gap:3px; flex-wrap:wrap;">${billsListHTML}</div>` : ''}
      
      <div class="player-tableau-title">Acquired Assets</div>
      <div class="player-tableau-cards">
        ${p.tableau.length > 0 ? tableauHTML : `<span style="font-size: 0.75rem; opacity: 0.45; font-style: italic;">No assets yet...</span>`}
      </div>
      
      ${p.pendingTheft > 0 
        ? `<div style="color: #ff9999; font-size: 0.7rem; font-weight: bold; margin-top: 5px; text-transform: uppercase;">⚠️ Pending Theft: ${p.pendingTheft}</div>`
        : ''
      }
    `;

    playersRow.appendChild(panel);
  });
}

// Render the Log Feed full updates
function renderLogTicker(logs) {
  logTicker.innerHTML = "";
  if (logs.length === 0) {
    logTicker.innerHTML = `<div style="font-size: 0.85rem; opacity: 0.5;">Awaiting game start chronicles...</div>`;
    return;
  }
  // Render chronologically (newest at bottom)
  logs.forEach(log => {
    appendLogEntry(log, false);
  });
  scrollToBottom();
}

function appendLogEntry(log, scroll = true) {
  // Guard against duplicate initial render in UI
  const existingLogItems = logTicker.querySelectorAll('.log-entry');
  if (existingLogItems.length > 80) {
    logTicker.removeChild(existingLogItems[0]);
  }

  const item = document.createElement('div');
  item.className = `log-entry ${log.type}`;
  item.innerHTML = `
    <span class="time">${log.timestamp}</span>
    <span>${log.text}</span>
  `;
  logTicker.appendChild(item);

  if (scroll) {
    scrollToBottom();
  }
}

function scrollToBottom() {
  logTicker.scrollTop = logTicker.scrollHeight;
}

// Render the Final Game Standings Scoreboard Modal
function renderLeaderboard(results) {
  if (!results) return;

  resultsTbody.innerHTML = "";
  finishScreen.style.display = 'flex';

  // Render Rank Scoreboard rows
  results.rankings.forEach(p => {
    const assetsHTML = p.tableau.map(c => `
      <span class="mini-card${c.type === 'penalty' ? ' penalty' : ''}">${c.name}</span>
    `).join(" ");

    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>#${p.rank}</strong></td>
      <td style="color: var(--gold-primary); font-weight: 700;">👑 ${p.name}</td>
      <td style="font-size: 1.1rem; font-weight: 800;">${p.score} pts</td>
      <td>$${p.cash / 1000}k</td>
      <td><div style="display:flex; gap:4px; flex-wrap:wrap;">${assetsHTML || '<span style="opacity:0.4;">None</span>'}</div></td>
    `;
    resultsTbody.appendChild(row);
  });

  // Render Eliminated players (who had lowest money!)
  results.eliminated.forEach(p => {
    const assetsHTML = p.tableau.map(c => `
      <span class="mini-card${c.type === 'penalty' ? ' penalty' : ''}">${c.name}</span>
    `).join(" ");

    const row = document.createElement('tr');
    row.className = "eliminated-row";
    row.innerHTML = `
      <td><span class="badge-eliminated">OUT</span></td>
      <td style="text-decoration: line-through;">💀 ${p.name}</td>
      <td>${p.score} pts</td>
      <td style="font-weight: bold; color: #ff9999;">$${p.cash / 1000}k (Least Cash)</td>
      <td><div style="display:flex; gap:4px; flex-wrap:wrap; filter: grayscale(1);">${assetsHTML || '<span style="opacity:0.4;">None</span>'}</div></td>
    `;
    resultsTbody.appendChild(row);
  });
}

// Restart button binding
restartBtn.addEventListener('click', () => {
  socket.emit('startGame');
});
