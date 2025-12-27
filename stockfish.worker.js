/* global importScripts, postMessage, onmessage */
// Load Stockfish engine inside a Web Worker for UCI-style communication.
importScripts("./stockfish.js");
console.log("[chess] stockfish worker loaded");

// Stockfish factory returns a message-capable object.
const engine = Stockfish();

engine.onmessage = (event) => {
  const line = event?.data ?? event;
  if (line === "uciok") console.log("[chess] worker uciok");
  if (line === "readyok") console.log("[chess] worker readyok");
  postMessage(line);
};

onmessage = (event) => {
  engine.postMessage(event.data);
};
