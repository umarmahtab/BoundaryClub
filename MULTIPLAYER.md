# Boundary Club - Multiplayer Implementation Guide

This document provides a comprehensive technical overview of the real-time multiplayer functionality added to Boundary Club, while preserving the original single-player game, UI, sound effects, and visual styling.

---

## 1. Project Objectives & Constraints

- **Preserve Existing Game & UI**: Keep the original HTML, CSS, vector SVGs, and client-side design system intact.
- **Backend Architecture**: Built with Node.js, Express, and Socket.IO.
- **Pure JavaScript**: No TypeScript, no React migration, no unnecessary build abstractions.
- **In-Memory Storage**: Fast, zero-dependency state management without MongoDB or Redis.
- **Server Authority**: The backend must enforce all auction rules, bid calculations, timers, squad restrictions, and franchise ownership.
- **Backward Compatibility**: Single-player offline/local mode continues to work seamlessly if not connected to a room.

---

## 2. System Architecture

```
                       ┌────────────────────────────────────────────────────────┐
                       │                     Browser Clients                    │
                       │  [Host / Participant 1]      [Participant 2 / Guest]   │
                       └───────────────▲────────────────────────▲───────────────┘
                                       │ WebSocket              │ WebSocket
                                       │ (Socket.IO)            │ (Socket.IO)
                       ┌───────────────▼────────────────────────▼───────────────┐
                       │                   Node.js + Express                    │
                       │                 [server/server.js]                     │
                       └───────────────────────┬────────────────────────────────┘
                                               │
                                 ┌─────────────┴─────────────┐
                                 │                           │
                   ┌─────────────▼─────────────┐   ┌─────────▼──────────────┐
                   │        RoomManager        │   │     AuctionEngine      │
                   │  [server/room-manager.js] │   │[server/auction-engine] │
                   │                           │   │                        │
                   │ • In-memory room map      │   │ • Authoritative State  │
                   │ • 6-char unique codes     │   │ • Server-side Timer    │
                   │ • Host & Participant list │   │ • Bidding Rules & Bids │
                   │ • Franchise Assignment    │   │ • Lot Progression      │
                   └───────────────────────────┘   └────────────────────────┘
```

---

## 3. What Was Implemented

### 3.1 Room System (`server/room-manager.js`)
- **Room Creation**: Generates unique, human-friendly 6-character room codes (e.g. `BC9842`).
- **Host Role**: The room creator is designated as host with exclusive auctioneer privileges.
- **Participant Tracking**: Tracks connected socket IDs, names, connection state, and claimed franchises.
- **Franchise Claiming**:
  - Each of the 4 franchises (United, Knights, Invincibles, Thunders) can be claimed by a participant.
  - Prevents race conditions and multiple participants claiming the same team.
  - Automatically frees claimed franchises when a participant leaves or disconnects.
- **Room Isolation**: Multiple rooms run independently in parallel with zero event leakage.

### 3.2 Server-Side Authoritative Engine (`server/auction-engine.js`)
- **Authoritative State**: Maintains master player list, categorized player pools, pool order, active lot, highest bidder, bid history, team purses, squads, and statistics.
- **Server-Side Timer**: An internal countdown ticker running on the server:
  - Ticks authoritative seconds (`auction:timerTick`).
  - Broadcasts urgency states (`< 10s`).
  - Automatically triggers player sale to the highest bidder or marks the player unsold when time reaches zero.
- **Strict Bid Validation**:
  - **Ownership Authorization**: Only the user assigned to a franchise can bid on its behalf (or the host if managing unassigned teams).
  - **Self-Bid Prevention**: Blocks bidding if the franchise is already the highest bidder.
  - **Purse Limits**: Ensures `team.purse >= newBid`.
  - **Squad Size Limit**: Ensures `team.squad.length < maxSquadSize` (default 25).
  - **Overseas Limit**: Checks non-Indian players against `maxOverseasPlayers` (default 8).
  - **Bid Increment Schedule**: Enforces exact increments based on price bands (5L, 10L, 20L, 25L) and jump multipliers (`1×`, `2×`, `5×`).
- **Auction Progression**:
  - Pool ordering and lot advancement.
  - Manual sale and unsold handling.
  - Timer pause/resume.
  - Lot restart and full undo stack.
  - Unsold rounds and final scorecard settlement.

### 3.3 Express & Socket.IO Server (`server/server.js`, `server.js`)
- Static asset serving (`index.html`, `assets/`, `sounds/`).
- Health check endpoint: `GET /api/health`.
- Real-time event handling:
  - `room:create`, `room:join`, `room:selectTeam`, `room:leave`
  - `auction:start`, `auction:startRound`, `auction:nextPlayer`
  - `auction:bid`, `auction:pause`, `auction:sell`, `auction:unsold`
  - `auction:restart`, `auction:undo`, `auction:startUnsoldRound`
  - Automatic disconnection cleanup and franchise release.

### 3.4 Client-Side Multiplayer Integration (`assets/multiplayer-client.js`, `assets/multiplayer.css`)
- **Multiplayer Modal Lobby**:
  - Tab 1: Create room (as Host) with custom manager name.
  - Tab 2: Join room with 6-character room code.
  - Active Lobby: Displays room code with one-click copy, connected participants list, franchise selection tiles, and "Start Auction" button for the host.
- **Live Masthead Pill**:
  - Displays room code, connection status dot, claimed franchise, and participant count.
  - Clicking opens the lobby modal at any time.
- **Bidding Floor Integration**:
  - Highlights the user's claimed franchise button (`team-mine`).
  - Disables unauthorized franchise buttons with owner tags (`Owned by BobPlayer`).
  - Automatically forwards clicks and number keys (`1`–`4`) to `auction:bid`.
  - Automatically synchronizes host action buttons (Sell, Unsold, Pause, Next, Restart, Undo), while showing waiting indicators on non-host screens.

---

## 4. Summary of Files Changed & Created

| File | Action | Purpose |
| --- | --- | --- |
| `package.json` | Created | Project definition, Express & Socket.IO dependencies, `start` and `test` scripts. |
| `.gitignore` | Modified | Added `node_modules/` to ignore list. |
| `server.js` | Created | Root application entry point for `npm start` / `node server.js`. |
| `server/server.js` | Created | Express server, Socket.IO handlers, and static routing. |
| `server/room-manager.js` | Created | In-memory room manager, code generator, and franchise assignment coordinator. |
| `server/auction-engine.js` | Created | Authoritative game engine with rules validation, countdown timer, and lot lifecycle. |
| `server/default-players.json` | Created | Clean JSON database of all 238 players extracted from original dataset. |
| `assets/multiplayer.css` | Created | Styling for lobby modal, franchise claim tiles, and status indicators. |
| `assets/multiplayer-client.js` | Created | Client Socket.IO controller, event sync, and DOM updates. |
| `assets/auction-room.js` | Modified | Exposed `window.selectedBidStep` for jump-bid support in multiplayer. |
| `index.html` | Modified | Added multiplayer lobby HTML, navigation button, status pill, and non-intrusive action hooks. |
| `test/multiplayer.test.js` | Created | Automated multi-socket test suite testing 58 conditions across the full multiplayer lifecycle. |
| `test/e2e_dom_simulation.js` | Created | Integration test suite verifying 60 DOM elements, script tags, hooks, and client methods. |

---

## 5. Verification & Test Results

All automated tests were run via `npm test` and passed with zero failures:

```
====================================================
   CLIENT DOM & MULTIPLAYER FLOW INTEGRATION TEST   
====================================================
--- 1. VERIFY DOM ELEMENTS IN INDEX.HTML ---
✓ 21 DOM elements verified (buttons, modals, grids, status tags)
--- 2. VERIFY SCRIPT & STYLE INCLUSIONS ---
✓ 3 CSS and JS script inclusions verified
--- 3. VERIFY MULTIPLAYER HOOKS IN ORIGINAL AUCTION LOGIC ---
✓ 10 original auction functions verified with multiplayer forwarders
--- 4. VERIFY MULTIPLAYER-CLIENT.JS CAPABILITIES ---
✓ 26 MultiplayerClient methods verified
DOM INTEGRATION RESULTS: 60 PASSED, 0 FAILED

====================================================
   BOUNDARY CLUB MULTIPLAYER AUTOMATED TEST SUITE   
====================================================
--- 1. ROOM CREATION & HOST IDENTIFICATION ---
✓ Host successfully created room
✓ Room code is 6 characters
✓ Creator is marked as isHost: true
✓ Host name saved correctly

--- 2. ROOM JOINING & LOBBY SYNCHRONIZATION ---
✓ Player 2 successfully joined Room A
✓ Player 2 is marked as isHost: false
✓ Host notified: room now has 2 participants
✓ Participant BobPlayer visible in lobby

--- 3. TEAM ASSIGNMENT & EXCLUSIVE OWNERSHIP ---
✓ Host claimed Team 0 (United)
✓ Player 2 claimed Team 1 (Knights)
✓ Server rejected Player 2 claiming already-taken Team 0
✓ Error correctly states team is claimed

--- 4. ROOM ISOLATION ---
✓ Created Room B independently
✓ Room B code differs from Room A code

--- 5. AUCTION INITIALIZATION & ACCESS CONTROL ---
✓ Non-host blocked from starting auction
✓ Host successfully started auction
✓ Auction started event received by Player 2
✓ Initial phase is pool preview
✓ Both participants received auction:started
✓ Room B was isolated and did not receive Room A auction start

--- 6. ROUND START & LOT SYNCHRONIZATION ---
✓ Phase transitioned to bidding
✓ Current player is defined
✓ Current bid matches player base price
✓ Both Host and Player 2 received synchronized lot opening

--- 7. LIVE BIDDING & BID INCREMENTS ---
✓ Host sees highestBidder is Team 1
✓ Host sees current bid at base price
✓ Player 2 sees highestBidder is Team 1
✓ Valid bid by Player 2 accepted by server
✓ Both clients received real-time auction:bidUpdate
✓ Counter-bid by Host accepted by server
✓ Highest bidder updated to Team 0
✓ Bid amount increased according to increment schedule

--- 8. SERVER BID VALIDATION & RULE ENFORCEMENT ---
✓ Server rejected bidding against oneself
✓ Error mentions already highest bidder
✓ Server rejected unauthorized franchise bid by Player 2
✓ Error enforces franchise authorization
✓ Server rejected bid exceeding franchise purse
✓ Error states not enough purse

--- 9. TIMER SYNCHRONIZATION & LOT SALE ---
✓ Received server-authoritative timer tick
✓ Host received playerSold status: sold
✓ Sold to Team 0
✓ Host sold current player
✓ Player 2 received playerSold status: sold
✓ Both clients received playerSold event
✓ Winning team squad count incremented
✓ Winning team purse correctly debited

--- 10. UNSOLD TRANSITIONS & AUCTION PROGRESSION ---
✓ Host called next player lot
✓ Host marked lot unsold
✓ Player 2 received playerUnsold status: unsold
✓ Player status updated to passed-over
✓ Both clients received playerUnsold notification

--- 11. PAUSE / RESUME & HOST CONTROLS ---
✓ Non-host blocked from pausing timer
✓ Host paused auction timer
✓ Timer marked paused
✓ Host resumed auction timer
✓ Timer marked active

--- 12. DISCONNECT HANDLING ---
✓ Host notified: participant count decreased after disconnect
✓ Disconnected player franchise released

====================================================
TOTAL TEST RESULTS: 118 PASSED, 0 FAILED
====================================================
```

---

## 6. How to Run & Play

### 6.1 Start the Server
```bash
npm start
```
The server will start at: `http://localhost:3000`

### 6.2 Run Automated Tests
```bash
npm test
```

### 6.3 Playing a Multiplayer Game
1. Open `http://localhost:3000` in multiple browser windows or tabs.
2. In Window 1 (Host):
   - Click **Multiplayer Room** on the setup screen.
   - Enter your name and click **Create Room**.
   - Note the 6-character room code (e.g. `BC9842`).
   - Claim your preferred franchise (e.g. **United**).
3. In Window 2 (Participant):
   - Click **Multiplayer Room** or **Multiplayer** in the top bar.
   - Enter your name, enter the 6-character code, and click **Join Room**.
   - Claim a different available franchise (e.g. **Knights**).
4. Window 1 (Host) clicks **Start Multiplayer Auction**.
5. All connected participants immediately enter the live auction floor in sync:
   - Every participant can only bid on behalf of their claimed franchise.
   - Bids, animations, sounds, purse balances, and countdown clocks are synchronized in real time.
   - The host controls lot transitions, sold/unsold approvals, and pauses.

---

## 7. Remaining Limitations

1. **In-Memory Volatility**: Room states are held in memory. Restarting the Node process resets active rooms.
2. **Socket Session Lifecycle**: Reconnection does not currently restore state if the browser tab is fully closed or cleared.
3. **Public Deployment**: To play across different networks over the Internet, the Node process must be hosted on a cloud provider (e.g. Render, Railway, DigitalOcean) or tunneled via Cloudflare Tunnel / ngrok.
