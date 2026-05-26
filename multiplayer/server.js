const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback routes to serve the proper views
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// STARTING HAND VALUES DEFINED IN THE RULES
const STARTING_HAND = [1000, 2000, 3000, 4000, 5000, 8000, 10000, 12000, 15000, 20000, 25000];

// DECK INITIALIZER
function getInitialDeck() {
  return [
    { name: "+1", type: "point", value: 1, isEndGameTrigger: false },
    { name: "+2", type: "point", value: 2, isEndGameTrigger: false },
    { name: "+3", type: "point", value: 3, isEndGameTrigger: false },
    { name: "+4", type: "point", value: 4, isEndGameTrigger: false },
    { name: "+5", type: "point", value: 5, isEndGameTrigger: false },
    { name: "+6", type: "point", value: 6, isEndGameTrigger: false },
    { name: "+7", type: "point", value: 7, isEndGameTrigger: false },
    { name: "+8", type: "point", value: 8, isEndGameTrigger: false },
    { name: "+9", type: "point", value: 9, isEndGameTrigger: false },
    { name: "+10", type: "point", value: 10, isEndGameTrigger: false },
    { name: "x2", type: "multiplier", value: 2, isEndGameTrigger: true },
    { name: "x2", type: "multiplier", value: 2, isEndGameTrigger: true },
    { name: "x2", type: "multiplier", value: 2, isEndGameTrigger: true },
    { name: "-5", type: "penalty", value: -5, isEndGameTrigger: false },
    { name: "Passé", type: "penalty", value: "discard_point", isEndGameTrigger: false },
    { name: "÷2", type: "penalty", value: "halve_score", isEndGameTrigger: true }
  ];
}

// GAME STATE
const gameState = {
  status: "waiting", // waiting, in_progress, pending_discard, round_over, finished
  players: [],       // list of active players { id, name, hand, tableau, currentBid, hasPassed, pendingTheft, connected, socketId, avatar }
  deck: [],
  currentCard: null,
  auctionType: null, // positive, negative
  currentPlayerIndex: 0,
  startingPlayerIndex: 0,
  pendingDiscardPlayerIndex: null, // Tracks active discard player during Passé resolution
  endGameTriggersRevealed: 0,
  gameResults: null,
  gameLog: [],
  lastRoundResult: null,
  turnEndsAt: null   // Timestamp of when the active turn expires
};

let turnTimerInterval = null;

// HELPER: Log message to board & stdout
function logMessage(text, type = "info") {
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const logEntry = { timestamp, text, type };
  gameState.gameLog.push(logEntry);
  if (gameState.gameLog.length > 50) {
    gameState.gameLog.shift(); // Cap log history
  }
  console.log(`[${type.toUpperCase()}] ${text}`);
  io.emit('logUpdate', logEntry);
}

// HELPER: Get sum of bids
function getHighestBid() {
  return gameState.players.reduce((max, p) => {
    const total = p.currentBid.reduce((sum, val) => sum + val, 0);
    return total > max ? total : max;
  }, 0);
}

// HELPER: Get sum of an array
function sumArray(arr) {
  return arr.reduce((sum, val) => sum + val, 0);
}

// HELPER: Calculate current score of a player
function calculateScore(player) {
  let base = player.tableau
    .filter(c => c.type === 'point')
    .reduce((sum, c) => sum + c.value, 0);

  // Apply Faux Pas (-5 penalty)
  if (player.tableau.some(c => c.name === "-5")) {
    base -= 5;
  }

  // Apply Multipliers (each doubles points)
  const multiplierCount = player.tableau.filter(c => c.type === 'multiplier').length;
  let score = base * Math.pow(2, multiplierCount);

  // Apply Scandal (halves score, rounded up)
  if (player.tableau.some(c => c.name === "÷2")) {
    score = Math.ceil(score / 2.0);
  }

  return score;
}

// HELPER: Broadcast tailored updates to all players and central display
function broadcastState() {
  // Public player data for board & players
  const publicPlayers = gameState.players.map(p => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    tableau: p.tableau,
    currentBid: p.currentBid,
    bidTotal: sumArray(p.currentBid),
    hasPassed: p.hasPassed,
    connected: p.connected,
    cardsCount: p.hand.length,
    pendingTheft: p.pendingTheft,
    score: calculateScore(p)
  }));

  // Emit private state to each connected player socket
  gameState.players.forEach(p => {
    if (p.connected && p.socketId) {
      io.to(p.socketId).emit('playerStateUpdate', {
        status: gameState.status,
        players: publicPlayers,
        hand: p.hand,
        currentCard: gameState.currentCard,
        auctionType: gameState.auctionType,
        isMyTurn: gameState.status === "in_progress" && gameState.currentPlayerIndex === gameState.players.indexOf(p),
        currentPlayerName: gameState.status === "in_progress" ? gameState.players[gameState.currentPlayerIndex].name : null,
        isMyDiscardTurn: gameState.status === "pending_discard" && gameState.pendingDiscardPlayerIndex === gameState.players.indexOf(p),
        discardPlayerName: gameState.status === "pending_discard" ? gameState.players[gameState.pendingDiscardPlayerIndex].name : null,
        pendingDiscardPlayerIndex: gameState.status === "pending_discard" ? gameState.pendingDiscardPlayerIndex : null,
        myBidTotal: sumArray(p.currentBid),
        highestBid: getHighestBid(),
        endGameTriggersRevealed: gameState.endGameTriggersRevealed,
        gameResults: gameState.gameResults,
        myPendingTheft: p.pendingTheft,
        myIndex: gameState.players.indexOf(p),
        turnEndsAt: gameState.turnEndsAt, // Sync active turn ends timestamp
        currentPlayerIndex: gameState.status === "in_progress" ? gameState.currentPlayerIndex : -1,
        gameLog: gameState.gameLog,
        deckCount: gameState.deck.length,
        lastRoundResult: gameState.lastRoundResult
      });
    }
  });
}

// GAME CORE LOGIC

function startNewGame() {
  if (gameState.players.length < 3) {
    logMessage("Need at least 3 players to start!", "warning");
    return;
  }

  clearTurnTimer();
  logMessage("Game is starting! Shuffling deck...", "success");

  // Re-init player hands and states
  gameState.players.forEach(p => {
    p.hand = [...STARTING_HAND];
    p.tableau = [];
    p.currentBid = [];
    p.hasPassed = false;
    p.pendingTheft = 0;
  });

  // Shuffle deck
  const freshDeck = getInitialDeck();
  for (let i = freshDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [freshDeck[i], freshDeck[j]] = [freshDeck[j], freshDeck[i]];
  }
  gameState.deck = freshDeck;
  gameState.endGameTriggersRevealed = 0;
  gameState.gameResults = null;
  gameState.lastRoundResult = null;

  // Select random starting player
  gameState.startingPlayerIndex = Math.floor(Math.random() * gameState.players.length);
  
  startRound();
}

function startRound() {
  // Reset player round states
  gameState.players.forEach(p => {
    p.hasPassed = false;
    p.currentBid = [];
  });

  if (gameState.deck.length === 0) {
    endGame();
    return;
  }

  // Draw card
  const drawnCard = gameState.deck.pop();
  gameState.currentCard = drawnCard;
  logMessage(`New card flipped: ${drawnCard.name}!`, "card");

  // Check end-game triggers
  if (drawnCard.isEndGameTrigger) {
    gameState.endGameTriggersRevealed++;
    logMessage(`End-game trigger revealed! (${gameState.endGameTriggersRevealed}/4)`, "warning");
    
    if (gameState.endGameTriggersRevealed === 4) {
      logMessage("The 4th end-game trigger has been flipped! The game ends immediately!", "danger");
      endGame();
      return;
    }
  }

  // Set auction type
  if (drawnCard.type === 'point' || drawnCard.type === 'multiplier') {
    gameState.auctionType = 'positive';
  } else {
    gameState.auctionType = 'negative';
  }

  gameState.status = "in_progress";
  gameState.currentPlayerIndex = gameState.startingPlayerIndex;
  logMessage(`Bidding starts with ${gameState.players[gameState.currentPlayerIndex].name}.`, "info");
  
  // Start the 30s turn countdown
  startTurnTimer();
  
  broadcastState();
}

function advanceTurn() {
  // Move to next player in turn order who has not passed
  let nextIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;
  let loops = 0;
  
  while (gameState.players[nextIndex].hasPassed && loops < gameState.players.length) {
    nextIndex = (nextIndex + 1) % gameState.players.length;
    loops++;
  }

  gameState.currentPlayerIndex = nextIndex;
}

// SERVER TIMER CONTROLS
function startTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    clearTimeout(turnTimerInterval);
  }
  
  // Set expiration timestamp to 30 seconds from now
  gameState.turnEndsAt = Date.now() + 30000;

  // CPU TURN DETECTION AND AUTOMATION
  if (gameState.status === "in_progress") {
    const activePlayer = gameState.players[gameState.currentPlayerIndex];
    if (activePlayer && activePlayer.isCpu) {
      turnTimerInterval = setTimeout(() => {
        runCpuTurn(gameState.currentPlayerIndex);
      }, 1500);
      return;
    }
  } else if (gameState.status === "pending_discard") {
    const discardPlayer = gameState.players[gameState.pendingDiscardPlayerIndex];
    if (discardPlayer && discardPlayer.isCpu) {
      turnTimerInterval = setTimeout(() => {
        runCpuDiscard(gameState.pendingDiscardPlayerIndex);
      }, 1500);
      return;
    }
  }
  
  turnTimerInterval = setInterval(() => {
    if (gameState.status !== "in_progress" && gameState.status !== "pending_discard") {
      clearInterval(turnTimerInterval);
      return;
    }
    
    // Check if time expired
    if (Date.now() >= gameState.turnEndsAt) {
      clearInterval(turnTimerInterval);
      if (gameState.status === "pending_discard") {
        handleDiscardTimeout();
      } else {
        handleTurnTimeout();
      }
    }
  }, 200);
}

function clearTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    clearTimeout(turnTimerInterval);
    turnTimerInterval = null;
  }
  gameState.turnEndsAt = null;
}

function handleTurnTimeout() {
  const activePlayer = gameState.players[gameState.currentPlayerIndex];
  logMessage(`⏰ Time expired! ${activePlayer.name} automatically passes.`, "warning");
  
  // Execute passing logic
  executePlayerPass(gameState.currentPlayerIndex);
}

function handleDiscardTimeout() {
  const pIndex = gameState.pendingDiscardPlayerIndex;
  if (pIndex === null || pIndex === undefined) return;
  const p = gameState.players[pIndex];
  if (!p) return;

  const pointCards = p.tableau.filter(c => c.type === 'point');
  if (pointCards.length > 0) {
    // Sort ascending by value to find the lowest-value Point card
    pointCards.sort((a, b) => a.value - b.value);
    const discarded = pointCards[0];
    const idx = p.tableau.findIndex(c => c.name === discarded.name && c.value === discarded.value);
    if (idx !== -1) {
      p.tableau.splice(idx, 1);
    }
    logMessage(`⏰ Time expired! ${p.name} automatically discards their lowest-value Point card: ${discarded.name}.`, "danger");
  }

  // Clear pending discard variables and resolve round
  clearTurnTimer();
  gameState.pendingDiscardPlayerIndex = null;

  // Save round result
  gameState.lastRoundResult = {
    winner: p.name,
    card: gameState.currentCard.name,
    amount: 0,
    type: "negative"
  };

  // Passing player starts the next round
  gameState.startingPlayerIndex = pIndex;
  gameState.status = "round_over";

  broadcastState();

  setTimeout(() => {
    startRound();
  }, 3500);
}

// CORE REUSABLE BID AUCTION RESOLUTION HELP
function executePlayerBid(playerIndex, addedCards) {
  const p = gameState.players[playerIndex];

  // Turn resolved: stop timer immediately
  clearTurnTimer();

  // Apply Bid
  addedCards.forEach(card => {
    const idx = p.hand.indexOf(card);
    if (idx !== -1) {
      p.hand.splice(idx, 1);
      p.currentBid.push(card);
    }
  });

  const newTotalBid = sumArray(p.currentBid);
  const addedBidSum = sumArray(addedCards);

  logMessage(`${p.name} raised their bid to $${newTotalBid / 1000}k (+ $${addedBidSum / 1000}k).`, "bid");

  // Advance turn and trigger next turn timer
  advanceTurn();
  startTurnTimer();
  broadcastState();
}

// CORE REUSABLE PASS AUCTION RESOLUTION HELP
function executePlayerPass(playerIndex) {
  const p = gameState.players[playerIndex];
  p.hasPassed = true;
  
  // Turn resolved: stop timer immediately
  clearTurnTimer();

  // RESOLVE PASS ACTION
  if (gameState.auctionType === 'positive') {
    // Return passing player's bid to their hand
    p.hand.push(...p.currentBid);
    p.hand.sort((a, b) => a - b);
    p.currentBid = [];

    // Check how many active players remain
    const activePlayers = gameState.players.filter(pl => !pl.hasPassed);

    if (activePlayers.length === 1) {
      // Winner declared!
      const winner = activePlayers[0];
      const winningBid = sumArray(winner.currentBid);
      
      logMessage(`🎉 ${winner.name} wins the auction for ${gameState.currentCard.name} with a bid of $${winningBid / 1000}k!`, "success");

      // Handle Theft / Passé discard interaction
      if (gameState.currentCard.type === 'point' && winner.pendingTheft > 0) {
        winner.pendingTheft--;
        logMessage(`Theft triggers! ${winner.name}'s new ${gameState.currentCard.name} is immediately stolen/discarded.`, "danger");
      } else {
        winner.tableau.push(gameState.currentCard);
      }

      // Winner pays bid to bank
      winner.currentBid = [];

      // Save round result
      gameState.lastRoundResult = {
        winner: winner.name,
        card: gameState.currentCard.name,
        amount: winningBid,
        type: "positive"
      };

      // Winner starts the next round
      gameState.startingPlayerIndex = gameState.players.indexOf(winner);
      gameState.status = "round_over";
      
      // Wait 3.5 seconds before starting the next round for dramatic effect
      setTimeout(() => {
        startRound();
      }, 3500);

    } else if (activePlayers.length === 0) {
      // Edge Case: If starting player passes immediately and nobody bids
      logMessage(`Everyone passed! The card ${gameState.currentCard.name} is discarded.`, "warning");
      
      gameState.lastRoundResult = {
        winner: "No one",
        card: gameState.currentCard.name,
        amount: 0,
        type: "positive"
      };

      // Next starting index advances sequentially
      gameState.startingPlayerIndex = (gameState.startingPlayerIndex + 1) % gameState.players.length;
      gameState.status = "round_over";
      
      setTimeout(() => {
        startRound();
      }, 3500);
    } else {
      // Bidding continues - move turn and start next timer
      advanceTurn();
      startTurnTimer();
    }

  } else if (gameState.auctionType === 'negative') {
    // NEGATIVE AUCTION: First player to pass takes the penalty card, but gets their money back
    p.hand.push(...p.currentBid);
    p.hand.sort((a, b) => a - b);
    p.currentBid = [];

    logMessage(`💥 ${p.name} takes the penalty card ${gameState.currentCard.name} and reclaims their bid.`, "danger");

    let isSelectionRequired = false;

    // Handle Theft/Passé card trigger
    if (gameState.currentCard.name === "Passé") {
      const pointCards = p.tableau.filter(c => c.type === 'point');
      if (pointCards.length === 0) {
        p.pendingTheft++;
        logMessage(`Passé triggers, but ${p.name} has no point cards! A pending theft is recorded.`, "danger");
      } else if (pointCards.length === 1) {
        const discarded = pointCards[0];
        const idx = p.tableau.findIndex(c => c.name === discarded.name && c.value === discarded.value);
        p.tableau.splice(idx, 1);
        logMessage(`Passé triggers! ${p.name} automatically discards their only point card: ${discarded.name}.`, "danger");
      } else {
        // More than 1 point card: Pause game and request choice!
        isSelectionRequired = true;
        gameState.status = "pending_discard";
        gameState.pendingDiscardPlayerIndex = playerIndex;
        logMessage(`Passé triggers! ${p.name} has multiple point cards and must select one to discard.`, "warning");
        
        // Start 30s discard timer
        startTurnTimer();
      }
    } else {
      p.tableau.push(gameState.currentCard);
    }

    // EVERYONE ELSE pays their table bid to the bank!
    gameState.players.forEach(other => {
      if (other !== p) {
        const forfeitedBid = sumArray(other.currentBid);
        if (forfeitedBid > 0) {
          logMessage(`${other.name} forfeits $${forfeitedBid / 1000}k to avoid the penalty.`, "warning");
        }
        other.currentBid = [];
      }
    });

    if (!isSelectionRequired) {
      // Save round result
      gameState.lastRoundResult = {
        winner: p.name,
        card: gameState.currentCard.name,
        amount: 0,
        type: "negative"
      };

      // Passing player starts the next round
      gameState.startingPlayerIndex = playerIndex;
      gameState.status = "round_over";

      setTimeout(() => {
        startRound();
      }, 3500);
    }
  }

  broadcastState();
}

function endGame() {
  clearTurnTimer();
  gameState.status = "finished";
  logMessage("Game over! Calculating final standings...", "success");

  // Calculate remaining money for each player
  const playerCash = gameState.players.map(p => ({
    player: p,
    cash: sumArray(p.hand)
  }));

  // 1. ELIMINATE LOWEST CASH PLAYER(S)
  const minCash = Math.min(...playerCash.map(item => item.cash));
  
  const eliminatedPlayers = [];
  const remainingPlayers = [];

  playerCash.forEach(item => {
    if (item.cash === minCash) {
      eliminatedPlayers.push(item.player);
      logMessage(`ELIMINATED: ${item.player.name} has the lowest remaining cash ($${item.cash / 1000}k)!`, "danger");
    } else {
      remainingPlayers.push(item.player);
    }
  });
  // Standings list
  const rankings = [];
  const eliminatedList = eliminatedPlayers.map(p => ({
    name: p.name,
    avatar: p.avatar,
    score: calculateScore(p),
    cash: sumArray(p.hand),
    eliminated: true,
    tableau: p.tableau
  }));

  if (remainingPlayers.length > 0) {
    // Score remaining players
    const scoredPlayers = remainingPlayers.map(p => {
      const score = calculateScore(p);
      const cash = sumArray(p.hand);
      // Tie breaker 2: highest single point card
      const pointCards = p.tableau.filter(c => c.type === 'point');
      const highestPointCard = pointCards.length > 0 ? Math.max(...pointCards.map(c => c.value)) : 0;

      return {
        player: p,
        name: p.name,
        avatar: p.avatar,
        score,
        cash,
        highestPointCard,
        tableau: p.tableau
      };
    });

    // Sort: 1. Score (desc), 2. Cash (desc), 3. Highest point card (desc)
    scoredPlayers.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.cash !== a.cash) return b.cash - a.cash;
      return b.highestPointCard - a.highestPointCard;
    });

    scoredPlayers.forEach((item, index) => {
      rankings.push({
        rank: index + 1,
        name: item.name,
        avatar: item.avatar,
        score: item.score,
        cash: item.cash,
        eliminated: false,
        tableau: item.tableau
      });
      logMessage(`STANDING #${index + 1}: ${item.name} with score ${item.score} (Cash: $${item.cash / 1000}k)`, "success");
    });
  }

  gameState.gameResults = {
    rankings,
    eliminated: eliminatedList
  };

  if (rankings.length > 0) {
    logMessage(`🏆 WINNER: ${rankings[0].name} wins with a score of ${rankings[0].score}!`, "success");
  } else {
    logMessage("All players were eliminated!", "warning");
  }

  broadcastState();
}

// ==========================================================================
// COMPUTER / AI PLAYER (AgentBasedCPU) PORTED STRATEGY ENGINE
// ==========================================================================

// Helper: generate combinations of r elements from array
function getCombinations(array, r) {
  const result = [];
  function helper(start, combo) {
    if (combo.length === r) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

// Helper: build AI beliefs structure
function getAgentBeliefs(playerIndex) {
  const p = gameState.players[playerIndex];
  
  const opponents = [];
  gameState.players.forEach((pl, idx) => {
    if (idx !== playerIndex) {
      opponents.push({
        id: pl.id,
        name: pl.name,
        wealth: sumArray(pl.hand),
        score: calculateScore(pl),
        bid: sumArray(pl.currentBid),
        hasPassed: pl.hasPassed,
        handSize: pl.hand.length,
        tableau: [...pl.tableau]
      });
    }
  });

  const allMoney = gameState.players.map(pl => sumArray(pl.hand)).sort((a, b) => b - a);
  const poorestMoney = allMoney[allMoney.length - 1];
  const richestMoney = allMoney[0];

  const oppMoney = opponents.map(opp => opp.wealth);
  const poorestOppMoney = oppMoney.length > 0 ? Math.min(...oppMoney) : 0;

  const myWealth = sumArray(p.hand);
  const myScore = calculateScore(p);
  const myBid = sumArray(p.currentBid);

  const allScores = gameState.players.map(pl => calculateScore(pl));
  const leaderScore = allScores.length > 0 ? Math.max(...allScores) : 0;

  return {
    myId: p.id,
    myName: p.name,
    myWealth: myWealth,
    myScore: myScore,
    myBid: myBid,
    myHand: [...p.hand],
    myTableau: [...p.tableau],
    opponents: opponents,
    auctionType: gameState.auctionType,
    currentCard: gameState.currentCard,
    highestBid: getHighestBid(),
    endGameTriggers: gameState.endGameTriggersRevealed,
    totalPlayers: gameState.players.length,
    poorestMoney: poorestMoney,
    richestMoney: richestMoney,
    isPoorest: myWealth === poorestMoney,
    isRichest: myWealth === richestMoney,
    poorestOppMoney: poorestOppMoney,
    marginToPoorest: myWealth - poorestOppMoney,
    leaderScore: leaderScore,
    isLeader: myScore === leaderScore
  };
}

// AI Utility calculation: Poverty avoidance cash reserves check
function calculateWealthUtility(beliefs, remainingMoney) {
  const poorestOpp = beliefs.poorestOppMoney;
  const margin = (remainingMoney - poorestOpp) / 1000; // Face value scaling (/ 1000)
  const gameUrgency = 1.0 + (beliefs.endGameTriggers * 1.5);
  
  if (margin < 0) {
    return margin * 8.0 * gameUrgency;
  } else if (margin === 0) {
    return -15.0 * gameUrgency;
  } else if (margin <= 5) {
    return (margin - 6) * 3.0 * gameUrgency;
  } else {
    return margin * 0.1;
  }
}

// AI Utility calculation: evaluates standard card values vs penalty loss weights
function calculateCardUtility(beliefs, card, actionType) {
  if (beliefs.auctionType === 'positive') {
    if (actionType === 'pass') {
      return 0.0;
    }
    if (card.type === 'point') {
      const desperation = 1.0 + (Math.max(0, beliefs.leaderScore - beliefs.myScore) / 20.0);
      return card.value * 5.0 * desperation;
    } else if (card.type === 'multiplier') {
      const marginalValue = Math.max(beliefs.myScore, 10.0);
      return marginalValue * 5.0;
    }
  } else { // Negative auction
    if (actionType === 'bid') {
      return 0.0;
    }
    if (card.name === '-5') {
      const multiplierCount = beliefs.myTableau.filter(c => c.type === 'multiplier').length;
      const multiplierFactor = Math.pow(2, multiplierCount);
      const loss = 5.0 * multiplierFactor;
      return -loss * 6.0;
    } else if (card.name === '÷2') {
      const loss = beliefs.myScore / 2.0;
      return -Math.max(loss, 6.0) * 6.0;
    } else if (card.name === 'Passé') {
      const pointCards = beliefs.myTableau.filter(c => c.type === 'point').map(c => c.value);
      const loss = pointCards.length > 0 ? Math.max(...pointCards) : 5.0;
      return -loss * 6.0;
    }
  }
  return 0.0;
}

// AI Utility calculation: Poverty Trap - forces opponent who is poorer to spend aggressively
function calculateTacticalUtility(beliefs, actionType) {
  if (beliefs.auctionType === 'positive' && actionType === 'pass') {
    let highestBidder = null;
    for (let opp of beliefs.opponents) {
      if (opp.bid === beliefs.highestBid && beliefs.highestBid > 0) {
        highestBidder = opp;
        break;
      }
    }
    if (highestBidder) {
      const isPoorestOpp = (highestBidder.wealth === beliefs.poorestMoney);
      if (isPoorestOpp && highestBidder.bid > highestBidder.wealth * 0.15) {
        return 25.0;
      }
    }
  }
  return 0.0;
}

// AI general action evaluator
function evaluateAction(beliefs, actionType, bidCombo = null) {
  const card = beliefs.currentCard;
  let remainingWealth = beliefs.myWealth;
  if (actionType === 'bid') {
    remainingWealth = beliefs.myWealth - sumArray(bidCombo);
  }

  // 1. Wealth Utility
  const wealthUtility = calculateWealthUtility(beliefs, remainingWealth);

  // 2. Card Utility
  const cardUtility = calculateCardUtility(beliefs, card, actionType);

  // 3. Tactical Utility
  const tacticalUtility = calculateTacticalUtility(beliefs, actionType);

  // 4. Overbid Waste Penalty & Card Count Flexibility Penalty
  let wastePenalty = 0.0;
  let cardCountPenalty = 0.0;

  if (actionType === 'bid') {
    const addedSum = sumArray(bidCombo);
    const newBidTotal = beliefs.myBid + addedSum;
    const waste = (newBidTotal - (beliefs.highestBid + 1000)) / 1000;

    let wasteFactor = 2.5;
    if (beliefs.myHand.length < 5) {
      wasteFactor = 1.0;
    }
    wastePenalty = Math.max(0, waste) * wasteFactor;

    const cardsSpent = bidCombo.length;
    const remainingHand = beliefs.myHand.length - cardsSpent;

    if (remainingHand === 0) {
      cardCountPenalty = cardsSpent * 15.0;
    } else if (remainingHand < 3) {
      cardCountPenalty = cardsSpent * 8.0;
    } else if (remainingHand < 5) {
      cardCountPenalty = cardsSpent * 4.0;
    } else {
      cardCountPenalty = cardsSpent * 1.5;
    }
  }

  return wealthUtility + cardUtility + tacticalUtility - wastePenalty - cardCountPenalty;
}

// Controller: Executes turn for the active AI player
function runCpuTurn(playerIndex) {
  if (gameState.status !== "in_progress" || playerIndex !== gameState.currentPlayerIndex) return;

  const p = gameState.players[playerIndex];
  if (p.hasPassed) return;

  const beliefs = getAgentBeliefs(playerIndex);

  // Evaluate PASS utility
  const passUtility = evaluateAction(beliefs, 'pass');

  let bestAction = 'pass';
  let bestCombo = null;
  let maxUtility = passUtility;

  // Generate combinations up to 3 cards
  for (let r = 1; r <= Math.min(3, p.hand.length); r++) {
    const combos = getCombinations(p.hand, r);
    for (let combo of combos) {
      const bidAdded = sumArray(combo);
      const newBid = sumArray(p.currentBid) + bidAdded;

      // Check raise validity (must beat highest bid)
      if (newBid <= beliefs.highestBid) {
        continue;
      }

      // Evaluate bid combination
      const bidUtility = evaluateAction(beliefs, 'bid', combo);
      if (bidUtility > maxUtility) {
        maxUtility = bidUtility;
        bestAction = 'bid';
        bestCombo = combo;
      }
    }
  }

  if (bestAction === 'bid' && bestCombo !== null) {
    executePlayerBid(playerIndex, bestCombo);
  } else {
    executePlayerPass(playerIndex);
  }
}

// Controller: Executes strategic Passé discard for the AI player
function runCpuDiscard(playerIndex) {
  if (gameState.status !== "pending_discard" || playerIndex !== gameState.pendingDiscardPlayerIndex) return;

  const p = gameState.players[playerIndex];
  
  // Find all point cards in the CPU's tableau
  const pointCards = p.tableau.filter(c => c.type === 'point');
  if (pointCards.length === 0) {
    clearTurnTimer();
    gameState.pendingDiscardPlayerIndex = null;
    gameState.status = "round_over";
    broadcastState();
    setTimeout(startRound, 3500);
    return;
  }

  // Discard the lowest-value point card!
  pointCards.sort((a, b) => a.value - b.value);
  const discarded = pointCards[0];

  const cardIdx = p.tableau.findIndex(c => c.type === 'point' && c.name === discarded.name && c.value === discarded.value);
  if (cardIdx !== -1) {
    p.tableau.splice(cardIdx, 1);
    logMessage(`${p.name} (AI) automatically discards their lowest-value Point card: ${discarded.name}.`, "danger");
  }

  // Clean up timer and discard state
  clearTurnTimer();
  gameState.pendingDiscardPlayerIndex = null;

  // Save round result
  gameState.lastRoundResult = {
    winner: p.name,
    card: gameState.currentCard.name,
    amount: 0,
    type: "negative"
  };

  // Passing player starts next round
  gameState.startingPlayerIndex = playerIndex;
  gameState.status = "round_over";

  broadcastState();

  setTimeout(() => {
    startRound();
  }, 3500);
}

// SOCKET IO SERVER EVENT INTERFACES
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 2. PLAYER JOIN / RECONNECT
  socket.on('joinPlayer', ({ name, playerId, avatar }) => {
    let player = null;
    let isReconnect = false;

    // Check for reconnection by playerId
    if (playerId) {
      player = gameState.players.find(p => p.id === playerId);
    }

    // Reconnection mapping
    if (player) {
      player.socketId = socket.id;
      player.connected = true;
      isReconnect = true;
      logMessage(`${player.name} reconnected to the game.`, "info");
    } else {
      // New player check
      if (gameState.status !== "waiting") {
        socket.emit('joinFailed', 'Game already in progress.');
        return;
      }
      if (gameState.players.length >= 5) {
        socket.emit('joinFailed', 'Lobby is full (max 5 players).');
        return;
      }
      if (!name || name.trim() === "") {
        socket.emit('joinFailed', 'Please enter a valid name.');
        return;
      }

      const cleanName = name.trim().substring(0, 16);
      const newPlayerId = crypto.randomBytes(8).toString('hex');

      player = {
        id: newPlayerId,
        name: cleanName,
        avatar: avatar || "👑", // Store selected avatar
        hand: [...STARTING_HAND],
        tableau: [],
        currentBid: [],
        hasPassed: false,
        pendingTheft: 0,
        connected: true,
        socketId: socket.id
      };

      gameState.players.push(player);
      logMessage(`${cleanName} joined the game lobby.`, "success");
    }

    socket.emit('joinSuccess', { playerId: player.id, name: player.name, avatar: player.avatar });
    broadcastState();
  });

  // 3. START GAME TRIGGER
  socket.on('startGame', () => {
    if (gameState.status === "waiting") {
      startNewGame();
    }
  });

  // 3a. ADD CPU PLAYER TRIGGER
  socket.on('addCpuPlayer', () => {
    if (gameState.status !== "waiting") return;
    if (gameState.players.length >= 5) return;

    const aiNames = [
      "AI Lord Chimington",
      "AI Duke Macaque",
      "AI Count Baboon",
      "AI Sir Orangutan",
      "AI Baron Gorilla",
      "AI Viscount Gibbon",
      "AI Marquess Mandrill"
    ];

    // Filter out names that are already taken
    const existingNames = gameState.players.map(p => p.name);
    const availableNames = aiNames.filter(name => !existingNames.includes(name));
    const chosenName = availableNames.length > 0 ? availableNames[0] : `AI Bot ${gameState.players.length + 1}`;

    const aiAvatars = ["🤖", "🦾", "👾", "💻", "🧠"];
    const chosenAvatar = aiAvatars[gameState.players.length % aiAvatars.length];
    const newPlayerId = "cpu_" + crypto.randomBytes(4).toString('hex');

    const cpuPlayer = {
      id: newPlayerId,
      name: chosenName,
      avatar: chosenAvatar,
      hand: [...STARTING_HAND],
      tableau: [],
      currentBid: [],
      hasPassed: false,
      pendingTheft: 0,
      connected: true,
      socketId: null,
      isCpu: true
    };

    gameState.players.push(cpuPlayer);
    logMessage(`${chosenName} (AI) joined the game lobby.`, "success");
    broadcastState();
  });

  // 3b. KICK PLAYER TRIGGER
  socket.on('kickPlayer', ({ playerId }) => {
    if (gameState.status !== "waiting") return;
    const idx = gameState.players.findIndex(p => p.id === playerId);
    if (idx !== -1) {
      const p = gameState.players[idx];
      logMessage(`${p.name} was kicked from the lobby.`, "warning");
      
      // Notify player socket to clear their session
      if (p.socketId) {
        io.to(p.socketId).emit('kicked');
      }
      
      // Remove from state
      gameState.players.splice(idx, 1);
      broadcastState();
    }
  });

  // 4. SUBMIT BID
  socket.on('submitBid', ({ addedCards }) => {
    const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    const p = gameState.players[playerIndex];

    if (gameState.status !== "in_progress") {
      socket.emit('actionError', 'Bidding is not active right now.');
      return;
    }
    if (playerIndex !== gameState.currentPlayerIndex) {
      socket.emit('actionError', 'It is not your turn.');
      return;
    }
    if (p.hasPassed) {
      socket.emit('actionError', 'You have already passed.');
      return;
    }
    if (!addedCards || addedCards.length === 0) {
      socket.emit('actionError', 'Must select at least one card to bid.');
      return;
    }

    // Verify added cards are in player's hand
    const tempHand = [...p.hand];
    let cardsAreValid = true;

    for (let card of addedCards) {
      const idx = tempHand.indexOf(card);
      if (idx === -1) {
        cardsAreValid = false;
        break;
      }
      tempHand.splice(idx, 1);
    }

    if (!cardsAreValid) {
      socket.emit('actionError', 'Invalid cards submitted. You do not have these bills.');
      return;
    }

    const currentBidSum = sumArray(p.currentBid);
    const addedBidSum = sumArray(addedCards);
    const newTotalBid = currentBidSum + addedBidSum;
    const maxBid = getHighestBid();

    // Check raise condition
    if (newTotalBid <= maxBid) {
      socket.emit('actionError', `Your total bid ($${newTotalBid / 1000}k) must be higher than the current highest bid ($${maxBid / 1000}k).`);
      return;
    }

    executePlayerBid(playerIndex, addedCards);
  });

  // 5. PASS AUCTION
  socket.on('passAuction', () => {
    const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1) return;

    const p = gameState.players[playerIndex];

    if (gameState.status !== "in_progress") {
      socket.emit('actionError', 'Bidding is not active right now.');
      return;
    }
    if (playerIndex !== gameState.currentPlayerIndex) {
      socket.emit('actionError', 'It is not your turn.');
      return;
    }
    if (p.hasPassed) {
      socket.emit('actionError', 'You have already passed.');
      return;
    }

    // Re-use common pass engine
    executePlayerPass(playerIndex);
  });

  // 5b. SELECT DISCARD FOR PASSE
  socket.on('selectDiscard', ({ cardName }) => {
    if (gameState.status !== "pending_discard") {
      socket.emit('actionError', 'Discard is not active.');
      return;
    }
    const playerIndex = gameState.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex === -1 || playerIndex !== gameState.pendingDiscardPlayerIndex) {
      socket.emit('actionError', 'It is not your turn to discard.');
      return;
    }

    const p = gameState.players[playerIndex];
    
    // Find the Point card in player's tableau matching the name
    const cardIdx = p.tableau.findIndex(c => c.type === 'point' && c.name === cardName);
    if (cardIdx === -1) {
      socket.emit('actionError', 'Card not found in your tableau.');
      return;
    }

    // Discard the card!
    const discardedCard = p.tableau[cardIdx];
    p.tableau.splice(cardIdx, 1);
    logMessage(`${p.name} selected and discarded Point card: ${discardedCard.name}.`, "danger");

    // Clean up timer and discard state
    clearTurnTimer();
    gameState.pendingDiscardPlayerIndex = null;

    // Save round result
    gameState.lastRoundResult = {
      winner: p.name,
      card: gameState.currentCard.name,
      amount: 0,
      type: "negative"
    };

    // Passing player starts the next round
    gameState.startingPlayerIndex = playerIndex;
    gameState.status = "round_over";

    broadcastState();

    setTimeout(() => {
      startRound();
    }, 3500);
  });

  // 6. CLIENT DISCONNECTION
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const player = gameState.players.find(p => p.socketId === socket.id);
    if (player) {
      player.connected = false;
      player.socketId = null;
      logMessage(`${player.name} disconnected.`, "warning");
      broadcastState();
    }
  });
});

// Start listening globally on 0.0.0.0
server.listen(PORT, '0.0.0.0', () => {
  console.log(`High Society server listening globally at http://0.0.0.0:${PORT}`);
});
