const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { isAuthenticated } = require('../middleware/auth');

const { countUnread } = require('../controllers/messagesController');

router.use(isAuthenticated);

// GET /profile
router.get('/', (req, res) => {
  res.redirect('/profile/dashboard');
});

// GET /profile/dashboard
router.get('/dashboard', (req, res) => {
  const annonces = db.read('annonces').filter(a => a.auteurId === req.session.user.id);
  const unread = countUnread(req.session.user.id);
  res.render('profile/dashboard', { annonces, unread });
});

// GET /profile/annonces
router.get('/annonces', (req, res) => {
  const annonces = db.read('annonces').filter(a => a.auteurId === req.session.user.id);
  res.render('profile/annonces', { annonces });
});

// // GET /profile/messages
// router.get('/messages', (req, res) => {
//   const userId = req.session.user.id;
//   const conversations = db.read('conversations').filter(
//     c => c.participantA === userId || c.participantB === userId
//   );
//   const users = db.read('users');

//   const convWithDetails = conversations.map(conv => {
//     const otherId = conv.participantA === userId ? conv.participantB : conv.participantA;
//     const other = users.find(u => u.id === otherId);
//     const annonce = db.findById('annonces', conv.annonceId);
//     return { ...conv, other, annonce };
//   });

//   res.render('profile/messages', { conversations: convWithDetails });
// });

module.exports = router;
