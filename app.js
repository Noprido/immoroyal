const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const annoncesRoutes = require('./routes/annonces');
const profileRoutes = require('./routes/profile');
const adminRoutes = require('./routes/admin');
const pagesRoutes = require('./routes/pages');
const recherchesRouter = require('./routes/recherches');
const apiRoutes        = require('./routes/api'); 


const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Body parsers
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    return next(); // laisser multer gérer
  }
  express.urlencoded({ extended: true })(req, res, () => {
    express.json()(req, res, next);
  });
});

// Session
app.use(session({
  secret: 'immoroyal_secret_key_2026',
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


// API mobile — JSON, pas de session
app.use('/api/v1', apiRoutes);

// Routes
app.use('/', authRoutes);
app.use('/annonces', annoncesRoutes);
app.use('/profile', profileRoutes);
app.use('/admin', adminRoutes);
app.use('/messages', require('./routes/messages'));
app.use('/', pagesRoutes);
app.use('/recherches', recherchesRouter);


// 404
app.use((req, res) => {
  res.status(404).render('404');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ ImmoRoyal démarré sur http://localhost:${PORT}`);
});
