const { Server } = require("socket.io");
const { createApp } = require("./app");
const { env } = require("./config/env");

const app = createApp();
const httpServer = require("http").createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.clientOrigin,
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  // eslint-disable-next-line no-console
  console.log(`Socket connecte: ${socket.id}`);

  socket.on("disconnect", () => {
    // eslint-disable-next-line no-console
    console.log(`Socket deconnecte: ${socket.id}`);
  });
});

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Food Rescue API running on http://localhost:${env.port}`);
});
