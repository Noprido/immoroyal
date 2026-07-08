const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, success: null });
});

// POST /login
router.post('/login', async (req, res) => {
  const { telephone, password } = req.body;

  if (!telephone || !password) {
    return res.render('login', { error: 'Veuillez remplir tous les champs.', success: null });
  }

  const users = db.read('users');
  const user = users.find(u => u.telephone === telephone.trim());

  if (!user) {
    return res.render('login', { error: 'Numéro de téléphone ou mot de passe incorrect.', success: null });
  }

  if (user.banni) {
    return res.render('login', { error: 'Ce compte a été suspendu. Contactez l\'administrateur.', success: null });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.render('login', { error: 'Numéro de téléphone ou mot de passe incorrect.', success: null });
  }

  req.session.user = {
    id: user.id,
    nom: user.nom,
    telephone: user.telephone,
    role: user.role
  };

  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

// GET /register
router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { error: null });
});

// POST /register
router.post('/register', async (req, res) => {
  const { nom, telephone, whatsapp, whatsappSame, password, confirmPassword } = req.body;

  // ─── Validation ───────────────────────────────────────────────
  if (!nom || !telephone || !password || !confirmPassword) {
    return res.render('register', { error: 'Veuillez remplir tous les champs obligatoires.' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Les mots de passe ne correspondent pas.' });
  }

  if (password.length < 6) {
    return res.render('register', { error: 'Le mot de passe doit contenir au moins 6 caractères.' });
  }

  const users = db.read('users');

  // Vérifier unicité du téléphone
  if (users.find(u => u.telephone === telephone.trim())) {
    return res.render('register', { error: 'Ce numéro de téléphone est déjà utilisé.' });
  }

  // ─── WhatsApp ─────────────────────────────────────────────────
  const memeNumeroWhatsapp = whatsappSame === '1';
  const numeroWhatsapp = memeNumeroWhatsapp
    ? telephone.trim()
    : (whatsapp || '').trim();

  if (!memeNumeroWhatsapp && !numeroWhatsapp) {
    return res.render('register', { error: 'Veuillez renseigner votre numéro WhatsApp.' });
  }

  // ─── Création ─────────────────────────────────────────────────
  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    nom: nom.trim(),
    email: '',
    telephone: telephone.trim(),
    whatsapp: numeroWhatsapp,
    password: hash,
    role: 'user',
    banni: false,
    bio: '',
    typeVendeur: 'particulier',
    suspendu: false,
    createdAt: new Date().toISOString()
  };

  db.insert('users', newUser);

  req.session.user = {
    id: newUser.id,
    nom: newUser.nom,
    telephone: newUser.telephone,
    role: newUser.role
  };

  req.session.success = `Bienvenue sur ImmoRoyal, ${newUser.nom} !`;
  res.redirect('/');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
