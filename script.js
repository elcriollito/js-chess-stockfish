// ============================
// DOM
// ============================
let chessboard = null;
let playVsAIEl = null;
let aiColorEl = null;
let difficultyEl = null;
let depthEl = null;
let analyzeBtn = null;
let undoBtn = null;
let newGameBtn = null;
let flipBoardEl = null;

let evalText = null;
let pvText = null;
let evalBar = null;

let moveListEl = null;
let pgnBox = null;
let exportPgnBtn = null;
let importPgnBtn = null;
let copyPgnBtn = null;
let clearPgnBtn = null;

// Replay buttons
let toStartBtn = null;
let backBtn = null;
let forwardBtn = null;
let toEndBtn = null;

// Clock DOM
let whiteClockEl = null;
let blackClockEl = null;
let timePresetEl = null;
let applyTimeBtn = null;

// Promotion modal
let promoModal = null;
let promoButtons = null;
let workerWarningEl = null;

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

// ============================
// Stockfish (Worker)
// ============================
let sf = null;
let bestMoveResolver = null;

function initWorker() {
  try {
    console.log("[chess] starting Stockfish worker");
    sf = new Worker("./stockfish.worker.js");
  } catch (err) {
    console.error("[chess] failed to start Stockfish worker:", err);
    showWorkerWarning();
    sf = null;
    return;
  }

  sf.addEventListener("message", (e) => {
    const line = (e.data || "").toString();
    if (line === "uciok") {
      console.log("[chess] stockfish uciok");
    }
    if (line === "readyok") {
      console.log("[chess] stockfish readyok");
    }

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
}

function sfSend(cmd) {
  if (!sf) return;
  try {
    sf.postMessage(cmd);
  } catch (err) {
    console.error("[chess] failed to post to worker:", err);
    showWorkerWarning();
  }
}

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

function showWorkerWarning() {
  if (!workerWarningEl) return;
  workerWarningEl.textContent =
    "Stockfish blocked by CSP. Board remains usable without engine.";
  workerWarningEl.classList.remove("hidden");
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

// ============================
// Render board (flip + review)
// ============================
function buildTempGame() {
  const tempGame = new Chess(game.fen());

  for (let i = 0; i < viewIndex; i++) tempGame.move(mainlineSAN[i]);
  return tempGame;
}

function renderBoard() {
  console.log("[chess] renderBoard start");
  chessboard.innerHTML = "";

  let board = null;
  try {
    const tempGame = buildTempGame();
    board = tempGame.board();
  } catch (err) {
    console.warn("[chess] failed to build board from game, using empty board", err);
  }
  if (!board) {
    board = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => null),
    );
  }
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
  console.log("[chess] renderBoard end; squares:", chessboard.children.length);
  if (chessboard.children.length === 64) {
    console.log("Board rendered: 64");
  }
}

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
  if (!sf) return Promise.resolve(null);
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

// ============================
// Start
// ============================
function initApp() {
  console.log("[chess] init start");
  chessboard = document.getElementById("chessboard");
  playVsAIEl = document.getElementById("playVsAI");
  aiColorEl = document.getElementById("aiColor");
  difficultyEl = document.getElementById("difficulty");
  depthEl = document.getElementById("depth");
  analyzeBtn = document.getElementById("analyzeBtn");
  undoBtn = document.getElementById("undoBtn");
  newGameBtn = document.getElementById("newGameBtn");
  flipBoardEl = document.getElementById("flipBoard");
  evalText = document.getElementById("evalText");
  pvText = document.getElementById("pvText");
  evalBar = document.getElementById("evalBar");
  moveListEl = document.getElementById("moveList");
  pgnBox = document.getElementById("pgnBox");
  exportPgnBtn = document.getElementById("exportPgnBtn");
  importPgnBtn = document.getElementById("importPgnBtn");
  copyPgnBtn = document.getElementById("copyPgnBtn");
  clearPgnBtn = document.getElementById("clearPgnBtn");
  toStartBtn = document.getElementById("toStartBtn");
  backBtn = document.getElementById("backBtn");
  forwardBtn = document.getElementById("forwardBtn");
  toEndBtn = document.getElementById("toEndBtn");
  whiteClockEl = document.getElementById("whiteClock");
  blackClockEl = document.getElementById("blackClock");
  timePresetEl = document.getElementById("timePreset");
  applyTimeBtn = document.getElementById("applyTimeBtn");
  promoModal = document.getElementById("promoModal");
  promoButtons = promoModal.querySelectorAll("button[data-piece]");
  workerWarningEl = document.getElementById("workerWarning");

  if (!chessboard) {
    console.error("[chess] chessboard element not found.");
    return;
  }

  console.log("[chess] chessboard found:", !!chessboard);

  applyTimeBtn.addEventListener("click", applyTimePreset);
  difficultyEl.addEventListener("change", applyDifficultyPreset);
  flipBoardEl.addEventListener("change", renderBoard);
  toStartBtn.addEventListener("click", () => goToIndex(0));
  backBtn.addEventListener("click", () => goToIndex(viewIndex - 1));
  forwardBtn.addEventListener("click", () => goToIndex(viewIndex + 1));
  toEndBtn.addEventListener("click", () => goToIndex(mainlineSAN.length));
  aiColorEl.addEventListener("change", () => {
    selectedSquare = null;
    clearHighlights();
    maybeMakeAIMove();
  });
  analyzeBtn.addEventListener("click", () => {
    if (!sf) {
      alert("Stockfish is unavailable (worker blocked).");
      return;
    }
    const depth = clamp(Number(depthEl.value) || 12, 1, 20);
    pvText.textContent = "Analyzing...";
    sfSend("uci");
    sfSend("isready");
    sfSend("position fen " + game.fen());
    sfSend("go depth " + depth);
  });
  undoBtn.addEventListener("click", () => {
    if (mainlineSAN.length === 0) return;

    // Undo one ply
    game.undo();

    // If AI is enabled and after undo it's still AI turn, undo again
    if (playVsAIEl.checked && game.turn() === aiColorEl.value) {
      game.undo();
    }

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

  initWorker();
  applyDifficultyPreset();
  renderBoard();
  applyTimePreset();
  maybeMakeAIMove();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}
