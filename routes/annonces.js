const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../utils/db');
const { isAuthenticated } = require('../middleware/auth');

const TYPES_BIEN = [
  'Maison', 'Appartement', 'Appartement meublé',
  'Studio', 'Studio meublé', 'Chambre',
  'Boutique', 'Magasin', 'Bureau', 'Terrain'
];

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
  let annonces = db.read('annonces').filter(a => a.actif !== false);

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
    typesBien: ['Maison','Appartement','Appartement meublé','Studio','Studio meublé','Chambre','Boutique','Magasin','Bureau','Terrain']
  });
});


// GET /annonces/create
router.get('/creer', isAuthenticated, (req, res) => {
  res.render('annonces/create', { error: null, typesBien: TYPES_BIEN });
});

// POST /annonces/create
router.post('/creer', isAuthenticated, upload.array('photos', 10), (req, res) => {
  const {
    titre, description, typeBien, ville, quartier,
    loyer, moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  } = req.body;

  // ─── Validation : tous les champs sont obligatoires ────────────
  const champsObligatoires = {
    titre, description, typeBien, ville, quartier,
    loyer, moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  };

  for (const [champ, valeur] of Object.entries(champsObligatoires)) {
    if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
      return res.render('annonces/create', {
        error: 'Tous les champs sont obligatoires.',
        typesBien: TYPES_BIEN
      });
    }
  }

  if (!req.files || req.files.length === 0) {
    return res.render('annonces/create', {
      error: 'Veuillez ajouter au moins une photo.',
      typesBien: TYPES_BIEN
    });
  }

  const photos = req.files.map(f => `/uploads/annonces/${f.filename}`);

  const annonce = {
    id: uuidv4(),
    titre: titre.trim(),
    description: description.trim(),
    typeBien,
    ville: ville.trim(),
    quartier: quartier.trim(),
    loyer: parseInt(loyer),
    moisAvance: parseInt(moisAvance) || 0,
    cautionEau: parseInt(cautionEau) || 0,
    cautionElec: parseInt(cautionElec) || 0,
    commissionDemarcheur: parseInt(commissionDemarcheur) || 0,
    nbPieces: parseInt(nbPieces) || 0,
    nbChambres: parseInt(nbChambres) || 0,
    nbSalons: parseInt(nbSalons) || 0,
    nbDouches: parseInt(nbDouches) || 0,
    nbCuisines: parseInt(nbCuisines) || 0,
    electriciteType,
    electriciteCompteur,
    eauType,
    photos,
    auteurId: req.session.user.id,
    auteurNom: req.session.user.nom,
    auteurTelephone: req.session.user.telephone,
    enAvant: false,
    actif: true,
    createdAt: new Date().toISOString()
  };

  db.insert('annonces', annonce);
  res.redirect(`/annonces/${annonce.id}`);
});

// GET /annonces/:id - détail
router.get('/:id', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce || annonce.actif === false) return res.status(404).render('404');
  res.render('annonces/details', { annonce });
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

  const newPhotos = req.files ? req.files.map(f => `/uploads/annonces/${f.filename}`) : [];
  const keepPhotos = annonce.photos || [];

  const updates = {
    titre: req.body.titre.trim(),
    description: req.body.description.trim(),
    typeBien: req.body.typeBien,
    ville: req.body.ville.trim(),
    quartier: req.body.quartier.trim(),
    loyer: parseInt(req.body.loyer),
    moisAvance: parseInt(req.body.moisAvance) || 0,
    cautionEau: parseInt(req.body.cautionEau) || 0,
    cautionElec: parseInt(req.body.cautionElec) || 0,
    commissionDemarcheur: parseInt(req.body.commissionDemarcheur) || 0,
    nbPieces: parseInt(req.body.nbPieces) || 0,
    nbChambres: parseInt(req.body.nbChambres) || 0,
    nbSalons: parseInt(req.body.nbSalons) || 0,
    nbDouches: parseInt(req.body.nbDouches) || 0,
    nbCuisines: parseInt(req.body.nbCuisines) || 0,
    photos: [...keepPhotos, ...newPhotos].slice(0, 10),
    updatedAt: new Date().toISOString()
  };

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

module.exports = router;
