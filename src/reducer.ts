import type { GameState, PlayerId, StackId, Zone } from "./types";
import type { GameAction } from "./actions";

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function removeStackFromAllZones(state: GameState, stackId: StackId): void {
  for (const player of Object.values(state.players)) {
    for (const zone of Object.keys(player.zones) as Zone[]) {
      player.zones[zone] = player.zones[zone].filter((id) => id !== stackId);
    }
  }
}

function findStackLocation(
  state: GameState,
  stackId: StackId
): { playerId: PlayerId; zone: Zone; index: number } | null {
  for (const player of Object.values(state.players)) {
    for (const zone of Object.keys(player.zones) as Zone[]) {
      const index = player.zones[zone].indexOf(stackId);

      if (index !== -1) {
        return {
          playerId: player.id,
          zone,
          index,
        };
      }
    }
  }

  return null;
}

function addLog(
  state: GameState,
  actorId: PlayerId,
  type: string,
  message: string
): void {
  state.logs.push({
    id: createId("log"),
    actorId,
    type,
    message,
    createdAt: Date.now(),
  });
}

export function applyAction(input: GameState, action: GameAction): GameState {
  const state = cloneState(input);

  switch (action.type) {
    case "MOVE_STACK": {
      const stack = state.stacks[action.stackId];
      if (!stack) return input;

      removeStackFromAllZones(state, action.stackId);
      state.players[stack.ownerId].zones[action.toZone].push(action.stackId);

      addLog(
        state,
        action.actorId,
        "MOVE_STACK",
        `${action.actorId}: カードを ${action.toZone} へ移動`
      );

      return state;
    }

    case "MOVE_STACK_TO_DECK_TOP": {
      const stack = state.stacks[action.stackId];
      if (!stack) return input;

      removeStackFromAllZones(state, action.stackId);
      stack.tapped = false;
      state.players[stack.ownerId].zones.deck.unshift(action.stackId);

      addLog(
        state,
        action.actorId,
        "MOVE_STACK_TO_DECK_TOP",
        `${action.actorId}: カードを山札の上へ置いた`
      );

      return state;
    }

    case "MOVE_STACK_TO_DECK_BOTTOM": {
      const stack = state.stacks[action.stackId];
      if (!stack) return input;

      removeStackFromAllZones(state, action.stackId);
      stack.tapped = false;
      state.players[stack.ownerId].zones.deck.push(action.stackId);

      addLog(
        state,
        action.actorId,
        "MOVE_STACK_TO_DECK_BOTTOM",
        `${action.actorId}: カードを山札の下へ置いた`
      );

      return state;
    }

    case "MOVE_DECK_TOP_TO_PRIVATE": {
      const player = state.players[action.actorId];
      const count = Math.max(0, Math.floor(action.count));

      let moved = 0;

      for (let i = 0; i < count; i++) {
        const stackId = player.zones.deck.shift();
        if (!stackId) break;

        player.zones.private.push(stackId);
        moved++;
      }

      addLog(
        state,
        action.actorId,
        "MOVE_DECK_TOP_TO_PRIVATE",
        `${action.actorId}: 山札上から${moved}枚を確認中へ`
      );

      return state;
    }

    case "MOVE_PRIVATE_TO_DECK_TOP": {
      const player = state.players[action.actorId];
      const privateStacks = player.zones.private;

      if (privateStacks.length === 0) return input;

      player.zones.deck.unshift(...privateStacks);
      player.zones.private = [];

      addLog(
        state,
        action.actorId,
        "MOVE_PRIVATE_TO_DECK_TOP",
        `${action.actorId}: 確認中のカード${privateStacks.length}枚を山札上へ`
      );

      return state;
    }

    case "MOVE_PRIVATE_TO_DECK_BOTTOM": {
      const player = state.players[action.actorId];
      const privateStacks = player.zones.private;

      if (privateStacks.length === 0) return input;

      player.zones.deck.push(...privateStacks);
      player.zones.private = [];

      addLog(
        state,
        action.actorId,
        "MOVE_PRIVATE_TO_DECK_BOTTOM",
        `${action.actorId}: 確認中のカード${privateStacks.length}枚を山札下へ`
      );

      return state;
    }

    case "STACK_ON": {
      const source = state.stacks[action.sourceStackId];
      const target = state.stacks[action.targetStackId];
      if (!source || !target) return input;

      target.cardIds.push(...source.cardIds);

      removeStackFromAllZones(state, action.sourceStackId);
      delete state.stacks[action.sourceStackId];

      addLog(
        state,
        action.actorId,
        "STACK_ON",
        `${action.actorId}: カードを重ねた`
      );

      return state;
    }

    case "EXTRACT_CARD_FROM_STACK": {
      const source = state.stacks[action.sourceStackId];
      if (!source) return input;

      const location = findStackLocation(state, action.sourceStackId);
      if (!location) return input;

      if (action.cardIndex < 0 || action.cardIndex >= source.cardIds.length) {
        return input;
      }

      const [cardId] = source.cardIds.splice(action.cardIndex, 1);
      if (!cardId) return input;

      const toZone = action.toZone ?? location.zone;

      state.stacks[action.newStackId] = {
        id: action.newStackId,
        ownerId: source.ownerId,
        cardIds: [cardId],
        tapped: false,
      };

      state.players[source.ownerId].zones[toZone].push(action.newStackId);

      if (source.cardIds.length === 0) {
        removeStackFromAllZones(state, action.sourceStackId);
        delete state.stacks[action.sourceStackId];
      }

      addLog(
        state,
        action.actorId,
        "EXTRACT_CARD_FROM_STACK",
        `${action.actorId}: 束からカードを1枚取り出した`
      );

      return state;
    }

    case "DRAW": {
      const player = state.players[action.actorId];

      let drawn = 0;

      for (let i = 0; i < action.count; i++) {
        const stackId = player.zones.deck.shift();
        if (!stackId) break;

        player.zones.hand.push(stackId);
        drawn++;
      }

      addLog(
        state,
        action.actorId,
        "DRAW",
        `${action.actorId}: 山札から${drawn}枚ドロー`
      );

      return state;
    }

    case "SHUFFLE_DECK": {
      const deck = state.players[action.actorId].zones.deck;

      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }

      addLog(
        state,
        action.actorId,
        "SHUFFLE_DECK",
        `${action.actorId}: 山札をシャッフル`
      );

      return state;
    }

    case "SET_SHIELDS": {
      const player = state.players[action.actorId];

      let set = 0;

      for (let i = 0; i < action.count; i++) {
        const stackId = player.zones.deck.shift();
        if (!stackId) break;

        player.zones.shield.push(stackId);
        set++;
      }

      addLog(
        state,
        action.actorId,
        "SET_SHIELDS",
        `${action.actorId}: シールドを${set}枚セット`
      );

      return state;
    }

    case "TOGGLE_TAP": {
      const stack = state.stacks[action.stackId];
      if (!stack) return input;

      stack.tapped = !stack.tapped;

      addLog(
        state,
        action.actorId,
        "TOGGLE_TAP",
        `${action.actorId}: タップ状態を変更`
      );

      return state;
    }

    case "TOGGLE_FACE": {
      const card = state.cards[action.cardId];
      if (!card) return input;

      card.faceDown = !card.faceDown;

      addLog(
        state,
        action.actorId,
        "TOGGLE_FACE",
        `${action.actorId}: 表裏を変更`
      );

      return state;
    }

    default: {
      return state;
    }
  }
}
