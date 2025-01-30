const express = require("express");
const app = express();
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on("ruleChange", (ruleChange) => {
    io.emit("updateRule", ruleChange); 
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

server.listen(process.env.PORT || 3001, () => {
  console.log("SERVER RUNNING");
});
