import { useState } from "react";
import type { GameState, PlayerId, StackId, Zone } from "./types";
import { applyAction } from "./reducer";

const zones: Zone[] = [
  "deck",
  "hand",
  "shield",
  "mana",
  "battle",
  "grave",
  "private",
  "external",
];

const zoneLabels: Record<Zone, string> = {
  deck: "山札",
  hand: "手札",
  shield: "シールド",
  mana: "マナ",
  battle: "バトルゾーン",
  grave: "墓地",
  private: "確認中",
  external: "外部",
};

function emptyZones(): Record<Zone, string[]> {
  return {
    deck: [],
    hand: [],
    shield: [],
    mana: [],
    battle: [],
    grave: [],
    private: [],
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

function makeDemoState(): GameState {
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

  return state;
}

function topCardName(state: GameState, stackId: StackId): string {
  const stack = state.stacks[stackId];
  if (!stack) return "不明";

  const topCardId = stack.cardIds[stack.cardIds.length - 1];
  return state.cards[topCardId]?.name ?? "不明";
}

function stackCardNames(state: GameState, stackId: StackId): string[] {
  const stack = state.stacks[stackId];
  if (!stack) return [];

  return stack.cardIds.map((cardId) => state.cards[cardId]?.name ?? "不明");
}

function findStackZone(state: GameState, playerId: PlayerId, stackId: StackId): Zone | null {
  const player = state.players[playerId];

  for (const zone of zones) {
    if (player.zones[zone].includes(stackId)) {
      return zone;
    }
  }

  return null;
}

function makeNewStackId(): StackId {
  return `extracted-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [state, setState] = useState<GameState>(() => makeDemoState());
  const [selectedStackIds, setSelectedStackIds] = useState<StackId[]>([]);
  const [openedStackId, setOpenedStackId] = useState<StackId | null>(null);
  const [deckPreviewInput, setDeckPreviewInput] = useState("4");

  const selectedStackId = selectedStackIds[0] ?? null;

  function dispatch(action: Parameters<typeof applyAction>[1]) {
    setState((prev) => applyAction(prev, action));
  }

  function dispatchMany(actions: Parameters<typeof applyAction>[1][]) {
    setState((prev) => actions.reduce((current, action) => applyAction(current, action), prev));
  }

  function clearSelection() {
    setSelectedStackIds([]);
  }

  function isSelected(stackId: StackId): boolean {
    return selectedStackIds.includes(stackId);
  }

  function toggleMultiSelection(stackId: StackId) {
    setSelectedStackIds((prev) => {
      if (prev.includes(stackId)) {
        return prev.filter((id) => id !== stackId);
      }

      return [...prev, stackId];
    });
  }

  function handleZoneClick(zone: Zone) {
    if (selectedStackIds.length === 0) return;

    dispatchMany(
      selectedStackIds.map((stackId) => ({
        type: "MOVE_STACK",
        actorId: "p1",
        stackId,
        toZone: zone,
      }))
    );

    clearSelection();
  }

  function handleStackClick(stackId: StackId, event: React.MouseEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.metaKey) {
      toggleMultiSelection(stackId);
      return;
    }

    if (selectedStackIds.length === 0) {
      setSelectedStackIds([stackId]);
      return;
    }

    if (selectedStackIds.length === 1 && selectedStackIds[0] === stackId) {
      clearSelection();
      return;
    }

    if (selectedStackIds.includes(stackId)) {
      clearSelection();
      return;
    }

    dispatchMany(
      selectedStackIds.map((sourceStackId) => ({
        type: "STACK_ON",
        actorId: "p1",
        sourceStackId,
        targetStackId: stackId,
      }))
    );

    clearSelection();
  }

  function handleExtractCardFromStack(cardIndex: number) {
    if (!openedStackId) return;

    const newStackId = makeNewStackId();

    dispatch({
      type: "EXTRACT_CARD_FROM_STACK",
      actorId: "p1",
      sourceStackId: openedStackId,
      cardIndex,
      newStackId,
    });

    setSelectedStackIds([newStackId]);
    setOpenedStackId(null);
  }

  function handleMoveSelectedToDeckTop() {
    if (selectedStackIds.length === 0) return;

    dispatchMany(
      [...selectedStackIds].reverse().map((stackId) => ({
        type: "MOVE_STACK_TO_DECK_TOP",
        actorId: "p1",
        stackId,
      }))
    );

    clearSelection();
  }

  function handleMoveSelectedToDeckBottom() {
    if (selectedStackIds.length === 0) return;

    dispatchMany(
      selectedStackIds.map((stackId) => ({
        type: "MOVE_STACK_TO_DECK_BOTTOM",
        actorId: "p1",
        stackId,
      }))
    );

    clearSelection();
  }

  function handleMoveDeckTopToPrivate() {
    const rawCount = Math.floor(Number(deckPreviewInput));
    const deckCount = state.players.p1.zones.deck.length;

    if (!Number.isFinite(rawCount) || rawCount <= 0) return;

    dispatch({
      type: "MOVE_DECK_TOP_TO_PRIVATE",
      actorId: "p1",
      count: Math.min(rawCount, deckCount),
    });

    clearSelection();
  }

  function handleMovePrivateToDeckTop() {
    dispatch({
      type: "MOVE_PRIVATE_TO_DECK_TOP",
      actorId: "p1",
    });

    clearSelection();
  }

  function handleMovePrivateToDeckBottom() {
    dispatch({
      type: "MOVE_PRIVATE_TO_DECK_BOTTOM",
      actorId: "p1",
    });

    clearSelection();
  }

  const selectedZone = selectedStackId ? findStackZone(state, "p1", selectedStackId) : null;
  const selectedText =
    selectedStackIds.length === 0
      ? "なし"
      : selectedStackIds.length >= 2
      ? `${selectedStackIds.length}枚選択中`
      : selectedStackId && selectedZone === "shield"
      ? `${selectedStackId} / シールド（非公開）`
      : selectedStackId
      ? `${selectedStackId} / ${topCardName(state, selectedStackId)}`
      : "なし";

  const openedNames = openedStackId ? stackCardNames(state, openedStackId) : [];
  const openedStack = openedStackId ? state.stacks[openedStackId] : null;
  const openedZone = openedStackId ? findStackZone(state, "p1", openedStackId) : null;

  return (
    <div className="app">
      <h1>DM Table Prototype</h1>

      <div className="toolbar">
        <button onClick={() => dispatch({ type: "SHUFFLE_DECK", actorId: "p1" })}>
          山札シャッフル
        </button>

        <button onClick={() => dispatch({ type: "SET_SHIELDS", actorId: "p1", count: 5 })}>
          シールド5枚
        </button>

        <button onClick={() => dispatch({ type: "DRAW", actorId: "p1", count: 1 })}>
          1ドロー
        </button>

        <label className="deckPreviewControl">
          山札上
          <input
            value={deckPreviewInput}
            onChange={(event) => setDeckPreviewInput(event.target.value)}
            inputMode="numeric"
            type="number"
            min="1"
          />
          枚
        </label>

        <button onClick={handleMoveDeckTopToPrivate}>確認中へ</button>
        <button onClick={handleMovePrivateToDeckTop}>確認中を山札上へ</button>
        <button onClick={handleMovePrivateToDeckBottom}>確認中を山札下へ</button>

        <button
          onClick={() => {
            if (selectedStackIds.length === 0) return;

            dispatchMany(
              selectedStackIds.map((stackId) => ({
                type: "TOGGLE_TAP",
                actorId: "p1",
                stackId,
              }))
            );
          }}
        >
          選択をタップ切替
        </button>

        <button onClick={handleMoveSelectedToDeckTop}>選択を山札上へ</button>
        <button onClick={handleMoveSelectedToDeckBottom}>選択を山札下へ</button>

        <button onClick={clearSelection}>選択解除</button>
      </div>

      <p className="hint">
        通常クリックで1枚選択 / Ctrlクリックで複数選択 / 複数選択してゾーンをクリックするとまとめて移動
      </p>

      <p className="selectedText">選択中：{selectedText}</p>

      <div className="layout">
        <div className="board">
          {zones.map((zone) => {
            const stackIds = state.players.p1.zones[zone];

            return (
              <div key={zone} className="zone" onClick={() => handleZoneClick(zone)}>
                <h2>
                  {zoneLabels[zone]} ({stackIds.length})
                </h2>

                <div className="cards">
                  {zone === "deck" ? (
                    <div className="card cardBack">
                      <strong>山札</strong>
                      <span>{stackIds.length}枚</span>
                      <span className="hiddenInfo">中身は非公開</span>
                    </div>
                  ) : zone === "shield" ? (
                    stackIds.map((stackId, index) => (
                      <div
                        key={stackId}
                        className={`card cardBack shieldBack ${
                          isSelected(stackId) ? "selected" : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleStackClick(stackId, event);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setOpenedStackId(stackId);
                        }}
                      >
                        <strong>シールド</strong>
                        <span>{index + 1}枚目</span>
                        <span className="hiddenInfo">ダブルクリックで確認</span>
                      </div>
                    ))
                  ) : (
                    stackIds.map((stackId) => {
                      const stack = state.stacks[stackId];

                      return (
                        <div
                          key={stackId}
                          className={`card ${zone === "private" ? "privateCard" : ""} ${
                            isSelected(stackId) ? "selected" : ""
                          } ${stack.tapped ? "tapped" : ""}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleStackClick(stackId, event);
                          }}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setOpenedStackId(stackId);
                          }}
                        >
                          <strong>{topCardName(state, stackId)}</strong>

                          {zone === "private" && <span className="hiddenInfo">確認中</span>}

                          {stack.cardIds.length > 1 && (
                            <span className="stackCount">下に{stack.cardIds.length - 1}枚</span>
                          )}

                          {stack.tapped && <span className="tapLabel">TAP</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="logs">
          <h2>ログ</h2>
          {state.logs.map((log) => (
            <div key={log.id} className="log">
              {log.message}
            </div>
          ))}
        </div>
      </div>

      {openedStackId && (
        <div className="modalBackdrop" onClick={() => setOpenedStackId(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h2>{openedZone === "shield" ? "シールド確認" : `Stack: ${openedStackId}`}</h2>
            <p>下から上の順番</p>

            <ol>
              {openedNames.map((name, index) => (
                <li key={`${name}-${index}`}>
                  {index === openedNames.length - 1 ? "上：" : "下："}
                  {name}

                  {openedStack && openedStack.cardIds.length > 1 && (
                    <button
                      style={{ marginLeft: 8 }}
                      onClick={() => handleExtractCardFromStack(index)}
                    >
                      取り出して選択
                    </button>
                  )}
                </li>
              ))}
            </ol>

            <button onClick={() => setOpenedStackId(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
