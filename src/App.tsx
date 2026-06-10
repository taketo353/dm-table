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

const DEFAULT_DECK_TEXT = `4 天災 デドダム
4 フェアリー・Re:ライフ
4 Disジルコン
4 終末王秘伝オリジナルフィナーレ
4 切札勝太&カツキング -熱血の物語-
3 単騎連射 マグナム
3 音卿の精霊龍 ラフルル・ラブ
3 流星のガイアッシュ・カイザー
4 地龍神の魔陣
4 ドンドン火噴くナウ
3 ボン・キゴマイム`;

const SAVED_DECKS_KEY = "dm-table.savedDecks.v1";

type SavedDeck = {
  id: string;
  name: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

type ParsedDeck = {
  names: string[];
  errors: string[];
};

function createSavedDeckId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `deck-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadSavedDecks(): SavedDeck[] {
  try {
    if (typeof window === "undefined") return [];

    const raw = window.localStorage.getItem(SAVED_DECKS_KEY);
    if (!raw) return [];

    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];

    return value.filter((deck) => {
      return (
        typeof deck.id === "string" &&
        typeof deck.name === "string" &&
        typeof deck.text === "string" &&
        typeof deck.createdAt === "number" &&
        typeof deck.updatedAt === "number"
      );
    });
  } catch {
    return [];
  }
}

function saveSavedDecks(decks: SavedDeck[]): void {
  try {
    window.localStorage.setItem(SAVED_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // 保存容量不足など。画面側の状態は残す。
  }
}

function parseDeckText(text: string): ParsedDeck {
  const names: string[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.replace(/\/\/.*$/, "").trim();

    if (!line || line.startsWith("#")) return;

    const match = line.match(/^(\d+)\s+(.+)$/);

    let count = 1;
    let name = line;

    if (match) {
      count = Number(match[1]);
      name = match[2]?.trim() ?? "";
    }

    if (!Number.isInteger(count) || count <= 0 || count > 40) {
      errors.push(`${lineNumber}行目: 枚数が不正です`);
      return;
    }

    if (!name) {
      errors.push(`${lineNumber}行目: カード名が空です`);
      return;
    }

    for (let i = 0; i < count; i++) {
      names.push(name);
    }
  });

  return { names, errors };
}

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

function makeGameStateFromDeckTexts(p1DeckText: string, p2DeckText: string): GameState {
  const p1Deck = parseDeckText(p1DeckText);
  const p2Deck = parseDeckText(p2DeckText);

  let state = createInitialState();

  state = addDeck(state, "p1", p1Deck.names);
  state = addDeck(state, "p2", p2Deck.names);

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
  const [p1DeckText, setP1DeckText] = useState(DEFAULT_DECK_TEXT);
  const [p2DeckText, setP2DeckText] = useState(DEFAULT_DECK_TEXT);
  const [showDeckEditor, setShowDeckEditor] = useState(false);
  const [deckMessage, setDeckMessage] = useState<string | null>(null);

  const [deckNameInput, setDeckNameInput] = useState("");
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>(() => loadSavedDecks());
  const [selectedSavedDeckId, setSelectedSavedDeckId] = useState("");

  const [state, setState] = useState<GameState>(() =>
    makeGameStateFromDeckTexts(DEFAULT_DECK_TEXT, DEFAULT_DECK_TEXT)
  );
  const [viewPlayerId, setViewPlayerId] = useState<PlayerId>("p1");
  const [selectedStackIds, setSelectedStackIds] = useState<StackId[]>([]);
  const [revealedStackIds, setRevealedStackIds] = useState<StackId[]>([]);
  const [publicStackIds, setPublicStackIds] = useState<StackId[]>([]);
  const [openedStackId, setOpenedStackId] = useState<StackId | null>(null);
  const [openedZoneView, setOpenedZoneView] = useState<{ playerId: PlayerId; zone: Zone } | null>(
    null
  );
  const [deckPreviewInput, setDeckPreviewInput] = useState("4");

  const opponentId = otherPlayer(viewPlayerId);
  const selectedStackId = selectedStackIds[0] ?? null;
  const p1ParsedDeck = parseDeckText(p1DeckText);
  const p2ParsedDeck = parseDeckText(p2DeckText);
  const selectedSavedDeck =
    savedDecks.find((deck) => deck.id === selectedSavedDeckId) ?? null;

  function dispatch(action: Parameters<typeof applyAction>[1]) {
    setState((prev) => applyAction(prev, action));
  }

  function dispatchMany(actions: Parameters<typeof applyAction>[1][]) {
    setState((prev) => actions.reduce((current, action) => applyAction(current, action), prev));
  }

  function clearSelection() {
    setSelectedStackIds([]);
  }

  function resetUiState() {
    setSelectedStackIds([]);
    setRevealedStackIds([]);
    setOpenedStackId(null);
    setOpenedZoneView(null);
  }

  function persistSavedDecks(nextDecks: SavedDeck[]) {
    setSavedDecks(nextDecks);
    saveSavedDecks(nextDecks);
  }

  function validateDeckTextForSave(deckText: string): string[] {
    const parsed = parseDeckText(deckText);
    const errors = [...parsed.errors];

    if (parsed.names.length !== 40) {
      errors.push(`デッキ枚数が${parsed.names.length}枚です。40枚にしてください。`);
    }

    return errors;
  }

  function handleSaveDeck(deckText: string, sourceLabel: string) {
    const name = deckNameInput.trim();

    if (!name) {
      setDeckMessage("デッキ名を入力してください。");
      return;
    }

    const errors = validateDeckTextForSave(deckText);

    if (errors.length > 0) {
      setDeckMessage(errors.map((error) => `${sourceLabel}: ${error}`).join("\n"));
      return;
    }

    const now = Date.now();
    const existing = savedDecks.find((deck) => deck.name === name);

    if (existing) {
      const nextDecks = savedDecks.map((deck) =>
        deck.id === existing.id
          ? {
              ...deck,
              text: deckText,
              updatedAt: now,
            }
          : deck
      );

      persistSavedDecks(nextDecks);
      setSelectedSavedDeckId(existing.id);
      setDeckMessage(`「${name}」を上書き保存しました。`);
      return;
    }

    const newDeck: SavedDeck = {
      id: createSavedDeckId(),
      name,
      text: deckText,
      createdAt: now,
      updatedAt: now,
    };

    persistSavedDecks([...savedDecks, newDeck]);
    setSelectedSavedDeckId(newDeck.id);
    setDeckMessage(`「${name}」を保存しました。`);
  }

  function handleLoadSavedDeck(playerId: PlayerId) {
    if (!selectedSavedDeck) {
      setDeckMessage("読み込むデッキを選択してください。");
      return;
    }

    if (playerId === "p1") {
      setP1DeckText(selectedSavedDeck.text);
    } else {
      setP2DeckText(selectedSavedDeck.text);
    }

    setDeckNameInput(selectedSavedDeck.name);
    setDeckMessage(`「${selectedSavedDeck.name}」を${playerId}へ読み込みました。`);
  }

  function handleDeleteSavedDeck() {
    if (!selectedSavedDeck) {
      setDeckMessage("削除するデッキを選択してください。");
      return;
    }

    const deckName = selectedSavedDeck.name;
    const nextDecks = savedDecks.filter((deck) => deck.id !== selectedSavedDeck.id);

    persistSavedDecks(nextDecks);
    setSelectedSavedDeckId("");
    setDeckMessage(`「${deckName}」を削除しました。`);
  }

  function validateDecks(): string[] {
    const errors = [
      ...p1ParsedDeck.errors.map((error) => `p1: ${error}`),
      ...p2ParsedDeck.errors.map((error) => `p2: ${error}`),
    ];

    if (p1ParsedDeck.names.length !== 40) {
      errors.push(`p1: デッキ枚数が${p1ParsedDeck.names.length}枚です。40枚にしてください。`);
    }

    if (p2ParsedDeck.names.length !== 40) {
      errors.push(`p2: デッキ枚数が${p2ParsedDeck.names.length}枚です。40枚にしてください。`);
    }

    return errors;
  }

  function handleApplyDecks() {
    const errors = validateDecks();

    if (errors.length > 0) {
      setDeckMessage(errors.join("\n"));
      return;
    }

    setState(makeGameStateFromDeckTexts(p1DeckText, p2DeckText));
    resetUiState();
    setPublicStackIds([]);
    setDeckMessage("デッキを反映しました。");
  }

  function handleResetGame() {
    const errors = validateDecks();

    if (errors.length > 0) {
      setDeckMessage(errors.join("\n"));
      setShowDeckEditor(true);
      return;
    }

    setState(makeGameStateFromDeckTexts(p1DeckText, p2DeckText));
    resetUiState();
    setPublicStackIds([]);
  }

  function isSelected(stackId: StackId): boolean {
    return selectedStackIds.includes(stackId);
  }

  function isRevealedByPeek(stackId: StackId): boolean {
    return revealedStackIds.includes(stackId);
  }

  function isPublicStack(stackId: StackId): boolean {
    return publicStackIds.includes(stackId);
  }

  function addLogMessage(type: string, message: string) {
    setState((prev) => ({
      ...prev,
      logs: [
        {
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          actorId: viewPlayerId,
          type,
          message,
          createdAt: Date.now(),
        },
        ...prev.logs,
      ].slice(0, 120),
    }));
  }

  function handlePublicizeSelected() {
    const publishableIds = selectedStackIds.filter((stackId) => {
      const stack = state.stacks[stackId];
      const zone = findStackZone(state, stackId);

      if (!stack || !zone) return false;
      if (zone === "deck") return false;

      return canRevealStack(stack.ownerId, zone, stackId);
    });

    if (publishableIds.length === 0) {
      addLogMessage("PUBLICIZE_FAILED", `${viewPlayerId}: 公開可能なカードが選択されていません`);
      return;
    }

    setPublicStackIds((prev) => Array.from(new Set([...prev, ...publishableIds])));

    const names = publishableIds.map((stackId) => topCardName(state, stackId));
    const shownNames = names.length <= 4 ? names.join("、") : `${names.length}枚`;

    addLogMessage("PUBLICIZE", `${viewPlayerId}が公開：${shownNames}`);
    clearSelection();
  }

  function handleUnpublicizeSelected() {
    if (selectedStackIds.length === 0) return;

    setPublicStackIds((prev) => prev.filter((stackId) => !selectedStackIds.includes(stackId)));
    addLogMessage("UNPUBLICIZE", `${viewPlayerId}が選択カードの公開を解除`);
    clearSelection();
  }

  function handleClearPublicInfo() {
    setPublicStackIds([]);
    addLogMessage("CLEAR_PUBLIC", `${viewPlayerId}が公開情報を全解除`);
    clearSelection();
  }

  function handleDeclareSelected() {
    const declarableIds = selectedStackIds.filter((stackId) => {
      const stack = state.stacks[stackId];
      const zone = findStackZone(state, stackId);

      if (!stack || !zone) return false;
      if (zone === "deck") return false;

      return canRevealStack(stack.ownerId, zone, stackId);
    });

    if (declarableIds.length === 0) {
      addLogMessage("DECLARE_FAILED", `${viewPlayerId}: 宣言できるカードが選択されていません`);
      return;
    }

    const names = declarableIds.map((stackId) => topCardName(state, stackId));
    addLogMessage("DECLARE_CARD_NAME", `${viewPlayerId}がカード名を宣言：${names.join("、")}`);
    clearSelection();
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

    if (zone === "deck") {
      setPublicStackIds((prev) => prev.filter((id) => !movableStackIds.includes(id)));
    }

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
    setOpenedZoneView(null);
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
    setOpenedZoneView(null);
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
    setPublicStackIds((prev) => prev.filter((id) => !selectedStackIds.includes(id)));
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
    setPublicStackIds((prev) => prev.filter((id) => !selectedStackIds.includes(id)));
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

    if (isPublicStack(stackId)) return true;

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
    const publicInfo = isPublicStack(stackId);
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

    if (zone === "shield" && !peeked && !publicInfo) {
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
        } ${publicInfo ? "publicCard" : ""} ${selected ? "selected" : ""} ${stack.tapped ? "tapped" : ""}`}
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
        {publicInfo && <span className="hiddenInfo">公開中</span>}
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
                  ) : zone === "grave" ? (
                    <div
                      className="card cardBack gravePile"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenedZoneView({ playerId, zone: "grave" });
                      }}
                    >
                      <strong>墓地</strong>
                      <span>{stackIds.length}枚</span>
                      <span className="hiddenInfo">クリックで展開</span>
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
              resetUiState();
            }}
          >
            <option value="p1">p1</option>
            <option value="p2">p2</option>
          </select>
        </label>

        <button onClick={() => setShowDeckEditor(true)}>デッキ作成</button>
        <button onClick={handlePublicizeSelected}>選択を公開</button>
        <button onClick={handleUnpublicizeSelected}>公開解除</button>
        <button onClick={handleClearPublicInfo}>公開全解除</button>
        <button onClick={handleDeclareSelected}>選択を宣言</button>
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
        デッキ作成から40枚入力 → ゲーム開始/リセット。相手の手札/シールドは選択して「選択を見る」。
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

      {showDeckEditor && (
        <div className="modalBackdrop" onClick={() => setShowDeckEditor(false)}>
          <div className="modal deckEditorModal" onClick={(event) => event.stopPropagation()}>
            <h2>デッキ作成</h2>
            <p>
              形式：<code>4 天災 デドダム</code>。数字なしなら1枚扱い。各プレイヤー40枚。
            </p>

            <div className="savedDeckPanel">
              <div className="savedDeckNameRow">
                <label>
                  デッキ名
                  <input
                    value={deckNameInput}
                    onChange={(event) => setDeckNameInput(event.target.value)}
                    placeholder="例：黒緑デンジャデオン"
                  />
                </label>

                <button onClick={() => handleSaveDeck(p1DeckText, "p1")}>
                  現在のp1欄を保存
                </button>

                <button onClick={() => handleSaveDeck(p2DeckText, "p2")}>
                  現在のp2欄を保存
                </button>
              </div>

              <div className="savedDeckLoadRow">
                <label>
                  保存済みデッキ一覧
                  <select
                    value={selectedSavedDeckId}
                    onChange={(event) => {
                      const deckId = event.target.value;
                      setSelectedSavedDeckId(deckId);

                      const deck = savedDecks.find((savedDeck) => savedDeck.id === deckId);
                      if (deck) {
                        setDeckNameInput(deck.name);
                      }
                    }}
                  >
                    <option value="">選択してください</option>
                    {savedDecks.map((deck) => {
                      const parsed = parseDeckText(deck.text);

                      return (
                        <option key={deck.id} value={deck.id}>
                          {deck.name}（{parsed.names.length}枚）
                        </option>
                      );
                    })}
                  </select>
                </label>

                <button onClick={() => handleLoadSavedDeck("p1")}>選択デッキをp1へ読み込み</button>
                <button onClick={() => handleLoadSavedDeck("p2")}>選択デッキをp2へ読み込み</button>
                <button onClick={handleDeleteSavedDeck}>選択デッキを削除</button>
              </div>
            </div>

            <div className="deckEditorGrid">
              <div className="deckEditorColumn">
                <h3>p1デッキ：{p1ParsedDeck.names.length}枚</h3>
                <textarea
                  value={p1DeckText}
                  onChange={(event) => setP1DeckText(event.target.value)}
                  spellCheck={false}
                />
              </div>

              <div className="deckEditorColumn">
                <h3>p2デッキ：{p2ParsedDeck.names.length}枚</h3>
                <textarea
                  value={p2DeckText}
                  onChange={(event) => setP2DeckText(event.target.value)}
                  spellCheck={false}
                />
              </div>
            </div>

            {deckMessage && <pre className="deckMessage">{deckMessage}</pre>}

            <div className="deckEditorActions">
              <button
                onClick={() => {
                  setP1DeckText(DEFAULT_DECK_TEXT);
                  setP2DeckText(DEFAULT_DECK_TEXT);
                  setDeckMessage(null);
                }}
              >
                サンプルに戻す
              </button>
              <button onClick={handleApplyDecks}>このデッキで開始</button>
              <button onClick={() => setShowDeckEditor(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {openedZoneView && (
        <div className="modalBackdrop" onClick={() => setOpenedZoneView(null)}>
          <div className="modal graveModal" onClick={(event) => event.stopPropagation()}>
            <h2>
              {openedZoneView.playerId}：{zoneLabels[openedZoneView.zone]}
            </h2>
            <p>クリックで選択/解除。選択後、盤面のゾーンをクリックすると移動できます。</p>

            <div className="graveList">
              {state.players[openedZoneView.playerId].zones[openedZoneView.zone].length === 0 ? (
                <p>空です。</p>
              ) : (
                state.players[openedZoneView.playerId].zones[openedZoneView.zone].map(
                  (stackId, index) => {
                    const stack = state.stacks[stackId];
                    if (!stack) return null;

                    return (
                      <button
                        key={stackId}
                        className={`graveListItem ${isSelected(stackId) ? "graveSelected" : ""}`}
                        onClick={() => toggleMultiSelection(stackId)}
                      >
                        <span>{index + 1}</span>
                        <strong>{topCardName(state, stackId)}</strong>
                        {stack.cardIds.length > 1 && (
                          <small>下に{stack.cardIds.length - 1}枚</small>
                        )}
                      </button>
                    );
                  }
                )
              )}
            </div>

            <button onClick={() => setOpenedZoneView(null)}>閉じる</button>
          </div>
        </div>
      )}

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
