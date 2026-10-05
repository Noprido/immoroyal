const express = require('express');
const router = express.Router();

const { isAuthenticated } = require('../middleware/auth');
const {
  getOrCreateConversation,
  getMessagesOfConversation,
  sendMessage,
  getUserConversations,
  readMessages,
  readConversations
} = require('../controllers/messagesController');
const { findAnnonceById } = require('../controllers/annoncesController');
const { findUserById } = require('../controllers/usersController');

const { envoyerNotificationMessage } = require('../utils/notifications');

// En haut du fichier, avec les autres requires
const { getIO } = require('../utils/socket');

// ─── Liste des conversations ──────────────────────────────────────
router.get('/', isAuthenticated, (req, res) => {
  const conversations = getUserConversations(req.session.user.id);
  const convAvecDetails = conversations.map(conv => {
    const annonce = findAnnonceById(conv.annonceId);
    const autreUserId = conv.userId1 === req.session.user.id ? conv.userId2 : conv.userId1;
    const autreUser = findUserById(autreUserId);
    const msgs = getMessagesOfConversation(conv.id);
    const nonLus = msgs.filter(m => m.senderId !== req.session.user.id && !m.lu).length;
    return { ...conv, annonce, autreUser, nonLus };
  });
  res.render('profile/messages', { conversations: convAvecDetails });
});

// ─── Ouvrir/démarrer une conversation depuis une annonce ──────────
router.get('/annonce/:annonceId', isAuthenticated, (req, res) => {
  const annonce = findAnnonceById(req.params.annonceId);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId === req.session.user.id) {
    req.session.error = 'Vous ne pouvez pas vous envoyer un message.';
    return res.redirect(`/annonces/${annonce.id}`);
  }
  const conv = getOrCreateConversation(annonce.id, req.session.user.id, annonce.auteurId);
  res.redirect(`/messages/${conv.id}`);
});


// GET /messages/json
router.get('/json', isAuthenticated, (req, res) => {
  const conversations = getUserConversations(req.session.user.id);
  const convAvecDetails = conversations.map(conv => {
    const annonce = findAnnonceById(conv.annonceId);
    const autreUserId = conv.userId1 === req.session.user.id ? conv.userId2 : conv.userId1;
    const autreUser = findUserById(autreUserId);
    const msgs = getMessagesOfConversation(conv.id);
    const nonLus = msgs.filter(m => m.senderId !== req.session.user.id && !m.lu).length;
    return { ...conv, annonce, autreUser, nonLus };
  });
  res.json(convAvecDetails);
});

// GET /messages/badge
router.get('/badge', isAuthenticated, (req, res) => {
  const { countUnread } = require('../controllers/messagesController');
  res.json({ total: countUnread(req.session.user.id) });
});

// ─── Conversation ─────────────────────────────────────────────────
router.get('/:convId', isAuthenticated, (req, res) => {
  const convs = readConversations();
  const conv = convs.find(c => c.id === req.params.convId);
  if (!conv) return res.status(404).render('404');

  const estParticipant = conv.userId1 === req.session.user.id || conv.userId2 === req.session.user.id;
  if (!estParticipant) return res.status(403).render('403');

  const messages = getMessagesOfConversation(conv.id);
  const annonce = findAnnonceById(conv.annonceId);
  const autreUserId = conv.userId1 === req.session.user.id ? conv.userId2 : conv.userId1;
  const autreUser = findUserById(autreUserId);

  const { markMessagesAsRead } = require('../controllers/messagesController');
  markMessagesAsRead(conv.id, req.session.user.id);

  getIO().to(`user_${req.session.user.id}`).emit('messages_read', { conversationId: conv.id });

  res.render('profile/conversation', { conv, messages, annonce, autreUser });
});

// ─── Envoyer un message ───────────────────────────────────────────
router.post('/:convId/envoyer', isAuthenticated, (req, res) => {
  const { texte } = req.body;
  if (!texte?.trim()) return res.redirect(`/messages/${req.params.convId}`);

  const convs = readConversations();
  const conv = convs.find(c => c.id === req.params.convId);
  if (!conv) return res.status(404).render('404');

  const estParticipant = conv.userId1 === req.session.user.id || conv.userId2 === req.session.user.id;
  if (!estParticipant) return res.status(403).render('403');

  const message = sendMessage(conv.id, req.session.user.id, texte.trim());

  // Temps réel → Flutter et autres clients web
  getIO().to(`conv_${conv.id}`).emit('new_message', message);
  getIO().to(`user_${conv.userId1}`).emit('conversation_updated', { conversationId: conv.id });
  getIO().to(`user_${conv.userId2}`).emit('conversation_updated', { conversationId: conv.id });

  const destinataireId = conv.userId1 === req.session.user.id ? conv.userId2 : conv.userId1;
  envoyerNotificationMessage(destinataireId, message.texte, req.session.user.nom, conv.id);

  res.json({ success: true });
});

// POST /messages/:convId/read
router.post('/:convId/read', isAuthenticated, (req, res) => {
  const convs = readConversations();
  const conv = convs.find(c => c.id === req.params.convId);
  if (!conv) return res.status(404).json({ error: 'Introuvable' });

  const { markMessagesAsRead } = require('../controllers/messagesController');
  markMessagesAsRead(conv.id, req.session.user.id);

  getIO().to(`user_${req.session.user.id}`).emit('messages_read', { conversationId: conv.id });
  res.json({ success: true });
});

module.exports = router;
