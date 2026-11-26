'use strict';

const roomIcons = {
    layout: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10h18M10 10v11"/>',
    players: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    shield: '<path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-5"/>',
    report: '<path d="M6 3h8l4 4v14H6zM14 3v5h4m-9 8v-3m3 3v-5m3 5v-2"/>',
    wallet: '<path d="M4 7V5l13-2v4M4 7h15a1 1 0 0 1 1 1v11H5a2 2 0 0 1-2-2V9a2 2 0 0 1 1-2Z"/><path d="M20 11h-5v4h5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    gavel: '<path d="m13 4 7 7-3 3-7-7zM8 9l7 7m-9-4 4-4m3 7 4-4m-6 2-7 7m10 0h7"/>',
    sliders: '<path d="M3 7h5m4 0h9M3 17h10m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
    pencil: '<path d="m15 5 4 4M4 20l4-1 12-12a2.8 2.8 0 0 0-4-4L4 15z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-5 5 6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    keyboard: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h.1m3.9 0h.1m3.9 0h.1m3.9 0h.1M6 12h.1m3.9 0h.1m3.9 0h.1m3.9 0h.1M8 15h8"/>',
    stack: '<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    sound: '<path d="M4 9h4l5-5v16l-5-5H4zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'
};
function roomIcon(name) {
    return '<svg class="room-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + roomIcons[name] + '</svg>';
}
function element(id) { return document.getElementById(id); }
document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = roomIcon(node.dataset.icon); });
element('resetAuctionBtn').innerHTML = roomIcon('reset');
element('helpBtn').innerHTML = roomIcon('keyboard');
element('settingsBtn').innerHTML = roomIcon('sliders') + '<span>Settings</span>';

const crestNames = ['falcon', 'knight', 'crown', 'thunder', 'tiger', 'star'];
function readRoomPreference(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storeRoomPreference(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); }
    catch { showToast('Browser storage is full. Changes apply to this tab only.', 'warning'); }
}
function safeLogo(logo) {
    return typeof logo === 'string' && /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(logo);
}
function franchiseMark(team, idx) {
    if (safeLogo(team.logo)) return '<img class="club-crest" alt="" src="' + team.logo + '">';
    const name = crestNames.includes(team.crest) ? team.crest : crestNames[idx % crestNames.length];
    return '<svg class="club-crest" aria-hidden="true" viewBox="0 0 64 64" fill="none"><use href="#crest-' + name + '"/></svg>';
}
const franchiseCards = [...document.querySelectorAll('.franchise-card')];
function paintSetupCrest(index) {
    const card = franchiseCards[index], team = appState.teams[index];
    const mark = franchiseMark(team, index);
    card.querySelector('.crest-main').innerHTML = mark;
    card.querySelector('.crest-main').setAttribute('aria-label', 'Change ' + team.name + ' logo');
    card.querySelector('.crest-echo').innerHTML = mark;
    card.style.setProperty('--team', teamAccent(team));
}
function paintFloorCrest(team, index) {
    const tile = element('purseTeam' + (index + 1) + 'Info').querySelector('.team-badge-icon');
    const bidTile = element('bidTeam' + (index + 1)).querySelector('.team-btn-top-row > div');
    const mark = franchiseMark(team, index);
    tile.innerHTML = mark;
    bidTile.querySelector('svg,img')?.remove();
    bidTile.insertAdjacentHTML('afterbegin', mark);
}
function saveClubIdentities() {
    storeRoomPreference('boundaryClubFranchises', appState.teams.map(({ name, color, crest, logo }) => ({ name, color, crest, logo })));
}
const franchiseCount = element('franchiseCount');
const franchiseGrid = franchiseCards[0].parentElement;
const setupTemplate = franchiseCards[0].cloneNode(true);
const playStyle = element('auctionPlayStyle');
const soloTeam = element('soloTeam');
const savedClubs = readRoomPreference('boundaryClubFranchises', []);
const extraColors = ['#a16207', '#0f766e', '#be185d', '#475569'];
const clubTemplates = franchiseCards.map((card, index) => ({
    name: card.querySelector('.franchise-name').defaultValue,
    color: card.querySelector('input[type=color]').defaultValue,
    crest: crestNames[index]
}));

function clubIdentity(index) {
    const base = clubTemplates[index] || {
        name: 'Franchise ' + (index + 1),
        color: extraColors[index - clubTemplates.length],
        crest: crestNames[index % crestNames.length]
    };
    const saved = savedClubs[index] || {};
    return {
        name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.slice(0, 20) : base.name,
        color: /^#[a-f\d]{6}$/i.test(saved.color) ? saved.color : base.color,
        crest: crestNames.includes(saved.crest) ? saved.crest : base.crest,
        logo: safeLogo(saved.logo) ? saved.logo : null
    };
}

function refreshSoloTeams() {
    const selected = Number(soloTeam.value);
    soloTeam.replaceChildren(...appState.teams.map((team, index) => new Option(team.name, String(index))));
    soloTeam.value = String(Math.min(selected, appState.teams.length - 1));
    element('soloTeamField').hidden = playStyle.value !== 'solo';
    element('soloAlphaNote').hidden = playStyle.value !== 'solo';
}

function syncFranchiseSetup() {
    for (const [index, team] of appState.teams.entries()) {
        const card = franchiseCards[index];
        const input = card.querySelector('.franchise-name');
        team.name = input.value.trim() || input.defaultValue;
        input.value = team.name;
        team.color = card.querySelector('input[type=color]').value;
    }
    if (new Set(appState.teams.map(team => team.name.toLowerCase())).size !== appState.teams.length) {
        showToast('Give each franchise a different name.', 'warning');
        return false;
    }
    saveClubIdentities();
    return true;
}

function configureFranchises(count) {
    const teams = appState.teams.slice(0, count);
    while (teams.length < count) teams.push({ ...clubIdentity(teams.length), squad: [], purse: appState.settings.initialPurse });
    appState.teams = teams;
    while (franchiseCards.length < count) {
        const card = setupTemplate.cloneNode(true);
        const index = franchiseCards.length;
        card.querySelector('.franchise-index').textContent = 'Franchise ' + String(index + 1).padStart(2, '0');
        card.querySelectorAll('[data-edit-team]').forEach(button => { button.dataset.editTeam = index; });
        card.querySelector('.name-field .sr-only').textContent = 'Franchise ' + (index + 1) + ' name';
        card.querySelector('.franchise-name').id = 'team' + (index + 1) + 'Name';
        card.querySelector('input[type=color]').id = 'team' + (index + 1) + 'Color';
        card.querySelector('input[type=color]').setAttribute('aria-label', 'Franchise ' + (index + 1) + ' colour');
        franchiseCards.push(card);
        franchiseGrid.append(card);
    }
    franchiseCards.forEach((card, index) => {
        card.hidden = index >= count;
        if (card.hidden) return;
        const team = teams[index];
        const name = card.querySelector('.franchise-name');
        name.defaultValue = clubTemplates[index]?.name || 'Franchise ' + (index + 1);
        name.value = team.name;
        card.querySelector('input[type=color]').value = team.color;
        paintSetupCrest(index);
    });
    franchiseCount.value = String(count);
    element('setupTeamCount').textContent = count;
    refreshSoloTeams();
}

appState.teams.forEach((team, index) => Object.assign(team, clubIdentity(index)));
const savedCount = readRoomPreference('boundaryClubFranchiseCount', 4);
configureFranchises(Number.isInteger(savedCount) && savedCount >= 2 && savedCount <= 8 ? savedCount : 4);
playStyle.value = readRoomPreference('boundaryClubPlayStyle', 'solo') === 'manual' ? 'manual' : 'solo';
refreshSoloTeams();

franchiseCount.addEventListener('change', () => {
    if (window.multiplayer?.active) {
        franchiseCount.value = String(appState.teams.length);
        showToast('Set the number of franchises before creating a room.', 'warning');
        return;
    }
    appState.teams.forEach((team, index) => { savedClubs[index] = { ...team }; });
    configureFranchises(Number(franchiseCount.value));
    saveClubIdentities();
    storeRoomPreference('boundaryClubFranchiseCount', appState.teams.length);
});
playStyle.addEventListener('change', () => {
    refreshSoloTeams();
    storeRoomPreference('boundaryClubPlayStyle', playStyle.value);
});
franchiseGrid.addEventListener('input', event => {
    if (event.target.type !== 'color') return;
    const card = event.target.closest('.franchise-card');
    appState.teams[franchiseCards.indexOf(card)].color = event.target.value;
    card.style.setProperty('--team', event.target.value);
});
franchiseGrid.addEventListener('change', event => {
    const card = event.target.closest('.franchise-card');
    if (!card) return;
    const index = franchiseCards.indexOf(card);
    if (event.target.classList.contains('franchise-name')) {
        const team = appState.teams[index];
        team.name = event.target.value.trim() || event.target.defaultValue;
        event.target.value = team.name;
        paintSetupCrest(index);
        refreshSoloTeams();
    }
    saveClubIdentities();
});

function syncFloorTeams() {
    while (bidButtons.length < appState.teams.length) {
        const index = bidButtons.length;
        const button = bidButtons[0].cloneNode(true);
        button.id = 'bidTeam' + (index + 1);
        button.dataset.team = index;
        button.querySelector('.team-key-chip').textContent = index + 1;
        const card = purseCards[0].cloneNode(true);
        card.id = 'purseTeam' + (index + 1) + 'Info';
        bidButtons.push(button);
        purseCards.push(card);
        bidButtons[0].parentElement.append(button);
        purseCards[0].parentElement.append(card);
    }
    bidButtons.forEach((button, index) => {
        button.hidden = purseCards[index].hidden = index >= appState.teams.length;
    });
}

function isComputerTeam(index) {
    return appState.humanTeam != null && index !== appState.humanTeam && !window.multiplayer?.active;
}

// Game balance values in lakhs. These estimates can be overridden in the player database.
const marqueeBidCaps = new Map(Object.entries({
    'Virat Kohli': 2100, 'Jasprit Bumrah': 2200, 'Rishabh Pant': 2400,
    'Shreyas Iyer': 2300, 'Nicholas Pooran': 2000, 'Heinrich Klaasen': 1900,
    'Yashasvi Jaiswal': 1700, 'Arshdeep Singh': 1600, 'Pat Cummins': 1800,
    'Travis Head': 1500, 'Rashid Khan': 1700, 'Hardik Pandya': 1700,
    'Suryakumar Yadav': 1900, 'Ravindra Jadeja': 1600
}));

function computerBidCap(player) {
    if (Number.isSafeInteger(player.aiMaxBid) && player.aiMaxBid >= 0) return player.aiMaxBid;
    const base = Number(player.basePrice) || 30;
    const estimate = marqueeBidCaps.get(player.name) ?? base *
        (base >= 200 ? 5 : base >= 100 ? 4 : 3);
    return Math.max(base, estimate);
}

function computerBidder(player, offer) {
    const { maxSquadSize, maxOverseasPlayers } = appState.settings;
    const overseas = Boolean(player.country && player.country.trim().toLowerCase() !== 'india');
    const playerCap = computerBidCap(player);
    const candidates = [];
    appState.teams.forEach((team, index) => {
        if (!isComputerTeam(index) || index === appState.highestBidder ||
            team.squad.length >= maxSquadSize || (overseas && getOverseasCount(team) >= maxOverseasPlayers)) return;
        const style = Array.from(player.name).reduce((total, letter) => (total * 31 + letter.charCodeAt(0)) >>> 0, index + 1);
        const roleCount = team.squad.filter(member => member.category === player.category).length;
        const preference = (0.75 + (style % 26) / 100) / (1 + roleCount * 0.18);
        const reserve = Math.max(0, Math.min(10, maxSquadSize) - team.squad.length - 1) * 20;
        const budget = Math.min(team.purse - reserve, playerCap, Math.max(player.basePrice, playerCap * preference));
        if (offer <= budget) candidates.push(index);
    });
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function setComputerPass(passed) {
    appState.computersPassed = passed;
    const notice = element('computerPass');
    notice.hidden = !passed;
    if (passed) {
        const leader = appState.highestBidder;
        notice.textContent = leader === appState.humanTeam
            ? 'Computer teams are out. You can sell now.'
            : leader === null
                ? 'Computer teams passed. Buy at base price or mark unsold.'
                : 'Computer teams have no further bids. You can still bid or settle the lot.';
    }
    refreshComputerSale();
}

function refreshComputerSale() {
    const button = element('manualSellBtn');
    const canBuy = appState.computersPassed && appState.highestBidder === null && appState.phase === 'bidding';
    button.textContent = canBuy ? 'Buy at ₹' + formatPrice(nextOfferAmount(1)) : 'Sell Player (S)';
    if (canBuy) button.disabled = appState.timerPaused || bidButtons[appState.humanTeam].disabled;
    if (canBuy && !button.disabled) button.classList.remove('opacity-50', 'cursor-not-allowed');
}

function tryComputerBid() {
    if (appState.humanTeam == null || window.multiplayer?.active) return false;
    const player = getCurrentPlayer();
    if (!player || appState.phase !== 'bidding') return false;
    const bidder = computerBidder(player, nextOfferAmount(1));
    if (bidder === null) {
        setComputerPass(true);
        return false;
    }
    bid(bidder, true);
    return true;
}

let editingTeam = 0, logoDraft, imageRequest = 0;
function previewLogo() {
    element('logoPreview').innerHTML = franchiseMark(logoDraft, editingTeam);
    element('logoTeam').textContent = appState.teams[editingTeam].name;
    element('logoModal').style.setProperty('--team', teamAccent(appState.teams[editingTeam]));
    document.querySelectorAll('[data-crest-choice]').forEach(button => button.setAttribute('aria-pressed', !logoDraft.logo && logoDraft.crest === button.dataset.crestChoice));
}
element('crestChoices').innerHTML = crestNames.map(name => '<button data-crest-choice="' + name + '">' + franchiseMark({crest:name}, 0) + '<span>' + name + '</span></button>').join('');
franchiseGrid.addEventListener('click', event => {
    const btn = event.target.closest('[data-edit-team]');
    if (!btn) return;
    editingTeam = Number(btn.dataset.editTeam);
    logoDraft = {...appState.teams[editingTeam]};
    element('logoError').textContent = '';
    element('logoFile').value = '';
    element('applyLogo').disabled = false;
    previewLogo();
    element('logoModal').classList.remove('hidden');
});
element('crestChoices').addEventListener('click', event => {
    const button = event.target.closest('[data-crest-choice]');
    if (!button) return;
    imageRequest++;
    logoDraft.crest = button.dataset.crestChoice;
    logoDraft.logo = null;
    element('logoError').textContent = '';
    element('applyLogo').disabled = false;
    previewLogo();
});
element('logoFile').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const request = ++imageRequest;
    element('applyLogo').disabled = true;
    const url = URL.createObjectURL(file);
    try {
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) throw Error('Choose a PNG, JPG or WebP under 4 MB.');
        const img = new Image();
        img.src = url;
        await img.decode();
        if (imageRequest !== request) return;
        const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        logoDraft.logo = canvas.toDataURL('image/png');
        element('logoError').textContent = '';
        previewLogo();
    } catch (error) {
        if (imageRequest === request) element('logoError').textContent = error.name === 'EncodingError' ? 'This image could not be opened.' : error.message;
    } finally {
        URL.revokeObjectURL(url);
        if (imageRequest === request) element('applyLogo').disabled = false;
    }
});
function closeLogo() { imageRequest++; element('logoModal').classList.add('hidden'); }
element('cancelLogo').addEventListener('click', closeLogo);
element('applyLogo').addEventListener('click', () => {
    Object.assign(appState.teams[editingTeam], {crest:logoDraft.crest, logo:logoDraft.logo});
    saveClubIdentities();
    paintSetupCrest(editingTeam);
    closeLogo();
});

let selectedBidStep = 1;
window.selectedBidStep = 1;
function nextOfferAmount(steps = selectedBidStep) {
    let amount = appState.currentBid;
    if (appState.highestBidder !== null) {
        for (let step = 0; step < steps; step++) amount += getBidIncrement(amount);
    }
    return amount;
}
function selectBidStep(step, refresh = true) {
    selectedBidStep = step;
    window.selectedBidStep = step;
    document.querySelectorAll('[data-step]').forEach(btn => btn.setAttribute('aria-pressed', Number(btn.dataset.step) === step));
    if (refresh && appState.phase === 'bidding') updateControls(false);
}
document.querySelectorAll('[data-step]').forEach(btn => btn.addEventListener('click', () => selectBidStep(Number(btn.dataset.step))));

const roomDefaults = {lotOrder:'listed', clockRule:'reset', retentionSlots:5, volume:100};
const roomFields = {lotOrder:'settingLotOrder', clockRule:'settingClockRule', retentionSlots:'settingSlots', volume:'settingVolume'};
const savedRules = readRoomPreference('boundaryClubRules', {});
Object.assign(appState.settings, roomDefaults);
for (const key of ['initialPurse','timerDuration','enableRetention','enableUnsoldRound','bidMode','maxSquadSize','minSquadSize','maxOverseasPlayers', ...Object.keys(roomFields)]) {
    if (typeof savedRules?.[key] === typeof appState.settings[key]) appState.settings[key] = savedRules[key];
}
function applyRoomVolume() {
    for (const [key, audio] of Object.entries(sounds)) audio.volume = Math.max(0, Math.min(100, appState.settings.volume ?? 100)) / 100 * (key === 'crowd' ? 0.25 : 1);
}
function syncRoomSettings() {
    for (const [key,id] of Object.entries(roomFields)) element(id).value = appState.settings[key] ?? roomDefaults[key];
    element('settingLotOrder').disabled = appState.auctionStarted;
    element('settingSlots').disabled = appState.auctionStarted;
    applyRoomVolume();
}
function saveRoomSettings() {
    for (const [key,id] of Object.entries(roomFields)) appState.settings[key] = typeof roomDefaults[key] === 'number' ? Number(element(id).value) : element(id).value;
    storeRoomPreference('boundaryClubRules', appState.settings);
    applyRoomVolume();
}
function resetRoomSettingsForm() {
    for (const [key,id] of Object.entries(roomFields)) if (!element(id).disabled) element(id).value = roomDefaults[key];
}
element('roomNav').addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));
element('poolNav').addEventListener('click', () => {
    if (appState.auctionStarted && !appState.auctionEnded) openAuctionCentre('remaining');
    else element('managePoolBtn').click();
});
element('reportsNav').addEventListener('click', () => {
    element('settingsBtn').click();
    settingsPanel.querySelector('[data-target="setTabData"]').click();
});
applyRoomVolume();
refreshSetupSummary();