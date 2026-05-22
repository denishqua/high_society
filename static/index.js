document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const PLAYER_COLORS = [
        '#F59E0B', // Honey Gold
        '#10B981', // Emerald Green
        '#3B82F6', // Sapphire Blue
        '#F43F5E', // Ruby Rose
        '#A78BFA'  // Amethyst Violet
    ];

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
    
    // Bid to beat badge elements
    const bidToBeatBadge = document.getElementById('bid-to-beat-badge');
    const bidToBeatLabel = document.getElementById('bid-to-beat-label');
    const bidToBeatValue = document.getElementById('bid-to-beat-value');
    
    // New Round Result UI
    const actionControlsPanel = document.getElementById('action-controls-panel');
    const roundResultPanel = document.getElementById('round-result-panel');
    const roundResultText = document.getElementById('round-result-text');
    const btnNextRound = document.getElementById('btn-next-round');
    
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

    btnNextRound.addEventListener('click', async () => {
        btnNextRound.disabled = true;
        try {
            const res = await fetch('/api/next_round', { method: 'POST' });
            if (res.ok) {
                fetchState();
            }
        } catch (e) { console.error(e); }
        btnNextRound.disabled = false;
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
            } else if (gameState.status === 'in_progress' || gameState.status === 'round_over') {
                renderGame();
                
                if (gameState.status === 'in_progress') {
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

    // --- Helper Functions ---
    function getCardDisplayInfo(card) {
        if (!card) return null;
        
        // Handle Point cards
        if (card.type === 'point') {
            return { title: 'Point', displayValue: card.value, symbol: card.value };
        }
        
        if (card.type === 'multiplier') {
            return { title: 'Multiplier', displayValue: 'x2', symbol: 'x2' };
        }
        
        // Handle Penalty (negative) cards
        if (card.name === 'Scandale') return { title: 'Scandale', displayValue: '÷2', symbol: '÷2' };
        if (card.name === 'Faux Pas') return { title: 'Faux Pas', displayValue: '-5', symbol: '-5' };
        if (card.name === 'Theft') return { title: 'Theft', displayValue: '🔪', symbol: '🔪' };
        
        // Fallback
        return { title: card.name, displayValue: card.value, symbol: card.name };
    }

    function renderGame() {
        // Render Central Auction Card
        const card = gameState.current_auction_card;
        if (card) {
            const cardInfo = getCardDisplayInfo(card);
            auctionCardEl.className = `card ${card.type}`;
            auctionCardEl.innerHTML = `
                <span class="card-title">${cardInfo.title}</span>
                <span class="card-value">${cardInfo.displayValue}</span>
                ${card.is_end_game_trigger ? '<br><small>[End Game Trigger]</small>' : ''}
            `;
            auctionInfoEl.innerHTML = `<p class="auction-type">Type: <strong>${gameState.auction_type === 'positive' ? 'Positive (Win Card)' : 'Negative (Avoid Card)'}</strong></p>`;
        }

        // Players Grid
        playersGrid.innerHTML = '';
        gameState.players.forEach((p, idx) => {
            const isActive = idx === gameState.current_player_index;
            const color = PLAYER_COLORS[p.id % PLAYER_COLORS.length];
            const el = document.createElement('div');
            el.className = `player-card ${isActive ? 'active-turn' : ''}`;
            
            // Apply dynamic coloring to player card
            if (isActive) {
                el.style.borderColor = color;
                el.style.boxShadow = `0 0 15px ${color}4d`;
                el.style.background = `linear-gradient(135deg, ${color}0d, ${color}1a)`;
            } else {
                el.style.borderColor = `${color}33`;
            }
            
            // Format Player Status
            let status = 'Waiting';
            if (p.has_passed) status = 'Passed';
            else if (isActive) status = 'Thinking...';

            // Format Player Tableau (split into point-scoring point_cards and modifiers)
            const pointCards = p.tableau
                .filter(c => c.type === 'point')
                .map(c => `<span class="mini-card point">${getCardDisplayInfo(c).symbol}</span>`)
                .join('');
                
            let statusCards = p.tableau
                .filter(c => c.type !== 'point')
                .map(c => `<span class="mini-card ${c.type}">${getCardDisplayInfo(c).symbol}</span>`)
                .join('');
                
            // Include pending thefts in the status display
            if (p.pending_theft > 0) {
                 statusCards += `<span class="mini-card penalty">Pending Theft (${p.pending_theft})</span>`;
            }

            // Format Current Bid
            const displayBid = p.display_bid || [];
            const displayTotal = displayBid.reduce((a, b) => a + b, 0);
            let bidText = `<span class="gold-text">${displayTotal}</span> 🍌`;
            if (displayBid.length > 0) {
                bidText += ` <span style="font-size: 0.8em; color: var(--gold-dark);">[${displayBid.join(', ')}]</span>`;
            }

            // Construct Player Card HTML
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div class="player-name" style="color: ${color}; border-bottom: 1px solid ${color}33;">🐵 ${p.name}</div>
                    <div style="font-size: 0.9em; color: var(--gold-light); font-weight: bold;">Score: ${p.score}</div>
                </div>
                <div class="player-bid">Current Bid: ${bidText}</div>
                <div class="player-status">${status}</div>
                <div class="tableau-mini">Points: ${pointCards || '<span style="opacity:0.5">None</span>'}</div>
                <div class="tableau-mini">Modifiers: ${statusCards || '<span style="opacity:0.5">None</span>'}</div>
            `;
            playersGrid.appendChild(el);
        });

        // Active Player Hand
        const activeP = gameState.players[gameState.current_player_index];
        const activeColor = PLAYER_COLORS[activeP.id % PLAYER_COLORS.length];
        activePlayerName.innerHTML = `Turn: <span style="color: ${activeColor}; font-weight: bold;">${activeP.name}</span>`;
        
        const actionPrompt = document.getElementById('action-prompt');
        if (actionPrompt) {
            if (activeP.is_cpu) {
                actionPrompt.innerText = `${activeP.name} is deciding...`;
            } else {
                actionPrompt.innerText = "It's your turn to act.";
            }
        }

        // Calculate and display Bid to Beat
        const highestBid = Math.max(...gameState.players.map(p => p.bid_total));
        if (gameState.status === 'in_progress' && bidToBeatBadge) {
            bidToBeatBadge.classList.remove('hidden');
            bidToBeatValue.innerText = highestBid;
            if (gameState.auction_type === 'positive') {
                bidToBeatBadge.classList.remove('negative-auction');
                bidToBeatLabel.innerText = "Bid to Beat";
            } else {
                bidToBeatBadge.classList.add('negative-auction');
                bidToBeatLabel.innerText = "Bid to Avoid";
            }
        } else if (bidToBeatBadge) {
            bidToBeatBadge.classList.add('hidden');
        }
        
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
        
        // Handle Round Over state
        if (gameState.status === 'round_over') {
            actionControlsPanel.classList.add('hidden');
            handContainer.classList.add('hidden');
            document.getElementById('action-prompt').classList.add('hidden');
            
            roundResultPanel.classList.remove('hidden');
            const res = gameState.last_round_result;
            if (res) {
                const winnerP = gameState.players.find(pl => pl.name === res.winner);
                const winnerColor = winnerP ? PLAYER_COLORS[winnerP.id % PLAYER_COLORS.length] : 'var(--gold)';
                if (res.type === 'positive') {
                    roundResultText.innerHTML = `<span style="color: ${winnerColor}; font-weight: bold;">${res.winner}</span> won the ${res.card} for ${res.amount} 🍌!`;
                } else {
                    roundResultText.innerHTML = `<span style="color: ${winnerColor}; font-weight: bold;">${res.winner}</span> took the ${res.card} and reclaimed their bid!`;
                }
            }
        } else {
            actionControlsPanel.classList.remove('hidden');
            handContainer.classList.remove('hidden');
            document.getElementById('action-prompt').classList.remove('hidden');
            roundResultPanel.classList.add('hidden');
        }

        // Live Log
        if (gameState.game_log) {
            const logHTML = gameState.game_log.map(entry => {
                let color = "var(--text-main)";
                if (entry.type === "bid") color = "var(--gold-light)";
                else if (entry.type === "pass") color = "var(--text-muted)";
                else if (entry.type === "win") color = "var(--emerald-light)";
                else if (entry.type === "danger") color = "var(--danger)";
                else if (entry.type === "start") color = "var(--gold)";
                
                // Colorize player names in live log
                let msg = entry.msg;
                gameState.players.forEach(pl => {
                    const plColor = PLAYER_COLORS[pl.id % PLAYER_COLORS.length];
                    const escName = pl.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`\\b${escName}\\b`, 'g');
                    msg = msg.replace(regex, `<span style="color: ${plColor}; font-weight: 600;">${pl.name}</span>`);
                });

                return `<div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.1); color: ${color};">${msg}</div>`;
            }).join('');
            if (logContent.innerHTML !== logHTML) {
                logContent.innerHTML = logHTML;
                logContent.scrollTop = logContent.scrollHeight;
            }
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
                <span class="card-title">🍌</span>
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
            const winnerColor = PLAYER_COLORS[winner.id % PLAYER_COLORS.length];
            winnerAnnouncement.innerHTML = `Winner: <span style="color: ${winnerColor}; font-weight: bold;">${winner.name}</span>! 🏆`;
        } else {
             winnerAnnouncement.innerText = `Everyone was eliminated!`;
        }

        // Display remaining
        rankings.forEach((p, idx) => {
            const color = PLAYER_COLORS[p.id % PLAYER_COLORS.length];
            const row = document.createElement('div');
            row.className = `ranking-row ${idx === 0 ? 'winner' : ''}`;
            
            row.innerHTML = `
                <span>#${idx+1} <span style="color: ${color}; font-weight: bold;">${p.name}</span></span>
                <span>Score: ${p.final_score} | Money: ${p.total_money} 🍌</span>
            `;
            finalRankings.appendChild(row);
        });

        // Display Eliminated
        eliminated.forEach(p => {
             const color = PLAYER_COLORS[p.id % PLAYER_COLORS.length];
             const row = document.createElement('div');
             row.className = `ranking-row eliminated`;
             row.innerHTML = `
                <span>ELIMINATED: <span style="color: ${color}; font-weight: bold;">${p.name}</span> (Poor!)</span>
                <span>Score: ${p.final_score} | Money: ${p.total_money} 🍌</span>
            `;
            finalRankings.appendChild(row);
        });

        // Display final log
        const finalLogContainer = document.getElementById('final-log');
        if (finalLogContainer && gameState.game_log) {
            finalLogContainer.innerHTML = gameState.game_log.map(entry => {
                let color = "var(--text-main)";
                if (entry.type === "bid") color = "var(--gold-light)";
                else if (entry.type === "pass") color = "var(--text-muted)";
                else if (entry.type === "win") color = "var(--emerald-light)";
                else if (entry.type === "danger") color = "var(--danger)";
                else if (entry.type === "start") color = "var(--gold)";
                
                // Colorize player names in final log
                let msg = entry.msg;
                gameState.players.forEach(pl => {
                    const plColor = PLAYER_COLORS[pl.id % PLAYER_COLORS.length];
                    const escName = pl.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                    const regex = new RegExp(`\\b${escName}\\b`, 'g');
                    msg = msg.replace(regex, `<span style="color: ${plColor}; font-weight: 600;">${pl.name}</span>`);
                });

                return `<div style="color: ${color};">${msg}</div>`;
            }).join('');
            finalLogContainer.scrollTop = finalLogContainer.scrollHeight;
        }
    }

});
