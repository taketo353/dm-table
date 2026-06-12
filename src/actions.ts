import type { CardId, PlayerId, StackId, Zone } from "./types";

export type GameAction =
  | {
      type: "MOVE_STACK";
      actorId: PlayerId;
      stackId: StackId;
      toZone: Zone;
    }
  | {
      type: "MOVE_STACK_TO_DECK_TOP";
      actorId: PlayerId;
      stackId: StackId;
    }
  | {
      type: "MOVE_STACK_TO_DECK_BOTTOM";
      actorId: PlayerId;
      stackId: StackId;
    }
  | {
      type: "MOVE_DECK_TOP_TO_PRIVATE";
      actorId: PlayerId;
      count: number;
    }
  | {
      type: "MOVE_PRIVATE_TO_DECK_TOP";
      actorId: PlayerId;
    }
  | {
      type: "MOVE_PRIVATE_TO_DECK_BOTTOM";
      actorId: PlayerId;
    }
  | {
      type: "STACK_ON";
      actorId: PlayerId;
      sourceStackId: StackId;
      targetStackId: StackId;
    }
  | {
      type: "EXTRACT_CARD_FROM_STACK";
      actorId: PlayerId;
      sourceStackId: StackId;
      cardIndex: number;
      newStackId: StackId;
      toZone?: Zone;
    }
  | {
      type: "DRAW";
      actorId: PlayerId;
      count: number;
    }
  | {
      type: "SHUFFLE_DECK";
      actorId: PlayerId;
    }
  | {
      type: "SET_SHIELDS";
      actorId: PlayerId;
      count: number;
    }
  | {
      type: "TOGGLE_TAP";
      actorId: PlayerId;
      stackId: StackId;
    }
  | {
      type: "TOGGLE_FACE";
      actorId: PlayerId;
      cardId: CardId;
    }
  | { type: "CONCEDE"; actorId: PlayerId };
