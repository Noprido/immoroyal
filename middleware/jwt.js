const jwt = require('jsonwebtoken');
const db  = require('../utils/db');

// Le serveur refuse de démarrer sans secret JWT explicitement configuré,
// plutôt que de retomber silencieusement sur une valeur par défaut faible.
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET manquant dans les variables d\'environnement — arrêt du serveur pour éviter un secret par défaut non sécurisé.');
}

function authJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Le token peut être valide jusqu'à 7 jours après la connexion. Sans cette
    // vérification, un compte banni entre-temps resterait pleinement
    // fonctionnel sur l'API jusqu'à l'expiration du token. On revérifie donc
    // l'état réel de l'utilisateur en base à chaque requête authentifiée.
    const user = db.findById('users', payload.id);
    if (!user || user.banni) {
      return res.status(401).json({ error: 'Compte suspendu ou introuvable.' });
    }

    req.user = payload; // { id, nom, telephone, role } — inchangé pour compat avec le reste du code
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

module.exports = { authJWT };