// Debug helper (prints on page even if console isn't used)
function dbg(msg) {
  const el = document.getElementById("debug");
  if (el) el.textContent += msg + "\n";
  console.log(msg);
}

window.addEventListener("error", (e) => {
  dbg("❌ JS ERROR: " + (e.message || e.error));
});

window.addEventListener("unhandledrejection", (e) => {
  dbg("❌ PROMISE ERROR: " + (e.reason?.message || e.reason));
});

function safeGet(id) {
  const el = document.getElementById(id);
  if (!el) dbg("⚠️ Missing element: #" + id);
  return el;
}

function forceBoardCSS(board) {
  // force visibility even if CSS is failing
  board.style.display = "grid";
  board.style.gridTemplateColumns = "repeat(8, 1fr)";
  board.style.gridTemplateRows = "repeat(8, 1fr)";
  board.style.width = "360px";
  board.style.height = "360px";
  board.style.border = "2px solid #333";
  board.style.margin = "10px auto";
}

function renderEmpty64() {
  const board = safeGet("chessboard");
  if (!board) return;

  forceBoardCSS(board);
  board.innerHTML = "";

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const sq = document.createElement("div");
      sq.className = "square " + (((row + col) % 2 === 0) ? "white" : "black");

      // also force colors in case CSS isn't applying
      sq.style.width = "100%";
      sq.style.height = "100%";
      sq.style.display = "flex";
      sq.style.alignItems = "center";
      sq.style.justifyContent = "center";
      sq.style.userSelect = "none";
      sq.style.background = ((row + col) % 2 === 0) ? "#f0d9b5" : "#b58863";

      board.appendChild(sq);
    }
  }

  dbg("✅ renderEmpty64 squares = " + board.children.length);
}

document.addEventListener("DOMContentLoaded", () => {
  dbg("✅ DOMContentLoaded fired");
  dbg("✅ script.js is running");

  // IMPORTANT: This test ignores chess.js and stockfish.
  // If you still see white, then something is seriously blocking rendering.
  renderEmpty64();
});
