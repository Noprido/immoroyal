const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');

// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

// POST /login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const users = db.read('users');
  const user = users.find(u => u.email === email.toLowerCase());

  if (!user) {
    return res.render('login', { error: 'Email ou mot de passe incorrect.' });
  }

  if (user.banni) {
    return res.render('login', { error: 'Ce compte a été suspendu.' });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.render('login', { error: 'Email ou mot de passe incorrect.' });
  }

  req.session.user = {
    id: user.id,
    nom: user.nom,
    email: user.email,
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
  const { nom, email, telephone, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Les mots de passe ne correspondent pas.' });
  }

  const users = db.read('users');
  if (users.find(u => u.email === email.toLowerCase())) {
    return res.render('register', { error: 'Cet email est déjà utilisé.' });
  }

  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    nom: nom.trim(),
    email: email.toLowerCase().trim(),
    telephone: telephone.trim(),
    password: hash,
    role: 'user',
    banni: false,
    createdAt: new Date().toISOString()
  };

  db.insert('users', newUser);

  req.session.user = {
    id: newUser.id,
    nom: newUser.nom,
    email: newUser.email,
    telephone: newUser.telephone,
    role: newUser.role
  };

  res.redirect('/');
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

module.exports = router;
