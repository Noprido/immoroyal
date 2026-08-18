/**
 * ImmoRoyal — API REST v1
 * À monter dans app.js : app.use('/api/v1', require('./routes/api'));
 *
 * Tous les endpoints retournent du JSON.
 * Auth web (session) et auth mobile (JWT) coexistent sans conflit.
 */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const path     = require('path');
const multer   = require('multer');

const { getIO } = require('../utils/socket');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const db = require('../utils/db');
const { authJWT } = require('../middleware/jwt');
const {
  validateAnnonce, buildAnnonce,
  TYPES_BIEN, DUREES_LOCATION,
  getPrixAffiche, getLabelDuree
} = require('../utils/validateAnnonce');

const { normalize } = require('../utils/textNormalize');
const { findCommunesForQuartier } = require('../utils/beninHierarchy');

const { envoyerNotificationMessage } = require('../utils/notifications');

const JWT_SECRET  = process.env.JWT_SECRET || 'immoroyal_jwt_secret';
const JWT_EXPIRES = '7d';

// ─── Multer (réutilise le même dossier que le web) ────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/annonces')),
  filename:    (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Seuls les fichiers images et vidéos sont acceptés.'));
  }
});

const uploadMessages = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(__dirname, '../uploads/messages');
      require('fs').mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20Mo max
  fileFilter: (req, file, cb) => {
    console.log("──────── FILE FILTER ────────");
    console.log("Nom :", file.originalname);
    console.log("Extension :", path.extname(file.originalname));
    console.log("Mime :", file.mimetype);
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|webm|m4a|mp3|aac|wav|ogg|opus|amr/;
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    if (allowed.test(ext)) cb(null, true);
    else cb(new Error('Type de fichier non supporté.'));
  }
});

// ─── Helpers ──────────────────────────────────────────────────────
const VIDEO_EXTS = /mp4|webm|mov/;

async function separerMedias(files) {
  const photos = [];
  const videos = [];

  for (const f of (files || [])) {
    const ext = path.extname(f.originalname).toLowerCase().replace('.', '');
    const url = `/uploads/annonces/${f.filename}`;

    if (VIDEO_EXTS.test(ext)) {
      videos.push(url);
      // Générer miniature jpg de la première frame
      const thumbFilename = `thumb_${f.filename.replace(/\.[^.]+$/, '.jpg')}`;
      const thumbPath = path.join(__dirname, '../uploads/annonces', thumbFilename);
      try {
        await new Promise((resolve, reject) => {
          ffmpeg(path.join(__dirname, '../uploads/annonces', f.filename))
            .screenshots({
              timestamps: ['00:00:01'],
              filename: thumbFilename,
              folder: path.join(__dirname, '../uploads/annonces'),
              // size: '640x360'
            })
            .on('end', resolve)
            .on('error', reject);
        });
        photos.unshift(`/uploads/annonces/${thumbFilename}`);
      } catch (e) {
        console.error('Erreur génération miniature:', e.message);
      }
    } else {
      photos.push(url);
    }
  }

  return { photos, videos };
}

function validerMedias(photosTotal, videosTotal) {
  if (photosTotal + videosTotal === 0) return 'Veuillez ajouter au moins un média.';
  if (videosTotal > 3)                  return 'Maximum 3 vidéos par annonce.';
  if (photosTotal + videosTotal > 10)   return 'Maximum 10 médias au total.';
  return null;
}

function sanitizeUser(user) {
  const { password, ...u } = user;
  return u;
}

function enrichirAnnonce(annonce) {
  return {
    ...annonce,
    prixAffiche: getPrixAffiche(annonce),
    labelDuree:  getLabelDuree(annonce)
  };
}

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════

// POST /api/v1/auth/register
router.post('/auth/register', async (req, res) => {
  try {
    const { nom, telephone, whatsapp, password } = req.body;

    if (!nom || !telephone || !password)
      return res.status(400).json({ error: 'nom, telephone et password sont requis.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });

    const users = db.read('users');
    if (users.find(u => u.telephone === telephone.trim()))
      return res.status(409).json({ error: 'Ce numéro de téléphone est déjà utilisé.' });

    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      id:          uuidv4(),
      nom:         nom.trim(),
      email:       '',
      telephone:   telephone.trim(),
      whatsapp:    (whatsapp || '').trim() || telephone.trim(),
      password:    hash,
      role:        'user',
      banni:       false,
      bio:         '',
      typeVendeur: 'particulier',
      suspendu:    false,
      createdAt:   new Date().toISOString()
    };

    db.insert('users', newUser);

    const token = jwt.sign(
      { id: newUser.id, nom: newUser.nom, telephone: newUser.telephone, role: newUser.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.status(201).json({ token, user: sanitizeUser(newUser) });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/v1/auth/login
router.post('/auth/login', async (req, res) => {
  try {
    const { telephone, password } = req.body;

    if (!telephone || !password)
      return res.status(400).json({ error: 'telephone et password sont requis.' });

    const users = db.read('users');
    const user  = users.find(u => u.telephone === telephone.trim());

    if (!user)
      return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
    if (user.banni)
      return res.status(403).json({ error: 'Ce compte a été suspendu.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });

    const token = jwt.sign(
      { id: user.id, nom: user.nom, telephone: user.telephone, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({ token, user: sanitizeUser(user) });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/v1/auth/me
router.get('/auth/me', authJWT, (req, res) => {
  const user = db.findById('users', req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json(sanitizeUser(user));
});

// POST /api/v1/users/fcm-token — enregistre/actualise le token FCM de l'utilisateur
router.post('/users/fcm-token', authJWT, (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token requis.' });

  const user = db.findById('users', req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const tokens = new Set(user.fcmTokens || []);
  tokens.add(token); // Set évite les doublons si le même token est renvoyé

  db.update('users', req.user.id, { fcmTokens: [...tokens] });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════
// ANNONCES
// ═══════════════════════════════════════════════════════════════════

// GET /api/v1/categories
router.get('/categories', (req, res) => {
  const categories = require('../data/categories.json');
  res.json(categories);
});

// GET /api/v1/suggestions/benin
router.get('/suggestions/benin', (req, res) => {
  const suggestions = require('../public/data/benin_suggestions.json');

  // Pour chaque quartier de la liste plate existante, on résout sa/ses commune(s)
  // via la hiérarchie administrative. Rétrocompatible : villes/quartiers inchangés.
  const quartiersDetail = suggestions.quartiers.map(quartier => {
    const communes = findCommunesForQuartier(quartier);
    return {
      quartier,
      // null si quartier inconnu de la hiérarchie, sinon la commune si non-ambigu
      commune: communes.length === 1 ? communes[0].commune : null,
      ambigu: communes.length > 1
    };
  });

  res.json({
    ...suggestions,
    quartiersDetail
  });
});

// GET /api/v1/annonces
router.get('/annonces', (req, res) => {
  const { ville, quartier, typeBien, typeTransaction, prixMin, prixMax, q, nbChambres, nbSalons, standing, page, limit, mode } = req.query;

  let annonces = db.read('annonces').filter(a => a.actif !== false && !a.suspendu);

  if (typeTransaction) annonces = annonces.filter(a => (a.typeTransaction || 'location') === typeTransaction);
  if (prixMin)         annonces = annonces.filter(a => getPrixAffiche(a) >= parseInt(prixMin));
  if (prixMax)         annonces = annonces.filter(a => getPrixAffiche(a) <= parseInt(prixMax));

  const useRelevance = mode === 'relevance' && (ville || quartier || typeBien || q || nbChambres || nbSalons || standing);

  if (useRelevance) {
    const villeNorm     = ville     ? normalize(ville)     : null;
    const quartierNorm  = quartier  ? normalize(quartier)  : null;
    const typeBienNorm  = typeBien  ? normalize(typeBien)  : null;
    const qNorm         = q         ? normalize(q)         : null;
    const nbChambresVal = nbChambres ? parseInt(nbChambres) : null;
    const nbSalonsVal   = nbSalons   ? parseInt(nbSalons)   : null;
    const standingNorm  = standing   ? normalize(standing)  : null;

    const scored = annonces.map(a => {
      let score = 0;
      if (villeNorm    && normalize(a.ville).includes(villeNorm))        score += 3;
      if (quartierNorm && normalize(a.quartier).includes(quartierNorm))  score += 3;
      if (typeBienNorm && normalize(a.typeBien) === typeBienNorm)        score += 2;
      if (nbChambresVal !== null && a.nbChambres === nbChambresVal)      score += 2;
      if (nbSalonsVal   !== null && a.nbSalons === nbSalonsVal)          score += 1;
      if (standingNorm  && normalize(a.standing || '') === standingNorm) score += 1;
      if (qNorm) {
        if (normalize(a.titre).includes(qNorm))            score += 2;
        else if (normalize(a.description || '').includes(qNorm)) score += 1;
      }
      return { annonce: a, score };
    }).filter(s => s.score > 0);

    scored.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      if (x.annonce.enAvant && !y.annonce.enAvant) return -1;
      if (!x.annonce.enAvant && y.annonce.enAvant) return 1;
      return new Date(y.annonce.createdAt) - new Date(x.annonce.createdAt);
    });

    annonces = scored.map(s => s.annonce);
  } else {
    if (ville)    annonces = annonces.filter(a => normalize(a.ville).includes(normalize(ville)));
    if (quartier) annonces = annonces.filter(a => normalize(a.quartier).includes(normalize(quartier)));
    if (typeBien) annonces = annonces.filter(a => a.typeBien === typeBien);
    if (q) {
      const qNorm = normalize(q);
      annonces = annonces.filter(a =>
        normalize(a.titre).includes(qNorm) ||
        normalize(a.description || '').includes(qNorm)
      );
    }
    annonces.sort((a, b) => {
      if (a.enAvant && !b.enAvant) return -1;
      if (!a.enAvant && b.enAvant) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  // console.log('📋 Liste finale avant pagination :');
  // console.log(JSON.stringify(annonces, null, 2));

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const total    = annonces.length;
  const items    = annonces.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({
    data: items.map(enrichirAnnonce),
    meta: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) }
  });
});

// GET /api/v1/annonces/stats-categories
router.get('/annonces/stats-categories', (req, res) => {
  const annonces = db.read('annonces').filter(a => a.actif !== false && !a.suspendu);
  const { TYPES_BIEN } = require('../utils/validateAnnonce');

  const counts = {};
  for (const type of TYPES_BIEN) counts[type] = 0;
  for (const a of annonces) {
    counts[a.typeBien] = (counts[a.typeBien] || 0) + 1;
  }

  res.json(counts);
});

// GET /api/v1/annonces/:id
router.get('/annonces/:id', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce || annonce.actif === false || annonce.suspendu)
    return res.status(404).json({ error: 'Annonce introuvable.' });

  const auteur = db.findById('users', annonce.auteurId);
  res.json({
    ...enrichirAnnonce(annonce),
    auteurWhatsapp: auteur?.whatsapp || annonce.auteurTelephone
  });
});

// POST /api/v1/annonces
router.post('/annonces', authJWT, (req, res) => {
  upload.array('medias', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const erreur = validateAnnonce(req.body);
    if (erreur) return res.status(400).json({ error: erreur });

    const { photos, videos } = await separerMedias(req.files);
    const erreurMedias = validerMedias(photos.length, videos.length);
    if (erreurMedias) return res.status(400).json({ error: erreurMedias });

    const auteur  = db.findById('users', req.user.id);
    const annonce = buildAnnonce(req.body, { photos, videos }, {
      id:               uuidv4(),
      auteurId:         req.user.id,
      auteurNom:        req.user.nom,
      auteurTelephone:  req.user.telephone,
      enAvant:          false,
      actif:            true,
      suspendu:         false,
      createdAt:        new Date().toISOString()
    });

    db.insert('annonces', annonce);
    res.status(201).json(enrichirAnnonce(annonce));
  });
});

// PUT /api/v1/annonces/:id
router.put('/annonces/:id', authJWT, (req, res) => {
  upload.array('medias', 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const annonce = db.findById('annonces', req.params.id);
    if (!annonce) return res.status(404).json({ error: 'Annonce introuvable.' });
    if (annonce.auteurId !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Accès interdit.' });

    const erreur = validateAnnonce(req.body);
    if (erreur) return res.status(400).json({ error: erreur });

    const { photos: newPhotos, videos: newVideos } = await separerMedias(req.files);

    const photosExistantes = Array.isArray(req.body.photosExistantes)
      ? req.body.photosExistantes
      : req.body.photosExistantes ? [req.body.photosExistantes] : [];
    const videosExistantes = Array.isArray(req.body.videosExistantes)
      ? req.body.videosExistantes
      : req.body.videosExistantes ? [req.body.videosExistantes] : [];

    const photosFinales = [...photosExistantes, ...newPhotos];
    const videosFinales = [...videosExistantes, ...newVideos];

    const erreurMedias = validerMedias(photosFinales.length, videosFinales.length);
    if (erreurMedias) return res.status(400).json({ error: erreurMedias });

    const updates = buildAnnonce(req.body, { photos: photosFinales, videos: videosFinales }, {
      updatedAt: new Date().toISOString()
    });

    db.update('annonces', req.params.id, updates);
    res.json(enrichirAnnonce({ ...annonce, ...updates }));
  });
});

// DELETE /api/v1/annonces/:id
router.delete('/annonces/:id', authJWT, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (annonce.auteurId !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'Accès interdit.' });

  db.update('annonces', req.params.id, { actif: false });
  res.json({ success: true });
});

// POST /api/v1/annonces/:id/toggle
router.post('/annonces/:id/toggle', authJWT, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (annonce.auteurId !== req.user.id)
    return res.status(403).json({ error: 'Accès interdit.' });
  if (annonce.suspendu && !annonce.actif)
    return res.status(403).json({ error: 'Cette annonce a été suspendue par un administrateur.' });

  db.update('annonces', req.params.id, { actif: !annonce.actif });
  res.json({ actif: !annonce.actif });
});

// ═══════════════════════════════════════════════════════════════════
// RECHERCHES
// ═══════════════════════════════════════════════════════════════════

const TYPES_BIEN_RECHERCHE = [...TYPES_BIEN, 'Autre'];

// GET /api/v1/recherches
router.get('/recherches', (req, res) => {
  const { ville, typeBien, typeTransaction, fondsDisponibles, page, limit } = req.query;

  let recherches = db.read('recherches').filter(r => r.actif !== false);

  if (ville)            recherches = recherches.filter(r =>
    !r.localisation?.importe && r.localisation?.ville?.toLowerCase().includes(ville.toLowerCase())
  );
  if (typeBien)         recherches = recherches.filter(r => r.typeBien === typeBien);
  if (typeTransaction)  recherches = recherches.filter(r => r.typeTransaction === typeTransaction);
  if (fondsDisponibles) recherches = recherches.filter(r => r.fondsDisponibles === true);

  recherches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const pageNum  = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(50, Math.max(1, parseInt(limit) || 20));
  const total    = recherches.length;
  const items    = recherches.slice((pageNum - 1) * pageSize, pageNum * pageSize);

  res.json({ data: items, meta: { total, page: pageNum, limit: pageSize, pages: Math.ceil(total / pageSize) } });
});

// GET /api/v1/recherches/:id
router.get('/recherches/:id', (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche || recherche.actif === false)
    return res.status(404).json({ error: 'Recherche introuvable.' });
  res.json(recherche);
});

// POST /api/v1/recherches
router.post('/recherches', authJWT, (req, res) => {
  const {
    titre, typeBien, autreTypeBien, typeTransaction,
    localisationImporte, ville, quartier,
    budgetMax, dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    fondsDisponibles, description
  } = req.body;

  if (!titre || !typeBien || !typeTransaction || !budgetMax)
    return res.status(400).json({ error: 'Champs obligatoires manquants.' });
  if (typeBien === 'Autre' && !autreTypeBien?.trim())
    return res.status(400).json({ error: 'Précisez le type de bien recherché.' });

  const importe = localisationImporte === true || localisationImporte === 'true' || localisationImporte === 'on';
  if (!importe && !ville?.trim())
    return res.status(400).json({ error: 'Indiquez une ville ou activez "localisation peu importe".' });

  const auteur = db.findById('users', req.user.id);
  const recherche = {
    id:             uuidv4(),
    titre:          titre.trim(),
    description:    description?.trim() || '',
    typeBien,
    autreTypeBien:  typeBien === 'Autre' ? autreTypeBien.trim() : '',
    typeTransaction,
    localisation: {
      importe,
      ville:    importe ? '' : ville.trim(),
      quartier: importe ? '' : (quartier?.trim() || '')
    },
    budgetMax:      parseInt(budgetMax) || 0,
    dureeLocation:  typeTransaction === 'location' ? (dureeLocation || 'mois') : '',
    nbChambres:     parseInt(nbChambres) || 0,
    nbSalons:       parseInt(nbSalons) || 0,
    nbDouches:      parseInt(nbDouches) || 0,
    nbCuisines:     parseInt(nbCuisines) || 0,
    fondsDisponibles: fondsDisponibles === true || fondsDisponibles === 'true' || fondsDisponibles === 'on',
    auteurId:         req.user.id,
    auteurNom:        req.user.nom,
    auteurTelephone:  req.user.telephone,
    auteurWhatsapp:   auteur?.whatsapp || req.user.telephone,
    actif:            true,
    createdAt:        new Date().toISOString(),
    updatedAt:        new Date().toISOString()
  };

  db.insert('recherches', recherche);
  res.status(201).json(recherche);
});

// PUT /api/v1/recherches/:id
router.put('/recherches/:id', authJWT, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).json({ error: 'Recherche introuvable.' });
  if (recherche.auteurId !== req.user.id)
    return res.status(403).json({ error: 'Accès interdit.' });

  const {
    titre, typeBien, autreTypeBien, typeTransaction,
    localisationImporte, ville, quartier,
    budgetMax, dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    fondsDisponibles, description
  } = req.body;

  const importe = localisationImporte === true || localisationImporte === 'true' || localisationImporte === 'on';

  const updates = {
    titre:         titre?.trim() || recherche.titre,
    description:   description?.trim() || '',
    typeBien:      typeBien || recherche.typeBien,
    autreTypeBien: typeBien === 'Autre' ? autreTypeBien?.trim() : '',
    typeTransaction: typeTransaction || recherche.typeTransaction,
    localisation: {
      importe,
      ville:    importe ? '' : ville?.trim() || '',
      quartier: importe ? '' : quartier?.trim() || ''
    },
    budgetMax:      parseInt(budgetMax) || recherche.budgetMax,
    dureeLocation:  typeTransaction === 'location' ? (dureeLocation || 'mois') : '',
    nbChambres:     parseInt(nbChambres) || 0,
    nbSalons:       parseInt(nbSalons) || 0,
    nbDouches:      parseInt(nbDouches) || 0,
    nbCuisines:     parseInt(nbCuisines) || 0,
    fondsDisponibles: fondsDisponibles === true || fondsDisponibles === 'true' || fondsDisponibles === 'on',
    updatedAt: new Date().toISOString()
  };

  db.update('recherches', req.params.id, updates);
  res.json({ ...recherche, ...updates });
});

// POST /api/v1/recherches/:id/toggle
router.post('/recherches/:id/toggle', authJWT, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).json({ error: 'Recherche introuvable.' });
  if (recherche.auteurId !== req.user.id) return res.status(403).json({ error: 'Accès interdit.' });

  db.update('recherches', req.params.id, { actif: !recherche.actif });
  res.json({ actif: !recherche.actif });
});

// DELETE /api/v1/recherches/:id
router.delete('/recherches/:id', authJWT, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).json({ error: 'Recherche introuvable.' });
  if (recherche.auteurId !== req.user.id)
    return res.status(403).json({ error: 'Accès interdit.' });
  db.update('recherches', req.params.id, { actif: false });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════
// PROFIL
// ═══════════════════════════════════════════════════════════════════

// GET /api/v1/profile/public/:id
router.get('/profile/public/:id', (req, res) => {
  const user = db.findById('users', req.params.id);
  if (!user || user.banni) return res.status(404).json({ error: 'Profil introuvable.' });

  const annonces = db.read('annonces')
    .filter(a => a.auteurId === user.id && a.actif !== false && !a.suspendu)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ user: sanitizeUser(user), annonces: annonces.map(enrichirAnnonce) });
});

// PUT /api/v1/profile/modifier
router.put('/profile/modifier', authJWT, async (req, res) => {
  const { nom, whatsapp, bio, typeVendeur, ancienPassword, newPassword } = req.body;
  const user = db.findById('users', req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  const updates = {
    nom:         nom?.trim()         || user.nom,
    whatsapp:    whatsapp?.trim()    || user.whatsapp,
    bio:         bio?.trim()         || '',
    typeVendeur: typeVendeur         || 'particulier'
  };

  if (newPassword) {
    if (!ancienPassword)
      return res.status(400).json({ error: 'Saisissez votre mot de passe actuel.' });
    const valid = await bcrypt.compare(ancienPassword, user.password);
    if (!valid)
      return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
    if (newPassword.length < 6)
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
    updates.password = await bcrypt.hash(newPassword, 10);
  }

  db.update('users', req.user.id, updates);
  const updated = db.findById('users', req.user.id);
  res.json(sanitizeUser(updated));
});

// GET /api/v1/profile/annonces
router.get('/profile/annonces', authJWT, (req, res) => {
  const annonces = db.read('annonces')
    .filter(a => a.auteurId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(annonces.map(enrichirAnnonce));
});

// GET /api/v1/profile/recherches
router.get('/profile/recherches', authJWT, (req, res) => {
  const recherches = db.read('recherches')
    .filter(r => r.auteurId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(recherches);
});

// ═══════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════

// GET /api/v1/messages  — liste des conversations
router.get('/messages', authJWT, (req, res) => {
  const conversations = db.read('conversations')
    .filter(c => c.userId1 === req.user.id || c.userId2 === req.user.id)
    .sort((a, b) => {
      const da = a.dernierMessage?.date || a.dateCreation || '';
      const db_ = b.dernierMessage?.date || b.dateCreation || '';
      return new Date(db_) - new Date(da);
    });

  const enrichies = conversations.map(conv => {
    const autreUserId = conv.userId1 === req.user.id ? conv.userId2 : conv.userId1;
    const autreUser   = db.findById('users', autreUserId);
    const annonce     = db.findById('annonces', conv.annonceId);
    const msgs        = db.read('messages').filter(m => m.conversationId === conv.id);
    const nonLus      = msgs.filter(m => m.senderId !== req.user.id && !m.lu).length;

    return {
      ...conv,
      annonceTitre:  annonce?.titre || '',
      autreUserNom:  autreUser?.nom || '',
      autreUserTel:  autreUser?.telephone || '',
      nonLus
    };
  });

  res.json(enrichies);
});

// GET /api/v1/messages/conversation/:id
router.get('/messages/conversation/:id', authJWT, (req, res) => {
  const conv = db.read('conversations').find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const estParticipant = conv.userId1 === req.user.id || conv.userId2 === req.user.id;
  if (!estParticipant) return res.status(403).json({ error: 'Accès interdit.' });

  const messages = db.read('messages')
    .filter(m => m.conversationId === conv.id && !m.isDeleted)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Marquer les messages de l'autre comme lus
  const allMsgs = db.read('messages');
  let modified = false;
  allMsgs.forEach(m => {
    if (m.conversationId === conv.id && m.senderId !== req.user.id && !m.lu) {
      m.lu = true;
      modified = true;
    }
  });
  if (modified) {
    const fs = require('fs');
    const p  = require('path').join(__dirname, '../data/messages.json');
    fs.writeFileSync(p, JSON.stringify(allMsgs, null, 2));

    getIO().to(`user_${req.user.id}`).emit('messages_read', { conversationId: conv.id });
  }

  const autreUserId = conv.userId1 === req.user.id ? conv.userId2 : conv.userId1;
  const autreUser   = db.findById('users', autreUserId);
  const annonce     = db.findById('annonces', conv.annonceId);

  res.json({
    conversation: {
      ...conv,
      autreUserNom:  autreUser?.nom || '',
      annonceTitre:  annonce?.titre || '',
    },
    messages
  });
});

// POST /api/v1/messages/conversation/:id/send-audio
router.post('/messages/conversation/:id/send-audio', authJWT, (req, res) => {
  console.log("\n══════════════════════════════════════════════");
  console.log("🎤 [SEND AUDIO] Nouvelle requête reçue");
  console.log("📅 Heure :", new Date().toISOString());
  console.log("🆔 Conversation :", req.params.id);

  uploadMessages.single('audio')(req, res, async (err) => {
    if (err) {
      console.error("❌ Erreur Multer :", err.message);
      return res.status(400).json({ error: err.message });
    }

    console.log("✅ Upload Multer terminé.");

    if (!req.file) {
      console.error("❌ Aucun fichier reçu.");
      return res.status(400).json({ error: "Aucun fichier audio reçu." });
    }

    console.log("📁 Fichier reçu :");
    console.log("   - Nom original :", req.file.originalname);
    console.log("   - Nom enregistré :", req.file.filename);
    console.log("   - Taille :", req.file.size, "octets");
    console.log("   - MIME :", req.file.mimetype);

    console.log("👤 Utilisateur authentifié :", req.user.id);

    const conv = db.read('conversations').find(c => c.id === req.params.id);

    if (!conv) {
      console.error("❌ Conversation introuvable.");
      return res.status(404).json({ error: 'Conversation introuvable.' });
    }

    console.log("✅ Conversation trouvée :", conv.id);
    console.log("   Participants :", conv.userId1, "<->", conv.userId2);

    const estParticipant =
      conv.userId1 === req.user.id ||
      conv.userId2 === req.user.id;

    console.log("🔒 Vérification des droits :", estParticipant);

    if (!estParticipant) {
      console.error("❌ L'utilisateur ne fait pas partie de la conversation.");
      return res.status(403).json({ error: 'Accès interdit.' });
    }

    console.log("📦 Body reçu :", req.body);
    console.log("⏱️ Durée reçue :", req.body.duree);

    const fichierUrl = `/uploads/messages/${req.file.filename}`;
    const duree = parseInt(req.body.duree) || 0;

    console.log("🎵 Durée audio :", duree, "sec");
    console.log("📂 URL générée :", fichierUrl);

    const message = {
      id: uuidv4(),
      conversationId: conv.id,
      senderId: req.user.id,
      texte: '',
      type: 'audio',
      fichierUrl,
      dureeAudio: duree,
      date: new Date().toISOString(),
      lu: false
    };

    console.log("💾 Enregistrement du message...");

    db.insert('messages', message);

    console.log("✅ Message enregistré :", message.id);

    db.update('conversations', conv.id, {
      dernierMessage: {
        texte: '🎤 Audio',
        date: message.date,
        senderId: message.senderId
      }
    });

    console.log("✅ Conversation mise à jour.");

    getIO().to(`conv_${conv.id}`).emit('new_message', message);
    // Notifie les deux participants pour maj de leur liste de convs
    getIO().to(`user_${conv.userId1}`).emit('conversation_updated', { conversationId: conv.id });
    getIO().to(`user_${conv.userId2}`).emit('conversation_updated', { conversationId: conv.id });

    console.log("📤 Réponse 201 envoyée au client.");
    console.log("══════════════════════════════════════════════\n");

    res.status(201).json(message);
  });
});

// POST /api/v1/messages/conversation/:id/send-fichier
router.post('/messages/conversation/:id/send-media', authJWT, (req, res) => {
  console.log("api image appelée")
  uploadMessages.single('fichier')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const conv = db.read('conversations').find(c => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

    const estParticipant = conv.userId1 === req.user.id || conv.userId2 === req.user.id;
    if (!estParticipant) return res.status(403).json({ error: 'Accès interdit.' });

    const fichierUrl  = `/uploads/messages/${req.file.filename}`;
    const fichierNom  = req.file.originalname;
    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');

    const message = {
      id:             uuidv4(),
      conversationId: conv.id,
      senderId:       req.user.id,
      texte:          '',
      type: isImage ? 'image' : isVideo ? 'video' : 'fichier',
      fichierUrl,
      fichierNom,
      date:           new Date().toISOString(),
      lu:             false
    };

    db.insert('messages', message);
    db.update('conversations', conv.id, {
      dernierMessage: {
        texte: isImage ? '🖼️ Image' : isVideo ? '🎥 Vidéo' : `📎 ${fichierNom}`,
        date:     message.date,
        senderId: message.senderId
      }
    });

    getIO().to(`conv_${conv.id}`).emit('new_message', message);
    // Notifie les deux participants pour maj de leur liste de convs
    getIO().to(`user_${conv.userId1}`).emit('conversation_updated', { conversationId: conv.id });
    getIO().to(`user_${conv.userId2}`).emit('conversation_updated', { conversationId: conv.id });
    res.status(201).json(message);
  });
});

// POST /api/v1/messages/annonce/:annonceId/quick-send
// Crée (ou récupère) la conversation ET envoie le message en une seule requête
router.post('/messages/annonce/:annonceId/quick-send', authJWT, (req, res) => {
  const { texte } = req.body;
  if (!texte?.trim()) return res.status(400).json({ error: 'Le message ne peut pas être vide.' });

  const annonce = db.findById('annonces', req.params.annonceId);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (annonce.auteurId === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message.' });

  const conversations = db.read('conversations');
  let conv = conversations.find(c =>
    c.annonceId === annonce.id &&
    ((c.userId1 === req.user.id && c.userId2 === annonce.auteurId) ||
     (c.userId2 === req.user.id && c.userId1 === annonce.auteurId))
  );

  if (!conv) {
    conv = {
      id:            uuidv4(),
      annonceId:     annonce.id,
      userId1:       req.user.id,
      userId2:       annonce.auteurId,
      dernierMessage: { texte: '', date: '', senderId: '' },
      dateCreation:  new Date().toISOString()
    };
    db.insert('conversations', conv);
  }

  const message = {
    id:             uuidv4(),
    conversationId: conv.id,
    senderId:       req.user.id,
    texte:          texte.trim(),
    date:           new Date().toISOString(),
    lu:             false
  };
  db.insert('messages', message);

  db.update('conversations', conv.id, {
    dernierMessage: { texte: message.texte, date: message.date, senderId: message.senderId }
  });

  // ⬇️ AJOUT
  envoyerNotificationMessage(annonce.auteurId, message.texte, req.user.nom, conv.id);

  res.status(201).json({ conversation: conv, message });
});

// POST /api/v1/messages/conversation/:id/read
router.post('/messages/conversation/:id/read', authJWT, (req, res) => {
  const conv = db.read('conversations').find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const estParticipant = conv.userId1 === req.user.id || conv.userId2 === req.user.id;
  if (!estParticipant) return res.status(403).json({ error: 'Accès interdit.' });

  const allMsgs = db.read('messages');
  let modified = false;
  allMsgs.forEach(m => {
    if (m.conversationId === conv.id && m.senderId !== req.user.id && !m.lu) {
      m.lu = true;
      modified = true;
    }
  });

  if (modified) {
    const fs = require('fs');
    const p = require('path').join(__dirname, '../data/messages.json');
    fs.writeFileSync(p, JSON.stringify(allMsgs, null, 2));
    getIO().to(`user_${req.user.id}`).emit('messages_read', { conversationId: conv.id });
  }

  res.json({ success: true });
});

// DELETE /api/v1/messages/:id
router.delete('/messages/:id', authJWT, (req, res) => {
  const allMsgs = db.read('messages');
  const msg = allMsgs.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Message introuvable.' });
  if (msg.senderId !== req.user.id) return res.status(403).json({ error: 'Accès interdit.' });

  const fs = require('fs');
  const p  = require('path').join(__dirname, '../data/messages.json');
  msg.isDeleted = true;
  fs.writeFileSync(p, JSON.stringify(allMsgs, null, 2));

  res.json({ success: true });
});

// POST /api/v1/messages/annonce/:annonceId  — démarrer/récupérer une conv
router.post('/messages/annonce/:annonceId', authJWT, (req, res) => {
  const annonce = db.findById('annonces', req.params.annonceId);
  if (!annonce) return res.status(404).json({ error: 'Annonce introuvable.' });
  if (annonce.auteurId === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas vous envoyer un message.' });

  const conversations = db.read('conversations');
  let conv = conversations.find(c =>
    c.annonceId === annonce.id &&
    ((c.userId1 === req.user.id && c.userId2 === annonce.auteurId) ||
     (c.userId2 === req.user.id && c.userId1 === annonce.auteurId))
  );

  if (!conv) {
    conv = {
      id:            uuidv4(),
      annonceId:     annonce.id,
      userId1:       req.user.id,
      userId2:       annonce.auteurId,
      dernierMessage: { texte: '', date: '', senderId: '' },
      dateCreation:  new Date().toISOString()
    };
    db.insert('conversations', conv);
  }

  res.status(201).json(conv);
});

// POST /api/v1/messages/conversation/:id/send
router.post('/messages/conversation/:id/send', authJWT, (req, res) => {
  const { texte } = req.body;
  if (!texte?.trim()) return res.status(400).json({ error: 'Le message ne peut pas être vide.' });

  const conv = db.read('conversations').find(c => c.id === req.params.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });

  const estParticipant = conv.userId1 === req.user.id || conv.userId2 === req.user.id;
  if (!estParticipant) return res.status(403).json({ error: 'Accès interdit.' });

  const message = {
    id:             uuidv4(),
    conversationId: conv.id,
    senderId:       req.user.id,
    texte:          texte.trim(),
    date:           new Date().toISOString(),
    lu:             false
  };

  db.insert('messages', message);

  db.update('conversations', conv.id, {
    dernierMessage: { texte: message.texte, date: message.date, senderId: message.senderId }
  });

  // ⬇️ AJOUT : notifie le destinataire
  const destinataireId = conv.userId1 === req.user.id ? conv.userId2 : conv.userId1;
  envoyerNotificationMessage(destinataireId, message.texte, req.user.nom, conv.id);

  // Émettre le message en temps réel à tous les membres de la conv
  getIO().to(`conv_${conv.id}`).emit('new_message', message);
  // Notifie les deux participants pour maj de leur liste de convs
  getIO().to(`user_${conv.userId1}`).emit('conversation_updated', { conversationId: conv.id });
  getIO().to(`user_${conv.userId2}`).emit('conversation_updated', { conversationId: conv.id });
  res.status(201).json(message);
});

module.exports = router;
