const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { RoomManager } = require('./room-manager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const roomManager = new RoomManager(io);

// Serve static assets from project root
app.use(express.static(path.join(__dirname, '..')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        activeRooms: roomManager.rooms.size,
        timestamp: Date.now()
    });
});

// Socket.IO real-time events
io.on('connection', (socket) => {
    // Room creation
    socket.on('room:create', ({ hostName, settings, teams, playerList } = {}, callback) => {
        try {
            const room = roomManager.createRoom(socket.id, hostName, { settings, teams, playerList });
            socket.join(`room:${room.code}`);

            const hostParticipant = room.participants[0];
            const state = roomManager.getPublicRoomState(room.code);

            if (typeof callback === 'function') {
                callback({ success: true, roomCode: room.code, participant: hostParticipant, roomState: state });
            }

            socket.emit('room:created', { roomCode: room.code, participant: hostParticipant, roomState: state });
            io.to(`room:${room.code}`).emit('room:state', state);
        } catch (err) {
            console.error('Error creating room:', err);
            if (typeof callback === 'function') {
                callback({ success: false, error: err.message });
            }
            socket.emit('room:error', { error: 'Failed to create room' });
        }
    });

    // Room joining
    socket.on('room:join', ({ roomCode, participantName } = {}, callback) => {
        try {
            const result = roomManager.joinRoom(roomCode, socket.id, participantName);
            if (!result.success) {
                if (typeof callback === 'function') callback(result);
                socket.emit('room:error', { error: result.error });
                return;
            }

            const room = result.room;
            socket.join(`room:${room.code}`);

            const state = roomManager.getPublicRoomState(room.code);
            const auctionState = room.engine.getState();

            const response = {
                success: true,
                roomCode: room.code,
                participant: result.participant,
                roomState: state,
                auctionState
            };

            if (typeof callback === 'function') callback(response);

            socket.emit('room:joined', response);
            io.to(`room:${room.code}`).emit('room:state', state);

            // If auction is already running, send full state to joining player
            if (room.engine.auctionStarted) {
                socket.emit('auction:state', auctionState);
            }
        } catch (err) {
            console.error('Error joining room:', err);
            if (typeof callback === 'function') callback({ success: false, error: err.message });
            socket.emit('room:error', { error: 'Failed to join room' });
        }
    });

    // Franchise claiming / assignment
    socket.on('room:selectTeam', ({ teamIdx } = {}, callback) => {
        const result = roomManager.selectTeam(socket.id, teamIdx);
        if (typeof callback === 'function') callback(result);

        if (!result.success) {
            socket.emit('room:error', { error: result.error });
            return;
        }

        const roomState = roomManager.getPublicRoomState(result.room.code);
        io.to(`room:${result.room.code}`).emit('room:state', roomState);
    });

    // Start auction (host only)
    socket.on('auction:start', (data = {}, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) return;

        if (room.hostId !== socket.id) {
            const err = 'Only the room host can start the auction';
            if (typeof callback === 'function') callback({ success: false, error: err });
            socket.emit('auction:error', { error: err });
            return;
        }

        // Apply updated team names or settings if passed from host setup screen
        if (data.teams && Array.isArray(data.teams) && data.teams.length === 4) {
            data.teams.forEach((t, i) => {
                if (t.name) room.engine.teams[i].name = t.name;
                if (t.color) room.engine.teams[i].color = t.color;
                if (t.crest) room.engine.teams[i].crest = t.crest;
                if (t.logo) room.engine.teams[i].logo = t.logo;
            });
        }
        if (data.settings) {
            Object.assign(room.engine.settings, data.settings);
        }

        room.status = 'auction';
        const startResult = room.engine.startAuction();
        const roomState = roomManager.getPublicRoomState(room.code);
        const auctionState = room.engine.getState();

        io.to(`room:${room.code}`).emit('room:state', roomState);
        io.to(`room:${room.code}`).emit('auction:started', auctionState);
        io.to(`room:${room.code}`).emit('auction:state', auctionState);

        if (typeof callback === 'function') callback(startResult);
    });

    // Start round (host only)
    socket.on('auction:startRound', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can start rounds';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.startRound();
        if (typeof callback === 'function') callback(res);
    });

    // Next player (host only)
    socket.on('auction:nextPlayer', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can advance players';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.nextPlayer();
        if (typeof callback === 'function') callback(res);
    });

    // Place bid
    socket.on('auction:bid', ({ teamIdx, step = 1 } = {}, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
            const err = 'Not in an active room';
            if (typeof callback === 'function') callback({ success: false, error: err });
            socket.emit('auction:error', { error: err });
            return;
        }

        const participant = room.participants.find(p => p.id === socket.id);
        if (!participant) {
            const err = 'Participant record not found';
            if (typeof callback === 'function') callback({ success: false, error: err });
            socket.emit('auction:error', { error: err });
            return;
        }

        // Server-side Franchise Authority / Ownership Check:
        // A participant can bid for teamIdx IF:
        // 1) They are explicitly assigned to teamIdx (participant.teamIdx === teamIdx)
        // 2) OR they are the Host and no participant is assigned to teamIdx (host acting as franchise manager for open team)
        const teamOwner = room.participants.find(p => p.teamIdx === teamIdx);
        const isAssigned = participant.teamIdx === teamIdx;
        const isHostManagingUnassigned = participant.isHost && (!teamOwner || teamOwner.id === socket.id);

        if (!isAssigned && !isHostManagingUnassigned) {
            const teamName = room.engine.teams[teamIdx] ? room.engine.teams[teamIdx].name : `Team ${teamIdx + 1}`;
            const ownerName = teamOwner ? teamOwner.name : 'another player';
            const err = `Cannot bid for ${teamName}: controlled by ${ownerName}.`;
            if (typeof callback === 'function') callback({ success: false, error: err });
            socket.emit('auction:error', { error: err });
            return;
        }

        const result = room.engine.placeBid(teamIdx, step, participant);
        if (typeof callback === 'function') callback(result);

        if (!result.success) {
            socket.emit('auction:error', { error: result.error });
        }
    });

    // Pause / Resume timer (host only)
    socket.on('auction:pause', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can pause/resume the auction timer';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.togglePauseTimer();
        if (typeof callback === 'function') callback(res);
    });

    // Sell player manually (host only)
    socket.on('auction:sell', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can conclude a sale manually';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.sellPlayer();
        if (typeof callback === 'function') callback(res);
    });

    // Mark unsold manually (host only)
    socket.on('auction:unsold', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can mark a player unsold manually';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.markUnsold();
        if (typeof callback === 'function') callback(res);
    });

    // Restart player lot (host only)
    socket.on('auction:restart', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can restart a lot';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.restartCurrentPlayer();
        if (typeof callback === 'function') callback(res);
    });

    // Undo action (host only)
    socket.on('auction:undo', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can undo an action';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.undoLastAction();
        if (typeof callback === 'function') callback(res);
    });

    // Start unsold round (host only)
    socket.on('auction:startUnsoldRound', (data, callback) => {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room || room.hostId !== socket.id) {
            const err = 'Only the host can start the unsold round';
            if (typeof callback === 'function') callback({ success: false, error: err });
            return;
        }
        const res = room.engine.startUnsoldRound();
        if (typeof callback === 'function') callback(res);
    });

    // Disconnect
    socket.on('disconnect', () => {
        const leaveResult = roomManager.leaveRoom(socket.id);
        if (leaveResult && !leaveResult.empty) {
            const state = roomManager.getPublicRoomState(leaveResult.roomCode);
            io.to(`room:${leaveResult.roomCode}`).emit('room:state', state);
        }
    });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Boundary Club auction server running at http://localhost:${PORT}`);
    });
}

module.exports = { app, server, io, roomManager };
