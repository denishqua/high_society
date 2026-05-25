const socket = io();

// STATE OBJECT
const clientState = {
  playerId: null,
  playerName: null,
  hand: [],
  selectedCards: [],
  isMyTurn: false,
  myBidTotal: 0,
  highestBid: 0,
  auctionType: null,
  status: "waiting"
};

// HTML ELEMENTS
const joinView = document.getElementById('join-view');
const gameView = document.getElementById('game-view');
const playerNameInput = document.getElementById('player-name');
const joinBtn = document.getElementById('join-btn');
const joinError = document.getElementById('join-error');

const myDisplayName = document.getElementById('my-display-name');
const myTheftStatus = document.getElementById('my-theft-status');
const connBadge = document.getElementById('conn-badge');
const cardStage = document.getElementById('card-stage');
const auctionBiddingStatus = document.getElementById('auction-bidding-status');
const turnBanner = document.getElementById('turn-banner');
const selectedBillsTray = document.getElementById('selected-bills-tray');
const selectedBidTotal = document.getElementById('selected-bid-total');
const submitBidBtn = document.getElementById('submit-bid-btn');
const passBtn = document.getElementById('pass-btn');
const actionErrorMsg = document.getElementById('action-error-msg');
const billsContainer = document.getElementById('bills-container');

// ==========================================================================
// SESSION MANAGEMENT (LOBBY / RECONNECT)
// ==========================================================================

// Check for existing player session
window.addEventListener('DOMContentLoaded', () => {
  const cachedId = localStorage.getItem('highSocietyPlayerId');
  const cachedName = localStorage.getItem('highSocietyPlayerName');

  if (cachedId && cachedName) {
    clientState.playerId = cachedId;
    clientState.playerName = cachedName;
    socket.emit('joinPlayer', { name: cachedName, playerId: cachedId });
  }
});

// Join Button click handler
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
  socket.emit('joinPlayer', { name });
}

function showJoinError(msg) {
  joinError.textContent = msg;
  joinError.style.display = 'block';
  joinBtn.disabled = false;
}

// Socket responses for Join requests
socket.on('joinSuccess', ({ playerId, name }) => {
  localStorage.setItem('highSocietyPlayerId', playerId);
  localStorage.setItem('highSocietyPlayerName', name);
  clientState.playerId = playerId;
  clientState.playerName = name;

  joinView.style.display = 'none';
  gameView.style.display = 'flex';
  myDisplayName.textContent = name;
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
  joinBtn.disabled = false;
  showJoinError("You were kicked from the lobby by the host.");
});

// Connection state notifications
socket.on('connect', () => {
  connBadge.textContent = "Connected";
  connBadge.className = "player-status-badge badge-connected";
  // If already registered, re-join
  if (clientState.playerId) {
    socket.emit('joinPlayer', { name: clientState.playerName, playerId: clientState.playerId });
  }
});

socket.on('disconnect', () => {
  connBadge.textContent = "Disconnected";
  connBadge.className = "player-status-badge badge-disconnected";
});

// Action failures from the server
socket.on('actionError', (msg) => {
  actionErrorMsg.textContent = msg;
  actionErrorMsg.style.display = 'block';
  setTimeout(() => {
    actionErrorMsg.style.display = 'none';
  }, 4000);
});

// ==========================================================================
// RENDER & UI COORDINATION
// ==========================================================================

socket.on('playerStateUpdate', (state) => {
  clientState.hand = state.hand;
  clientState.isMyTurn = state.isMyTurn;
  clientState.myBidTotal = state.myBidTotal;
  clientState.highestBid = state.highestBid;
  clientState.auctionType = state.auctionType;
  clientState.status = state.status;

  // Render theft status
  if (state.myPendingTheft > 0) {
    myTheftStatus.textContent = `Pending Theft: ${state.myPendingTheft}`;
    myTheftStatus.style.display = 'block';
  } else {
    myTheftStatus.style.display = 'none';
  }

  // If it's not my turn, force clear selected cards buffer
  if (!state.isMyTurn) {
    clientState.selectedCards = [];
  }

  // 1. Render Current Card
  renderAuctionCard(state.currentCard, state.auctionType, state.status);

  // 2. Render Turn Banner
  renderTurnBanner(state.isMyTurn, state.currentPlayerName, state.status, state.gameResults);

  // 3. Render Hand Bills
  renderHand(state.hand, state.isMyTurn);

  // 4. Update Trays & Buttons
  updateBiddingControls();
});

// Render the big luxury card in the round stage
function renderAuctionCard(card, type, status) {
  if (status === "waiting") {
    cardStage.innerHTML = `<div style="font-size: 0.9rem; opacity: 0.6; padding: 20px;">Waiting for host to start game...</div>`;
    auctionBiddingStatus.style.display = 'none';
    return;
  }
  
  if (status === "finished") {
    cardStage.innerHTML = `<div style="font-size: 1.1rem; color: var(--gold-primary); font-weight: 700; padding: 20px;">GAME OVER</div>`;
    auctionBiddingStatus.style.display = 'none';
    return;
  }

  if (!card) {
    cardStage.innerHTML = `<div style="font-size: 0.9rem; opacity: 0.6; padding: 20px;">Preparing next round...</div>`;
    auctionBiddingStatus.style.display = 'none';
    return;
  }

  auctionBiddingStatus.style.display = 'block';
  auctionBiddingStatus.innerHTML = `
    Highest Bid on Table: <strong>$${clientState.highestBid / 1000}k</strong><br>
    Your Active Bid: <strong>$${clientState.myBidTotal / 1000}k</strong>
  `;

  let typeText = "Luxury Point";
  if (card.type === 'multiplier') typeText = "Multiplier (Double)";
  if (card.type === 'penalty') {
    if (card.name === 'Scandal') typeText = "Disgrace (Halve Score)";
    else if (card.name === 'Passé') typeText = "Disgrace (Discard Card)";
    else typeText = "Disgrace (-5 points)";
  }

  const isPositive = type === 'positive';
  const cardClass = isPositive ? 'positive' : 'negative';
  
  // Format central value
  let valDisplay = card.value;
  if (card.type === 'point') valDisplay = `+${card.value}`;
  if (card.type === 'multiplier') valDisplay = `x2`;
  if (card.name === 'Scandal') valDisplay = `x½`;
  if (card.name === 'Passé') valDisplay = `Vol`;
  if (card.name === 'Faux Pas') valDisplay = `-5`;

  cardStage.innerHTML = `
    <div class="auction-card ${cardClass} float-animation">
      <div class="card-top">${typeText}</div>
      <div class="card-center">${valDisplay}</div>
      <div class="card-bottom">${card.name}</div>
    </div>
  `;
}

// Render player turn messages
function renderTurnBanner(isMyTurn, activeName, status, gameResults) {
  turnBanner.className = "turn-banner";
  
  if (status === "waiting") {
    turnBanner.textContent = "Waiting in lobby...";
    turnBanner.classList.add("turn-waiting");
    return;
  }

  if (status === "finished") {
    const winner = gameResults && gameResults.rankings.length > 0 ? gameResults.rankings[0].name : "No one";
    turnBanner.innerHTML = `Game Over! Winner: <strong>${winner}</strong>`;
    turnBanner.classList.add("turn-mine");
    return;
  }

  if (status === "round_over") {
    turnBanner.textContent = "Round complete! Preparing next round...";
    turnBanner.classList.add("turn-waiting");
    return;
  }

  if (isMyTurn) {
    turnBanner.textContent = "YOUR TURN! SUBMIT A BID OR PASS.";
    turnBanner.classList.add("turn-mine");
  } else {
    turnBanner.textContent = `Waiting for ${activeName || "another player"}...`;
    turnBanner.classList.add("turn-waiting");
  }
}

// Render the 11 banknotes starting hand
function renderHand(hand, isMyTurn) {
  billsContainer.innerHTML = "";
  
  if (hand.length === 0) {
    billsContainer.innerHTML = `<div style="font-size: 0.85rem; opacity: 0.5; padding: 15px;">Your hand is empty.</div>`;
    return;
  }

  hand.forEach((cardVal, index) => {
    const isSelected = clientState.selectedCards.includes(cardVal) && 
                       (clientState.selectedCards.filter(c => c === cardVal).length >= 
                        clientState.selectedCards.filter((c, i) => clientState.hand[i] === cardVal).length);
    
    // Manage duplicate bill selections cleanly
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

// Select / Unselect bill
function toggleBillSelection(value, isAlreadySelected) {
  if (isAlreadySelected) {
    const idx = clientState.selectedCards.indexOf(value);
    if (idx !== -1) {
      clientState.selectedCards.splice(idx, 1);
    }
  } else {
    clientState.selectedCards.push(value);
  }
  
  // Re-render hand and tray update
  renderHand(clientState.hand, clientState.isMyTurn);
  updateBiddingControls();
}

// Update the Selected Bid Tray UI and validate the submit buttons
function updateBiddingControls() {
  selectedBillsTray.innerHTML = "";
  
  const increaseSum = clientState.selectedCards.reduce((sum, val) => sum + val, 0);
  const totalProposedBid = clientState.myBidTotal + increaseSum;

  selectedBidTotal.innerHTML = `$${increaseSum / 1000}k <span style="font-size: 0.8rem; font-weight: normal; opacity: 0.7;">(Total Bid: $${totalProposedBid / 1000}k)</span>`;

  if (clientState.selectedCards.length === 0) {
    selectedBillsTray.innerHTML = `<div style="font-size: 0.8rem; opacity: 0.5;">Click money cards below to add to your bid...</div>`;
    submitBidBtn.disabled = true;
  } else {
    // Show selected bills in the tray
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

    // Enforce raise validation rule
    if (clientState.isMyTurn && clientState.status === "in_progress") {
      submitBidBtn.disabled = totalProposedBid <= clientState.highestBid;
    } else {
      submitBidBtn.disabled = true;
    }
  }

  // Turn-based main button status
  if (clientState.isMyTurn && clientState.status === "in_progress") {
    passBtn.disabled = false;
  } else {
    submitBidBtn.disabled = true;
    passBtn.disabled = true;
  }
}

// ==========================================================================
// ACTIONS ACTIONS
// ==========================================================================

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
