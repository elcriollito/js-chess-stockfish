// ============================
// DOM
// ============================
const chessboard = document.getElementById("chessboard");
const playVsAIEl = document.getElementById("playVsAI");
const aiColorEl = document.getElementById("aiColor");
const difficultyEl = document.getElementById("difficulty");
const depthEl = document.getElementById("depth");
const analyzeBtn = document.getElementById("analyzeBtn");
const undoBtn = document.getElementById("undoBtn");
const newGameBtn = document.getElementById("newGameBtn");
const flipBoardEl = document.getElementById("flipBoard");

const evalText = document.getElementById("evalText");
const pvText = document.getElementById("pvText");
const evalBar = document.getElementById("evalBar");

const moveListEl = document.getElementById("moveList");
const pgnBox = document.getElementById("pgnBox");
const exportPgnBtn = document.getElementById("exportPgnBtn");
const importPgnBtn = document.getElementById("importPgnBtn");
const copyPgnBtn = document.getElementById("copyPgnBtn");
const clearPgnBtn = document.getElementById("clearPgnBtn");

// Replay buttons
const toStartBtn = document.getElementById("toStartBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const toEndBtn = document.getElementById("toEndBtn");

// Clock DOM
const whiteClockEl = document.getElementById("whiteClock");
const blackClockEl = document.getElementById("blackClock");
const timePresetEl = document.getElementById("timePreset");
const applyTimeBtn = document.getElementById("applyTimeBtn");

// Promotion modal
const promoModal = document.getElementById("promoModal");
const promoButtons = promoModal.querySelectorAll("button[data-piece]");

// ============================
// Game state
// ============================
const game = new Chess();
let selectedSquare = null;

// Main line SAN + viewing index
let mainlineSAN = [];
let viewIndex = 0;

// Promotion pending
let pendingPromotion = null; // {from,to}

// ============================
// Clocks
// ============================
let whiteTime = 300; // seconds
let blackTime = 300;
let increment = 0;
let clockTimer = null;

function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function renderClocks() {
  whiteClockEl.textContent = formatTime(whiteTime);
  blackClockEl.textContent = formatTime(blackTime);
}

function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function startClock() {
  stopClock();
  clockTimer = setInterval(() => {
    if (game.game_over()) {
      stopClock();
      return;
    }
    if (viewIndex !== mainlineSAN.length) return; // don't run in review mode

    if (game.turn() === "w") whiteTime--;
    else blackTime--;

    renderClocks();

    if (whiteTime <= 0 || blackTime <= 0) {
      stopClock();
      alert(
        whiteTime <= 0 ? "White ran out of time!" : "Black ran out of time!",
      );
    }
  }, 1000);
}

function applyTimePreset() {
  const [t, inc] = timePresetEl.value.split("|").map(Number);
  whiteTime = t;
  blackTime = t;
  increment = inc;
  renderClocks();
  startClock();
}

applyTimeBtn.addEventListener("click", applyTimePreset);

// ============================
// Stockfish (Worker)
// ============================
const sf = new Worker("stockfish.worker.js");
function sfSend(cmd) {
  sf.postMessage(cmd);
}

let bestMoveResolver = null;

sf.addEventListener("message", (e) => {
  const line = (e.data || "").toString();

  if (line.startsWith("info ")) {
    const info = parseInfoLine(line);
    if (info.pv) pvText.textContent = info.pv;
    if (info.cp !== null || info.mate !== null) {
      updateEvalUI(info.cp ?? 0, info.mate);
    }
    return;
  }

  if (line.startsWith("bestmove")) {
    const move = line.split(" ")[1];
    if (bestMoveResolver) {
      const r = bestMoveResolver;
      bestMoveResolver = null;
      r(move);
    }
  }
});

// ============================
// Pieces (Unicode)
// ============================
const PIECES = {
  p: "♟",
  r: "♜",
  n: "♞",
  b: "♝",
  q: "♛",
  k: "♚",
  P: "♙",
  R: "♖",
  N: "♘",
  B: "♗",
  Q: "♕",
  K: "♔",
};

// ============================
// Helpers
// ============================
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function clearHighlights() {
  document.querySelectorAll(".square").forEach((s) => {
    s.classList.remove("highlight", "capture");
  });
}

function parseInfoLine(line) {
  const cpMatch = line.match(/score cp (-?\d+)/);
  const mateMatch = line.match(/score mate (-?\d+)/);
  const pvMatch = line.match(/\spv\s(.+)$/);
  return {
    cp: cpMatch ? Number(cpMatch[1]) : null,
    mate: mateMatch ? Number(mateMatch[1]) : null,
    pv: pvMatch ? pvMatch[1].trim() : null,
  };
}

function updateEvalUI(scoreCp, mateIn) {
  let whiteScore = scoreCp;
  if (game.turn() === "b") whiteScore = -whiteScore;

  if (mateIn !== null) {
    evalText.textContent =
      mateIn > 0 ? `Mate in ${mateIn}` : `Mated in ${Math.abs(mateIn)}`;
    evalBar.style.height = mateIn > 0 ? "95%" : "5%";
    return;
  }

  const capped = clamp(whiteScore, -800, 800);
  const percent = ((capped + 800) / 1600) * 100;
  evalText.textContent = (whiteScore / 100).toFixed(2);
  evalBar.style.height = percent + "%";
}

function applyDifficultyPreset() {
  const d = difficultyEl.value;
  let depth = 12,
    skill = 10;
  if (d === "easy") {
    depth = 8;
    skill = 5;
  }
  if (d === "hard") {
    depth = 16;
    skill = 18;
  }
  depthEl.value = depth;
  sfSend("setoption name Skill Level value " + skill);
}
difficultyEl.addEventListener("change", applyDifficultyPreset);
applyDifficultyPreset();

// ============================
// Render board (flip + review)
// ============================
function buildTempGame() {
    // Clone current position from the real game
  const temp = new Chess(game.fen());


  for (let i = 0; i < viewIndex; i++) temp.move(mainlineSAN[i]);
  return temp;
}

function renderBoard() {
  chessboard.innerHTML = "";

  const temp = buildTempGame();
  const board = temp.board();
  const flipped = flipBoardEl.checked;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const rr = flipped ? 7 - r : r;
      const cc = flipped ? 7 - c : c;

      const square = document.createElement("div");
      square.className = "square " + ((r + c) % 2 === 0 ? "white" : "black");

      const file = "abcdefgh"[cc];
      const rank = 8 - rr;
      const coord = file + rank;

      square.dataset.square = coord;

      const piece = board[rr][cc];
      if (piece) {
        const key =
          piece.color === "w"
            ? piece.type.toUpperCase()
            : piece.type.toLowerCase();
        square.textContent = PIECES[key];
      }

      square.addEventListener("click", () => {
        if (viewIndex !== mainlineSAN.length) return;
        onSquareClick(coord);
      });

      chessboard.appendChild(square);
    }
  }

  renderMoveList();
}

flipBoardEl.addEventListener("change", renderBoard);

// ============================
// Move list clickable
// ============================
function renderMoveList() {
  moveListEl.innerHTML = "";
  for (let i = 0; i < mainlineSAN.length; i++) {
    const pill = document.createElement("div");
    pill.className = "move-pill" + (i + 1 === viewIndex ? " active" : "");
    pill.textContent = `${i + 1}. ${mainlineSAN[i]}`;
    pill.addEventListener("click", () => {
      viewIndex = i + 1;
      selectedSquare = null;
      clearHighlights();
      renderBoard();
    });
    moveListEl.appendChild(pill);
  }
}

// ============================
// Replay controls
// ============================
function goToIndex(idx) {
  viewIndex = clamp(idx, 0, mainlineSAN.length);
  selectedSquare = null;
  clearHighlights();
  renderBoard();
}

toStartBtn.addEventListener("click", () => goToIndex(0));
backBtn.addEventListener("click", () => goToIndex(viewIndex - 1));
forwardBtn.addEventListener("click", () => goToIndex(viewIndex + 1));
toEndBtn.addEventListener("click", () => goToIndex(mainlineSAN.length));

// ============================
// Highlight legal moves
// ============================
function highlightMoves(from) {
  clearHighlights();
  const moves = game.moves({ square: from, verbose: true });
  moves.forEach((m) => {
    const el = document.querySelector(`[data-square="${m.to}"]`);
    if (!el) return;
    el.classList.add(m.captured ? "capture" : "highlight");
  });
}

// ============================
// Promotion modal
// ============================
function isPromotionMove(from, to) {
  const piece = game.get(from);
  if (!piece || piece.type !== "p") return false;
  const toRank = to[1];
  return (
    (piece.color === "w" && toRank === "8") ||
    (piece.color === "b" && toRank === "1")
  );
}

function openPromotionModal(from, to) {
  pendingPromotion = { from, to };
  promoModal.classList.remove("hidden");
}

function closePromotionModal() {
  promoModal.classList.add("hidden");
  pendingPromotion = null;
}

promoButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!pendingPromotion) return;
    const promo = btn.dataset.piece; // q r b n

    makeMove(pendingPromotion.from, pendingPromotion.to, promo);
    closePromotionModal();
  });
});

// click outside to close
promoModal.addEventListener("click", (e) => {
  if (e.target === promoModal) closePromotionModal();
});

// ============================
// Make move (handles increment + updates lists)
// ============================
function applyIncrementToSideThatJustMoved(movedColor) {
  if (increment <= 0) return;
  if (movedColor === "w") whiteTime += increment;
  else blackTime += increment;
  renderClocks();
}

function makeMove(from, to, promotion = "q") {
  const movedColor = game.turn(); // who is ABOUT to move (this is correct before move)
  const move = game.move({ from, to, promotion });

  selectedSquare = null;
  clearHighlights();
  if (!move) return false;

  applyIncrementToSideThatJustMoved(movedColor);

  mainlineSAN = game.history();
  viewIndex = mainlineSAN.length;

  renderBoard();
  maybeMakeAIMove();
  return true;
}

// ============================
// Click squares: human play
// ============================
function onSquareClick(square) {
  if (!selectedSquare) {
    const piece = game.get(square);
    if (!piece) return;

    // Turn enforcement
    if (piece.color !== game.turn()) return;

    // If AI owns this side, human can't move it
    if (playVsAIEl.checked && aiColorEl.value === game.turn()) return;

    selectedSquare = square;
    highlightMoves(square);
    return;
  }

  // Promotion check
  if (isPromotionMove(selectedSquare, square)) {
    openPromotionModal(selectedSquare, square);
    selectedSquare = null;
    clearHighlights();
    return;
  }

  makeMove(selectedSquare, square, "q");
}

// ============================
// Engine move
// ============================
function getBestMoveFromStockfish(fen, depth) {
  return new Promise((resolve) => {
    bestMoveResolver = resolve;
    pvText.textContent = "Thinking...";
    sfSend("uci");
    sfSend("isready");
    sfSend("ucinewgame");
    sfSend("position fen " + fen);
    sfSend("go depth " + depth);
  });
}

function uciToChessJsMove(uci) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length >= 5 ? uci[4] : "q",
  };
}

async function maybeMakeAIMove() {
  if (!playVsAIEl.checked) return;
  if (game.game_over()) return;

  const aiColor = aiColorEl.value;
  if (game.turn() !== aiColor) return;

  const depth = clamp(Number(depthEl.value) || 12, 1, 20);
  const best = await getBestMoveFromStockfish(game.fen(), depth);
  if (!best || best === "(none)") return;

  const movedColor = game.turn();
  game.move(uciToChessJsMove(best));

  applyIncrementToSideThatJustMoved(movedColor);

  mainlineSAN = game.history();
  viewIndex = mainlineSAN.length;

  renderBoard();
}

aiColorEl.addEventListener("change", () => {
  selectedSquare = null;
  clearHighlights();
  maybeMakeAIMove();
});

// ============================
// Analyze (no move)
// ============================
analyzeBtn.addEventListener("click", () => {
  const depth = clamp(Number(depthEl.value) || 12, 1, 20);
  pvText.textContent = "Analyzing...";
  sfSend("uci");
  sfSend("isready");
  sfSend("position fen " + game.fen());
  sfSend("go depth " + depth);
});

// ============================
// Undo + New game
// ============================
undoBtn.addEventListener("click", () => {
  if (mainlineSAN.length === 0) return;

  // Undo one ply
  const last = game.undo();

  // If AI is enabled and after undo it's still AI turn, undo again
  if (playVsAIEl.checked && game.turn() === aiColorEl.value) {
    game.undo();
  }

  // We won't perfectly restore time per move here (advanced feature).
  // Simple approach: keep clocks running; you can reset with Apply Time if needed.

  mainlineSAN = game.history();
  viewIndex = mainlineSAN.length;

  selectedSquare = null;
  clearHighlights();
  renderBoard();
});

newGameBtn.addEventListener("click", () => {
  game.reset();
  mainlineSAN = [];
  viewIndex = 0;
  selectedSquare = null;
  clearHighlights();
  evalText.textContent = "—";
  pvText.textContent = "—";
  evalBar.style.height = "50%";
  renderBoard();
  applyTimePreset();
  maybeMakeAIMove();
});

// ============================
// PGN
// ============================
exportPgnBtn.addEventListener("click", () => {
  pgnBox.value = game.pgn();
});

importPgnBtn.addEventListener("click", () => {
  const pgn = pgnBox.value.trim();
  if (!pgn) return;

  const ok = game.load_pgn(pgn);
  if (!ok) {
    alert("Invalid PGN");
    return;
  }

  mainlineSAN = game.history();
  viewIndex = mainlineSAN.length;

  selectedSquare = null;
  clearHighlights();
  renderBoard();
  maybeMakeAIMove();
});

copyPgnBtn.addEventListener("click", async () => {
  const text = pgnBox.value.trim() || game.pgn();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    alert("PGN copied!");
  } catch {
    alert("Copy failed (clipboard blocked).");
  }
});

clearPgnBtn.addEventListener("click", () => {
  pgnBox.value = "";
});

// ============================
// Start
// ============================
renderBoard();
applyTimePreset();
maybeMakeAIMove();


}

document.addEventListener("DOMContentLoaded", renderEmptyBoard);
function renderEmptyBoard() {
  const board = document.getElementById("chessboard");
  if (!board) {
    console.error("Chessboard not found");
    return;
  }

  board.innerHTML = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement("div");
      square.classList.add("square");

      const isWhite = (row + col) % 2 === 0;
      square.classList.add(isWhite ? "white" : "black");

      board.appendChild(square);
    }
  }

  console.log("Board rendered squares:", board.children.length);
}




