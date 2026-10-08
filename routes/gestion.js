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
router.get('/recherche-utilisateur', safe((req, res) => {
  const r = resoudreUtilisateur(req.query.q);
  if (r.erreur) return res.status(r.status).json({ error: r.erreur });

  res.json({
    nom:             r.user.nom,
    monId:           monIdDe(r.user.id),
    telephoneMasque: masquerTel(r.user.telephone)
  });
}));

// POST /gestion/biens/:id/lier-locataire   body: { idOuTel }
router.post('/biens/:id/lier-locataire', safe((req, res) => {
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
  res.json(toBienDto(maj, chargerContexte()));
}));

// DELETE /gestion/biens/:id/lier-locataire
router.delete('/biens/:id/lier-locataire', safe((req, res) => {
  const bien = db.findById('biens', req.params.id);
  if (!bien || bien.gerantId !== req.user.id)
    return res.status(404).json({ error: 'Bien introuvable.' });
  if (!bien.locataireId)
    return res.status(400).json({ error: 'Ce bien n\'a pas de locataire.' });

  const maj = db.update('biens', bien.id, { locataireId: null, locataireLieLe: null });
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

module.exports = router;
