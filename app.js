require('dotenv').config(); // ← déplacé tout en haut : doit s'exécuter avant tout le reste

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser'); // ← AJOUT
const path = require('path');
const rateLimit = require('express-rate-limit'); // ← pour le rate limit global, vu précédemment

const authRoutes = require('./routes/auth');
const annoncesRoutes = require('./routes/annonces');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const pagesRoutes = require('./routes/pages');
const recherchesRouter = require('./routes/recherches');
const apiRoutes        = require('./routes/api'); 
const helmet = require('helmet');

const http = require('http');
const { initSocket } = require('./utils/socket');

const { doubleCsrf } = require('csrf-csrf');


const { doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET,
  getSessionIdentifier: (req) => req.session.id,
  cookieName: 'x-csrf-token',
  cookieOptions: {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true, 
  },
  getCsrfTokenFromRequest: (req) => req.body._csrf, // ← nom correct pour la v4
});


const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "script-src-attr": ["'unsafe-inline'"],
    },
  },
}));

// Body parsers
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  express.urlencoded({ extended: true, limit: '100kb' })(req, res, () => {
    express.json({ limit: '100kb' })(req, res, next);
  });
});

// Rate limit global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de requêtes depuis cette adresse, réessayez plus tard.'
});
app.use(globalLimiter);

// Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

app.use((req, res, next) => {
  if (req.session && !req.session.initialized) {
    req.session.initialized = true; // écrire quelque chose "modifie" la session → elle est sauvegardée
  }
  next();
});


// ─── AJOUT : cookie-parser, APRÈS la session, AVANT le CSRF ─────
app.use(cookieParser());

// ─── API mobile — JSON, pas de session, EXCLUE du CSRF ──────────
app.use('/api/v1', apiRoutes);


// CSRF — s'applique maintenant uniquement aux routes web enregistrées après cette ligne
app.use(doubleCsrfProtection);

// Middleware global : injecter user + messages flash + csrfToken dans toutes les vues
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  res.locals.csrfToken = req.csrfToken();
  delete req.session.success;
  delete req.session.error;

  // AJOUTER
  if (req.session.user) {
    const { countUnread } = require('./controllers/messagesController');
    res.locals.totalNonLus = countUnread(req.session.user.id);
  } else {
    res.locals.totalNonLus = 0;
  }

  next();
});

// Routes web
app.use('/', authRoutes);
app.use('/annonces', annoncesRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/messages', require('./routes/messages'));
app.use('/', pagesRoutes);
app.use('/recherches', recherchesRouter);

// ─── AJOUT : handler d'erreur CSRF dédié ─────────────────────────
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message?.includes('csrf')) {
    res.locals.user = req.session.user || null;
    res.locals.success = null;
    res.locals.error = null;
    return res.status(403).render('403', { message: 'Formulaire expiré ou invalide, veuillez réessayer.' });
  }
  next(err);
});

// 404
app.use((req, res) => {
  res.status(404).render('404');
});




const server = http.createServer(app);
initSocket(server);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ImmoRoyal démarré sur http://localhost:${PORT}`);
});