const http = require('http');
const { io: Client } = require('socket.io-client');
const { app, server, io, roomManager } = require('../server/server');

const TEST_PORT = 3100;
let serverInstance;

function createClient(port = TEST_PORT) {
    return new Promise((resolve, reject) => {
        const client = Client(`http://127.0.0.1:${port}`, {
            transports: ['polling', 'websocket'],
            forceNew: true,
            timeout: 5000
        });
        client.on('connect', () => resolve(client));
        client.on('connect_error', (err) => reject(err));
    });
}

async function runTests() {
    console.log('====================================================');
    console.log('   BOUNDARY CLUB MULTIPLAYER AUTOMATED TEST SUITE   ');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, testName, details = '') {
        if (condition) {
            console.log(`✓ PASS: ${testName}`);
            passed++;
        } else {
            console.error(`✗ FAIL: ${testName} ${details ? '- ' + details : ''}`);
            failed++;
        }
    }

    await new Promise((resolve) => {
        serverInstance = server.listen(TEST_PORT, '127.0.0.1', () => {
            console.log(`Test server running on http://127.0.0.1:${TEST_PORT}\n`);
            resolve();
        });
    });

    let clientHost, clientPlayer2, clientRoomB;

    try {
        clientHost = await createClient();
        clientPlayer2 = await createClient();
        clientRoomB = await createClient();

        // --- TEST 1: Room Creation ---
        console.log('\n--- 1. ROOM CREATION & HOST IDENTIFICATION ---');
        let roomACode = null;
        await new Promise((resolve) => {
            clientHost.emit('room:create', { hostName: 'HostAlice' }, (res) => {
                assert(res.success === true, 'Host successfully created room');
                assert(typeof res.roomCode === 'string' && res.roomCode.length === 6, 'Room code is 6 characters');
                assert(res.participant.isHost === true, 'Creator is marked as isHost: true');
                assert(res.participant.name === 'HostAlice', 'Host name saved correctly');
                roomACode = res.roomCode;
                resolve();
            });
        });

        // --- TEST 2: Room Joining & Lobby Sync ---
        console.log('\n--- 2. ROOM JOINING & LOBBY SYNCHRONIZATION ---');
        await new Promise((resolve) => {
            clientHost.once('room:state', (state) => {
                assert(state.participants.length === 2, 'Host notified: room now has 2 participants');
                assert(state.participants.some(p => p.name === 'BobPlayer'), 'Participant BobPlayer visible in lobby');
                resolve();
            });

            clientPlayer2.emit('room:join', { roomCode: roomACode, participantName: 'BobPlayer' }, (res) => {
                assert(res.success === true, 'Player 2 successfully joined Room A');
                assert(res.participant.isHost === false, 'Player 2 is marked as isHost: false');
            });
        });

        // --- TEST 3: Team Assignment & Claiming ---
        console.log('\n--- 3. TEAM ASSIGNMENT & EXCLUSIVE OWNERSHIP ---');
        // Host claims Team 0 (United)
        await new Promise((resolve) => {
            clientHost.emit('room:selectTeam', { teamIdx: 0 }, (res) => {
                assert(res.success === true, 'Host claimed Team 0 (United)');
                resolve();
            });
        });

        // Player 2 claims Team 1 (Knights)
        await new Promise((resolve) => {
            clientPlayer2.emit('room:selectTeam', { teamIdx: 1 }, (res) => {
                assert(res.success === true, 'Player 2 claimed Team 1 (Knights)');
                resolve();
            });
        });

        // Player 2 tries to claim Team 0 (United, already taken by Host)
        await new Promise((resolve) => {
            clientPlayer2.emit('room:selectTeam', { teamIdx: 0 }, (res) => {
                assert(res.success === false, 'Server rejected Player 2 claiming already-taken Team 0');
                assert(res.error.includes('already claimed'), 'Error correctly states team is claimed');
                resolve();
            });
        });

        // --- TEST 4: Room Isolation ---
        console.log('\n--- 4. ROOM ISOLATION ---');
        let roomBCode = null;
        await new Promise((resolve) => {
            clientRoomB.emit('room:create', { hostName: 'CharlieRoomB' }, (res) => {
                assert(res.success === true, 'Created Room B independently');
                assert(res.roomCode !== roomACode, 'Room B code differs from Room A code');
                roomBCode = res.roomCode;
                resolve();
            });
        });

        // Verify Room B does not get Room A broadcasts
        let roomBReceivedRoomAEvent = false;
        clientRoomB.on('auction:started', () => { roomBReceivedRoomAEvent = true; });

        // --- TEST 5: Auction Initialization & Non-Host Protection ---
        console.log('\n--- 5. AUCTION INITIALIZATION & ACCESS CONTROL ---');
        // Non-host (Player 2) attempts to start auction
        await new Promise((resolve) => {
            clientPlayer2.emit('auction:start', {}, (res) => {
                assert(res.success === false, 'Non-host blocked from starting auction');
                resolve();
            });
        });

        // Host starts auction
        await new Promise((resolve) => {
            let hostGotStarted = false;
            let player2GotStarted = false;

            clientHost.once('auction:started', () => { hostGotStarted = true; });
            clientPlayer2.once('auction:started', (state) => {
                player2GotStarted = true;
                assert(state.auctionStarted === true, 'Auction started event received by Player 2');
                assert(state.phase === 'preview', 'Initial phase is pool preview');
            });

            clientHost.emit('auction:start', {}, (res) => {
                assert(res.success === true, 'Host successfully started auction');
                setTimeout(() => {
                    assert(hostGotStarted && player2GotStarted, 'Both participants received auction:started');
                    assert(!roomBReceivedRoomAEvent, 'Room B was isolated and did not receive Room A auction start');
                    resolve();
                }, 100);
            });
        });

        // --- TEST 6: Round Start & Lot Display Synchronization ---
        console.log('\n--- 6. ROUND START & LOT SYNCHRONIZATION ---');
        let currentLotPlayer = null;
        await new Promise((resolve) => {
            let hostNext = false;
            let p2Next = false;

            clientHost.once('auction:nextPlayer', (state) => {
                hostNext = true;
                currentLotPlayer = state.currentPlayer;
            });

            clientPlayer2.once('auction:nextPlayer', (state) => {
                p2Next = true;
                assert(state.phase === 'bidding', 'Phase transitioned to bidding');
                assert(state.currentPlayer !== null, 'Current player is defined');
                assert(state.currentBid === state.currentPlayer.basePrice, 'Current bid matches player base price');
            });

            clientHost.emit('auction:startRound', {}, () => {
                setTimeout(() => {
                    assert(hostNext && p2Next, 'Both Host and Player 2 received synchronized lot opening');
                    resolve();
                }, 150);
            });
        });

        // --- TEST 7: Server Authority - Live Bidding & Real-Time Sync ---
        console.log('\n--- 7. LIVE BIDDING & BID INCREMENTS ---');
        // Player 2 (holding Team 1 Knights) bids on current player at base price
        await new Promise((resolve) => {
            let p2GotBid = false;
            let hostGotBid = false;

            clientHost.once('auction:bidUpdate', (data) => {
                hostGotBid = true;
                assert(data.highestBidder === 1, 'Host sees highestBidder is Team 1');
                assert(data.currentBid === currentLotPlayer.basePrice, 'Host sees current bid at base price');
            });

            clientPlayer2.once('auction:bidUpdate', (data) => {
                p2GotBid = true;
                assert(data.highestBidder === 1, 'Player 2 sees highestBidder is Team 1');
            });

            clientPlayer2.emit('auction:bid', { teamIdx: 1, step: 1 }, (res) => {
                assert(res.success === true, 'Valid bid by Player 2 accepted by server');
                setTimeout(() => {
                    assert(hostGotBid && p2GotBid, 'Both clients received real-time auction:bidUpdate');
                    resolve();
                }, 100);
            });
        });

        // Host (holding Team 0 United) bids next increment
        await new Promise((resolve) => {
            clientHost.emit('auction:bid', { teamIdx: 0, step: 1 }, (res) => {
                assert(res.success === true, 'Counter-bid by Host accepted by server');
                assert(res.highestBidder === 0, 'Highest bidder updated to Team 0');
                assert(res.currentBid > currentLotPlayer.basePrice, 'Bid amount increased according to increment schedule');
                resolve();
            });
        });

        // --- TEST 8: Server Authority - Invalid Bid Rejection ---
        console.log('\n--- 8. SERVER BID VALIDATION & RULE ENFORCEMENT ---');
        // 8a. Host attempts to bid against themselves
        await new Promise((resolve) => {
            clientHost.emit('auction:bid', { teamIdx: 0, step: 1 }, (res) => {
                assert(res.success === false, 'Server rejected bidding against oneself');
                assert(res.error.includes('already the highest bidder'), 'Error mentions already highest bidder');
                resolve();
            });
        });

        // 8b. Player 2 attempts to bid for Team 2 (Invincibles, which Player 2 does not own)
        await new Promise((resolve) => {
            clientPlayer2.emit('auction:bid', { teamIdx: 2, step: 1 }, (res) => {
                assert(res.success === false, 'Server rejected unauthorized franchise bid by Player 2');
                assert(res.error.includes('Cannot bid for'), 'Error enforces franchise authorization');
                resolve();
            });
        });

        // 8c. Purse restriction test
        const roomA = roomManager.getRoom(roomACode);
        const originalPurse = roomA.engine.teams[1].purse;
        roomA.engine.teams[1].purse = 10; // artificially set purse below next offer
        await new Promise((resolve) => {
            clientPlayer2.emit('auction:bid', { teamIdx: 1, step: 1 }, (res) => {
                assert(res.success === false, 'Server rejected bid exceeding franchise purse');
                assert(res.error.includes('Not enough purse'), 'Error states not enough purse');
                roomA.engine.teams[1].purse = originalPurse; // restore
                resolve();
            });
        });

        // --- TEST 9: Timer Synchronization & Expiration Auto-Sale ---
        console.log('\n--- 9. TIMER SYNCHRONIZATION & LOT SALE ---');
        // Verify timer tick event arrives
        await new Promise((resolve) => {
            clientPlayer2.once('auction:timerTick', (tick) => {
                assert(typeof tick.timeLeft === 'number', 'Received server-authoritative timer tick');
                resolve();
            });
        });

        // Sell player to current highest bidder (Host: Team 0)
        await new Promise((resolve) => {
            let hostGotSold = false;
            let p2GotSold = false;

            clientHost.once('auction:playerSold', (data) => {
                hostGotSold = true;
                assert(data.status === 'sold', 'Host received playerSold status: sold');
                assert(data.team.name === roomA.engine.teams[0].name, 'Sold to Team 0');
            });

            clientPlayer2.once('auction:playerSold', (data) => {
                p2GotSold = true;
                assert(data.status === 'sold', 'Player 2 received playerSold status: sold');
            });

            clientHost.emit('auction:sell', {}, (res) => {
                assert(res.success === true, 'Host sold current player');
                setTimeout(() => {
                    assert(hostGotSold && p2GotSold, 'Both clients received playerSold event');
                    assert(roomA.engine.teams[0].squad.length === 1, 'Winning team squad count incremented');
                    assert(roomA.engine.teams[0].purse < 10000, 'Winning team purse correctly debited');
                    resolve();
                }, 100);
            });
        });

        // --- TEST 10: Player Unsold Transition ---
        console.log('\n--- 10. UNSOLD TRANSITIONS & AUCTION PROGRESSION ---');
        // Advance to next player
        await new Promise((resolve) => {
            clientHost.emit('auction:nextPlayer', {}, (res) => {
                assert(res.success === true, 'Host called next player lot');
                resolve();
            });
        });

        // Mark current player unsold (no bids placed)
        await new Promise((resolve) => {
            let p2GotUnsold = false;

            clientPlayer2.once('auction:playerUnsold', (data) => {
                p2GotUnsold = true;
                assert(data.status === 'unsold', 'Player 2 received playerUnsold status: unsold');
                assert(data.player.status === 'passed-over', 'Player status updated to passed-over');
            });

            clientHost.emit('auction:unsold', {}, (res) => {
                assert(res.success === true, 'Host marked lot unsold');
                setTimeout(() => {
                    assert(p2GotUnsold, 'Both clients received playerUnsold notification');
                    resolve();
                }, 100);
            });
        });

        // --- TEST 11: Pause / Resume & Host Controls ---
        console.log('\n--- 11. PAUSE / RESUME & HOST CONTROLS ---');
        // Advance to another player to test pause
        await new Promise((resolve) => {
            clientHost.emit('auction:nextPlayer', {}, () => resolve());
        });

        // Non-host attempts to pause
        await new Promise((resolve) => {
            clientPlayer2.emit('auction:pause', {}, (res) => {
                assert(res.success === false, 'Non-host blocked from pausing timer');
                resolve();
            });
        });

        // Host pauses
        await new Promise((resolve) => {
            clientHost.emit('auction:pause', {}, (res) => {
                assert(res.success === true, 'Host paused auction timer');
                assert(res.timerPaused === true, 'Timer marked paused');
                resolve();
            });
        });

        // Host resumes
        await new Promise((resolve) => {
            clientHost.emit('auction:pause', {}, (res) => {
                assert(res.success === true, 'Host resumed auction timer');
                assert(res.timerPaused === false, 'Timer marked active');
                resolve();
            });
        });

        // --- TEST 12: Disconnect Handling ---
        console.log('\n--- 12. DISCONNECT HANDLING ---');
        await new Promise((resolve) => {
            clientHost.once('room:state', (state) => {
                assert(state.participants.length === 1, 'Host notified: participant count decreased after disconnect');
                const team1Owner = state.teams[1].owner;
                assert(team1Owner === null, 'Disconnected player franchise released');
                resolve();
            });
            clientPlayer2.disconnect();
        });

    } catch (err) {
        console.error('Unexpected error during testing:', err);
        failed++;
    } finally {
        if (clientHost) clientHost.disconnect();
        if (clientPlayer2) clientPlayer2.disconnect();
        if (clientRoomB) clientRoomB.disconnect();

        // Close server
        if (serverInstance) {
            serverInstance.close(() => {
                console.log('\n====================================================');
                console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
                console.log('====================================================');
                process.exit(failed > 0 ? 1 : 0);
            });
        }
    }
}

runTests();
