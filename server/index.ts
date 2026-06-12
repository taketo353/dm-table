import { createServer } from "node:http";
import { Server } from "socket.io";
import { applyAction } from "../src/reducer";
import type { CardId, GameLog, GameState, PlayerId, Zone } from "../src/types";

type ClientRole = PlayerId | "spectator";
type GameAction = Parameters<typeof applyAction>[1];

type Room = {
  state: GameState | null;
  players: Partial<Record<PlayerId, string>>;
  updatedAt: number;
};

type CardLocation = {
  ownerId: PlayerId;
  zone: Zone;
  stackId: string;
};

const PORT = Number(process.env.PORT ?? 3001);
const rooms = new Map<string, Room>();

const PUBLIC_ZONES = new Set<Zone>(["mana", "battle", "grave", "external"]);
const OWNER_VISIBLE_PRIVATE_ZONES = new Set<Zone>(["hand", "private"]);

const ZONE_LABELS: Record<Zone, string> = {
  deck: "山札",
  hand: "手札",
  shield: "シールド",
  mana: "マナ",
  battle: "バトルゾーン",
  grave: "墓地",
  private: "確認中",
  external: "外部ゾーン",
};

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

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function buildCardLocations(state: GameState): Record<CardId, CardLocation> {
  const locations: Record<CardId, CardLocation> = {};

  for (const playerId of Object.keys(state.players) as PlayerId[]) {
    const player = state.players[playerId];

    for (const zone of Object.keys(player.zones) as Zone[]) {
      for (const stackId of player.zones[zone]) {
        const stack = state.stacks[stackId];
        if (!stack) continue;

        for (const cardId of stack.cardIds) {
          const card = state.cards[cardId];
          locations[cardId] = {
            ownerId: card?.ownerId ?? stack.ownerId ?? playerId,
            zone,
            stackId,
          };
        }
      }
    }
  }

  return locations;
}

function canViewerSeeCardName(viewerId: ClientRole, location: CardLocation): boolean {
  if (PUBLIC_ZONES.has(location.zone)) {
    return true;
  }

  if (
    viewerId !== "spectator" &&
    location.ownerId === viewerId &&
    OWNER_VISIBLE_PRIVATE_ZONES.has(location.zone)
  ) {
    return true;
  }

  return false;
}

function sanitizeGameState(state: GameState, viewerId: ClientRole): GameState {
  const sanitized = cloneState(state);
  const locations = buildCardLocations(state);

  for (const cardId of Object.keys(sanitized.cards) as CardId[]) {
    const location = locations[cardId];
    if (!location) continue;

    if (!canViewerSeeCardName(viewerId, location)) {
      sanitized.cards[cardId] = {
        ...sanitized.cards[cardId],
        name: "非公開",
        faceDown: true,
      };
    } else {
      sanitized.cards[cardId] = {
        ...sanitized.cards[cardId],
        faceDown: false,
      };
    }
  }

  return sanitized;
}

function makeLog(
  actorId: PlayerId,
  type: string,
  message: string,
): GameLog {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    actorId,
    type,
    message,
    createdAt: Date.now(),
  };
}

function makePublicMoveLogs(
  before: GameState,
  after: GameState,
  actorId: PlayerId,
): GameLog[] {
  const beforeLocations = buildCardLocations(before);
  const afterLocations = buildCardLocations(after);

  const groups = new Map<string, string[]>();

  for (const cardId of Object.keys(after.cards) as CardId[]) {
    const beforeLocation = beforeLocations[cardId];
    const afterLocation = afterLocations[cardId];

    if (!beforeLocation || !afterLocation) continue;
    if (beforeLocation.zone === afterLocation.zone) continue;
    if (!PUBLIC_ZONES.has(afterLocation.zone)) continue;

    const cardName = after.cards[cardId]?.name ?? "不明なカード";
    const key = `${beforeLocation.zone}->${afterLocation.zone}`;

    const names = groups.get(key) ?? [];
    names.push(cardName);
    groups.set(key, names);
  }

  return Array.from(groups.entries()).map(([key, names]) => {
    const [fromZone, toZone] = key.split("->") as [Zone, Zone];

    const shownNames =
      names.length <= 4 ? names.join("、") : `${names.length}枚`;

    return makeLog(
      actorId,
      "PUBLIC_MOVE",
      `${actorId}が${ZONE_LABELS[fromZone]}から${ZONE_LABELS[toZone]}に置いた：${shownNames}`,
    );
  });
}

function applyServerAction(
  before: GameState,
  action: GameAction,
  actorId: PlayerId,
): GameState {
  const after = applyAction(before, action);
  const publicMoveLogs = makePublicMoveLogs(before, after, actorId);

  if (publicMoveLogs.length === 0) {
    return after;
  }

  return {
    ...after,
    logs: [...publicMoveLogs, ...after.logs].slice(0, 120),
  };
}

function applyServerActions(
  before: GameState,
  actions: GameAction[],
  actorId: PlayerId,
): GameState {
  return actions.reduce((current, action) => applyServerAction(current, action, actorId), before);
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

function emitRoomState(roomId: string, room: Room) {
  if (!room.state) return;

  for (const targetSocket of io.sockets.sockets.values()) {
    if (!targetSocket.rooms.has(roomId)) continue;

    const viewerId = (targetSocket.data.playerId ?? "spectator") as ClientRole;
    targetSocket.emit("game:state", sanitizeGameState(room.state, viewerId));
  }
}

io.on("connection", (socket) => {
  let joinedRoomId = "";
  let joinedPlayerId: ClientRole = "spectator";

  socket.on("room:join", (payload: { roomId?: string; playerId?: ClientRole } = {}) => {
    const roomId = String(payload.roomId ?? "default").slice(0, 64);
    const playerId =
      payload.playerId === "p1" || payload.playerId === "p2"
        ? payload.playerId
        : "spectator";

    joinedRoomId = roomId;
    joinedPlayerId = playerId;
    socket.data.playerId = playerId;

    const room = getRoom(roomId);
    socket.join(roomId);

    if (playerId === "p1" || playerId === "p2") {
      room.players[playerId] = socket.id;
    }

    socket.emit("room:joined", {
      roomId,
      playerId,
      state: room.state ? sanitizeGameState(room.state, playerId) : null,
      players: room.players,
    });

    socket.to(roomId).emit("room:players", room.players);
  });

  socket.on("game:init", (state: GameState) => {
    if (!joinedRoomId) return;
    if (joinedPlayerId === "spectator") return;

    const room = getRoom(joinedRoomId);
    room.state = state;
    room.updatedAt = Date.now();

    emitRoomState(joinedRoomId, room);
  });

  socket.on("game:action", (action: GameAction) => {
    if (!joinedRoomId) return;
    if (joinedPlayerId !== "p1" && joinedPlayerId !== "p2") return;

    const room = getRoom(joinedRoomId);
    if (!room.state) return;

    room.state = applyServerAction(room.state, action, joinedPlayerId);
    room.updatedAt = Date.now();

    emitRoomState(joinedRoomId, room);
  });

  socket.on("game:actions", (actions: GameAction[]) => {
    if (!joinedRoomId) return;
    if (joinedPlayerId !== "p1" && joinedPlayerId !== "p2") return;

    const room = getRoom(joinedRoomId);
    if (!room.state) return;

    room.state = applyServerActions(room.state, actions, joinedPlayerId);
    room.updatedAt = Date.now();

    emitRoomState(joinedRoomId, room);
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
