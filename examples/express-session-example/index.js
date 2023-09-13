import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import session from "express-session";

const port = process.env.PORT || 3000;

const app = express();
const httpServer = createServer(app);

const sessionMiddleware = session({
  secret: "changeit",
  resave: true,
  saveUninitialized: true,
});

app.use(sessionMiddleware);

app.get("/", (req, res) => {
  res.sendFile("./index.html", { root: process.cwd() });
});

app.post("/incr", (req, res) => {
  const session = req.session;
  session.count = (session.count || 0) + 1;
  res.status(200).end("" + session.count);

  io.to(session.id).emit("current count", session.count);
});

app.post("/logout", (req, res) => {
  const sessionId = req.session.id;
  req.session.destroy(() => {
    // disconnect all Socket.IO connections linked to this session ID
    io.to(sessionId).disconnectSockets();
    res.status(204).end();
  });
});

const io = new Server(httpServer);

io.engine.use(sessionMiddleware);

io.on("connect", (socket) => {
  const req = socket.request;

  socket.join(req.session.id);

  socket.on("incr", (cb) => {
    req.session.reload((err) => {
      if (err) {
        // session has expired
        return socket.disconnect();
      }
      req.session.count = (req.session.count || 0) + 1;
      req.session.save(() => {
        cb(req.session.count);
      });
    });
  });
});

httpServer.listen(port, () => {
  console.log(`application is running at: http://localhost:${port}`);
});
