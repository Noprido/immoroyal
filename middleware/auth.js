// Vérifie que l'utilisateur est connecté
function isAuthenticated(req, res, next) {
  if (req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

// Vérifie que l'utilisateur est admin
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).render('403');
}

module.exports = { isAuthenticated, isAdmin };
