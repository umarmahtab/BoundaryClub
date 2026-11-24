const { AuctionEngine } = require('./auction-engine');

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid visually ambiguous chars like 0, O, 1, I
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map(); // roomCode -> Room
        this.socketRoomMap = new Map(); // socketId -> roomCode
    }

    createRoom(hostSocketId, hostName = 'Host', options = {}) {
        let code = generateRoomCode();
        while (this.rooms.has(code)) {
            code = generateRoomCode();
        }

        const roomCode = code;

        const auctionEngine = new AuctionEngine({
            settings: options.settings || {},
            teams: options.teams,
            playerList: options.playerList,
            onTick: (data) => {
                this.io.to(`room:${roomCode}`).emit('auction:timerTick', data);
            },
            onStateChange: (event, data) => {
                this.io.to(`room:${roomCode}`).emit(event, data);
                // Also broadcast full state update for safety
                if (event !== 'auction:bidUpdate' && event !== 'auction:timerPaused') {
                    this.io.to(`room:${roomCode}`).emit('auction:state', auctionEngine.getState());
                }
            },
            onLotSettled: (data) => {
                this.io.to(`room:${roomCode}`).emit('auction:lotSettled', data);
            }
        });

        const host = {
            id: hostSocketId,
            name: (hostName || 'Host').trim().slice(0, 20),
            isHost: true,
            teamIdx: null
        };

        const room = {
            code: roomCode,
            hostId: hostSocketId,
            participants: [host],
            engine: auctionEngine,
            status: 'lobby', // 'lobby' | 'auction' | 'ended'
            createdAt: Date.now()
        };

        this.rooms.set(roomCode, room);
        this.socketRoomMap.set(hostSocketId, roomCode);

        return room;
    }

    joinRoom(roomCode, socketId, participantName = 'Guest') {
        const cleanCode = (roomCode || '').toUpperCase().trim();
        const room = this.rooms.get(cleanCode);
        if (!room) {
            return { success: false, error: 'Room not found. Check the code and try again.' };
        }

        const existing = room.participants.find(p => p.id === socketId);
        if (existing) {
            return { success: true, room, participant: existing };
        }

        const participant = {
            id: socketId,
            name: (participantName || 'Guest').trim().slice(0, 20),
            isHost: false,
            teamIdx: null
        };

        room.participants.push(participant);
        this.socketRoomMap.set(socketId, cleanCode);

        return { success: true, room, participant };
    }

    leaveRoom(socketId) {
        const roomCode = this.socketRoomMap.get(socketId);
        if (!roomCode) return null;

        const room = this.rooms.get(roomCode);
        this.socketRoomMap.delete(socketId);

        if (!room) return null;

        const idx = room.participants.findIndex(p => p.id === socketId);
        if (idx !== -1) {
            const [removed] = room.participants.splice(idx, 1);

            // If room is empty, clean up
            if (room.participants.length === 0) {
                room.engine.destroy();
                this.rooms.delete(roomCode);
                return { roomCode, empty: true };
            }

            // If removed was host, transfer host to next participant
            if (removed.isHost && room.participants.length > 0) {
                room.participants[0].isHost = true;
                room.hostId = room.participants[0].id;
            }

            return { roomCode, room, removed };
        }

        return null;
    }

    selectTeam(socketId, teamIdx) {
        const roomCode = this.socketRoomMap.get(socketId);
        if (!roomCode) return { success: false, error: 'Not in a room' };

        const room = this.rooms.get(roomCode);
        if (!room) return { success: false, error: 'Room not found' };

        const participant = room.participants.find(p => p.id === socketId);
        if (!participant) return { success: false, error: 'Participant not found' };

        if (teamIdx === null || teamIdx === undefined) {
            participant.teamIdx = null;
            return { success: true, room, participant };
        }

        const index = Number(teamIdx);
        if (index < 0 || index >= room.engine.teams.length) {
            return { success: false, error: 'Invalid franchise' };
        }

        // Check if another participant already claimed this team
        const alreadyClaimed = room.participants.find(p => p.id !== socketId && p.teamIdx === index);
        if (alreadyClaimed) {
            return {
                success: false,
                error: `${room.engine.teams[index].name} is already claimed by ${alreadyClaimed.name}`
            };
        }

        participant.teamIdx = index;
        return { success: true, room, participant };
    }

    getRoom(roomCode) {
        if (!roomCode) return null;
        return this.rooms.get(roomCode.toUpperCase().trim());
    }

    getRoomBySocketId(socketId) {
        const roomCode = this.socketRoomMap.get(socketId);
        if (!roomCode) return null;
        return this.rooms.get(roomCode);
    }

    getPublicRoomState(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room) return null;

        return {
            roomCode: room.code,
            hostId: room.hostId,
            participants: room.participants.map(p => ({
                id: p.id,
                name: p.name,
                isHost: p.isHost,
                teamIdx: p.teamIdx
            })),
            status: room.status,
            teams: room.engine.teams.map((t, idx) => {
                const owner = room.participants.find(p => p.teamIdx === idx);
                return {
                    name: t.name,
                    color: t.color,
                    crest: t.crest,
                    logo: t.logo,
                    purse: t.purse,
                    squadCount: t.squad.length,
                    owner: owner ? { id: owner.id, name: owner.name } : null
                };
            }),
            auctionStarted: room.engine.auctionStarted,
            phase: room.engine.phase
        };
    }
}

module.exports = { RoomManager };
