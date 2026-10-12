/**
 * ImmoRoyal — API Gestion Immobilière
 * Monté dans routes/api.js : router.use('/gestion', require('./gestion'));
 * → tous les endpoints sont sous /api/v1/gestion/... et exigent un JWT.
 *
 * Collections JSON : groupes, biens, baux, paiements
 * (paiements est seulement LU ici ; il sera écrit à l'étape 7).
 * Indépendant des collections annonces / recherches.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const db = require('../utils/db');
const { authJWT } = require('../middleware/jwt');

const router = express.Router();
router.use(authJWT);

const ID_LEN = 6; // longueur du code dans #IR-XXXXXX

// ─── Helpers génériques ───────────────────────────────────────────

const safe = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (e) { res.status(500).json({ error: e.message }); }
};

const parDateDesc = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function jourDansMois(annee, mois, jour) {
  const dernier = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate();
  return Math.min(jour, dernier);
}

function cleMois(annee, mois) {
  return `${annee}-${String(mois + 1).padStart(2, '0')}`;
}

// ─── ID ImmoRoyal & recherche utilisateur ─────────────────────────

// #IR-XXXXXX dérivé de l'id utilisateur (pas de migration nécessaire).
const monIdDe = (userId) =>
  `#IR-${String(userId).replace(/-/g, '').slice(0, ID_LEN).toUpperCase()}`;

const chiffres = (s) => String(s || '').replace(/\D/g, '');

// Compare les 8 derniers chiffres : couvre "97000000", "+22997000000", "0197000000".
function memeTelephone(a, b) {
  const x = chiffres(a), y = chiffres(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
}

function masquerTel(tel) {
  const d = chiffres(tel);
  return d.length < 4 ? '••••' : `••••••${d.slice(-2)}`;
}

/** Résout une saisie "#IR-XXXXXX" ou "numéro de téléphone" en UN utilisateur (correspondance exacte). */
function resoudreUtilisateur(saisie) {
  const q = String(saisie || '').trim();
  if (!q) return { status: 400, erreur: 'Saisissez un ID ImmoRoyal ou un numéro de téléphone.' };

  const users = db.read('users').filter(u => !u.banni);
  let trouves;

  if (/^#?IR-/i.test(q)) {
    const code = q.replace(/^#?IR-/i, '').toUpperCase();
    trouves = users.filter(u => monIdDe(u.id) === `#IR-${code}`);
  } else {
    trouves = users.filter(u => memeTelephone(u.telephone, q));
  }

  if (trouves.length === 0) return { status: 404, erreur: 'Aucun utilisateur trouvé.' };
  if (trouves.length > 1)   return { status: 409, erreur: 'Plusieurs comptes correspondent. Utilisez le numéro de téléphone.' };
  return { user: trouves[0] };
}

// ─── Statut du loyer (calculé, jamais stocké) ─────────────────────

/**
 * Règles :
 *  - pas de locataire → 'sans_locataire'
 *  - locataire sans bail → 'a_jour' (rien à comparer)
 *  - sinon on parcourt les échéances depuis le début du suivi
 *    (max(début du bail, date de liaison)) ; la 1re échéance passée
 *    sans paiement 'paye' met le bien 'en_retard' (jours depuis cette échéance).
 *  Une échéance est "en retard" à partir du lendemain de sa date.
 */
function calculerStatut(bien, bail, ctx) {
  if (!bien.locataireId) return { statutLoyer: 'sans_locataire', joursRetard: null };
  if (!bail)             return { statutLoyer: 'a_jour', joursRetard: null };

  const payes = new Set(
    ctx.paiements
      .filter(p => p.bienId === bien.id && p.statut === 'paye')
      .map(p => p.moisConcerne)
  );

  const now = new Date();
  const aujourdhui = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const debutBail = new Date(bail.dateDebut);
  const lie = bien.locataireLieLe ? new Date(bien.locataireLieLe) : debutBail;
  const debut = lie > debutBail ? lie : debutBail;
  const fin = bail.dateFin ? new Date(bail.dateFin) : null;

  let annee = debut.getUTCFullYear();
  let mois = debut.getUTCMonth();

  // Échéance du mois de départ déjà passée à cette date → on commence le mois suivant
  if (debut.getUTCDate() > jourDansMois(annee, mois, bail.jourEcheance)) {
    mois++;
    if (mois > 11) { mois = 0; annee++; }
  }

  let premierImpaye = null;
  for (let garde = 0; garde < 120; garde++) {
    const echeance = Date.UTC(annee, mois, jourDansMois(annee, mois, bail.jourEcheance));
    if (echeance >= aujourdhui) break;
    if (fin && echeance > fin.getTime()) break;
    if (!payes.has(cleMois(annee, mois))) { premierImpaye = echeance; break; }
    mois++;
    if (mois > 11) { mois = 0; annee++; }
  }

  if (premierImpaye === null) return { statutLoyer: 'a_jour', joursRetard: null };
  return {
    statutLoyer: 'en_retard',
    joursRetard: Math.floor((aujourdhui - premierImpaye) / 86400000)
  };
}

// ─── DTO (forme attendue par les modèles Flutter) ─────────────────

function chargerContexte() {
  return {
    baux:      db.read('baux'),
    paiements: db.read('paiements'),
    users:     db.read('users')
  };
}

function toBienDto(bien, ctx) {
  const bail = ctx.baux
    .filter(b => b.bienId === bien.id)
    .sort(parDateDesc)[0] || null;
  const locataire = bien.locataireId
    ? ctx.users.find(u => u.id === bien.locataireId)
    : null;
  const { statutLoyer, joursRetard } = calculerStatut(bien, bail, ctx);

  return {
    id:              bien.id,
    groupeId:        bien.groupeId,
    nom:             bien.nom,
    adresse:         bien.adresse,
    ville:           bien.ville,
    quartier:        bien.quartier || null,
    typeBien:        bien.typeBien,
    proprietaireNom: bien.proprietaireNom || null,
    locataireId:     bien.locataireId || null,
    locataireNom:    locataire ? locataire.nom : null,
    locataireTel:    locataire ? locataire.telephone : null,
    bail,
    statutLoyer,
    joursRetard,
    createdAt:       bien.createdAt
  };
}

function toGroupeDto(groupe, biens) {
  return {
    id:          groupe.id,
    nom:         groupe.nom,
    description: groupe.description || null,
    gerantId:    groupe.gerantId,
    biensIds:    biens.filter(b => b.groupeId === groupe.id).map(b => b.id),
    createdAt:   groupe.createdAt
  };
}

// ─── Notifications ────────────────────────────────────────────────

function notifier(userId, type, titre, message, bienId = null) {
  if (!userId) return;
  db.insert('notifications', {
    id: uuidv4(), userId, type, titre, message, bienId,
    lue: false, createdAt: new Date().toISOString()
  });
}

// ─── Accès à un bien (gérant ou locataire) ────────────────────────

function bienAccessible(req, id) {
  const bien = db.findById('biens', id);
  if (!bien) return null;
  if (bien.gerantId !== req.user.id && bien.locataireId !== req.user.id) return null;
  return bien;
}

// ─── Limiteur de débit (recherche d'utilisateur) ──────────────────

const tentativesRecherche = new Map();
function limiterRecherche(req, res, next) {
  const cle = req.user.id;
  const maintenant = Date.now();
  const recentes = (tentativesRecherche.get(cle) || []).filter(t => maintenant - t < 60000);
  if (recentes.length >= 15)
    return res.status(429).json({ error: 'Trop de recherches. Réessayez dans une minute.' });
  recentes.push(maintenant);
  tentativesRecherche.set(cle, recentes);
  next();
}

// ─── Historique des loyers (échéances calculées + paiements) ──────

function construireHistorique(bien, bail, paiements) {
  if (!bien.locataireId || !bail) return [];

  const payes = new Map(
    paiements
      .filter(p => p.bienId === bien.id && p.statut === 'paye')
      .map(p => [p.moisConcerne, p])
  );

  const now = new Date();
  const aujourdhui = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const finMoisCourant = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0);

  const debutBail = new Date(bail.dateDebut);
  const lie = bien.locataireLieLe ? new Date(bien.locataireLieLe) : debutBail;
  const debut = lie > debutBail ? lie : debutBail;
  const fin = bail.dateFin ? new Date(bail.dateFin) : null;

  let annee = debut.getUTCFullYear();
  let mois = debut.getUTCMonth();
  if (debut.getUTCDate() > jourDansMois(annee, mois, bail.jourEcheance)) {
    mois++;
    if (mois > 11) { mois = 0; annee++; }
  }

  const liste = [];
  for (let garde = 0; garde < 120; garde++) {
    const echeance = Date.UTC(annee, mois, jourDansMois(annee, mois, bail.jourEcheance));
    if (echeance > finMoisCourant) break;
    if (fin && echeance > fin.getTime()) break;

    const cle = cleMois(annee, mois);
    const p = payes.get(cle);
    const base = { bienId: bien.id, moisConcerne: cle, operateur: null, transactionId: null, datePaiement: null, joursRetard: null };

    if (p) {
      liste.push({
        ...base, id: p.id, montant: p.montant, statut: 'paye',
        operateur: p.operateur || null,
        transactionId: p.transactionId || p.reference || null,
        datePaiement: p.datePaiement || null
      });
    } else if (echeance < aujourdhui) {
      liste.push({
        ...base, id: `echeance-${bien.id}-${cle}`, montant: bail.montantLoyer, statut: 'en_retard',
        joursRetard: Math.floor((aujourdhui - echeance) / 86400000)
      });
    } else {
      liste.push({ ...base, id: `echeance-${bien.id}-${cle}`, montant: bail.montantLoyer, statut: 'en_attente' });
    }

    mois++;
    if (mois > 11) { mois = 0; annee++; }
  }
  return liste.reverse(); // le plus récent d'abord
}

// ─── Validation du bail ───────────────────────────────────────────

function validerBail(b) {
  const montantLoyer = Number(b.montantLoyer);
  if (!(montantLoyer > 0))
    return { erreur: 'Le montant du loyer doit être supérieur à 0.' };

  const jourEcheance = parseInt(b.jourEcheance, 10);
  if (!(jourEcheance >= 1 && jourEcheance <= 31))
    return { erreur: "Le jour d'échéance doit être compris entre 1 et 31." };

  const dateDebut = parseDate(b.dateDebut);
  if (!dateDebut) return { erreur: 'Date de début du bail invalide.' };

  let dateFin = null;
  if (b.dateFin) {
    dateFin = parseDate(b.dateFin);
    if (!dateFin) return { erreur: 'Date de fin du bail invalide.' };
    if (dateFin < dateDebut) return { erreur: 'La date de fin doit suivre la date de début.' };
  }

  return { valeurs: { montantLoyer, jourEcheance, dateDebut: dateDebut.toISOString(), dateFin: dateFin ? dateFin.toISOString() : null } };
}

/** Supprime des biens et tout ce qui en dépend (baux, paiements). */
function supprimerBiensEtDependances(ids) {
  if (!ids.length) return;
  const set = new Set(ids);
  db.write('biens',     db.read('biens').filter(b => !set.has(b.id)));
  db.write('baux',      db.read('baux').filter(b => !set.has(b.bienId)));
  db.write('paiements', db.read('paiements').filter(p => !set.has(p.bienId)));
  db.write('etat_lieux',      db.read('etat_lieux').filter(e => !set.has(e.bienId)));
  db.write('documents_biens', db.read('documents_biens').filter(d => !set.has(d.bienId)));
}

// ═══════════════════════════════════════════════════════════════════
// GROUPES
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/groupes
router.get('/groupes', safe((req, res) => {
  const biens = db.read('biens').filter(b => b.gerantId === req.user.id);
  const groupes = db.read('groupes')
    .filter(g => g.gerantId === req.user.id)
    .sort(parDateDesc)
    .map(g => toGroupeDto(g, biens));
  res.json(groupes);
}));

// POST /gestion/groupes
router.post('/groupes', safe((req, res) => {
  const nom = (req.body.nom || '').trim();
  const description = (req.body.description || '').trim();

  if (!nom)               return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  if (nom.length > 80)    return res.status(400).json({ error: 'Le nom du groupe est trop long (80 caractères max).' });
  if (description.length > 300)
    return res.status(400).json({ error: 'La description est trop longue (300 caractères max).' });

  const groupe = {
    id:          uuidv4(),
    nom,
    description,
    gerantId:    req.user.id,
    createdAt:   new Date().toISOString()
  };
  db.insert('groupes', groupe);
  res.status(201).json(toGroupeDto(groupe, []));
}));

// PUT /gestion/groupes/:id
router.put('/groupes/:id', safe((req, res) => {
  const groupe = db.findById('groupes', req.params.id);
  if (!groupe || groupe.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Groupe introuvable.' });

  const nom = req.body.nom !== undefined ? String(req.body.nom).trim() : groupe.nom;
  const description = req.body.description !== undefined
    ? String(req.body.description || '').trim()
    : (groupe.description || '');

  if (!nom)            return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  if (nom.length > 80) return res.status(400).json({ error: 'Le nom du groupe est trop long (80 caractères max).' });
  if (description.length > 300)
    return res.status(400).json({ error: 'La description est trop longue (300 caractères max).' });

  const maj = db.update('groupes', groupe.id, { nom, description });
  const biens = db.read('biens').filter(b => b.gerantId === req.user.id);
  res.json(toGroupeDto(maj, biens));
}));

// DELETE /gestion/groupes/:id  (supprime aussi ses biens, baux et paiements)
router.delete('/groupes/:id', safe((req, res) => {
  const groupe = db.findById('groupes', req.params.id);
  if (!groupe || groupe.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Groupe introuvable.' });

  const ids = db.read('biens').filter(b => b.groupeId === groupe.id).map(b => b.id);
  supprimerBiensEtDependances(ids);
  db.delete('groupes', groupe.id);
  res.json({ success: true, biensSupprimes: ids.length });
}));

// ═══════════════════════════════════════════════════════════════════
// BIENS
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/biens
router.get('/biens', safe((req, res) => {
  const ctx = chargerContexte();
  const biens = db.read('biens')
    .filter(b => b.gerantId === req.user.id)
    .sort(parDateDesc)
    .map(b => toBienDto(b, ctx));
  res.json(biens);
}));

// GET /gestion/biens/:id  (gérant du bien ou son locataire)
router.get('/biens/:id', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || (bien.gerantId !== req.user.id && bien.locataireId !== req.user.id))
    return res.status(404).json({ error: 'Bien introuvable.' });
  res.json(toBienDto(bien, chargerContexte()));
}));

// POST /gestion/biens
router.post('/biens', safe((req, res) => {
  const { groupeId, quartier, proprietaireNom, bail } = req.body;
  const nom      = (req.body.nom || '').trim();
  const adresse  = (req.body.adresse || '').trim();
  const ville    = (req.body.ville || '').trim();
  const typeBien = (req.body.typeBien || '').trim();

  if (!groupeId || !nom || !adresse || !ville || !typeBien)
    return res.status(400).json({ error: 'Groupe, nom, adresse, ville et type de bien sont requis.' });

  const groupe = db.findById('groupes', groupeId);
  if (!groupe || groupe.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Groupe introuvable.' });

  // Tout valider avant d'écrire quoi que ce soit
  let bailValeurs = null;
  if (bail) {
    const r = validerBail(bail);
    if (r.erreur) return res.status(400).json({ error: r.erreur });
    bailValeurs = r.valeurs;
  }

  const maintenant = new Date().toISOString();
  const bien = {
    id:              uuidv4(),
    groupeId,
    gerantId:        req.user.id,
    nom,
    adresse,
    ville,
    quartier:        (quartier || '').trim() || null,
    typeBien,
    proprietaireNom: (proprietaireNom || '').trim() || null,
    locataireId:     null,
    locataireLieLe:  null,
    createdAt:       maintenant
  };
  db.insert('biens', bien);

  if (bailValeurs) {
    db.insert('baux', {
      id:        uuidv4(),
      bienId:    bien.id,
      ...bailValeurs,
      createdAt: maintenant
    });
  }

  res.status(201).json(toBienDto(bien, chargerContexte()));
}));

// PUT /gestion/biens/:id  (champs optionnels ; 'bail' crée ou met à jour le bail)
router.put('/biens/:id', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });

  const maj = {};
  for (const champ of ['nom', 'adresse', 'ville', 'typeBien']) {
    if (req.body[champ] !== undefined) {
      const v = String(req.body[champ]).trim();
      if (!v) return res.status(400).json({ error: `Le champ « ${champ} » ne peut pas être vide.` });
      maj[champ] = v;
    }
  }
  for (const champ of ['quartier', 'proprietaireNom']) {
    if (req.body[champ] !== undefined) maj[champ] = String(req.body[champ] || '').trim() || null;
  }
  if (req.body.groupeId !== undefined && req.body.groupeId !== bien.groupeId) {
    const groupe = db.findById('groupes', req.body.groupeId);
    if (!groupe || groupe.gerantId !== req.user.id)
      return res.status(404).json({ error: 'Groupe introuvable.' });
    maj.groupeId = groupe.id;
  }

  let bailValeurs = null;
  if (req.body.bail) {
    const r = validerBail(req.body.bail);
    if (r.erreur) return res.status(400).json({ error: r.erreur });
    bailValeurs = r.valeurs;
  }

  // Écritures seulement après toutes les validations
  const bienMaj = Object.keys(maj).length ? db.update('biens', bien.id, maj) : bien;
  if (bailValeurs) {
    const existant = db.read('baux').filter(b => b.bienId === bien.id).sort(parDateDesc)[0];
    if (existant) db.update('baux', existant.id, bailValeurs);
    else db.insert('baux', { id: uuidv4(), bienId: bien.id, ...bailValeurs, createdAt: new Date().toISOString() });
  }

  res.json(toBienDto(bienMaj, chargerContexte()));
}));

// DELETE /gestion/biens/:id
router.delete('/biens/:id', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });

  supprimerBiensEtDependances([bien.id]);
  res.json({ success: true });
}));

// ═══════════════════════════════════════════════════════════════════
// LOCATAIRE LIÉ À UN BIEN
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/recherche-utilisateur?q=  — correspondance EXACTE (ID ou téléphone)
router.get('/recherche-utilisateur',limiterRecherche , safe((req, res) => {
  const r = resoudreUtilisateur(req.query.q);
  if (r.erreur) return res.status(r.status).json({ error: r.erreur });

  res.json({
    nom:             r.user.nom,
    monId:           monIdDe(r.user.id),
    telephoneMasque: masquerTel(r.user.telephone)
  });
}));

// POST /gestion/biens/:id/lier-locataire   body: { idOuTel }
router.post('/biens/:id/lier-locataire',limiterRecherche , safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });
  if (bien.locataireId)
    return res.status(409).json({ error: 'Ce bien a déjà un locataire. Déliez-le d\'abord.' });

  const r = resoudreUtilisateur(req.body.idOuTel);
  if (r.erreur) return res.status(r.status).json({ error: r.erreur });
  if (r.user.id === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas être votre propre locataire.' });

  const maj = db.update('biens', bien.id, {
    locataireId:    r.user.id,
    locataireLieLe: new Date().toISOString()
  });

  notifier(r.user.id, 'bail_lie', 'Logement lié', `Votre gérant vous a lié à « ${bien.nom} ».`, bien.id);

  res.json(toBienDto(maj, chargerContexte()));
}));

// DELETE /gestion/biens/:id/lier-locataire
router.delete('/biens/:id/lier-locataire', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });
  if (!bien.locataireId)
    return res.status(400).json({ error: 'Ce bien n\'a pas de locataire.' });

  const ancienLocataireId = bien.locataireId;

  const maj = db.update('biens', bien.id, { locataireId: null, locataireLieLe: null });

  notifier(ancienLocataireId, 'bail_delie', 'Logement délié', `Vous n'êtes plus associé à « ${bien.nom} ».`, null);

  res.json(toBienDto(maj, chargerContexte()));
}));

// ═══════════════════════════════════════════════════════════════════
// CÔTÉ LOCATAIRE / ID
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/locataire/mes-logements
router.get('/locataire/mes-logements', safe((req, res) => {
  const ctx = chargerContexte();
  const logements = db.read('biens')
    .filter(b => b.locataireId === req.user.id)
    .sort(parDateDesc)
    .map(b => toBienDto(b, ctx));
  res.json(logements);
}));

// GET /gestion/mon-id
router.get('/mon-id', safe((req, res) => {
  res.json({ monId: monIdDe(req.user.id) });
}));


// ═══════════════════════════════════════════════════════════════════
// HISTORIQUE, RAPPEL
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/biens/:id/paiements  (gérant ou locataire)
router.get('/biens/:id/paiements', safe((req, res) => {
  const bien = bienAccessible(req, req.params.id);
  if (!bien) return res.status(404).json({ error: 'Bien introuvable.' });
  const ctx = chargerContexte();
  const bail = ctx.baux.filter(b => b.bienId === bien.id).sort(parDateDesc)[0] || null;
  res.json(construireHistorique(bien, bail, ctx.paiements));
}));

// POST /gestion/biens/:id/rappel  (gérant) → notification au locataire
router.post('/biens/:id/rappel', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });
  if (!bien.locataireId)
    return res.status(400).json({ error: 'Aucun locataire lié à ce bien.' });

  const ctx = chargerContexte();
  const bail = ctx.baux.filter(b => b.bienId === bien.id).sort(parDateDesc)[0] || null;
  const { statutLoyer, joursRetard } = calculerStatut(bien, bail, ctx);

  const message = statutLoyer === 'en_retard'
    ? `Votre loyer pour « ${bien.nom} » est en retard de ${joursRetard} jour${joursRetard > 1 ? 's' : ''}. Merci de régulariser.`
    : `Rappel : votre loyer pour « ${bien.nom} » arrive à échéance${bail ? ` le ${bail.jourEcheance} du mois` : ''}.`;

  notifier(bien.locataireId, 'rappel', 'Rappel de loyer', message, bien.id);
  res.json({ success: true });
}));

// ═══════════════════════════════════════════════════════════════════
// ÉTAT DES LIEUX
// ═══════════════════════════════════════════════════════════════════

const CATEGORIES_ELEMENT = ['equipement', 'structure', 'autre'];
const STATUTS_ELEMENT    = ['bon_etat', 'defectueux', 'absent'];

// GET /gestion/biens/:id/etat-des-lieux
router.get('/biens/:id/etat-des-lieux', safe((req, res) => {
  const bien = bienAccessible(req, req.params.id);
  if (!bien) return res.status(404).json({ error: 'Bien introuvable.' });
  res.json(
    db.read('etat_lieux')
      .filter(e => e.bienId === bien.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  );
}));

// POST /gestion/biens/:id/etat-des-lieux
router.post('/biens/:id/etat-des-lieux', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });

  const nom = (req.body.nom || '').trim();
  if (!nom)            return res.status(400).json({ error: "Le nom de l'élément est requis." });
  if (nom.length > 80) return res.status(400).json({ error: "Le nom de l'élément est trop long (80 caractères max)." });

  const categorie = req.body.categorie || 'equipement';
  const statut    = req.body.statut || 'bon_etat';
  if (!CATEGORIES_ELEMENT.includes(categorie)) return res.status(400).json({ error: 'Catégorie invalide.' });
  if (!STATUTS_ELEMENT.includes(statut))       return res.status(400).json({ error: 'Statut invalide.' });

  const note = (req.body.note || '').trim();
  if (note.length > 300) return res.status(400).json({ error: 'La note est trop longue (300 caractères max).' });

  const element = {
    id: uuidv4(), bienId: bien.id, nom, categorie, statut,
    note: note || null, photos: [], createdAt: new Date().toISOString()
  };
  db.insert('etat_lieux', element);
  res.status(201).json(element);
}));

// PUT /gestion/etat-des-lieux/:elemId
router.put('/etat-des-lieux/:elemId', safe((req, res) => {
  const element = db.findById('etat_lieux', req.params.elemId);
  const bien = element ? db.findById('biens', element.bienId) : null;
  if (!element || !bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Élément introuvable.' });

  const maj = {};
  if (req.body.nom !== undefined) {
    const nom = String(req.body.nom).trim();
    if (!nom || nom.length > 80) return res.status(400).json({ error: "Nom d'élément invalide." });
    maj.nom = nom;
  }
  if (req.body.statut !== undefined) {
    if (!STATUTS_ELEMENT.includes(req.body.statut)) return res.status(400).json({ error: 'Statut invalide.' });
    maj.statut = req.body.statut;
  }
  if (req.body.categorie !== undefined) {
    if (!CATEGORIES_ELEMENT.includes(req.body.categorie)) return res.status(400).json({ error: 'Catégorie invalide.' });
    maj.categorie = req.body.categorie;
  }
  if (req.body.note !== undefined) {
    const note = String(req.body.note || '').trim();
    if (note.length > 300) return res.status(400).json({ error: 'La note est trop longue (300 caractères max).' });
    maj.note = note || null;
  }

  res.json(db.update('etat_lieux', element.id, maj));
}));

// DELETE /gestion/etat-des-lieux/:elemId
router.delete('/etat-des-lieux/:elemId', safe((req, res) => {
  const element = db.findById('etat_lieux', req.params.elemId);
  const bien = element ? db.findById('biens', element.bienId) : null;
  if (!element || !bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Élément introuvable.' });
  db.delete('etat_lieux', element.id);
  res.json({ success: true });
}));

// ═══════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════

const TYPES_DOCUMENT = ['contrat', 'etat_lieux', 'autre'];

// GET /gestion/biens/:id/documents
router.get('/biens/:id/documents', safe((req, res) => {
  const bien = bienAccessible(req, req.params.id);
  if (!bien) return res.status(404).json({ error: 'Bien introuvable.' });
  res.json(
    db.read('documents_biens')
      .filter(d => d.bienId === bien.id)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
  );
}));

// POST /gestion/biens/:id/documents   body: { nom, type, url }
router.post('/biens/:id/documents', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });

  const nom = (req.body.nom || '').trim();
  const url = (req.body.url || '').trim();
  const type = req.body.type || 'autre';

  if (!nom)             return res.status(400).json({ error: 'Le nom du document est requis.' });
  if (nom.length > 100) return res.status(400).json({ error: 'Le nom du document est trop long (100 caractères max).' });
  if (!TYPES_DOCUMENT.includes(type)) return res.status(400).json({ error: 'Type de document invalide.' });
  if (!/^https?:\/\/\S+$/i.test(url) || url.length > 500)
    return res.status(400).json({ error: 'Le lien du document est invalide (http:// ou https://).' });

  const doc = { id: uuidv4(), bienId: bien.id, nom, type, url, uploadedAt: new Date().toISOString() };
  db.insert('documents_biens', doc);
  res.status(201).json(doc);
}));

// DELETE /gestion/documents/:docId
router.delete('/documents/:docId', safe((req, res) => {
  const doc = db.findById('documents_biens', req.params.docId);
  const bien = doc ? db.findById('biens', doc.bienId) : null;
  if (!doc || !bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Document introuvable.' });
  db.delete('documents_biens', doc.id);
  res.json({ success: true });
}));

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

// GET /gestion/notifications
router.get('/notifications', safe((req, res) => {
  res.json(
    db.read('notifications')
      .filter(n => n.userId === req.user.id)
      .sort(parDateDesc)
      .slice(0, 100)
  );
}));

// POST /gestion/notifications/lues  → marque tout comme lu
router.post('/notifications/lues', safe((req, res) => {
  const maj = db.read('notifications').map(n =>
    n.userId === req.user.id && !n.lue ? { ...n, lue: true } : n
  );
  db.write('notifications', maj);
  res.json({ success: true });
}));

module.exports = router;
