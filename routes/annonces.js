const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');
const { isAuthenticated } = require('../middleware/auth');

const { validateAnnonce, buildAnnonce, TYPES_BIEN } = require('../utils/validateAnnonce');

// Config multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/annonces'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Seules les images JPG, PNG et WEBP sont acceptées.'));
    }
  }
});

// GET /annonces - liste avec filtres
router.get('/', (req, res) => {
  const { ville, quartier, typeBien, prixMin, prixMax, q } = req.query;
  let annonces = db.read('annonces').filter(a => a.actif !== false && !a.suspendu);

  if (ville) annonces = annonces.filter(a => a.ville.toLowerCase().includes(ville.toLowerCase()));
  if (quartier) annonces = annonces.filter(a => a.quartier.toLowerCase().includes(quartier.toLowerCase()));
  if (typeBien) annonces = annonces.filter(a => a.typeBien === typeBien);
  if (prixMin) annonces = annonces.filter(a => a.loyer >= parseInt(prixMin));
  if (prixMax) annonces = annonces.filter(a => a.loyer <= parseInt(prixMax));
  if (q) annonces = annonces.filter(a =>
    a.titre.toLowerCase().includes(q.toLowerCase()) ||
    a.description.toLowerCase().includes(q.toLowerCase())
  );

  annonces.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('annonces/list', {
    annonces,
    filtres: req.query,
    typesBien: TYPES_BIEN
  });
});


// GET /annonces/create
router.get('/creer', isAuthenticated, (req, res) => {
  res.render('annonces/create', { error: null, typesBien: TYPES_BIEN });
});

// POST /annonces/create
router.post('/creer', isAuthenticated, upload.array('photos', 10), (req, res) => {
  const erreur = validateAnnonce(req.body);
  if (erreur) return res.render('annonces/create', { error: erreur, typesBien: TYPES_BIEN });

  if (!req.files || req.files.length === 0) {
    return res.render('annonces/create', { error: 'Veuillez ajouter au moins une photo.', typesBien: TYPES_BIEN });
  }

  const photos = req.files.map(f => `/uploads/annonces/${f.filename}`);
  const annonce = buildAnnonce(req.body, photos, {
    id: uuidv4(),
    auteurId: req.session.user.id,
    auteurNom: req.session.user.nom,
    auteurTelephone: req.session.user.telephone,
    enAvant: false,
    actif: true,
    createdAt: new Date().toISOString()
  });

  db.insert('annonces', annonce);
  res.redirect(`/annonces/${annonce.id}`);
});

// GET /annonces/:id - détail
router.get('/:id', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce || annonce.actif === false || annonce.suspendu) return res.status(404).render('404');

  const auteur = db.findById('users', annonce.auteurId);
  const whatsapp = auteur?.whatsapp || annonce.auteurTelephone;

  res.render('annonces/details', { annonce, whatsapp });
});

// GET /annonces/:id/edit
router.get('/:id/edit', isAuthenticated, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).render('403');
  }
  res.render('annonces/edit', { annonce, error: null, typesBien: TYPES_BIEN });
});

// POST /annonces/:id/edit
router.post('/:id/edit', isAuthenticated, upload.array('photos', 10), (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).render('403');
  }

  const erreur = validateAnnonce(req.body);
  if (erreur) return res.render('annonces/edit', { annonce, error: erreur, typesBien: TYPES_BIEN });

  const newPhotos = req.files ? req.files.map(f => `/uploads/annonces/${f.filename}`) : [];
  const photosExistantes = Array.isArray(req.body.photosExistantes)
    ? req.body.photosExistantes
    : req.body.photosExistantes ? [req.body.photosExistantes] : [];
  const photos = [...photosExistantes, ...newPhotos].slice(0, 10);

  if (photos.length === 0) {
    return res.render('annonces/edit', { annonce, error: 'L\'annonce doit avoir au moins une photo.', typesBien: TYPES_BIEN });
  }

  const updates = buildAnnonce(req.body, photos, { updatedAt: new Date().toISOString() });
  db.update('annonces', req.params.id, updates);
  res.redirect(`/annonces/${req.params.id}`);
});

// POST /annonces/:id/delete
router.post('/:id/delete', isAuthenticated, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).render('403');
  }

  db.update('annonces', req.params.id, { actif: false });
  res.redirect('/profile/annonces');
});

// POST /annonces/:id/toggle — activer ou désactiver (utilisateur)
router.post('/:id/toggle', isAuthenticated, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id) return res.status(403).render('403');

  // Un utilisateur ne peut pas réactiver une annonce suspendue par un admin
  if (annonce.suspendu && !annonce.actif) {
    req.session.error = 'Cette annonce a été suspendue par un administrateur. Vous ne pouvez pas la réactiver.';
    return res.redirect('/profile/annonces');
  }

  db.update('annonces', req.params.id, { actif: !annonce.actif });
  req.session.success = annonce.actif ? 'Annonce désactivée.' : 'Annonce activée.';
  res.redirect('/profile/annonces');
});

module.exports = router;
