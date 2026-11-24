'use strict';

/**
 * Boundary Club - Multiplayer Client
 * Handles real-time Socket.IO room management, franchise assignment, and auction synchronization.
 */

class MultiplayerClient {
    constructor() {
        this.socket = null;
        this.active = false;
        this.roomCode = null;
        this.isHost = false;
        this.myParticipantId = null;
        this.myTeamIdx = null;
        this.roomState = null;
        this.playerName = localStorage.getItem('boundaryClubPlayerName') || 'Manager ' + Math.floor(100 + Math.random() * 900);
        this.bound = false;
    }

    init() {
        this.setupUI();

        if (typeof io === 'undefined') {
            console.log('Socket.IO not available yet. Running in local solo mode.');
            return;
        }

        try {
            // If running via file: protocol or alternate dev port, point to localhost:3000
            const isFile = window.location.protocol === 'file:';
            const isAlternatePort = window.location.port !== '3000' && window.location.port !== '';
            const serverUrl = (isFile || isAlternatePort) ? 'http://localhost:3000' : undefined;

            this.socket = serverUrl ? io(serverUrl, { timeout: 5000 }) : io({ timeout: 5000 });
            this.setupSocketListeners();
            this.updateBadge();
        } catch (err) {
            console.warn('Socket connection could not be established:', err);
        }
    }

    setupSocketListeners() {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            this.myParticipantId = this.socket.id;
            this.updateBadge();
            const connStatus = document.getElementById('mpConnectionStatus');
            if (connStatus) {
                connStatus.innerHTML = '<span class="mp-status-dot"></span> Connected';
            }
        });

        this.socket.on('disconnect', () => {
            this.updateBadge();
            const connStatus = document.getElementById('mpConnectionStatus');
            if (connStatus) {
                connStatus.innerHTML = '<span class="mp-status-dot disconnected"></span> Disconnected';
            }
            if (this.active) {
                if (typeof showToast === 'function') {
                    showToast('Disconnected from multiplayer server. Reconnecting...', 'warning');
                }
            }
        });

        this.socket.on('connect_error', (err) => {
            const connStatus = document.getElementById('mpConnectionStatus');
            if (connStatus) {
                connStatus.innerHTML = '<span class="mp-status-dot disconnected"></span> Offline';
            }
        });

        this.socket.on('room:created', (data) => {
            this.active = true;
            this.roomCode = data.roomCode;
            this.isHost = true;
            this.myTeamIdx = null;
            this.roomState = data.roomState;
            this.renderLobby();
            this.updateBadge();
            if (typeof showToast === 'function') {
                showToast(`Room created! Code: ${data.roomCode}`, 'success');
            }
        });

        this.socket.on('room:joined', (data) => {
            this.active = true;
            this.roomCode = data.roomCode;
            this.isHost = data.participant.isHost;
            this.myTeamIdx = data.participant.teamIdx;
            this.roomState = data.roomState;
            this.renderLobby();
            this.updateBadge();

            if (data.auctionState && data.auctionState.auctionStarted) {
                this.handleAuctionState(data.auctionState);
                this.closeModal();
            }

            if (typeof showToast === 'function') {
                showToast(`Joined Room: ${data.roomCode}`, 'success');
            }
        });

        this.socket.on('room:state', (state) => {
            this.roomState = state;
            const me = state.participants.find(p => p.id === (this.socket ? this.socket.id : null));
            if (me) {
                this.isHost = me.isHost;
                this.myTeamIdx = me.teamIdx;
            }
            this.renderLobby();
            this.updateBadge();
            this.applyOwnershipControls();
            this.syncHostControls();
        });

        this.socket.on('room:error', (data) => {
            if (typeof showToast === 'function') {
                showToast(data.error || 'Multiplayer error', 'error');
            }
        });

        this.socket.on('auction:error', (data) => {
            if (typeof showToast === 'function') {
                showToast(data.error || 'Auction error', 'error');
            }
        });

        this.socket.on('auction:started', (state) => {
            this.handleAuctionStarted(state);
        });

        this.socket.on('auction:state', (state) => {
            this.handleAuctionState(state);
        });

        this.socket.on('auction:bidUpdate', (data) => {
            this.handleBidUpdate(data);
        });

        this.socket.on('auction:timerTick', (data) => {
            this.handleTimerTick(data);
        });

        this.socket.on('auction:playerSold', (data) => {
            this.handlePlayerSold(data);
        });

        this.socket.on('auction:playerUnsold', (data) => {
            this.handlePlayerUnsold(data);
        });

        this.socket.on('auction:timerPaused', (data) => {
            this.handleTimerPaused(data);
        });
    }

    setupUI() {
        if (this.bound) return;

        const modal = document.getElementById('multiplayerModal');
        const openBtn = document.getElementById('multiplayerBtn');
        const navBtn = document.getElementById('multiplayerNavBtn');
        const closeBtn = document.getElementById('closeMultiplayerModalBtn');
        const createBtn = document.getElementById('mpCreateRoomBtn');
        const joinBtn = document.getElementById('mpJoinRoomBtn');
        const copyBtn = document.getElementById('mpCopyCodeBtn');
        const leaveBtn = document.getElementById('mpLeaveRoomBtn');
        const startBtn = document.getElementById('mpStartAuctionBtn');
        const nameInput = document.getElementById('mpPlayerName');

        // Only mark bound if key elements are present in DOM
        if (openBtn || modal) {
            this.bound = true;
        }

        if (nameInput) {
            nameInput.value = this.playerName;
            nameInput.addEventListener('change', () => {
                this.playerName = nameInput.value.trim() || 'Manager';
                localStorage.setItem('boundaryClubPlayerName', this.playerName);
            });
        }

        if (openBtn) {
            openBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal();
            });
        }

        if (navBtn) {
            navBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openModal();
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeModal();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (this.roomCode) {
                    navigator.clipboard.writeText(this.roomCode).then(() => {
                        if (typeof showToast === 'function') showToast('Room code copied to clipboard!', 'success');
                    }).catch(() => {
                        prompt('Room Code:', this.roomCode);
                    });
                }
            });
        }

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                if (!this.socket || !this.socket.connected) {
                    if (typeof showToast === 'function') {
                        showToast('Connecting to server at http://localhost:3000. Ensure "npm start" is running.', 'warning');
                    }
                    this.init();
                    return;
                }
                const name = nameInput ? nameInput.value.trim() : this.playerName;
                const currentTeams = typeof appState !== 'undefined' ? appState.teams : null;
                const currentSettings = typeof appState !== 'undefined' ? appState.settings : null;
                this.socket.emit('room:create', {
                    hostName: name || 'Host',
                    settings: currentSettings,
                    teams: currentTeams
                });
            });
        }

        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                if (!this.socket || !this.socket.connected) {
                    if (typeof showToast === 'function') {
                        showToast('Connecting to server at http://localhost:3000. Ensure "npm start" is running.', 'warning');
                    }
                    this.init();
                    return;
                }
                const codeInput = document.getElementById('mpRoomCodeInput');
                const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
                if (!code || code.length !== 6) {
                    if (typeof showToast === 'function') showToast('Enter a valid 6-character room code', 'warning');
                    return;
                }
                const name = nameInput ? nameInput.value.trim() : this.playerName;
                this.socket.emit('room:join', { roomCode: code, participantName: name || 'Guest' });
            });
        }

        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                this.leaveRoom();
            });
        }

        if (startBtn) {
            startBtn.addEventListener('click', () => {
                if (!this.isHost) return;
                const currentTeams = typeof appState !== 'undefined' ? appState.teams : null;
                const currentSettings = typeof appState !== 'undefined' ? appState.settings : null;
                this.socket.emit('auction:start', { teams: currentTeams, settings: currentSettings });
            });
        }

        // Live badge click opens modal
        const badge = document.getElementById('multiplayerLiveBadge');
        if (badge) {
            badge.addEventListener('click', () => this.openModal());
        }
    }

    openModal() {
        const modal = document.getElementById('multiplayerModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.renderLobby();
        } else {
            console.error('multiplayerModal element not found');
        }
    }

    closeModal() {
        const modal = document.getElementById('multiplayerModal');
        if (modal) modal.classList.add('hidden');
    }

    leaveRoom() {
        if (this.socket && this.active) {
            this.socket.emit('room:leave');
        }
        this.active = false;
        this.roomCode = null;
        this.isHost = false;
        this.myTeamIdx = null;
        this.roomState = null;
        this.renderLobby();
        this.updateBadge();
        this.applyOwnershipControls();
        this.syncHostControls();
        if (typeof showToast === 'function') showToast('Left the room', 'warning');
    }

    selectTeam(teamIdx) {
        if (!this.socket || !this.active) return;
        const target = this.myTeamIdx === teamIdx ? null : teamIdx;
        this.socket.emit('room:selectTeam', { teamIdx: target });
    }

    renderLobby() {
        const preSection = document.getElementById('mpPreJoinSection');
        const activeSection = document.getElementById('mpActiveRoomSection');
        if (!preSection || !activeSection) return;

        if (!this.active) {
            preSection.classList.remove('hidden');
            activeSection.classList.add('hidden');
            return;
        }

        preSection.classList.add('hidden');
        activeSection.classList.remove('hidden');

        // Display room code
        const codeDisplay = document.getElementById('mpRoomCodeDisplay');
        if (codeDisplay) codeDisplay.textContent = this.roomCode || '------';

        // Role badge
        const roleBadge = document.getElementById('mpRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = this.isHost ? 'Host' : 'Participant';
            roleBadge.className = this.isHost
                ? 'px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40'
                : 'px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40';
        }

        // Connection status
        const connStatus = document.getElementById('mpConnectionStatus');
        if (connStatus) {
            const isConn = this.socket && this.socket.connected;
            connStatus.innerHTML = `<span class="mp-status-dot ${isConn ? '' : 'disconnected'}"></span> ${isConn ? 'Connected' : 'Disconnected'}`;
        }

        // Host start button vs waiting notice
        const startBtn = document.getElementById('mpStartAuctionBtn');
        const waitNotice = document.getElementById('mpWaitingMsg');
        if (startBtn && waitNotice) {
            if (this.isHost) {
                startBtn.classList.remove('hidden');
                waitNotice.classList.add('hidden');
            } else {
                startBtn.classList.add('hidden');
                waitNotice.classList.remove('hidden');
            }
        }

        // Participants list
        const partList = document.getElementById('mpParticipantsList');
        if (partList && this.roomState && this.roomState.participants) {
            partList.innerHTML = this.roomState.participants.map(p => {
                const isMe = p.id === (this.socket ? this.socket.id : null);
                const teamName = p.teamIdx !== null && typeof appState !== 'undefined' && appState.teams[p.teamIdx]
                    ? appState.teams[p.teamIdx].name
                    : null;
                return `
                    <div class="flex items-center justify-between py-1.5 px-3 bg-gray-800/60 rounded-lg text-sm border border-gray-700/60">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-400"></span>
                            <span class="font-medium text-white">${this.escape(p.name)} ${isMe ? '<span class="text-xs text-fuchsia-400">(You)</span>' : ''}</span>
                            ${p.isHost ? '<span class="text-[10px] px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">HOST</span>' : ''}
                        </div>
                        <div>
                            ${teamName ? `<span class="text-xs font-semibold text-fuchsia-300 bg-fuchsia-950/60 border border-fuchsia-800/60 px-2 py-0.5 rounded">${this.escape(teamName)}</span>` : '<span class="text-xs text-gray-500 italic">No Franchise</span>'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Franchise selection grid
        const franchiseGrid = document.getElementById('mpFranchiseSelectGrid');
        if (franchiseGrid && typeof appState !== 'undefined' && appState.teams) {
            franchiseGrid.innerHTML = appState.teams.map((team, idx) => {
                const owner = this.roomState && this.roomState.participants
                    ? this.roomState.participants.find(p => p.teamIdx === idx)
                    : null;
                const isMine = this.myTeamIdx === idx;
                const isTaken = owner && !isMine;

                let cardClass = 'mp-franchise-card p-3 rounded-xl flex flex-col justify-between ';
                if (isMine) cardClass += 'claimed-by-me border-fuchsia-500 bg-fuchsia-950/40 ';
                else if (isTaken) cardClass += 'claimed-by-other bg-gray-900/40 ';
                else cardClass += 'bg-gray-800/60 cursor-pointer hover:border-gray-500 ';

                let statusBadge = '';
                if (isMine) {
                    statusBadge = '<span class="text-xs text-green-400 font-semibold">Your Franchise</span>';
                } else if (isTaken) {
                    statusBadge = `<span class="text-xs text-gray-400">Claimed: ${this.escape(owner.name)}</span>`;
                } else {
                    statusBadge = '<span class="text-xs text-fuchsia-400 font-semibold">Available</span>';
                }

                return `
                    <div class="${cardClass}" onclick="window.multiplayer.selectTeam(${idx})" style="border-left: 4px solid ${team.color || '#3b82f6'};">
                        <div class="flex items-center justify-between mb-2">
                            <h4 class="font-bold text-white text-sm">${this.escape(team.name)}</h4>
                            <span class="text-xs font-mono text-gray-400">₹${typeof formatPrice === 'function' ? formatPrice(team.purse) : (team.purse + 'L')}</span>
                        </div>
                        <div class="flex items-center justify-between mt-auto pt-2 border-t border-gray-700/50">
                            ${statusBadge}
                            <button type="button" class="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white font-medium">
                                ${isMine ? 'Release' : isTaken ? 'Occupied' : 'Claim'}
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    updateBadge() {
        const badge = document.getElementById('multiplayerLiveBadge');
        const navLabel = document.getElementById('multiplayerNavLabel');
        const isConn = this.socket && this.socket.connected;

        if (navLabel) {
            if (this.active && this.roomCode) {
                navLabel.textContent = `Room ${this.roomCode}`;
            } else {
                navLabel.textContent = 'Multiplayer';
            }
        }

        if (!badge) return;

        if (this.active && this.roomCode) {
            badge.classList.remove('hidden');
            const count = this.roomState && this.roomState.participants ? this.roomState.participants.length : 1;
            const teamName = this.myTeamIdx !== null && typeof appState !== 'undefined' && appState.teams[this.myTeamIdx]
                ? appState.teams[this.myTeamIdx].name
                : (this.isHost ? 'Host' : 'Spectator');

            badge.innerHTML = `
                <span class="mp-status-dot ${isConn ? '' : 'disconnected'}"></span>
                <span class="mp-room-code-tag">${this.escape(this.roomCode)}</span>
                <span class="text-gray-400 text-[11px]">·</span>
                <span class="text-fuchsia-300 font-medium">${this.escape(teamName)}</span>
                <span class="text-gray-500 text-[10px]">(${count}p)</span>
            `;
        } else {
            badge.classList.add('hidden');
        }
    }

    getTeamOwner(teamIdx) {
        if (!this.roomState || !this.roomState.participants) return null;
        return this.roomState.participants.find(p => p.teamIdx === teamIdx) || null;
    }

    applyOwnershipControls() {
        if (!this.active) return;
        const bidButtons = document.querySelectorAll('.bid-team-card-btn');
        if (!bidButtons || !bidButtons.length) return;

        bidButtons.forEach((btn, tid) => {
            const owner = this.getTeamOwner(tid);
            const reasonEl = btn.querySelector('.team-btn-reason');
            btn.classList.remove('team-mine', 'team-disabled');

            if (this.myTeamIdx !== null) {
                if (tid === this.myTeamIdx) {
                    btn.classList.add('team-mine');
                } else {
                    btn.classList.add('team-disabled');
                    btn.disabled = true;
                    btn.classList.add('opacity-60', 'cursor-not-allowed');
                    if (reasonEl) {
                        reasonEl.innerText = owner ? `Owned by ${owner.name}` : 'Not your franchise';
                        reasonEl.classList.remove('hidden');
                    }
                }
            } else if (!this.isHost) {
                // Spectator
                btn.classList.add('team-disabled');
                btn.disabled = true;
                btn.classList.add('opacity-60', 'cursor-not-allowed');
                if (reasonEl) {
                    reasonEl.innerText = owner ? `Owned by ${owner.name}` : 'Spectating';
                    reasonEl.classList.remove('hidden');
                }
            }
        });
    }

    syncHostControls() {
        if (!this.active) return;
        const isHost = this.isHost;

        // Auctioneer controls: hide or disable if not host
        const manualSellBtn = document.getElementById('manualSellBtn');
        const unsoldBtn = document.getElementById('unsoldBtn');
        const pauseTimerBtn = document.getElementById('pauseTimerBtn');
        const restartPlayerBtn = document.getElementById('restartPlayerBtn');
        const undoBtn = document.getElementById('undoBtn');
        const startRoundBtn = document.getElementById('startRoundBtn');
        const startUnsoldRoundBtn = document.getElementById('startUnsoldRoundBtn');

        if (!isHost) {
            if (manualSellBtn) manualSellBtn.style.display = 'none';
            if (unsoldBtn) unsoldBtn.style.display = 'none';
            if (pauseTimerBtn) pauseTimerBtn.style.display = 'none';
            if (restartPlayerBtn) restartPlayerBtn.style.display = 'none';
            if (undoBtn) undoBtn.style.display = 'none';
            if (startRoundBtn) startRoundBtn.style.display = 'none';
            if (startUnsoldRoundBtn) startUnsoldRoundBtn.style.display = 'none';

            // Show a waiting label in pool preview if open
            const poolModal = document.getElementById('poolModal');
            if (poolModal && !poolModal.classList.contains('hidden')) {
                let waitPoolText = document.getElementById('mpWaitPoolText');
                if (!waitPoolText) {
                    waitPoolText = document.createElement('p');
                    waitPoolText.id = 'mpWaitPoolText';
                    waitPoolText.className = 'text-center text-gray-400 text-sm mt-3 italic';
                    startRoundBtn.parentNode.appendChild(waitPoolText);
                }
                waitPoolText.textContent = 'Waiting for the host to start this round...';
                waitPoolText.style.display = 'block';
            }
        } else {
            if (manualSellBtn) manualSellBtn.style.display = '';
            if (unsoldBtn) unsoldBtn.style.display = '';
            if (pauseTimerBtn) pauseTimerBtn.style.display = '';
            if (restartPlayerBtn) restartPlayerBtn.style.display = '';
            if (undoBtn) undoBtn.style.display = '';
            if (startRoundBtn) startRoundBtn.style.display = '';
            if (startUnsoldRoundBtn) startUnsoldRoundBtn.style.display = '';
            const waitPoolText = document.getElementById('mpWaitPoolText');
            if (waitPoolText) waitPoolText.style.display = 'none';
        }
    }

    // --- Outgoing Auction Actions ---
    placeBid(teamIdx, step = 1) {
        if (!this.socket || !this.active) return;
        this.socket.emit('auction:bid', { teamIdx, step });
    }

    startRound() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:startRound');
    }

    nextPlayer() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:nextPlayer');
    }

    togglePauseTimer() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:pause');
    }

    sellPlayer() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:sell');
    }

    markUnsold() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:unsold');
    }

    restartCurrentPlayer() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:restart');
    }

    undoLastAction() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:undo');
    }

    startUnsoldRound() {
        if (!this.socket || !this.active || !this.isHost) return;
        this.socket.emit('auction:startUnsoldRound');
    }

    // --- Incoming Event Handlers ---
    handleAuctionStarted(state) {
        this.closeModal();
        if (typeof setupScreen !== 'undefined' && setupScreen) setupScreen.classList.add('hidden');
        if (typeof auctionScreen !== 'undefined' && auctionScreen) auctionScreen.classList.remove('hidden');
        if (typeof resumeBanner !== 'undefined' && resumeBanner) resumeBanner.classList.add('hidden');

        this.handleAuctionState(state);
    }

    handleAuctionState(state) {
        if (!state || typeof appState === 'undefined') return;

        // Synchronize appState authoritatively
        appState.auctionStarted = state.auctionStarted;
        appState.auctionEnded = state.auctionEnded;
        appState.phase = state.phase;
        appState.currentPoolIndex = state.currentPoolIndex;
        appState.currentPlayerIndex = state.currentPlayerIndex;
        appState.currentBid = state.currentBid;
        appState.highestBidder = state.highestBidder;
        appState.timeLeft = state.timeLeft;
        appState.timerPaused = state.timerPaused;
        appState.lastBidInfo = state.lastBidInfo;
        appState.lotBids = state.lotBids || [];
        appState.stats = state.stats || appState.stats;
        appState.highestBidRecord = state.highestBidRecord || appState.highestBidRecord;
        appState.isUnsoldRound = state.isUnsoldRound;

        if (Array.isArray(state.teams)) {
            state.teams.forEach((st, i) => {
                if (appState.teams[i]) {
                    appState.teams[i].purse = st.purse;
                    appState.teams[i].squad = st.squad;
                }
            });
        }

        // Synchronize pool order if provided
        if (state.poolOrder) appState.poolOrder = state.poolOrder;

        // Render UI
        if (typeof updateAllTeamDisplays === 'function') updateAllTeamDisplays();
        if (typeof updateSoldPlayersTable === 'function') updateSoldPlayersTable();
        if (typeof updateStickyStats === 'function') updateStickyStats();
        if (typeof updateHighestBidRecordDisplay === 'function') updateHighestBidRecordDisplay();
        if (typeof updateProgressIndicator === 'function') updateProgressIndicator();

        const poolModal = document.getElementById('poolModal');

        if (state.phase === 'preview') {
            if (state.currentPoolKey && poolModal) {
                const [cat, price] = state.currentPoolKey.split('-');
                const poolTitle = document.getElementById('poolModalTitle');
                const poolList = document.getElementById('poolModalPlayerList');
                if (poolTitle) poolTitle.innerText = `Upcoming: ${cat} (₹${typeof formatPrice === 'function' ? formatPrice(parseInt(price)) : price})`;
                if (poolList && state.poolPlayers) {
                    poolList.innerHTML = state.poolPlayers.map(p => `
                        <div class="bg-gray-800/80 p-2.5 rounded-lg text-center border border-gray-700">
                            <p class="font-bold text-xs text-white truncate">${typeof getRoleSvg === 'function' ? getRoleSvg(p.category) : ''} ${this.escape(p.name)}</p>
                            <p class="text-[10px] text-gray-400">${this.escape(p.country)}</p>
                        </div>
                    `).join('');
                }
                const startRoundBtn = document.getElementById('startRoundBtn');
                if (startRoundBtn) {
                    startRoundBtn.innerText = 'Start Round';
                    startRoundBtn.classList.remove('hidden');
                }
                poolModal.classList.remove('hidden');
            }
        } else {
            if (poolModal) poolModal.classList.add('hidden');
        }

        if (state.currentPlayer) {
            if (typeof displayPlayer === 'function') displayPlayer(state.currentPlayer);
            if (typeof renderBidHistory === 'function') renderBidHistory();
            if (typeof updateControls === 'function') updateControls(false);

            if (state.highestBidder !== null && appState.teams[state.highestBidder]) {
                const highestBidderEl = document.getElementById('highestBidder');
                if (highestBidderEl) highestBidderEl.innerText = appState.teams[state.highestBidder].name;
            }

            if (state.phase === 'settled') {
                const sold = state.currentPlayer.status === 'sold';
                const stamp = document.getElementById('soldStamp');
                const playerCard = document.getElementById('playerCard');
                if (stamp) {
                    stamp.innerText = sold ? 'SOLD' : 'UNSOLD';
                    stamp.style.color = sold ? '#22c55e' : '#9ca3af';
                    stamp.style.borderColor = sold ? '#22c55e' : '#9ca3af';
                    stamp.classList.remove('hidden');
                }
                if (playerCard) {
                    playerCard.classList.remove('player-state-sold', 'player-state-unsold');
                    playerCard.classList.add(sold ? 'player-state-sold' : 'player-state-unsold');
                }
                if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus(sold ? 'sold' : 'unsold');

                const nextPlayerBtn = document.getElementById('nextPlayerBtn');
                const manualSellBtn = document.getElementById('manualSellBtn');
                const unsoldBtn = document.getElementById('unsoldBtn');
                if (manualSellBtn) manualSellBtn.classList.add('hidden');
                if (unsoldBtn) unsoldBtn.classList.add('hidden');
                if (nextPlayerBtn && this.isHost) nextPlayerBtn.classList.remove('hidden');
            } else {
                const nextPlayerBtn = document.getElementById('nextPlayerBtn');
                if (nextPlayerBtn) nextPlayerBtn.classList.add('hidden');
            }
        }

        this.applyOwnershipControls();
        this.syncHostControls();
        this.updateBadge();
    }

    handleBidUpdate(data) {
        if (!data || typeof appState === 'undefined') return;

        appState.currentBid = data.currentBid;
        appState.highestBidder = data.highestBidder;
        appState.lastBidInfo = data.lastBidInfo;
        appState.lotBids = data.lotBids || [];
        appState.timeLeft = data.timeLeft;

        const currentBidEl = document.getElementById('currentBid');
        const highestBidderEl = document.getElementById('highestBidder');
        const lastBidEl = document.getElementById('lastBidStrip');
        const team = appState.teams[data.highestBidder];

        if (currentBidEl) {
            currentBidEl.innerText = `₹${typeof formatPrice === 'function' ? formatPrice(data.currentBid) : data.currentBid}`;
            currentBidEl.classList.remove('price-pop');
            void currentBidEl.offsetWidth;
            currentBidEl.classList.add('price-pop');
        }

        if (highestBidderEl && team) {
            highestBidderEl.innerText = team.name;
        }

        if (lastBidEl && team) {
            const bidderTag = data.lastBidInfo && data.lastBidInfo.bidderName ? ` (${this.escape(data.lastBidInfo.bidderName)})` : '';
            lastBidEl.innerHTML = `<svg class="w-3.5 h-3.5 inline text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> ${this.escape(team.name)}${bidderTag} bid ₹${typeof formatPrice === 'function' ? formatPrice(data.currentBid) : data.currentBid} · just now`;
        }

        if (typeof renderBidHistory === 'function') renderBidHistory();
        if (typeof updateControls === 'function') updateControls(false);
        if (typeof playSound === 'function') playSound('bid');

        const manualSellBtn = document.getElementById('manualSellBtn');
        const unsoldBtn = document.getElementById('unsoldBtn');
        if (manualSellBtn) {
            manualSellBtn.disabled = !this.isHost;
            manualSellBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            manualSellBtn.classList.remove('hidden');
        }
        if (unsoldBtn) unsoldBtn.classList.add('hidden');

        this.applyOwnershipControls();
        this.syncHostControls();
    }

    handleTimerTick(data) {
        const timerDisplay = document.getElementById('timer');
        const timerRing = document.getElementById('timerRing');
        if (!timerDisplay) return;

        const duration = (typeof appState !== 'undefined' && appState.settings && appState.settings.timerDuration) || 40;
        const ringCircumference = 2 * Math.PI * 42;

        timerDisplay.innerText = data.timeLeft;
        if (timerRing) {
            const offset = ringCircumference - (data.timeLeft / duration) * ringCircumference;
            timerRing.style.strokeDashoffset = offset;

            if (data.timeLeft <= 10 && data.timeLeft > 0) {
                timerRing.classList.add('timer-urgent');
                timerDisplay.classList.add('timer-text-urgent');
                if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('going-twice');
            } else if (data.timeLeft <= 20) {
                if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('going-once');
            } else {
                timerRing.classList.remove('timer-urgent');
                timerDisplay.classList.remove('timer-text-urgent');
                if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('open');
            }
        }
    }

    handlePlayerSold(data) {
        if (!data) return;
        const stamp = document.getElementById('soldStamp');
        const playerCard = document.getElementById('playerCard');
        const messageBox = document.getElementById('messageBox');

        if (messageBox && data.team) {
            messageBox.innerHTML = `<span class="text-green-400 text-xl font-bold">SOLD to ${this.escape(data.team.name)}!</span>`;
        }

        if (stamp) {
            stamp.innerText = 'SOLD';
            stamp.style.color = '#22c55e';
            stamp.style.borderColor = '#22c55e';
            stamp.classList.remove('hidden');
            void stamp.offsetWidth;
            stamp.classList.add('animate');
        }

        if (playerCard) {
            playerCard.classList.remove('player-state-unsold');
            playerCard.classList.add('player-state-sold');
        }

        if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('sold');
        if (typeof playSound === 'function') {
            const teamIndex = data.team ? data.team.index : 0;
            playSound(`team${teamIndex + 1}`);
        }

        const bidButtons = document.querySelectorAll('.bid-team-card-btn');
        bidButtons.forEach(b => b.disabled = true);

        const manualSellBtn = document.getElementById('manualSellBtn');
        const unsoldBtn = document.getElementById('unsoldBtn');
        const nextPlayerBtn = document.getElementById('nextPlayerBtn');

        if (manualSellBtn) manualSellBtn.classList.add('hidden');
        if (unsoldBtn) unsoldBtn.classList.add('hidden');
        if (nextPlayerBtn && this.isHost) nextPlayerBtn.classList.remove('hidden');

        if (typeof updateAllTeamDisplays === 'function') updateAllTeamDisplays();
        if (typeof updateStickyStats === 'function') updateStickyStats();
        if (typeof updateSoldPlayersTable === 'function') updateSoldPlayersTable();
    }

    handlePlayerUnsold(data) {
        const stamp = document.getElementById('soldStamp');
        const playerCard = document.getElementById('playerCard');
        const messageBox = document.getElementById('messageBox');

        if (messageBox) {
            messageBox.innerHTML = '<span class="text-gray-300 text-xl font-bold">UNSOLD</span>';
        }

        if (stamp) {
            stamp.innerText = 'UNSOLD';
            stamp.style.color = '#9ca3af';
            stamp.style.borderColor = '#9ca3af';
            stamp.classList.remove('hidden');
            void stamp.offsetWidth;
            stamp.classList.add('animate');
        }

        if (playerCard) {
            playerCard.classList.remove('player-state-sold');
            playerCard.classList.add('player-state-unsold');
        }

        if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('unsold');
        if (typeof playSound === 'function') playSound('unsold');

        const bidButtons = document.querySelectorAll('.bid-team-card-btn');
        bidButtons.forEach(b => b.disabled = true);

        const manualSellBtn = document.getElementById('manualSellBtn');
        const unsoldBtn = document.getElementById('unsoldBtn');
        const nextPlayerBtn = document.getElementById('nextPlayerBtn');

        if (manualSellBtn) manualSellBtn.classList.add('hidden');
        if (unsoldBtn) unsoldBtn.classList.add('hidden');
        if (nextPlayerBtn && this.isHost) nextPlayerBtn.classList.remove('hidden');
    }

    handleTimerPaused(data) {
        const pauseBtnText = document.getElementById('pauseBtnText');
        const pauseBtn = document.getElementById('pauseTimerBtn');
        const messageBox = document.getElementById('messageBox');

        if (data.timerPaused) {
            if (pauseBtnText) pauseBtnText.innerText = 'Resume';
            if (pauseBtn) {
                pauseBtn.classList.remove('bg-gray-800/70');
                pauseBtn.classList.add('bg-green-600', 'hover:bg-green-500');
            }
            if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('paused');
            if (messageBox) {
                messageBox.innerHTML = '<div class="bg-fuchsia-600/20 border border-fuchsia-500/50 rounded-lg px-4 py-1 inline-flex items-center gap-2"><span class="text-fuchsia-200 font-bold text-sm tracking-wide uppercase">Auction Paused</span></div>';
            }
        } else {
            if (pauseBtnText) pauseBtnText.innerText = 'Pause';
            if (pauseBtn) {
                pauseBtn.classList.remove('bg-green-600', 'hover:bg-green-500');
                pauseBtn.classList.add('bg-gray-800/70');
            }
            if (typeof updateAuctioneerStatus === 'function') updateAuctioneerStatus('open');
            if (messageBox) messageBox.innerText = '';
        }
    }

    escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}

// Global instance
window.multiplayer = new MultiplayerClient();

// Initialize immediately if DOM is ready, or on DOMContentLoaded/load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.multiplayer.init());
} else {
    window.multiplayer.init();
}
window.addEventListener('load', () => {
    if (!window.multiplayer.bound) window.multiplayer.init();
});
