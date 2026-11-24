const fs = require('fs');

console.log('====================================================');
console.log('   CLIENT DOM & MULTIPLAYER FLOW INTEGRATION TEST   ');
console.log('====================================================\n');

const html = fs.readFileSync('index.html', 'utf8');

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

// 1. Check DOM structure in index.html
console.log('--- 1. VERIFY DOM ELEMENTS IN INDEX.HTML ---');
const requiredIds = [
    'multiplayerBtn',
    'multiplayerNavBtn',
    'multiplayerNavLabel',
    'multiplayerLiveBadge',
    'multiplayerModal',
    'closeMultiplayerModalBtn',
    'mpPreJoinSection',
    'mpPlayerName',
    'mpCreateRoomBtn',
    'mpJoinRoomBtn',
    'mpRoomCodeInput',
    'mpActiveRoomSection',
    'mpRoomCodeDisplay',
    'mpCopyCodeBtn',
    'mpRoleBadge',
    'mpConnectionStatus',
    'mpFranchiseSelectGrid',
    'mpParticipantsList',
    'mpLeaveRoomBtn',
    'mpWaitingMsg',
    'mpStartAuctionBtn'
];

requiredIds.forEach(id => {
    assert(html.includes(`id="${id}"`), `Element #${id} exists in HTML`);
});

// 2. Verify script and style tags
console.log('\n--- 2. VERIFY SCRIPT & STYLE INCLUSIONS ---');
assert(html.includes('<link rel="stylesheet" href="assets/multiplayer.css">'), 'multiplayer.css is linked in head');
assert(html.includes('assets/vendor/socket.io.min.js') || html.includes('/socket.io/socket.io.js'), 'Socket.IO client library included');
assert(html.includes('<script src="assets/multiplayer-client.js"></script>'), 'multiplayer-client.js included');

// 3. Verify multiplayer hooks in original functions
console.log('\n--- 3. VERIFY MULTIPLAYER HOOKS IN ORIGINAL AUCTION LOGIC ---');
const hooks = [
    { func: 'bid', check: 'window.multiplayer.placeBid' },
    { func: 'sellPlayer', check: 'window.multiplayer.sellPlayer' },
    { func: 'markUnsold', check: 'window.multiplayer.markUnsold' },
    { func: 'togglePauseTimer', check: 'window.multiplayer.togglePauseTimer' },
    { func: 'nextPlayer', check: 'window.multiplayer.nextPlayer' },
    { func: 'restartCurrentPlayer', check: 'window.multiplayer.restartCurrentPlayer' },
    { func: 'undoLastAction', check: 'window.multiplayer.undoLastAction' },
    { func: 'startRound', check: 'window.multiplayer.startRound' },
    { func: 'startUnsoldRound', check: 'window.multiplayer.startUnsoldRound' },
    { func: 'updateControls', check: 'window.multiplayer.applyOwnershipControls' }
];

hooks.forEach(h => {
    assert(html.includes(h.check), `Function ${h.func} contains multiplayer forwarder (${h.check})`);
});

// 4. Verify multiplayer client source code completeness
console.log('\n--- 4. VERIFY MULTIPLAYER-CLIENT.JS CAPABILITIES ---');
const clientJs = fs.readFileSync('assets/multiplayer-client.js', 'utf8');

const clientMethods = [
    'setupSocketListeners',
    'setupUI',
    'openModal',
    'closeModal',
    'leaveRoom',
    'selectTeam',
    'renderLobby',
    'updateBadge',
    'applyOwnershipControls',
    'syncHostControls',
    'placeBid',
    'startRound',
    'nextPlayer',
    'togglePauseTimer',
    'sellPlayer',
    'markUnsold',
    'restartCurrentPlayer',
    'undoLastAction',
    'startUnsoldRound',
    'handleAuctionStarted',
    'handleAuctionState',
    'handleBidUpdate',
    'handleTimerTick',
    'handlePlayerSold',
    'handlePlayerUnsold',
    'handleTimerPaused'
];

clientMethods.forEach(method => {
    assert(clientJs.includes(method), `MultiplayerClient implements ${method}()`);
});

console.log('\n====================================================');
console.log(`DOM INTEGRATION RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('====================================================');

process.exit(failed > 0 ? 1 : 0);
