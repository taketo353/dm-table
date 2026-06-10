import { useState, type MouseEvent } from "react";
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

function otherPlayer(playerId: PlayerId): PlayerId {
  return playerId === "p1" ? "p2" : "p1";
}

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

function shuffleIds(ids: StackId[]): StackId[] {
  const result = [...ids];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function setupOpeningState(state: GameState, playerId: PlayerId): GameState {
  const next = structuredClone(state);
  const player = next.players[playerId];

  player.zones.deck = shuffleIds(player.zones.deck);
  player.zones.shield = player.zones.deck.splice(0, 5);
  player.zones.hand = player.zones.deck.splice(0, 5);

  return next;
}

function makeSampleDeck(prefix = ""): string[] {
  const base = [
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
  ];

  return Array.from({ length: 40 }, (_, index) => {
    const name = base[index % base.length];
    return `${prefix}${name} #${index + 1}`;
  });
}

function makeDemoState(): GameState {
  let state = createInitialState();

  state = addDeck(state, "p1", makeSampleDeck(""));
  state = addDeck(state, "p2", makeSampleDeck("相手-"));

  state = setupOpeningState(state, "p1");
  state = setupOpeningState(state, "p2");

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

function findStackZone(state: GameState, stackId: StackId): Zone | null {
  const stack = state.stacks[stackId];
  if (!stack) return null;

  const player = state.players[stack.ownerId];

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
  const [viewPlayerId, setViewPlayerId] = useState<PlayerId>("p1");
  const [selectedStackIds, setSelectedStackIds] = useState<StackId[]>([]);
  const [revealedStackIds, setRevealedStackIds] = useState<StackId[]>([]);
  const [openedStackId, setOpenedStackId] = useState<StackId | null>(null);
  const [deckPreviewInput, setDeckPreviewInput] = useState("4");

  const opponentId = otherPlayer(viewPlayerId);
  const selectedStackId = selectedStackIds[0] ?? null;

  function dispatch(action: Parameters<typeof applyAction>[1]) {
    setState((prev) => applyAction(prev, action));
  }

  function dispatchMany(actions: Parameters<typeof applyAction>[1][]) {
    setState((prev) => actions.reduce((current, action) => applyAction(current, action), prev));
  }

  function handleResetGame() {
    setState(makeDemoState());
    setSelectedStackIds([]);
    setRevealedStackIds([]);
    setOpenedStackId(null);
  }

  function clearSelection() {
    setSelectedStackIds([]);
  }

  function isSelected(stackId: StackId): boolean {
    return selectedStackIds.includes(stackId);
  }

  function isRevealedByPeek(stackId: StackId): boolean {
    return revealedStackIds.includes(stackId);
  }

  function toggleMultiSelection(stackId: StackId) {
    setSelectedStackIds((prev) => {
      if (prev.includes(stackId)) {
        return prev.filter((id) => id !== stackId);
      }

      return [...prev, stackId];
    });
  }

  function handleZoneClick(playerId: PlayerId, zone: Zone) {
    if (selectedStackIds.length === 0) return;

    const movableStackIds = selectedStackIds.filter((stackId) => {
      const stack = state.stacks[stackId];
      return stack?.ownerId === playerId;
    });

    if (movableStackIds.length === 0) return;

    dispatchMany(
      movableStackIds.map((stackId) => ({
        type: "MOVE_STACK",
        actorId: viewPlayerId,
        stackId,
        toZone: zone,
      }))
    );

    setRevealedStackIds((prev) => prev.filter((id) => !movableStackIds.includes(id)));
    clearSelection();
  }

  function handleStackClick(stackId: StackId, event: MouseEvent<HTMLDivElement>) {
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
      setSelectedStackIds([stackId]);
      return;
    }

    const target = state.stacks[stackId];
    if (!target) return;

    if (target.ownerId !== viewPlayerId) {
      setSelectedStackIds([stackId]);
      return;
    }

    const stackableIds = selectedStackIds.filter((sourceStackId) => {
      const source = state.stacks[sourceStackId];
      return source && source.ownerId === viewPlayerId && source.ownerId === target.ownerId;
    });

    if (stackableIds.length === 0) {
      setSelectedStackIds([stackId]);
      return;
    }

    dispatchMany(
      stackableIds.map((sourceStackId) => ({
        type: "STACK_ON",
        actorId: viewPlayerId,
        sourceStackId,
        targetStackId: stackId,
      }))
    );

    setRevealedStackIds((prev) => prev.filter((id) => !stackableIds.includes(id)));
    clearSelection();
  }

  function handleRevealSelected() {
    const peekableIds = selectedStackIds.filter((stackId) => {
      const stack = state.stacks[stackId];
      const zone = findStackZone(state, stackId);

      if (!stack || !zone) return false;
      if (stack.ownerId === viewPlayerId) return false;

      return zone === "hand" || zone === "shield";
    });

    if (peekableIds.length === 0) return;

    setRevealedStackIds((prev) => Array.from(new Set([...prev, ...peekableIds])));
    clearSelection();
  }

  function handleHideSelectedPeek() {
    setRevealedStackIds((prev) => prev.filter((id) => !selectedStackIds.includes(id)));
    clearSelection();
  }

  function handleClearPeek() {
    setRevealedStackIds([]);
    setOpenedStackId(null);
    clearSelection();
  }

  function handleExtractCardFromStack(cardIndex: number) {
    if (!openedStackId) return;

    const openedStack = state.stacks[openedStackId];
    if (!openedStack || openedStack.ownerId !== viewPlayerId) return;

    const newStackId = makeNewStackId();

    dispatch({
      type: "EXTRACT_CARD_FROM_STACK",
      actorId: viewPlayerId,
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
        actorId: viewPlayerId,
        stackId,
      }))
    );

    setRevealedStackIds((prev) => prev.filter((id) => !selectedStackIds.includes(id)));
    clearSelection();
  }

  function handleMoveSelectedToDeckBottom() {
    if (selectedStackIds.length === 0) return;

    dispatchMany(
      selectedStackIds.map((stackId) => ({
        type: "MOVE_STACK_TO_DECK_BOTTOM",
        actorId: viewPlayerId,
        stackId,
      }))
    );

    setRevealedStackIds((prev) => prev.filter((id) => !selectedStackIds.includes(id)));
    clearSelection();
  }

  function handleMoveDeckTopToPrivate() {
    const rawCount = Math.floor(Number(deckPreviewInput));
    const deckCount = state.players[viewPlayerId].zones.deck.length;

    if (!Number.isFinite(rawCount) || rawCount <= 0) return;

    dispatch({
      type: "MOVE_DECK_TOP_TO_PRIVATE",
      actorId: viewPlayerId,
      count: Math.min(rawCount, deckCount),
    });

    clearSelection();
  }

  function handleMovePrivateToDeckTop() {
    dispatch({
      type: "MOVE_PRIVATE_TO_DECK_TOP",
      actorId: viewPlayerId,
    });

    clearSelection();
  }

  function handleMovePrivateToDeckBottom() {
    dispatch({
      type: "MOVE_PRIVATE_TO_DECK_BOTTOM",
      actorId: viewPlayerId,
    });

    clearSelection();
  }

  function canRevealStack(playerId: PlayerId, zone: Zone, stackId: StackId): boolean {
    if (zone === "deck") return false;

    if (playerId === viewPlayerId) {
      return true;
    }

    if (zone === "hand" || zone === "shield") {
      return isRevealedByPeek(stackId);
    }

    if (zone === "private") return false;

    return true;
  }

  function zoneHiddenLabel(zone: Zone): string {
    if (zone === "hand") return "手札";
    if (zone === "private") return "確認中";
    if (zone === "shield") return "シールド";
    return "非公開";
  }

  function handleOpenStack(playerId: PlayerId, zone: Zone, stackId: StackId) {
    if (!canRevealStack(playerId, zone, stackId)) return;
    setOpenedStackId(stackId);
  }

  const selectedZone = selectedStackId ? findStackZone(state, selectedStackId) : null;
  const selectedStack = selectedStackId ? state.stacks[selectedStackId] : null;
  const selectedVisible =
    selectedStackId && selectedStack && selectedZone
      ? canRevealStack(selectedStack.ownerId, selectedZone, selectedStackId)
      : false;

  const selectedText =
    selectedStackIds.length === 0
      ? "なし"
      : selectedStackIds.length >= 2
      ? `${selectedStackIds.length}枚選択中`
      : selectedStackId && selectedVisible
      ? `${selectedStackId} / ${topCardName(state, selectedStackId)}`
      : selectedStackId
      ? `${selectedStackId} / 非公開カード`
      : "なし";

  const openedNames = openedStackId ? stackCardNames(state, openedStackId) : [];
  const openedStack = openedStackId ? state.stacks[openedStackId] : null;
  const openedZone = openedStackId ? findStackZone(state, openedStackId) : null;

  function renderStack(playerId: PlayerId, zone: Zone, stackId: StackId, index: number) {
    const stack = state.stacks[stackId];
    if (!stack) return null;

    const revealed = canRevealStack(playerId, zone, stackId);
    const peeked = playerId !== viewPlayerId && isRevealedByPeek(stackId);
    const selected = isSelected(stackId);

    if (!revealed) {
      return (
        <div
          key={stackId}
          className={`card cardBack ${selected ? "selected" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            handleStackClick(stackId, event);
          }}
        >
          <strong>{zoneHiddenLabel(zone)}</strong>
          <span>{index + 1}枚目</span>
          <span className="hiddenInfo">非公開</span>
        </div>
      );
    }

    if (zone === "shield" && !peeked) {
      return (
        <div
          key={stackId}
          className={`card cardBack shieldBack ${selected ? "selected" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            handleStackClick(stackId, event);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            handleOpenStack(playerId, zone, stackId);
          }}
        >
          <strong>シールド</strong>
          <span>{index + 1}枚目</span>
          <span className="hiddenInfo">ダブルクリックで確認</span>
        </div>
      );
    }

    return (
      <div
        key={stackId}
        className={`card ${zone === "private" ? "privateCard" : ""} ${
          peeked ? "peekedCard" : ""
        } ${selected ? "selected" : ""} ${stack.tapped ? "tapped" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          handleStackClick(stackId, event);
        }}
        onDoubleClick={(event) => {
          event.stopPropagation();
          handleOpenStack(playerId, zone, stackId);
        }}
      >
        <strong>{topCardName(state, stackId)}</strong>

        {peeked && <span className="hiddenInfo">覗き中</span>}
        {zone === "private" && <span className="hiddenInfo">確認中</span>}

        {stack.cardIds.length > 1 && (
          <span className="stackCount">下に{stack.cardIds.length - 1}枚</span>
        )}

        {stack.tapped && <span className="tapLabel">TAP</span>}
      </div>
    );
  }

  function renderPlayerBoard(playerId: PlayerId, title: string) {
    return (
      <section className={`playerBoard ${playerId === viewPlayerId ? "activeBoard" : ""}`}>
        <h2 className="playerTitle">
          {title}：{playerId}
          {playerId === viewPlayerId && <span className="activeLabel">操作中</span>}
        </h2>

        <div className="board">
          {zones.map((zone) => {
            const stackIds = state.players[playerId].zones[zone];

            return (
              <div
                key={`${playerId}-${zone}`}
                className={`zone zone-${zone}`}
                onClick={() => handleZoneClick(playerId, zone)}
              >
                <h3>
                  {zoneLabels[zone]} ({stackIds.length})
                </h3>

                <div className="cards">
                  {zone === "deck" ? (
                    <div className="card cardBack">
                      <strong>山札</strong>
                      <span>{stackIds.length}枚</span>
                      <span className="hiddenInfo">中身は非公開</span>
                    </div>
                  ) : (
                    stackIds.map((stackId, index) => renderStack(playerId, zone, stackId, index))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="app">
      <h1>DM Table Prototype</h1>

      <div className="toolbar">
        <label className="deckPreviewControl">
          操作プレイヤー
          <select
            value={viewPlayerId}
            onChange={(event) => {
              setViewPlayerId(event.target.value as PlayerId);
              setRevealedStackIds([]);
              clearSelection();
              setOpenedStackId(null);
            }}
          >
            <option value="p1">p1</option>
            <option value="p2">p2</option>
          </select>
        </label>

        <button onClick={handleResetGame}>ゲーム開始/リセット</button>
        <button onClick={handleRevealSelected}>選択を見る</button>
        <button onClick={handleHideSelectedPeek}>選択を隠す</button>
        <button onClick={handleClearPeek}>覗き全解除</button>

        <button onClick={() => dispatch({ type: "SHUFFLE_DECK", actorId: viewPlayerId })}>
          山札シャッフル
        </button>

        <button onClick={() => dispatch({ type: "SET_SHIELDS", actorId: viewPlayerId, count: 5 })}>
          シールド5枚
        </button>

        <button onClick={() => dispatch({ type: "DRAW", actorId: viewPlayerId, count: 1 })}>
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
                actorId: viewPlayerId,
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
        初期状態：両者 山札30 / 手札5 / シールド5。相手の手札/シールドをCtrlクリックで選択 → 「選択を見る」。
      </p>

      <p className="selectedText">選択中：{selectedText}</p>

      <div className="tableLayout">
        {renderPlayerBoard(opponentId, "相手盤面")}
        {renderPlayerBoard(viewPlayerId, "自分盤面")}
      </div>

      <div className="logs fullLogs">
        <h2>ログ</h2>
        {state.logs.map((log) => (
          <div key={log.id} className="log">
            {log.message}
          </div>
        ))}
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

                  {openedStack &&
                    openedStack.ownerId === viewPlayerId &&
                    openedStack.cardIds.length > 1 && (
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
