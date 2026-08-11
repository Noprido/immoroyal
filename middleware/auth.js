// Vérifie que l'utilisateur est connecté
function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  const db = require('../utils/db');
  const user = db.findById('users', req.session.user.id);
  if (!user || user.banni) {
    req.session.destroy(() => res.redirect('/login'));
    return;
  }
  next();
}

// Vérifie que l'utilisateur est admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).render('403');
}

module.exports = { isAuthenticated, isAdmin };
