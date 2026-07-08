const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

router.use(isAuthenticated, isAdmin);

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

// GET /admin/dashboard
router.get('/dashboard', (req, res) => {
  const users = db.read('users');
  const annonces = db.read('annonces');
  res.render('admin/dashboard', {
    stats: {
      totalUsers: users.length,
      totalAnnonces: annonces.length,
      annoncesActives: annonces.filter(a => a.actif !== false && !a.suspendu).length,
      usersBannis: users.filter(u => u.banni).length,
      annoncesSuspendues: annonces.filter(a => a.suspendu).length
    },
    recentUsers: users.slice(-5).reverse(),
    recentAnnonces: annonces.slice(-5).reverse()
  });
});

// GET /admin/users
router.get('/users', (req, res) => {
  const users = db.read('users');
  res.render('admin/users', { users });
});

router.post('/users/:id/ban', (req, res) => {
  db.update('users', req.params.id, { banni: true });
  req.session.success = 'Utilisateur banni.';
  res.redirect('/admin/users');
});

router.post('/users/:id/unban', (req, res) => {
  db.update('users', req.params.id, { banni: false });
  req.session.success = 'Utilisateur débanni.';
  res.redirect('/admin/users');
});

// GET /admin/annonces — avec filtre et recherche
router.get('/annonces', (req, res) => {
  const { q, statut } = req.query;
  let annonces = db.read('annonces');

  // Filtre texte : titre, ville, quartier, id
  if (q) {
    const query = q.toLowerCase();
    annonces = annonces.filter(a =>
      a.titre.toLowerCase().includes(query) ||
      a.ville.toLowerCase().includes(query) ||
      a.quartier.toLowerCase().includes(query) ||
      a.id.toLowerCase().includes(query)
    );
  }

  // Filtre statut
  if (statut === 'actif') annonces = annonces.filter(a => a.actif !== false && !a.suspendu);
  if (statut === 'inactif') annonces = annonces.filter(a => a.actif === false && !a.suspendu);
  if (statut === 'suspendu') annonces = annonces.filter(a => a.suspendu === true);

  annonces.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('admin/annonces', { annonces, filtres: req.query });
});

// POST /admin/annonces/:id/featured
router.post('/annonces/:id/featured', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  db.update('annonces', req.params.id, { enAvant: !annonce.enAvant });
  res.redirect('/admin/annonces?' + new URLSearchParams(req.body.filtres || {}).toString());
});

// POST /admin/annonces/:id/suspendre — suspension admin
router.post('/annonces/:id/suspendre', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  db.update('annonces', req.params.id, {
    suspendu: true,
    actif: false,
    suspendéLe: new Date().toISOString()
  });
  req.session.success = 'Annonce suspendue.';
  res.redirect('/admin/annonces');
});

// POST /admin/annonces/:id/reactiver — réactivation admin
router.post('/annonces/:id/reactiver', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  db.update('annonces', req.params.id, {
    suspendu: false,
    actif: true,
    suspendéLe: null
  });
  req.session.success = 'Annonce réactivée.';
  res.redirect('/admin/annonces');
});

module.exports = router;