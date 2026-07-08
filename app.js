const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const annoncesRoutes = require('./routes/annonces');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const pagesRoutes = require('./routes/pages');

const { TYPES_BIEN } = require('./utils/validateAnnonce');


const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parsers
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: 'immoroyal_secret_key_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 24h
}));

// Middleware global : injecter user + messages flash dans toutes les vues
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
});

// Routes
app.use('/', authRoutes);
app.use('/annonces', annoncesRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/messages', require('./routes/messages'));
app.use('/', pagesRoutes);
// app.use('/profil', require('./routes/profile'));

// Page d'accueil
app.get('/', (req, res) => {
  const db = require('./utils/db');
  const dernieres = db.read('annonces')
    .filter(a => a.actif !== false)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 6);

  res.render('home', { dernieres, searchParams: {} , TYPES_BIEN});
});

// 404
app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, () => {
  console.log(`✅ ImmoRoyal démarré sur http://localhost:${PORT}`);
});
