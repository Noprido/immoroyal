const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const db = require('../utils/db');
const { isAuthenticated } = require('../middleware/auth');

const PQueue = require('p-queue').default;
// File d'attente : 2 conversions ffmpeg max en simultané, tout le reste attend
const ffmpegQueue = new PQueue({ concurrency: 2 });
// Timeout en millisecondes pour une conversion ffmpeg
const FFMPEG_TIMEOUT_MS = 30 * 1000; // 30 secondes

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const {
  validateAnnonce, buildAnnonce,
  TYPES_BIEN, TYPES_VENTE_DEFAUT, DUREES_LOCATION,
  STANDINGS, CATEGORIES, escapeForScript,
  getLabelPrix, getLabelDuree, getPrixAffiche
} = require('../utils/validateAnnonce');

// ─── Config Multer (photos + vidéos) ─────────────────────────────
const ALLOWED_MIME = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/annonces')),
    filename: (req, file, cb) => {
      const ext = ALLOWED_MIME[file.mimetype];
      cb(null, `${uuidv4()}${ext}`); // extension imposée par le serveur, pas par le client
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new Error('Type de fichier non autorisé.'));
  }
});

// Helper : séparer photos et vidéos depuis req.files
// Classification basée sur le mimetype validé par fileFilter, jamais sur
// l'extension du nom de fichier original (originalname), qui est une donnée
// non fiable entièrement contrôlée par le client.
async function separerMedias(files) {
  const photos = [];
  const videos = [];

  for (const f of (files || [])) {
    const url = `/uploads/annonces/${f.filename}`;
    const estVideo = f.mimetype.startsWith('video/');

    if (estVideo) {
      videos.push(url);
      // Générer miniature jpg de la première frame
      const thumbFilename = `thumb_${f.filename.replace(/\.[^.]+$/, '.jpg')}`;
      try {
        await ffmpegQueue.add(() => genererMiniature(f.filename, thumbFilename));
        photos.unshift(`/uploads/annonces/${thumbFilename}`);
      } catch (e) {
        console.error('Erreur génération miniature:', e.message);
        // On continue sans miniature plutôt que de faire échouer tout l'upload
      }
    } else {
      photos.push(url);
    }
  }

  return { photos, videos };
}

function genererMiniature(filename, thumbFilename) {
  return new Promise((resolve, reject) => {
    const inputPath = path.join(__dirname, '../uploads/annonces', filename);
    const command = ffmpeg(inputPath)
      .screenshots({
        timestamps: ['00:00:01'],
        filename: thumbFilename,
        folder: path.join(__dirname, '../uploads/annonces'),
      })
      .on('end', () => {
        clearTimeout(timer);
        resolve();
      })
      .on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

    // Timeout manuel : ffmpeg n'a pas d'option timeout native pour .screenshots()
    const timer = setTimeout(() => {
      command.kill('SIGKILL'); // tue le process ffmpeg sous-jacent
      reject(new Error(`Timeout ffmpeg dépassé (${FFMPEG_TIMEOUT_MS}ms) pour ${filename}`));
    }, FFMPEG_TIMEOUT_MS);
  });
}

// Helper : valider les contraintes médias
function validerMedias(photosTotal, videosTotal) {
  if (photosTotal + videosTotal === 0) return 'Veuillez ajouter au moins un média (photo ou vidéo).';
  if (videosTotal > 3) return 'Maximum 3 vidéos par annonce.';
  if (photosTotal + videosTotal > 10) return 'Le total de médias (photos + vidéos) ne peut pas dépasser 10.';
  return null;
}

// ─── GET /annonces ────────────────────────────────────────────────
router.get('/', (req, res) => {
  const { ville, quartier, typeBien, typeTransaction, prixMin, prixMax, q } = req.query;
  let annonces = db.read('annonces').filter(a => a.actif !== false && !a.suspendu);

  if (ville) annonces = annonces.filter(a => a.ville.toLowerCase().includes(ville.toLowerCase()));
  if (quartier) annonces = annonces.filter(a => a.quartier.toLowerCase().includes(quartier.toLowerCase()));
  if (typeBien) annonces = annonces.filter(a => a.typeBien === typeBien);
  if (typeTransaction) annonces = annonces.filter(a => (a.typeTransaction || 'location') === typeTransaction);
  if (prixMin) annonces = annonces.filter(a => getPrixAffiche(a) >= parseInt(prixMin));
  if (prixMax) annonces = annonces.filter(a => getPrixAffiche(a) <= parseInt(prixMax));
  if (q) annonces = annonces.filter(a =>
    a.titre.toLowerCase().includes(q.toLowerCase()) ||
    (a.description || '').toLowerCase().includes(q.toLowerCase())
  );

  annonces.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('annonces/list', {
    annonces, filtres: req.query,
    typesBien: TYPES_BIEN,
    getPrixAffiche, getLabelDuree
  });
});

// ─── GET /annonces/creer ──────────────────────────────────────────
router.get('/creer', isAuthenticated, (req, res) => {
  res.render('annonces/create', {
    error: null,
    typesBien: TYPES_BIEN,
    typesVenteDefaut: TYPES_VENTE_DEFAUT,
    dureesLocation: DUREES_LOCATION,
    categories: CATEGORIES,
    standings: STANDINGS
  });
});

// ─── POST /annonces/creer ─────────────────────────────────────────
router.post('/creer', isAuthenticated, (req, res) => {
  upload.array('medias', 10)(req, res, async (err) => {

    if (err) return res.render('annonces/create', {
      error: err.message, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    await processCreate();

  });

  async function processCreate() {
    const erreur = validateAnnonce(req.body);
    if (erreur) return res.render('annonces/create', {
      error: erreur, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    const { photos, videos } = await separerMedias(req.files);
    const erreurMedias = validerMedias(photos.length, videos.length);
    if (erreurMedias) return res.render('annonces/create', {
      error: erreurMedias, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    const annonce = buildAnnonce(req.body, { photos, videos }, {
      id: uuidv4(),
      auteurId: req.session.user.id,
      auteurNom: req.session.user.nom,
      auteurTelephone: req.session.user.telephone,
      enAvant: false,
      actif: true,
      suspendu: false,
      createdAt: new Date().toISOString()
    });

    db.insert('annonces', annonce);
    req.session.success = 'Votre annonce a été publiée avec succès !';
    res.redirect(`/annonces/${annonce.id}`);
  }


});

// ─── GET /annonces/:id ────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce || annonce.actif === false || annonce.suspendu) return res.status(404).render('404');

  const auteur = db.findById('users', annonce.auteurId);
  const whatsapp = auteur?.whatsapp || annonce.auteurTelephone;

  res.render('annonces/details', {
    annonce, whatsapp,
    escapeForScript,
    labelPrix: getLabelPrix(annonce),
    labelDuree: getLabelDuree(annonce),
    prixAffiche: getPrixAffiche(annonce)
  });
});

// ─── GET /annonces/:id/edit ───────────────────────────────────────
router.get('/:id/edit', isAuthenticated, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).render('403');
  }
  res.render('annonces/edit', {
    annonce, error: null,
    typesBien: TYPES_BIEN,
    typesVenteDefaut: TYPES_VENTE_DEFAUT,
    dureesLocation: DUREES_LOCATION,
    categories: CATEGORIES,
    standings: STANDINGS
  });
});



// ─── POST /annonces/:id/edit ──────────────────────────────────────
router.post('/:id/edit', isAuthenticated, (req, res) => {

  upload.array('medias', 10)(req, res, async (err) => {

    if (err) return res.render('annonces/edit', {
      annonce: db.findById('annonces', req.params.id),
      error: err.message, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    await processUpdate();
  });

  async function processUpdate() {

    const annonce = db.findById('annonces', req.params.id);
    if (!annonce) return res.status(404).render('404');
    if (annonce.auteurId !== req.session.user.id && req.session.user.role !== 'admin') {
      return res.status(403).render('403');
    }

    const erreur = validateAnnonce(req.body);
    if (erreur) return res.render('annonces/edit', {
      annonce, error: erreur, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    // Médias nouveaux
    const { photos: newPhotos, videos: newVideos } = await separerMedias(req.files);

    // Whitelist des médias réellement existants sur CETTE annonce :
    // req.body.photosExistantes/videosExistantes viennent du client et ne
    // doivent jamais être acceptés tels quels — on ne garde que ce qui
    // appartenait déjà réellement à l'annonce en base.
    const photosAutorisees = new Set(annonce.photos || []);
    const videosAutorisees = new Set(annonce.videos || []);

    const photosExistantesRaw = Array.isArray(req.body.photosExistantes)
      ? req.body.photosExistantes
      : req.body.photosExistantes ? [req.body.photosExistantes] : [];
    const photosExistantes = photosExistantesRaw.filter(p => photosAutorisees.has(p));

    const videosExistantesRaw = Array.isArray(req.body.videosExistantes)
      ? req.body.videosExistantes
      : req.body.videosExistantes ? [req.body.videosExistantes] : [];
    const videosExistantes = videosExistantesRaw.filter(v => videosAutorisees.has(v));

    const photosFinales = [...photosExistantes, ...newPhotos];
    const videosFinales = [...videosExistantes, ...newVideos];

    const erreurMedias = validerMedias(photosFinales.length, videosFinales.length);
    if (erreurMedias) return res.render('annonces/edit', {
      annonce, error: erreurMedias, typesBien: TYPES_BIEN,
      typesVenteDefaut: TYPES_VENTE_DEFAUT, dureesLocation: DUREES_LOCATION,
      categories: CATEGORIES,
      standings: STANDINGS
    });

    const updates = buildAnnonce(req.body, {
      photos: photosFinales,
      videos: videosFinales
    }, { updatedAt: new Date().toISOString() });

    db.update('annonces', req.params.id, updates);
    req.session.success = 'Annonce mise à jour avec succès.';
    res.redirect(`/annonces/${req.params.id}`);

  }


});

// ─── POST /annonces/:id/toggle ────────────────────────────────────
router.post('/:id/toggle', isAuthenticated, (req, res) => {
  const annonce = db.findById('annonces', req.params.id);
  if (!annonce) return res.status(404).render('404');
  if (annonce.auteurId !== req.session.user.id) return res.status(403).render('403');

  if (annonce.suspendu && !annonce.actif) {
    req.session.error = 'Cette annonce a été suspendue par un administrateur. Vous ne pouvez pas la réactiver.';
    return res.redirect('/profile/annonces');
  }

  db.update('annonces', req.params.id, { actif: !annonce.actif });
  req.session.success = annonce.actif ? 'Annonce désactivée.' : 'Annonce activée.';
  res.redirect('/profile/annonces');
});

// ─── POST /annonces/:id/delete ────────────────────────────────────
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
