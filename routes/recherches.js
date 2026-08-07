const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../utils/db');
const { isAuthenticated } = require('../middleware/auth');
const { TYPES_BIEN, DUREES_LOCATION } = require('../utils/validateAnnonce');

const TYPES_BIEN_RECHERCHE = [...TYPES_BIEN, 'Autre'];

//  GET - /recherches
router.get('/', (req, res) => {
  const { ville, typeBien, typeTransaction, fondsDisponibles } = req.query;
  let recherches = db.read('recherches').filter(r => r.actif !== false);

  if (ville) recherches = recherches.filter(r =>
    !r.localisation.importe && r.localisation.ville.toLowerCase().includes(ville.toLowerCase())
  );
  if (typeBien) recherches = recherches.filter(r => r.typeBien === typeBien);
  if (typeTransaction) recherches = recherches.filter(r => r.typeTransaction === typeTransaction);
  if (fondsDisponibles) recherches = recherches.filter(r => r.fondsDisponibles === true);

  recherches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('recherches/list', {
    recherches,
    filtres: req.query,
    typesBien: TYPES_BIEN_RECHERCHE
  });
});

//  GET - /recherches/creer
router.get('/creer', isAuthenticated, (req, res) => {
  res.render('recherches/create', {
    error: null,
    typesBien: TYPES_BIEN_RECHERCHE,
    dureesLocation: DUREES_LOCATION
  });
});

//  POST - /recherches/creer
router.post('/creer', isAuthenticated, (req, res) => {
  const {
    titre, typeBien, autreTypeBien, typeTransaction,
    localisationImporte, ville, quartier,
    budgetMax, dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    fondsDisponibles, description
  } = req.body;

  if (!titre || !typeBien || !typeTransaction || !budgetMax) {
    return res.render('recherches/create', {
      error: 'Veuillez remplir tous les champs obligatoires.',
      typesBien: TYPES_BIEN_RECHERCHE,
      dureesLocation: DUREES_LOCATION
    });
  }
  if (typeBien === 'Autre' && !autreTypeBien?.trim()) {
    return res.render('recherches/create', {
      error: 'Précisez le type de bien recherché.',
      typesBien: TYPES_BIEN_RECHERCHE,
      dureesLocation: DUREES_LOCATION
    });
  }
  const importe = localisationImporte === 'on';
  if (!importe && !ville?.trim()) {
    return res.render('recherches/create', {
      error: 'Indiquez une ville ou cochez "La localisation m\'importe peu".',
      typesBien: TYPES_BIEN_RECHERCHE,
      dureesLocation: DUREES_LOCATION
    });
  }

  const auteur = db.findById('users', req.session.user.id);
  const recherche = {
    id: uuidv4(),
    titre: titre.trim(),
    description: description?.trim() || '',
    typeBien,
    autreTypeBien: typeBien === 'Autre' ? autreTypeBien.trim() : '',
    typeTransaction,
    localisation: {
      importe,
      ville: importe ? '' : ville.trim(),
      quartier: importe ? '' : (quartier?.trim() || '')
    },
    budgetMax: parseInt(budgetMax) || 0,
    dureeLocation: typeTransaction === 'location' ? (dureeLocation || 'mois') : '',
    nbChambres: parseInt(nbChambres) || 0,
    nbSalons: parseInt(nbSalons) || 0,
    nbDouches: parseInt(nbDouches) || 0,
    nbCuisines: parseInt(nbCuisines) || 0,
    fondsDisponibles: fondsDisponibles === 'on',
    auteurId: req.session.user.id,
    auteurNom: req.session.user.nom,
    auteurTelephone: req.session.user.telephone,
    auteurWhatsapp: auteur?.whatsapp || req.session.user.telephone,
    actif: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  db.insert('recherches', recherche);
  req.session.success = 'Votre recherche a été publiée !';
  res.redirect(`/recherches/${recherche.id}`);
});

//  GET - /recherches/:id
router.get('/:id', (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche || recherche.actif === false) return res.status(404).render('404');
  res.render('recherches/details', { recherche });
});

//  GET - /recherches/:id/edit
router.get('/:id/edit', isAuthenticated, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).render('404');
  if (recherche.auteurId !== req.session.user.id) return res.status(403).render('403');
  res.render('recherches/edit', {
    recherche, error: null,
    typesBien: TYPES_BIEN_RECHERCHE,
    dureesLocation: DUREES_LOCATION
  });
});

//  POST - /recherches/:id/edit
router.post('/:id/edit', isAuthenticated, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).render('404');
  if (recherche.auteurId !== req.session.user.id) return res.status(403).render('403');

  const {
    titre, typeBien, autreTypeBien, typeTransaction,
    localisationImporte, ville, quartier,
    budgetMax, dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    fondsDisponibles, description
  } = req.body;

  const importe = localisationImporte === 'on';

  db.update('recherches', req.params.id, {
    titre: titre.trim(),
    description: description?.trim() || '',
    typeBien,
    autreTypeBien: typeBien === 'Autre' ? autreTypeBien?.trim() : '',
    typeTransaction,
    localisation: {
      importe,
      ville: importe ? '' : ville?.trim() || '',
      quartier: importe ? '' : quartier?.trim() || ''
    },
    budgetMax: parseInt(budgetMax) || 0,
    dureeLocation: typeTransaction === 'location' ? (dureeLocation || 'mois') : '',
    nbChambres: parseInt(nbChambres) || 0,
    nbSalons: parseInt(nbSalons) || 0,
    nbDouches: parseInt(nbDouches) || 0,
    nbCuisines: parseInt(nbCuisines) || 0,
    fondsDisponibles: fondsDisponibles === 'on',
    updatedAt: new Date().toISOString()
  });

  req.session.success = 'Recherche mise à jour.';
  res.redirect(`/recherches/${req.params.id}`);
});

//  POST - /recherches/:id/toggle
router.post('/:id/toggle', isAuthenticated, (req, res) => {
  const recherche = db.findById('recherches', req.params.id);
  if (!recherche) return res.status(404).render('404');
  if (recherche.auteurId !== req.session.user.id) return res.status(403).render('403');
  db.update('recherches', req.params.id, { actif: !recherche.actif });
  req.session.success = recherche.actif ? 'Recherche désactivée.' : 'Recherche activée.';
  res.redirect('/profile/recherches');
});




module.exports = router;