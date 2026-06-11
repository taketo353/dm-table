import { createServer } from "node:http";
import { Server } from "socket.io";

type PlayerId = "p1" | "p2" | "spectator";

type Room = {
  state: unknown | null;
  players: Partial<Record<"p1" | "p2", string>>;
  updatedAt: number;
};

const PORT = Number(process.env.PORT ?? 3001);
const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
  const id = roomId.trim() || "default";
  let room = rooms.get(id);

  if (!room) {
    room = {
      state: null,
      players: {},
      updatedAt: Date.now(),
    };
    rooms.set(id, room);
  }

  return room;
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("dm-table websocket server\n");
});

const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  let joinedRoomId = "";
  let joinedPlayerId: PlayerId = "spectator";

  socket.on("room:join", (payload: { roomId?: string; playerId?: PlayerId } = {}) => {
    const roomId = String(payload.roomId ?? "default").slice(0, 64);
    const playerId =
      payload.playerId === "p1" || payload.playerId === "p2"
        ? payload.playerId
        : "spectator";

    joinedRoomId = roomId;
    joinedPlayerId = playerId;

    const room = getRoom(roomId);
    socket.join(roomId);

    if (playerId === "p1" || playerId === "p2") {
      room.players[playerId] = socket.id;
    }

    socket.emit("room:joined", {
      roomId,
      playerId,
      state: room.state,
      players: room.players,
    });

    socket.to(roomId).emit("room:players", room.players);
  });

  socket.on("game:state", (state: unknown) => {
    if (!joinedRoomId) return;
    if (joinedPlayerId === "spectator") return;

    const room = getRoom(joinedRoomId);
    room.state = state;
    room.updatedAt = Date.now();

    socket.to(joinedRoomId).emit("game:state", state);
  });

  socket.on("disconnect", () => {
    if (!joinedRoomId) return;

    const room = getRoom(joinedRoomId);

    if (
      (joinedPlayerId === "p1" || joinedPlayerId === "p2") &&
      room.players[joinedPlayerId] === socket.id
    ) {
      delete room.players[joinedPlayerId];
      socket.to(joinedRoomId).emit("room:players", room.players);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running: http://localhost:${PORT}`);
});
