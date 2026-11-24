const fs = require('fs');
const path = require('path');

let defaultPlayers = [];
try {
    const raw = fs.readFileSync(path.join(__dirname, 'default-players.json'), 'utf8');
    defaultPlayers = JSON.parse(raw);
} catch (e) {
    console.error('Warning: could not load default-players.json', e.message);
}

function getBidIncrement(bidAmount, bidMode = 'real') {
    const multiplier = bidMode === 'double' ? 2 : 1;
    if (bidAmount <= 100) return 5 * multiplier;
    if (bidAmount <= 200) return 10 * multiplier;
    if (bidAmount <= 500) return 20 * multiplier;
    return 25 * multiplier;
}

function calculateNextBid(currentBid, highestBidder, step = 1, bidMode = 'real') {
    let amount = currentBid;
    if (highestBidder !== null) {
        for (let s = 0; s < step; s++) {
            amount += getBidIncrement(amount, bidMode);
        }
    }
    return amount;
}

function getOverseasCount(team) {
    return (team.squad || []).filter(p => p.country && p.country.trim().toLowerCase() !== 'india').length;
}

class AuctionEngine {
    constructor(options = {}) {
        this.onTick = options.onTick || (() => {});
        this.onStateChange = options.onStateChange || (() => {});
        this.onLotSettled = options.onLotSettled || (() => {});

        this.settings = {
            initialPurse: 10000,
            timerDuration: 40,
            theme: 'fuchsia',
            enableRetention: false,
            enableUnsoldRound: true,
            bidMode: 'real',
            maxSquadSize: 25,
            minSquadSize: 18,
            maxOverseasPlayers: 8,
            clockRule: 'reset',
            lotOrder: 'listed',
            retentionSlots: 5,
            ...(options.settings || {})
        };

        const defaultTeams = [
            { name: "United", color: "#3b82f6", crest: "falcon", logo: null, squad: [], purse: this.settings.initialPurse },
            { name: "Knights", color: "#ef4444", crest: "knight", logo: null, squad: [], purse: this.settings.initialPurse },
            { name: "Invincibles", color: "#22c55e", crest: "crown", logo: null, squad: [], purse: this.settings.initialPurse },
            { name: "Thunders", color: "#a855f7", crest: "thunder", logo: null, squad: [], purse: this.settings.initialPurse }
        ];

        if (Array.isArray(options.teams) && options.teams.length === 4) {
            this.teams = options.teams.map((t, idx) => ({
                name: t.name || defaultTeams[idx].name,
                color: t.color || defaultTeams[idx].color,
                crest: t.crest || defaultTeams[idx].crest,
                logo: t.logo || null,
                squad: [],
                purse: this.settings.initialPurse
            }));
        } else {
            this.teams = defaultTeams;
        }

        this.masterPlayerList = Array.isArray(options.playerList) && options.playerList.length > 0
            ? options.playerList
            : defaultPlayers;

        this.playerPools = {};
        this.poolOrder = [];
        this.currentPoolIndex = -1;
        this.currentPlayerIndex = -1;
        this.currentBid = 0;
        this.highestBidder = null;
        this.timeLeft = this.settings.timerDuration || 40;
        this.timerPaused = false;
        this.timerInterval = null;
        this.phase = 'pre-auction'; // 'pre-auction' | 'preview' | 'bidding' | 'settled' | 'ended'
        this.auctionStarted = false;
        this.auctionEnded = false;
        this.isUnsoldRound = false;
        this.currentUnsoldRoundPlayers = [];
        this.lastBidInfo = null;
        this.lotBids = [];
        this.highestBidRecord = { amount: 0, playerName: "-", teamName: "-" };
        this.stats = { totalSold: 0, totalSpent: 0 };
        this.actionHistory = [];

        this.initializePlayers();
    }

    initializePlayers() {
        const pools = {};
        this.masterPlayerList.forEach((player, index) => {
            const basePrice = Number(player.basePrice);
            const p = {
                ...player,
                basePrice: Number.isFinite(basePrice) ? basePrice : 30,
                id: index,
                status: 'unsold',
                soldTo: null,
                sellingPrice: 0
            };
            const key = `${p.category}-${p.basePrice}`;
            if (!pools[key]) pools[key] = [];
            pools[key].push(p);
        });

        if (this.settings.lotOrder === 'shuffle') {
            for (const pool of Object.values(pools)) {
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
            }
        }
        this.playerPools = pools;

        const categoryOrder = ['Batsman', 'Wicket Keeper', 'Allrounder', 'Fast Bowler', 'Spinner'];
        this.poolOrder = Object.keys(pools).sort((a, b) => {
            const [categoryA, priceA] = a.split(/-(?=\d+$)/);
            const [categoryB, priceB] = b.split(/-(?=\d+$)/);
            const priceDifference = Number(priceB) - Number(priceA);
            if (priceDifference !== 0) return priceDifference;
            const indexA = categoryOrder.indexOf(categoryA);
            const indexB = categoryOrder.indexOf(categoryB);
            return (indexA === -1 ? categoryOrder.length : indexA) - (indexB === -1 ? categoryOrder.length : indexB);
        });
    }

    getCurrentPlayer() {
        if (!this.playerPools) return null;
        if (this.isUnsoldRound) {
            if (!this.currentUnsoldRoundPlayers || this.currentUnsoldRoundPlayers.length === 0) return null;
            if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.currentUnsoldRoundPlayers.length) return null;
            return this.currentUnsoldRoundPlayers[this.currentPlayerIndex];
        }
        if (this.currentPoolIndex < 0 || this.currentPoolIndex >= this.poolOrder.length) return null;
        const key = this.poolOrder[this.currentPoolIndex];
        if (!this.playerPools[key]) return null;
        if (this.currentPlayerIndex < 0 || this.currentPlayerIndex >= this.playerPools[key].length) return null;
        return this.playerPools[key][this.currentPlayerIndex];
    }

    startAuction() {
        this.auctionStarted = true;
        this.auctionEnded = false;
        this.teams.forEach(t => t.purse = this.settings.initialPurse);
        this.showNextPoolModal();
        this.onStateChange('auction:started', this.getState());
        return { success: true };
    }

    showNextPoolModal(advance = true) {
        this.stopTimer();
        this.phase = 'preview';

        if (this.isUnsoldRound) {
            this.isUnsoldRound = false;
        } else if (advance) {
            this.currentPoolIndex++;
        }

        if (this.currentPoolIndex >= this.poolOrder.length) {
            const unsold = Object.values(this.playerPools).flat().filter(p => p.status === 'passed-over');
            if (this.settings.enableUnsoldRound && unsold.length > 0) {
                // Ready for unsold round
                this.onStateChange('auction:unsoldRoundReady', this.getState());
                return;
            } else {
                this.endAuction();
                return;
            }
        }

        const poolKey = this.poolOrder[this.currentPoolIndex];
        const players = (this.playerPools[poolKey] || []).filter(player => player.status === 'unsold');
        if (!players || players.length === 0) {
            this.showNextPoolModal(true);
            return;
        }

        this.onStateChange('auction:poolPreview', this.getState());
    }

    startRound() {
        this.currentPlayerIndex = -1;
        return this.nextPlayer();
    }

    nextPlayer() {
        this.currentPlayerIndex++;
        const player = this.getCurrentPlayer();
        const requiredStatus = this.isUnsoldRound ? 'passed-over' : 'unsold';

        if (player && player.status !== requiredStatus) {
            return this.nextPlayer();
        }

        if (!player) {
            if (this.isUnsoldRound && this.currentPoolIndex >= this.poolOrder.length) {
                this.endAuction();
            } else {
                this.showNextPoolModal(true);
            }
            return { success: true, poolFinished: true };
        }

        this.phase = 'bidding';
        this.highestBidder = null;
        this.currentBid = player.basePrice;
        this.lastBidInfo = null;
        this.lotBids = [];
        this.startTimer();
        this.onStateChange('auction:nextPlayer', this.getState());
        return { success: true, player };
    }

    startTimer(seconds) {
        this.stopTimer();
        this.timeLeft = seconds !== undefined ? seconds : (this.settings.timerDuration || 40);
        this.timerPaused = false;

        this.timerInterval = setInterval(() => {
            if (this.timerPaused) return;

            this.timeLeft--;
            if (this.timeLeft < 0) this.timeLeft = 0;

            this.onTick({ timeLeft: this.timeLeft, timerPaused: this.timerPaused });

            if (this.timeLeft <= 0) {
                this.stopTimer();
                if (this.highestBidder !== null && this.highestBidder >= 0 && this.highestBidder < this.teams.length) {
                    this.sellPlayer();
                } else {
                    this.markUnsold();
                }
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    togglePauseTimer() {
        if (!this.auctionStarted || this.auctionEnded || this.phase !== 'bidding') {
            return { success: false, error: 'Cannot pause outside bidding phase' };
        }
        this.timerPaused = !this.timerPaused;
        this.onStateChange('auction:timerPaused', { timerPaused: this.timerPaused, timeLeft: this.timeLeft });
        return { success: true, timerPaused: this.timerPaused };
    }

    placeBid(teamIdx, step = 1, participant = null) {
        if (!this.auctionStarted || this.auctionEnded) {
            return { success: false, error: 'Auction is not active' };
        }
        if (this.phase !== 'bidding') {
            return { success: false, error: 'Not in bidding phase' };
        }
        if (this.timerPaused) {
            return { success: false, error: 'Timer is paused' };
        }

        const player = this.getCurrentPlayer();
        if (!player) {
            return { success: false, error: 'No player currently on auction' };
        }

        if (typeof teamIdx !== 'number' || teamIdx < 0 || teamIdx >= this.teams.length) {
            return { success: false, error: 'Invalid franchise selected' };
        }

        const team = this.teams[teamIdx];
        const maxSquad = this.settings.maxSquadSize || 25;
        if (team.squad.length >= maxSquad) {
            return { success: false, error: `Squad full (${maxSquad} players max)` };
        }

        const isOverseas = player.country && player.country.trim().toLowerCase() !== 'india';
        if (isOverseas && getOverseasCount(team) >= (this.settings.maxOverseasPlayers ?? 8)) {
            return { success: false, error: 'Overseas player limit reached' };
        }

        if (teamIdx === this.highestBidder) {
            return { success: false, error: 'You are already the highest bidder' };
        }

        // Validate step
        const validSteps = [1, 2, 5];
        const bidStep = validSteps.includes(step) ? step : 1;
        const newBid = calculateNextBid(this.currentBid, this.highestBidder, bidStep, this.settings.bidMode);

        if (team.purse < newBid) {
            return { success: false, error: `Not enough purse. Current purse: ₹${team.purse}L, required: ₹${newBid}L` };
        }

        this.pushHistory(`${team.name} bid ₹${newBid}L`);

        this.currentBid = newBid;
        this.highestBidder = teamIdx;
        this.lastBidInfo = {
            teamIdx,
            teamName: team.name,
            amount: newBid,
            step: bidStep,
            time: Date.now(),
            bidderName: participant ? participant.name : team.name
        };
        this.lotBids.push(this.lastBidInfo);

        const clockRule = this.settings.clockRule || 'reset';
        const seconds = clockRule === 'fixed'
            ? this.timeLeft
            : clockRule === 'extend'
                ? Math.max(10, this.timeLeft)
                : (this.settings.timerDuration || 40);

        this.startTimer(seconds);

        const bidResult = {
            currentBid: this.currentBid,
            highestBidder: this.highestBidder,
            lastBidInfo: this.lastBidInfo,
            lotBids: this.lotBids,
            timeLeft: this.timeLeft
        };

        this.onStateChange('auction:bidUpdate', bidResult);
        return { success: true, ...bidResult };
    }

    sellPlayer() {
        if (this.phase !== 'bidding' || this.highestBidder === null || !this.getCurrentPlayer()) {
            return { success: false, error: 'Cannot sell player in current state' };
        }

        this.phase = 'settled';
        this.stopTimer();

        const player = this.getCurrentPlayer();
        const team = this.teams[this.highestBidder];
        this.pushHistory(`sold ${player.name} to ${team.name}`);

        player.status = 'sold';
        player.soldTo = team.name;
        player.sellingPrice = this.currentBid;

        team.purse -= this.currentBid;
        team.squad.push({ ...player });

        this.stats.totalSold++;
        this.stats.totalSpent += this.currentBid;

        if (this.currentBid > this.highestBidRecord.amount) {
            this.highestBidRecord = {
                amount: this.currentBid,
                playerName: player.name,
                teamName: team.name
            };
        }

        const saleData = {
            status: 'sold',
            player: { ...player },
            team: { name: team.name, index: this.highestBidder, purse: team.purse },
            teams: this.teams.map(t => ({ name: t.name, purse: t.purse, squadCount: t.squad.length })),
            stats: this.stats,
            highestBidRecord: this.highestBidRecord
        };

        this.onLotSettled(saleData);
        this.onStateChange('auction:playerSold', saleData);
        return { success: true, ...saleData };
    }

    markUnsold() {
        const player = this.getCurrentPlayer();
        if (!player || this.phase !== 'bidding' || this.highestBidder !== null) {
            return { success: false, error: 'Cannot mark unsold in current state' };
        }

        this.phase = 'settled';
        this.stopTimer();

        this.pushHistory(`marked ${player.name} unsold`);
        player.status = 'passed-over';

        const unsoldData = {
            status: 'unsold',
            player: { ...player }
        };

        this.onLotSettled(unsoldData);
        this.onStateChange('auction:playerUnsold', unsoldData);
        return { success: true, ...unsoldData };
    }

    restartCurrentPlayer() {
        if (!this.auctionStarted || this.auctionEnded) return { success: false, error: 'Auction not active' };
        const player = this.getCurrentPlayer();
        if (!player) return { success: false, error: 'No player to restart' };

        if (player.status === 'sold' && player.soldTo) {
            const team = this.teams.find(t => t.name === player.soldTo);
            if (team) {
                team.purse += player.sellingPrice;
                team.squad = team.squad.filter(p => p.id !== player.id);
            }
            this.stats.totalSold = Math.max(0, this.stats.totalSold - 1);
            this.stats.totalSpent = Math.max(0, this.stats.totalSpent - player.sellingPrice);
        }

        this.phase = 'bidding';
        player.status = this.isUnsoldRound ? 'passed-over' : 'unsold';
        player.soldTo = null;
        player.sellingPrice = 0;

        this.stopTimer();
        this.highestBidder = null;
        this.currentBid = player.basePrice;
        this.lastBidInfo = null;
        this.lotBids = [];

        this.startTimer();
        this.onStateChange('auction:restartedPlayer', this.getState());
        return { success: true, player };
    }

    startUnsoldRound() {
        this.isUnsoldRound = true;
        this.currentUnsoldRoundPlayers = Object.values(this.playerPools).flat().filter(p => p.status === 'passed-over');

        if (this.currentUnsoldRoundPlayers.length === 0) {
            this.endAuction();
            return { success: true, empty: true };
        }

        this.currentPlayerIndex = -1;
        this.nextPlayer();
        return { success: true };
    }

    endAuction() {
        this.stopTimer();
        this.auctionEnded = true;
        this.phase = 'ended';
        this.onStateChange('auction:ended', this.getState());
        return { success: true };
    }

    pushHistory(action) {
        this.actionHistory.push({
            label: action,
            currentPoolIndex: this.currentPoolIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            currentBid: this.currentBid,
            highestBidder: this.highestBidder,
            isUnsoldRound: this.isUnsoldRound,
            unsoldRoundIds: this.isUnsoldRound ? this.currentUnsoldRoundPlayers.map(p => p.id) : null,
            lastBidInfo: this.lastBidInfo ? { ...this.lastBidInfo } : null,
            lotBids: [...this.lotBids],
            teams: this.teams.map(t => ({ purse: t.purse, squad: [...t.squad] })),
            playerStatuses: Object.fromEntries(
                Object.entries(this.playerPools).map(([k, pool]) => [
                    k,
                    pool.map(p => ({ id: p.id, status: p.status, soldTo: p.soldTo, sellingPrice: p.sellingPrice }))
                ])
            ),
            stats: { ...this.stats },
            highestBidRecord: { ...this.highestBidRecord }
        });
    }

    undoLastAction() {
        if (!this.actionHistory.length) return { success: false, error: 'No action to undo' };
        const prev = this.actionHistory.pop();

        this.phase = 'bidding';
        this.lastBidInfo = prev.lastBidInfo || null;
        this.lotBids = prev.lotBids || [];
        this.currentPoolIndex = prev.currentPoolIndex;
        this.currentPlayerIndex = prev.currentPlayerIndex;
        this.currentBid = prev.currentBid;
        this.highestBidder = prev.highestBidder;
        this.isUnsoldRound = prev.isUnsoldRound;

        if (prev.isUnsoldRound && prev.unsoldRoundIds) {
            const players = new Map(Object.values(this.playerPools).flat().map(p => [p.id, p]));
            this.currentUnsoldRoundPlayers = prev.unsoldRoundIds.map(id => players.get(id)).filter(Boolean);
        }

        this.stats = prev.stats;
        this.highestBidRecord = prev.highestBidRecord;

        prev.teams.forEach((t, i) => {
            this.teams[i].purse = t.purse;
            this.teams[i].squad = t.squad;
        });

        Object.keys(prev.playerStatuses).forEach(k => {
            if (this.playerPools[k]) {
                const savedMap = new Map(prev.playerStatuses[k].map(p => [p.id, p]));
                this.playerPools[k].forEach(p => {
                    if (savedMap.has(p.id)) {
                        const saved = savedMap.get(p.id);
                        p.status = saved.status;
                        p.soldTo = saved.soldTo;
                        p.sellingPrice = saved.sellingPrice;
                    }
                });
            }
        });

        this.startTimer();
        this.onStateChange('auction:undone', this.getState());
        return { success: true, label: prev.label };
    }

    getState() {
        const currentPlayer = this.getCurrentPlayer();
        const currentPoolKey = this.currentPoolIndex >= 0 && this.currentPoolIndex < this.poolOrder.length
            ? this.poolOrder[this.currentPoolIndex]
            : null;

        const poolPlayers = currentPoolKey && this.playerPools[currentPoolKey]
            ? this.playerPools[currentPoolKey].filter(p => p.status === 'unsold')
            : [];

        // Find upcoming player in current pool
        const pool = this.isUnsoldRound
            ? this.currentUnsoldRoundPlayers
            : (currentPoolKey ? this.playerPools[currentPoolKey] : []);

        const nextLotPlayer = (pool || [])
            .slice(this.currentPlayerIndex + 1)
            .find(p => p.status === (this.isUnsoldRound ? 'passed-over' : 'unsold')) || null;

        return {
            settings: this.settings,
            teams: this.teams,
            poolOrder: this.poolOrder,
            currentPoolIndex: this.currentPoolIndex,
            currentPoolKey,
            poolPlayers,
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayer,
            nextLotPlayer: nextLotPlayer ? { name: nextLotPlayer.name, category: nextLotPlayer.category } : null,
            currentBid: this.currentBid,
            highestBidder: this.highestBidder,
            timeLeft: this.timeLeft,
            timerPaused: this.timerPaused,
            phase: this.phase,
            auctionStarted: this.auctionStarted,
            auctionEnded: this.auctionEnded,
            isUnsoldRound: this.isUnsoldRound,
            lastBidInfo: this.lastBidInfo,
            lotBids: this.lotBids,
            highestBidRecord: this.highestBidRecord,
            stats: this.stats,
            canUndo: this.actionHistory.length > 0,
            soldPlayers: this.teams.flatMap(t => t.squad),
            unsoldPlayers: Object.values(this.playerPools).flat().filter(p => p.status === 'passed-over')
        };
    }

    destroy() {
        this.stopTimer();
    }
}

module.exports = {
    AuctionEngine,
    getBidIncrement,
    calculateNextBid,
    getOverseasCount
};
