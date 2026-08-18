// socket.js
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'immoroyal_jwt_secret';

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*', // à restreindre en prod
      methods: ['GET', 'POST']
    }
  });

  // Middleware auth JWT — chaque connexion doit fournir son token
  io.use((socket, next) => {
    // Tentative JWT (mobile)
    const token = socket.handshake.auth?.token;
    if (token) {
      try {
        socket.user = jwt.verify(token, JWT_SECRET);
        return next();
      } catch {
        return next(new Error('Token invalide'));
      }
    }

    // Tentative session (web)
    const session = socket.handshake.auth?.session;
    if (session) {
      socket.user = session;
      return next();
    }

    next(new Error('Non authentifié'));
  });

io.on('connection', (socket) => {
  // console.log(`✅ Socket connecté — user: ${socket.user?.id}, auth:`, socket.handshake.auth);

  socket.join(`user_${socket.user.id}`);

  socket.on('join_conversation', (conversationId) => {
    // console.log(`📌 join_conversation: ${conversationId} par ${socket.user?.id}`);
    socket.join(`conv_${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conv_${conversationId}`);
  });

  socket.on('disconnect', () => {
    // console.log(`❌ Socket déconnecté — user: ${socket.user?.id}`);
  });
});

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.io non initialisé');
  return io;
}

module.exports = { initSocket, getIO };