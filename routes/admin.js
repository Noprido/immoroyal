const express = require('express');
const router = express.Router();
const db = require('../utils/db');
const { isAuthenticated, isAdmin } = require('../middleware/auth');

router.use(isAuthenticated, isAdmin);

// GET /admin
router.get('/', (req, res) => res.redirect('/admin/dashboard'));

// GET /admin/dashboard
router.get('/dashboard', (req, res) => {
  const users = db.read('users');
  const annonces = db.read('annonces');
  res.render('admin/dashboard', {
    totalUsers: users.length,
    totalAnnonces: annonces.filter(a => a.actif !== false).length,
    recentUsers: users.slice(-5).reverse(),
    recentAnnonces: annonces.slice(-5).reverse()
  });
});

// GET /admin/users
router.get('/users', (req, res) => {
  const users = db.read('users');
  res.render('admin/users', { users });
});

// POST /admin/users/:id/ban
router.post('/users/:id/ban', (req, res) => {
  db.update('users', req.params.id, { banni: true });
  res.redirect('/admin/users');
});

// POST /admin/users/:id/unban
router.post('/users/:id/unban', (req, res) => {
  db.update('users', req.params.id, { banni: false });
  res.redirect('/admin/users');
});

// GET /admin/annonces
router.get('/annonces', (req, res) => {
  const annonces = db.read('annonces');
  res.render('admin/annonces', { annonces });
});

// POST /admin/annonces/:id/delete
router.post('/annonces/:id/delete', (req, res) => {
  db.update('annonces', req.params.id, { actif: false });
  res.redirect('/admin/annonces');
});

// POST /admin/annonces/:id/featured
router.post('/annonces/:id/featured', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  db.update('annonces', req.params.id, { enAvant: !annonce.enAvant });
  res.redirect('/admin/annonces');
});

module.exports = router;
