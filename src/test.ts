import type { GameState, PlayerId, Zone } from "./types";
import { applyAction } from "./reducer";

function emptyZones(): Record<Zone, string[]> {
  return {
    deck: [],
    hand: [],
    shield: [],
    mana: [],
    battle: [],
    grave: [],
    external: [],
  };
}

function createInitialState(): GameState {
  return {
    cards: {},
    stacks: {},
    players: {
      p1: { id: "p1", zones: emptyZones() },
      p2: { id: "p2", zones: emptyZones() },
    },
    logs: [],
  };
}

function addDeck(state: GameState, playerId: PlayerId, names: string[]): GameState {
  const next = structuredClone(state);

  names.forEach((name, index) => {
    const cardId = `${playerId}-card-${index + 1}`;
    const stackId = `${playerId}-stack-${index + 1}`;

    next.cards[cardId] = {
      id: cardId,
      name,
      ownerId: playerId,
      faceDown: false,
    };

    next.stacks[stackId] = {
      id: stackId,
      ownerId: playerId,
      cardIds: [cardId],
      tapped: false,
    };

    next.players[playerId].zones.deck.push(stackId);
  });

  return next;
}

function topCardName(state: GameState, stackId: string): string {
  const stack = state.stacks[stackId];
  const topCardId = stack.cardIds[stack.cardIds.length - 1];
  return state.cards[topCardId].name;
}

let state = createInitialState();

state = addDeck(state, "p1", [
  "天災 デドダム",
  "フェアリー・Re:ライフ",
  "Disジルコン",
  "終末王秘伝オリジナルフィナーレ",
  "切札勝太&カツキング -熱血の物語-",
  "単騎連射 マグナム",
  "音卿の精霊龍 ラフルル・ラブ",
  "流星のガイアッシュ・カイザー",
  "地龍神の魔陣",
  "ドンドン火噴くナウ",
  "ボン・キゴマイム",
  "とこしえの超人",
]);

state = applyAction(state, { type: "SHUFFLE_DECK", actorId: "p1" });
state = applyAction(state, { type: "SET_SHIELDS", actorId: "p1", count: 5 });
state = applyAction(state, { type: "DRAW", actorId: "p1", count: 5 });

const firstHandStack = state.players.p1.zones.hand[0];
const secondHandStack = state.players.p1.zones.hand[1];

state = applyAction(state, {
  type: "MOVE_STACK",
  actorId: "p1",
  stackId: firstHandStack,
  toZone: "mana",
});

state = applyAction(state, {
  type: "MOVE_STACK",
  actorId: "p1",
  stackId: secondHandStack,
  toZone: "battle",
});

const manaStack = state.players.p1.zones.mana[0];
const battleStack = state.players.p1.zones.battle[0];

state = applyAction(state, {
  type: "STACK_ON",
  actorId: "p1",
  sourceStackId: manaStack,
  targetStackId: battleStack,
});

console.log("=== zones ===");
console.log(JSON.stringify(state.players.p1.zones, null, 2));

console.log("\n=== battle stack ===");
console.log(state.stacks[battleStack]);
console.log("top card:", topCardName(state, battleStack));

console.log("\n=== logs ===");
for (const log of state.logs) {
  console.log(log.message);
}
