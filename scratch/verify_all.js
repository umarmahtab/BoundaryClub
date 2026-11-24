const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

console.log('--- 1. PLAYER DATASET VERIFICATION ---');
const playerMatch = content.match(/const defaultPlayers = (\[[\s\S]*?\]);/);
if (!playerMatch) {
    console.error('ERROR: Could not find defaultPlayers in index.html');
} else {
    try {
        const vm = require('vm');
        const players = vm.runInNewContext(playerMatch[1]);
        console.log('Total players in dataset:', players.length);
        if (players.length !== 238) {
            console.error('FAIL: Expected 238 players, got ' + players.length);
        } else {
            console.log('PASS: Exactly 238 players found.');
        }

        // Check for duplicates
        const names = players.map(p => p.name.trim().toLowerCase());
        const duplicates = names.filter((item, index) => names.indexOf(item) !== index);
        if (duplicates.length > 0) {
            console.error('FAIL: Found duplicates:', duplicates);
        } else {
            console.log('PASS: 0 duplicate players.');
        }

        // Check for Pakistan players
        const pak = players.filter(p => (p.country || '').toLowerCase() === 'pakistan');
        if (pak.length > 0) {
            console.error('FAIL: Found Pakistani players:', pak);
        } else {
            console.log('PASS: 0 Pakistani players.');
        }
    } catch(e) {
        console.error('ERROR parsing defaultPlayers:', e.message);
    }
}

console.log('\n--- 2. EMOJI & SYMBOL VERIFICATION ---');
const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{25A0}-\u{25FF}\u{2B00}-\u{2BFF}]/gu;
const emojiMatches = content.match(emojiRegex);
if (emojiMatches) {
    console.log('Found emojis/symbols:', [...new Set(emojiMatches)]);
} else {
    console.log('PASS: ZERO emojis or special symbols in index.html! Everything is clean vector SVG.');
}

console.log('\n--- 3. CRITICAL UI ELEMENTS AND IDS ---');
const criticalIds = [
    'top-bar-ref',
    'brand-title',
    'headerProgress',
    'headerProgressText',
    'toggleAudioBtn',
    'audioIcon',
    'audioStatusText',
    'helpBtn',
    'resetAuctionBtn',
    'settingsBtn',
    'resumeBanner',
    'dismissResumeBtn',
    'resumeBtn',
    'closeResumeBannerBtn',
    'stickyStatsBar',
    'recordAmount',
    'recordPlayer',
    'recordTeam',
    'statSoldPlayers',
    'statTotalSpent',
    'statCurrentRound',
    'setupScreen',
    'team1Name', 'team1Color',
    'team2Name', 'team2Color',
    'team3Name', 'team3Color',
    'team4Name', 'team4Color',
    'managePoolBtn',
    'startAuctionBtn',
    'auctionScreen',
    'purseTeam1Info', 'purseTeam2Info', 'purseTeam3Info', 'purseTeam4Info',
    'showTeamsBtn',
    'showRemainingBtn',
    'showUnsoldBtn',
    'showLogBtn',
    'undoBtn',
    'auctioneerStatusBadge',
    'auctioneerStatusDot',
    'auctioneerStatusText',
    'playerCard',
    'soldStamp',
    'playerStarBtn',
    'playerCategoryBadge',
    'playerRoleIcon',
    'playerCategory',
    'playerName',
    'playerCountryFlag',
    'playerCountry',
    'basePrice',
    'pauseTimerBtn',
    'pauseBtnText',
    'restartPlayerBtn',
    'timerContainer',
    'timerRing',
    'timer',
    'currentBid',
    'bidModeDisplay',
    'highestBidder',
    'lastBidStrip',
    'auctionPausedBottomBar',
    'bidTeam1', 'bidTeam2', 'bidTeam3', 'bidTeam4',
    'manualSellBtn',
    'unsoldBtn',
    'nextPlayerBtn'
];

let missing = [];
for (const id of criticalIds) {
    if (!content.includes(id)) {
        missing.push(id);
    }
}

if (missing.length > 0) {
    console.error('FAIL: Missing critical IDs / classes:', missing);
} else {
    console.log('PASS: All ' + criticalIds.length + ' critical UI elements present!');
}

console.log('\n--- 4. SCRIPT SYNTAX CHECK ---');
const scriptMatches = [...content.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi)];
let scriptErr = false;
scriptMatches.forEach((m, idx) => {
    const code = m[1].trim();
    if (!code) return;
    try {
        new Function(code);
    } catch (e) {
        scriptErr = true;
        console.error('Syntax error in script tag ' + idx + ': ' + e.message);
    }
});
if (!scriptErr) {
    console.log('PASS: All script tags evaluated without syntax error.');
}
