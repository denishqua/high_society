document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let humanCount = 1;
    let cpuCount = 2;
    let gameState = null;
    let selectedCards = [];
    let pollInterval = null;
    let isCpuThinking = false;

    // --- DOM Elements ---
    const screens = {
        setup: document.getElementById('setup-screen'),
        game: document.getElementById('game-screen'),
        gameOver: document.getElementById('game-over-screen')
    };

    // Setup elements
    const humanInput = document.getElementById('human-count');
    const cpuInput = document.getElementById('cpu-count');
    const cpuSpeedInput = document.getElementById('cpu-speed');
    const btnStart = document.getElementById('btn-start');
    const setupError = document.getElementById('setup-error');

    // Game elements
    const auctionCardEl = document.getElementById('auction-card');
    const auctionInfoEl = document.getElementById('auction-info');
    const playersGrid = document.getElementById('players-grid');
    const activePlayerName = document.getElementById('active-player-name');
    const handContainer = document.getElementById('hand-container');
    const selectedBidTotalEl = document.getElementById('selected-bid-total');
    const btnBid = document.getElementById('btn-bid');
    const btnPass = document.getElementById('btn-pass');
    const logContent = document.querySelector('.log-content');

    // Game over elements
    const winnerAnnouncement = document.getElementById('winner-announcement');
    const finalRankings = document.getElementById('final-rankings');
    const btnPlayAgain = document.getElementById('btn-play-again');

    // --- Setup Listeners ---
    function validateSetup() {
        humanCount = parseInt(humanInput.value);
        cpuCount = parseInt(cpuInput.value);
        const total = humanCount + cpuCount;
        if (total >= 3 && total <= 5) {
            setupError.classList.add('hidden');
            btnStart.disabled = false;
        } else {
            setupError.classList.remove('hidden');
            btnStart.disabled = true;
        }
    }

    humanInput.addEventListener('input', validateSetup);
    cpuInput.addEventListener('input', validateSetup);

    btnStart.addEventListener('click', async () => {
        validateSetup();
        if (!btnStart.disabled) {
            btnStart.disabled = true;
            btnStart.innerText = "Opening Doors...";
            try {
                const res = await fetch('/api/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ num_human: humanCount, num_cpu: cpuCount })
                });
                if (res.ok) {
                    showScreen('game');
                    startPolling();
                }
            } catch (err) {
                console.error("Error starting game", err);
                btnStart.disabled = false;
                btnStart.innerText = "Open the Ballroom";
            }
        }
    });

    btnPlayAgain.addEventListener('click', () => {
        showScreen('setup');
        btnStart.disabled = false;
        btnStart.innerText = "Open the Ballroom";
        validateSetup();
    });

    // --- Action Listeners ---
    btnBid.addEventListener('click', async () => {
        if (selectedCards.length === 0) return;
        if (!gameState) return;
        
        const activeIdx = gameState.current_player_index;
        
        btnBid.disabled = true;
        try {
            const res = await fetch('/api/bid', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_index: activeIdx, cards: selectedCards })
            });
            const data = await res.json();
            if (!data.success) {
                alert("Invalid Bid: " + data.error);
            } else {
                selectedCards = [];
                updateHandUI();
            }
        } catch (e) { console.error(e); }
        btnBid.disabled = false;
        fetchState(); // immediate update
    });

    btnPass.addEventListener('click', async () => {
        if (!gameState) return;
        const activeIdx = gameState.current_player_index;
        
        btnPass.disabled = true;
        try {
            const res = await fetch('/api/pass', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ player_index: activeIdx })
            });
            const data = await res.json();
            if (!data.success) {
                alert("Cannot Pass: " + data.error);
            } else {
                selectedCards = [];
                updateHandUI();
            }
        } catch (e) { console.error(e); }
        btnPass.disabled = false;
        fetchState();
    });

    function updateBidButtonState() {
        if (!gameState) return;
        const total = selectedCards.reduce((a, b) => a + b, 0);
        
        if (gameState.auction_type === 'positive') {
            const highestBid = Math.max(...gameState.players.map(p => p.bid_total));
            const currentPlayer = gameState.players[gameState.current_player_index];
            const currentTotal = currentPlayer.bid_total + total;
            
            if (currentTotal <= highestBid) {
                btnBid.disabled = true;
                btnBid.innerText = `Must beat ${highestBid}`;
            } else {
                btnBid.disabled = false;
                btnBid.innerText = "Submit Bid";
            }
        } else {
            btnBid.disabled = selectedCards.length === 0;
            btnBid.innerText = "Submit Bid";
        }
    }

    // --- Hand Selection Logic ---
    function toggleCardSelection(cardValue, cardElement) {
        const idx = selectedCards.indexOf(cardValue);
        if (idx > -1) {
            // Deselect
            selectedCards.splice(idx, 1);
            cardElement.classList.remove('selected');
        } else {
            // Select
            selectedCards.push(cardValue);
            cardElement.classList.add('selected');
        }
        
        const total = selectedCards.reduce((a, b) => a + b, 0);
        selectedBidTotalEl.innerText = total;
        
        updateBidButtonState();
    }

    // --- State Polling & Rendering ---
    function startPolling() {
        if (pollInterval) clearInterval(pollInterval);
        fetchState();
        pollInterval = setInterval(fetchState, 1500); // 1.5s
    }

    async function fetchState() {
        if (isCpuThinking) return;
        try {
            const res = await fetch('/api/state');
            const data = await res.json();
            
            gameState = data;
            
            if (gameState.status === 'finished') {
                clearInterval(pollInterval);
                renderGameOver();
                showScreen('gameOver');
            } else if (gameState.status === 'in_progress') {
                renderGame();
                
                // CPU Action Logic
                const activeP = gameState.players[gameState.current_player_index];
                if (activeP.is_cpu && !activeP.has_passed) {
                    isCpuThinking = true;
                    setTimeout(async () => {
                        try {
                            await fetch('/api/cpu_action', { method: 'POST' });
                        } catch (e) { console.error(e); }
                        isCpuThinking = false;
                        fetchState();
                    }, parseFloat(cpuSpeedInput.value) * 1000); // User-configurable delay
                }
            }
        } catch (e) { console.error(e); }
    }

    function showScreen(screenId) {
        Object.values(screens).forEach(s => {
            if(s) s.classList.remove('active');
            if(s) s.classList.add('hidden');
        });
        screens[screenId].classList.remove('hidden');
        screens[screenId].classList.add('active');
    }

    function renderGame() {
        // Auction Card
        const card = gameState.current_auction_card;
        if (card) {
            auctionCardEl.className = `card ${card.type}`;
            let valStr = card.value;
            if (card.type === 'prestige') valStr = "x2";
            if (card.name === 'Scandale') valStr = "÷2";
            if (card.name === 'Faux Pas') valStr = "-5";
            if (card.name === 'Theft') valStr = "🔪";

            auctionCardEl.innerHTML = `
                <span class="card-title">${card.name}</span>
                <span class="card-value">${valStr}</span>
                ${card.is_end_game_trigger ? '<br><small>[End Game Trigger]</small>' : ''}
            `;
            auctionInfoEl.innerHTML = `<p class="auction-type">Type: <strong>${gameState.auction_type === 'positive' ? 'Positive (Win Card)' : 'Negative (Avoid Card)'}</strong></p>`;
        }

        // Players Grid
        playersGrid.innerHTML = '';
        gameState.players.forEach((p, idx) => {
            const isActive = idx === gameState.current_player_index;
            const el = document.createElement('div');
            el.className = `player-card ${isActive ? 'active-turn' : ''}`;
            
            let status = '';
            if (p.has_passed) status = 'Passed';
            else if (isActive) status = 'Thinking...';
            else status = 'Waiting';

            let tableauHTML = p.tableau.map(c => `<span class="mini-card ${c.type}">${c.name}</span>`).join('');

            el.innerHTML = `
                <div class="player-name">🐵 ${p.name}</div>
                <div class="player-bid">Current Bid: <span class="gold-text">${p.bid_total}</span> 🍌</div>
                <div class="player-status">${status}</div>
                <div class="tableau-mini">${tableauHTML}</div>
            `;
            playersGrid.appendChild(el);
        });

        // Active Player Hand
        const activeP = gameState.players[gameState.current_player_index];
        activePlayerName.innerText = `Turn: ${activeP.name}`;
        
        // Only re-render hand if it changed to prevent resetting selection
        // Quick hack: clear and rebuild unless they are already building a bid.
        // Actually it's easier to rebuild and clear selection on turn change
        if (handContainer.dataset.activePlayerId !== activeP.id.toString()) {
            selectedCards = [];
            selectedBidTotalEl.innerText = "0";
            handContainer.dataset.activePlayerId = activeP.id;
            updateHandUI(activeP.hand);
        }

        // Update basic button state
        updateBidButtonState();
        
        // Disable controls if CPU turn
        if (activeP.is_cpu) {
            btnBid.disabled = true;
            btnPass.disabled = true;
        } else {
            btnPass.disabled = false;
        }

    }

    function updateHandUI(handArray = null) {
        if (!gameState) return;
        const activeP = gameState.players[gameState.current_player_index];
        const hand = handArray || activeP.hand;
        
        handContainer.innerHTML = '';
        
        // Sort hand for display
        const sortedHand = [...hand].sort((a,b)=>a-b);
        
        sortedHand.forEach(val => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card money';
            if (selectedCards.includes(val)) cardEl.classList.add('selected'); // Try to persist selection
            
            cardEl.innerHTML = `
                <span class="card-title">Banana</span>
                <span class="card-value">${val}</span>
            `;
            
            cardEl.addEventListener('click', () => toggleCardSelection(val, cardEl));
            handContainer.appendChild(cardEl);
        });
        
        // Edge case: if they have no cards, they must pass
        if (hand.length === 0) {
            btnBid.disabled = true;
        }
    }

    function renderGameOver() {
        if (!gameState.game_results) return;
        
        finalRankings.innerHTML = '';
        
        const rankings = gameState.game_results.rankings;
        const eliminated = gameState.game_results.eliminated;
        
        let winner = rankings.length > 0 ? rankings[0] : null;
        
        if (winner) {
            winnerAnnouncement.innerText = `Winner: ${winner.name}! 🏆`;
        } else {
             winnerAnnouncement.innerText = `Everyone was eliminated!`;
        }

        // Display remaining
        rankings.forEach((p, idx) => {
            const row = document.createElement('div');
            row.className = `ranking-row ${idx === 0 ? 'winner' : ''}`;
            
            row.innerHTML = `
                <span>#${idx+1} ${p.name}</span>
                <span>Score: ${p.final_score} | Money: ${p.total_money} 🍌</span>
            `;
            finalRankings.appendChild(row);
        });

        // Display Eliminated
        eliminated.forEach(p => {
             const row = document.createElement('div');
             row.className = `ranking-row eliminated`;
             row.innerHTML = `
                <span>ELIMINATED: ${p.name} (Poor!)</span>
                <span>Score: ${p.final_score} | Money: ${p.total_money} 🍌</span>
            `;
            finalRankings.appendChild(row);
        });

        // Display final log
        const finalLogContainer = document.getElementById('final-log');
        if (finalLogContainer && gameState.game_log) {
            finalLogContainer.innerHTML = gameState.game_log.map(msg => `<div>${msg}</div>`).join('');
            finalLogContainer.scrollTop = finalLogContainer.scrollHeight;
        }
    }

});
