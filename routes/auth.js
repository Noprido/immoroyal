const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { TYPES_BIEN, CATEGORIES, getLabelDuree, getPrixAffiche } = require('../utils/validateAnnonce');
const path = require("path");
const rateLimit = require('express-rate-limit');


const { normalizeTelephone, validateRegisterInput, validateLoginInput } = require('../utils/validateAuth');

// ─── APRÈS ────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('login', {
      error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.',
      success: null
    });
  }
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).render('register', {
      error: 'Trop de comptes créés depuis cette adresse, réessayez plus tard.'
    });
  }
});


router.get('/txt', (req, res)=>{
  // res.send(txt.toS)
  // console.log(txt) 
  res.download(path.join(__dirname, "../data", "text.txt")) 

})


// Page d'accueil
router.get('/', (req, res) => {
  // const db = require('./utils/db');
  // console.log(CATEGORIES)
  const dernieres = db.read('annonces')
    .filter(a => a.actif !== false)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  res.render('home', { dernieres, TYPES_BIEN, CATEGORIES, getLabelDuree, getPrixAffiche });
});


// GET /login
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null, success: null });
});

// POST /login
router.post('/login', loginLimiter, async (req, res) => {
  const erreur = validateLoginInput(req.body);
  if (erreur) return res.render('login', { error: erreur, success: null });

  const { password } = req.body; // ← AJOUT
  const telNorm = normalizeTelephone(req.body.telephone);
  const users = db.read('users');
  const user = users.find(u => normalizeTelephone(u.telephone) === telNorm);

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
router.post('/register', registerLimiter, async (req, res) => {
  const erreur = validateRegisterInput(req.body);
  if (erreur) return res.render('register', { error: erreur });

  const { nom, telephone, whatsapp, whatsappSame, password } = req.body;
  const telNorm = normalizeTelephone(telephone);

  const users = db.read('users');
  if (users.find(u => normalizeTelephone(u.telephone) === telNorm)) {
    return res.render('register', { error: 'Ce numéro de téléphone est déjà utilisé.' });
  }

  const memeNumeroWhatsapp = whatsappSame === '1';
  const numeroWhatsapp = memeNumeroWhatsapp ? telNorm : normalizeTelephone(whatsapp);

  // ─── Création ─────────────────────────────────────────────────
  const hash = await bcrypt.hash(password, 10);
  const newUser = {
    id: uuidv4(),
    nom: nom.trim(),
    email: '',
    telephone: telNorm,
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
