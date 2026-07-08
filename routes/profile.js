const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const bcrypt = require('bcrypt');
const { isAuthenticated } = require('../middleware/auth');
const { countUnread } = require('../controllers/messagesController');

// ─── Route publique (pas de isAuthenticated) ──────────────────────
router.get('/public/:id', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.banni) return res.status(404).render('404');

  const { password, ...userPublic } = user;

  const annonces = db.read('annonces')
    .filter(a => a.auteurId === user.id && a.actif !== false && !a.suspendu)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const villes = [...new Set(annonces.map(a => a.ville))];
  const typesCount = annonces.reduce((acc, a) => {
    acc[a.typeBien] = (acc[a.typeBien] || 0) + 1;
    return acc;
  }, {});
  const typesPrincipaux = Object.entries(typesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);

  res.render('profile/public', {
    user: userPublic,
    annonces,
    stats: { totalAnnonces: annonces.length, villes: villes.slice(0, 4), typesPrincipaux }
  });
});

// ─── Routes protégées ────────────────────────────────────────────
router.get('/', isAuthenticated, (req, res) => res.redirect('/profile/dashboard'));

router.get('/dashboard', isAuthenticated, (req, res) => {
  const user = db.findById('users', req.session.user.id);
  const annonces = db.read('annonces').filter(a => a.auteurId === req.session.user.id);
  const unread = countUnread(req.session.user.id);
  res.render('profile/dashboard', { user, annonces, unread });
});

router.get('/annonces', isAuthenticated, (req, res) => {
  const annonces = db.read('annonces').filter(a => a.auteurId === req.session.user.id);
  res.render('profile/annonces', { annonces });
});

router.post('/modifier', isAuthenticated, async (req, res) => {
  const { nom, telephone, whatsapp, bio, typeVendeur, ancienPassword, newPassword } = req.body;
  const user = db.findById('users', req.session.user.id);

  const updates = {
    nom: nom?.trim() || user.nom,
    email: email?.trim() || '',
    whatsapp: whatsapp?.trim() || user.whatsapp,
    bio: bio?.trim() || '',
    typeVendeur: typeVendeur || 'particulier'
  };

  if (newPassword) {
    if (!ancienPassword) {
      req.session.error = 'Saisissez votre mot de passe actuel pour le modifier.';
      return res.redirect('/profile/dashboard');
    }
    const valid = await bcrypt.compare(ancienPassword, user.password);
    if (!valid) {
      req.session.error = 'Mot de passe actuel incorrect.';
      return res.redirect('/profile/dashboard');
    }
    if (newPassword.length < 6) {
      req.session.error = 'Le nouveau mot de passe doit contenir au moins 6 caractères.';
      return res.redirect('/profile/dashboard');
    }
    updates.password = await bcrypt.hash(newPassword, 10);
  }

  db.update('users', req.session.user.id, updates);
  req.session.user = { ...req.session.user, nom: updates.nom, email: updates.email };
  req.session.success = 'Profil mis à jour avec succès.';
  res.redirect('/profile/dashboard');
});

module.exports = router;