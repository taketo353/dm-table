export type PlayerId = "p1" | "p2";

export type Zone =
  | "deck"
  | "hand"
  | "shield"
  | "mana"
  | "battle"
  | "grave"
  | "private"
  | "external";

export type CardId = string;
export type StackId = string;

export type CardInstance = {
  id: CardId;
  name: string;
  ownerId: PlayerId;
  faceDown: boolean;
};

export type CardStack = {
  id: StackId;
  ownerId: PlayerId;
  cardIds: CardId[];
  tapped: boolean;
};

export type PlayerState = {
  id: PlayerId;
  zones: Record<Zone, StackId[]>;
};

export type GameLog = {
  id: string;
  actorId: PlayerId;
  type: string;
  message: string;
  createdAt: number;
};

export type GameState = {
  cards: Record<CardId, CardInstance>;
  stacks: Record<StackId, CardStack>;
  players: Record<PlayerId, PlayerState>;
  logs: GameLog[];
};
