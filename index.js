const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "https://surrounded.netlify.app",
    methods: ["GET", "POST"],
  },
});

// Freaky Friday state. Players are keyed by a device id the client keeps in
// localStorage, so a reconnect lands back on the same name and the same swap.
let mode = "surrounded";
const players = {}; // id -> { name, sockets: Set<socketId> }
let middleId = null;
// id -> partner id, "middle", or null (odd one out). Players missing from it
// joined after the last round and are waiting for the next one.
let assignments = {};
let round = 0;

const isActive = (id) => players[id] && players[id].sockets.size > 0;

const freakyState = () => ({
  mode,
  round,
  middleId,
  assignments,
  players: Object.entries(players).map(([id, p]) => ({
    id,
    name: p.name,
    active: isActive(id),
  })),
});

const broadcast = () => io.emit("freakyState", freakyState());

// Pairs only: shuffle the eligible players and swap them two at a time. An odd
// count leaves the last one swapping with no one. Disconnected players sit out.
const dealPairs = (eligible) => {
  const order = [...eligible];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const pairs = {};
  for (let i = 0; i + 1 < order.length; i += 2) {
    pairs[order[i]] = order[i + 1];
    pairs[order[i + 1]] = order[i];
  }
  if (order.length % 2 === 1) pairs[order[order.length - 1]] = null;
  return pairs;
};

const newRound = () => {
  const eligible = Object.keys(players).filter(
    (id) => id !== middleId && isActive(id) && players[id].name
  );

  // Reshuffle so nobody keeps last round's partner, unless that can't be avoided.
  let pairs;
  for (let tries = 0; tries < 20; tries++) {
    pairs = dealPairs(eligible);
    if (!eligible.some((id) => pairs[id] && pairs[id] === assignments[id])) break;
  }

  assignments = pairs;
  if (isActive(middleId) && players[middleId].name) assignments[middleId] = "middle";
  round++;
};

io.on('connection', (socket) => {
  console.log('A user connected');
  socket.emit("freakyState", freakyState());

  socket.on("ruleChange", (ruleChange) => {
    io.emit("updateRule", ruleChange);
  });

  socket.on("join", ({ id, name } = {}) => {
    if (typeof id !== "string" || !id) return;
    if (socket.data.playerId && socket.data.playerId !== id) {
      players[socket.data.playerId]?.sockets.delete(socket.id);
    }
    socket.data.playerId = id;
    if (!players[id]) players[id] = { name: "", sockets: new Set() };
    players[id].sockets.add(socket.id);
    players[id].name = typeof name === "string" ? name.trim().slice(0, 20) : "";
    broadcast();
  });

  socket.on("setMode", (newMode) => {
    if (newMode !== "surrounded" && newMode !== "freaky") return;
    mode = newMode;
    broadcast();
  });

  socket.on("setMiddle", (id) => {
    middleId = players[id] ? id : null;
    broadcast();
  });

  socket.on("newRound", () => {
    newRound();
    broadcast();
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
    const player = players[socket.data.playerId];
    if (player) {
      player.sockets.delete(socket.id);
      broadcast();
    }
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log("SERVER RUNNING");
});
