const express = require('express');
const router = express.Router();

// GET /apropos
router.get('/apropos', (req, res) => {
  res.render('apropos');
});

// GET /contact
router.get('/contact', (req, res) => {
  res.render('contact');
});

// POST /contact — pour l'instant on affiche juste un message de succès
// Plus tard tu pourras brancher un vrai envoi d'email (nodemailer)
router.post('/contact', (req, res) => {
  const { nom, email, sujet, message } = req.body;

  if (!nom || !email || !sujet || !message) {
    req.session.error = 'Tous les champs sont obligatoires.';
    return res.redirect('/contact');
  }

  // TODO: envoyer un email avec nodemailer
  // Pour l'instant on log en console
  console.log(`[Contact] De: ${nom} <${email}> | Sujet: ${sujet}\n${message}`);

  req.session.success = 'Votre message a bien été envoyé. Nous vous répondrons dans les plus brefs délais.';
  res.redirect('/contact');
});

module.exports = router;
