/**
 * Données de démo du module Gestion : groupes, biens, baux, paiements,
 * état des lieux, documents, notifications. Dates calculées par rapport à aujourd'hui.
 *
 * Usage (depuis backend/) :
 *   node seed_gestion.js                       → gérant = celui de vos groupes/biens existants
 *   node seed_gestion.js --gerant=97000000     → gérant choisi par téléphone ou id utilisateur
 *   node seed_gestion.js --clean               → retire toutes les données de démo
 *
 * Les locataires sont pris parmi les AUTRES comptes existants (aucun compte n'est créé).
 * Ne modifie aucune donnée réelle : seuls les enregistrements « demo-… » sont ajoutés/retirés.
 */
const db = require('../utils/db');

const PREFIXE = 'demo-';
const estDemo = (x) => String(x.id).startsWith(PREFIXE);
const COLLECTIONS = ['groupes', 'biens', 'baux', 'paiements', 'etat_lieux', 'documents_biens', 'notifications'];

function nettoyer() {
  for (const c of COLLECTIONS) db.write(c, db.read(c).filter(x => !estDemo(x)));
}

nettoyer();
if (process.argv.includes('--clean')) {
  console.log('Données de démo retirées.');
  process.exit(0);
}

// ─── Utilitaires ──────────────────────────────────────────────────

const chiffres = (s) => String(s || '').replace(/\D/g, '');
const memeTel = (a, b) => {
  const x = chiffres(a), y = chiffres(b);
  return x.length >= 8 && y.length >= 8 && x.slice(-8) === y.slice(-8);
};

const now = new Date();
const aujourdhui = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const dernierJour = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
const cle = (a, m) => `${a}-${String(m + 1).padStart(2, '0')}`;
const iso = (ms) => new Date(ms).toISOString();
const heure9 = (ms) => ms + 9 * 3600000;

/** 1er du mois, `moisAvant` mois en arrière. */
const premierDuMois = (moisAvant) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - moisAvant, 1);

/** Échéances déjà passées depuis `debutMs` (même logique que le serveur). */
function echeancesDues(debutMs, jour) {
  const d = new Date(debutMs);
  let a = d.getUTCFullYear(), m = d.getUTCMonth();
  const res = [];
  for (let g = 0; g < 60; g++) {
    const e = Date.UTC(a, m, Math.min(jour, dernierJour(a, m)));
    if (e >= aujourdhui) break;
    res.push({ cle: cle(a, m), echeance: e });
    m++;
    if (m > 11) { m = 0; a++; }
  }
  return res;
}

// ─── Gérant et locataires ─────────────────────────────────────────

const users = db.read('users').filter(u => !u.banni);
const argG = (process.argv.find(a => a.startsWith('--gerant=')) || '').slice(9).trim();

let gerant = null;
if (argG) {
  gerant = users.find(u => u.id === argG || memeTel(u.telephone, argG));
} else {
  const ref = db.read('groupes')[0] || db.read('biens')[0];
  if (ref) gerant = users.find(u => u.id === ref.gerantId);
}
if (!gerant) {
  console.error('Gérant introuvable. Créez un groupe depuis l\'app, ou relancez avec --gerant=<téléphone ou id>.');
  process.exit(1);
}

const locataires = users.filter(u => u.id !== gerant.id);
if (!locataires.length) {
  console.warn('Aucun autre compte : tous les biens seront créés SANS locataire.');
}
let indexLocataire = 0;
const prochainLocataire = () => locataires.length ? locataires[indexLocataire++ % locataires.length] : null;

// ─── Plan des données ─────────────────────────────────────────────

const GROUPES = [
  { nom: 'Résidences Fidjrossè', description: 'Studios meublés près de la plage', ville: 'Cotonou', quartier: 'Fidjrossè' },
  { nom: 'Immeuble Les Palmiers', description: 'R+3, 4 logements et une boutique', ville: 'Cotonou', quartier: 'Akpakpa' },
  { nom: 'Villas Calavi', description: 'Villas familiales avec cour', ville: 'Abomey-Calavi', quartier: 'Zoca' }
];

// g = index du groupe · loc = a un locataire · mois = ancienneté du bail ·
// impayes = nb d'échéances récentes non payées · fin = bail à durée déterminée (mois restants)
const BIENS = [
  { g: 0, nom: 'Studio Meublé A', typeBien: 'Studio',      loyer: 45000,  jour: 5,  loc: true,  mois: 7, impayes: 2, doc: 2, etat: 'logement', v: 1 },
  { g: 0, nom: 'Studio Meublé B', typeBien: 'Studio',      loyer: 30000,  jour: 1,  loc: true,  mois: 5, impayes: 0, doc: 2, etat: 'logement', v: 2 },
  { g: 1, nom: 'Appartement 3 pièces A1', typeBien: 'Appartement', loyer: 120000, jour: 10, loc: true,  mois: 9, impayes: 1, doc: 3, etat: 'logement', v: 3, fin: 3 },
  { g: 1, nom: 'Appartement 2 pièces A2', typeBien: 'Appartement', loyer: 80000,  jour: 15, loc: true,  mois: 4, impayes: 0, doc: 2, etat: 'logement', v: 4 },
  { g: 1, nom: 'Boutique rez-de-chaussée', typeBien: 'Boutique',   loyer: 150000, jour: 1,  loc: false, mois: 0, impayes: 0, doc: 0, etat: 'boutique', v: 5 },
  { g: 1, nom: 'Studio terrasse',         typeBien: 'Studio',      loyer: 35000,  jour: 20, loc: true,  mois: 3, impayes: 0, doc: 1, etat: null,       v: 0 },
  { g: 2, nom: 'Villa 4 chambres',        typeBien: 'Maison',      loyer: 250000, jour: 5,  loc: true,  mois: 11, impayes: 3, doc: 3, etat: 'logement', v: 6 },
  { g: 2, nom: 'Villa 3 chambres',        typeBien: 'Maison',      loyer: 180000, jour: 5,  loc: false, mois: 0, impayes: 0, doc: 0, etat: 'logement', v: 7 }
];

const ETAT_LOGEMENT = [
  ['Climatiseur salon', 'equipement', 'Télécommande fournie'],
  ['Brasseur chambre', 'equipement', null],
  ['Lampes', 'equipement', '5 points lumineux'],
  ['Robinets cuisine', 'equipement', null],
  ['Prises électriques', 'equipement', null],
  ['Porte principale', 'structure', 'Serrure changée récemment'],
  ['Fenêtres', 'structure', null],
  ['Carrelage', 'structure', null]
];
const ETAT_BOUTIQUE = [
  ['Rideau métallique', 'structure', null],
  ['Compteur électrique', 'equipement', 'Compteur séparé'],
  ['Vitrine', 'structure', null],
  ['Éclairage', 'equipement', null]
];
const OPERATEURS = ['mtn', 'moov', 'mtn', 'celtiis'];

/** Statut déterministe, avec un mélange de bon état / défectueux / absent. */
function statutElement(i, v) {
  const n = (i * 3 + v) % 9;
  if (n === 0) return 'defectueux';
  if (n === 4) return 'absent';
  return 'bon_etat';
}

// ─── Création ─────────────────────────────────────────────────────

const stats = { groupes: 0, biens: 0, locataires: 0, paiements: 0, elements: 0, documents: 0, notifications: 0 };

function notifier(userId, type, titre, message, bienId, createdAtMs) {
  db.insert('notifications', {
    id: `${PREFIXE}notif-${stats.notifications}`, userId, type, titre, message,
    bienId, lue: false, createdAt: iso(createdAtMs)
  });
  stats.notifications++;
}

const groupeIds = GROUPES.map((g, i) => {
  const id = `${PREFIXE}g-${i}`;
  db.insert('groupes', {
    id, nom: g.nom, description: g.description,
    gerantId: gerant.id, createdAt: iso(Date.now() - (GROUPES.length - i) * 86400000)
  });
  stats.groupes++;
  return id;
});

let notifPaiementDonne = false;

BIENS.forEach((b, i) => {
  const grp = GROUPES[b.g];
  const bienId = `${PREFIXE}b-${i}`;
  const locataire = b.loc ? prochainLocataire() : null;
  const debutMs = premierDuMois(b.mois);

  db.insert('biens', {
    id: bienId,
    groupeId: groupeIds[b.g],
    gerantId: gerant.id,
    nom: `${b.nom} — ${grp.quartier}`,
    adresse: `Lot ${100 + i * 7}, rue ${12 + i}`,
    ville: grp.ville,
    quartier: grp.quartier,
    typeBien: b.typeBien,
    proprietaireNom: i % 3 === 0 ? 'M. Adjovi' : null,
    locataireId: locataire ? locataire.id : null,
    locataireLieLe: locataire ? iso(debutMs) : null,
    createdAt: iso(Date.now() - (BIENS.length - i) * 3600000)
  });
  stats.biens++;

  // Bail (même sans locataire, pour voir les deux affichages : bail seul)
  const finMs = b.fin ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + b.fin, 28) : null;
  db.insert('baux', {
    id: `${PREFIXE}bail-${i}`, bienId,
    montantLoyer: b.loyer, jourEcheance: b.jour,
    dateDebut: iso(locataire ? debutMs : premierDuMois(1)),
    dateFin: finMs ? iso(finMs) : null,
    createdAt: iso(debutMs)
  });

  // Paiements : toutes les échéances dues payées, sauf les `impayes` dernières
  if (locataire) {
    stats.locataires++;
    const dues = echeancesDues(debutMs, b.jour);
    const payees = dues.slice(0, Math.max(0, dues.length - b.impayes));
    payees.forEach((d, k) => {
      db.insert('paiements', {
        id: `${PREFIXE}pay-${i}-${d.cle}`, bienId, locataireId: locataire.id,
        montant: b.loyer, moisConcerne: d.cle, statut: 'paye',
        operateur: OPERATEURS[(i + k) % OPERATEURS.length],
        transactionId: `TX-DEMO-${i}${k}${1000 + k}`,
        datePaiement: iso(heure9(d.echeance - (k % 3) * 86400000)),
        createdAt: iso(heure9(d.echeance))
      });
      stats.paiements++;
    });

    // Notifications
    notifier(locataire.id, 'bail_lie', 'Logement lié',
      `Votre gérant vous a lié à « ${b.nom} ».`, bienId, debutMs);

    const premierImpaye = dues[payees.length];
    if (b.impayes > 0 && premierImpaye) {
      const jours = Math.floor((aujourdhui - premierImpaye.echeance) / 86400000);
      notifier(locataire.id, 'rappel', 'Rappel de loyer',
        `Votre loyer pour « ${b.nom} » est en retard de ${jours} jour${jours > 1 ? 's' : ''}. Merci de régulariser.`,
        bienId, Date.now() - i * 3600000);
    }
    if (!notifPaiementDonne && payees.length) {
      const dernier = payees[payees.length - 1];
      notifier(gerant.id, 'paiement', 'Paiement reçu',
        `Loyer de ${dernier.cle} reçu pour « ${b.nom} ».`, bienId, dernier.echeance);
      notifPaiementDonne = true;
    }
  }

  // État des lieux
  const modele = b.etat === 'boutique' ? ETAT_BOUTIQUE : b.etat === 'logement' ? ETAT_LOGEMENT : [];
  modele.forEach(([nom, categorie, note], k) => {
    db.insert('etat_lieux', {
      id: `${PREFIXE}el-${i}-${k}`, bienId, nom, categorie,
      statut: statutElement(k, b.v), note, photos: [],
      createdAt: iso(debutMs + k * 60000)
    });
    stats.elements++;
  });

  // Documents
  const DOCS = [
    ['Contrat de bail', 'contrat', 'https://example.com/contrat-bail.pdf'],
    ['État des lieux d\'entrée signé', 'etat_lieux', 'https://example.com/etat-des-lieux.pdf'],
    ['Quittance du dernier mois', 'autre', 'https://example.com/quittance.pdf']
  ];
  DOCS.slice(0, b.doc).forEach(([nom, type, url], k) => {
    db.insert('documents_biens', {
      id: `${PREFIXE}doc-${i}-${k}`, bienId, nom, type, url,
      uploadedAt: iso(debutMs + k * 86400000)
    });
    stats.documents++;
  });
});

console.log(`Gérant : ${gerant.nom || gerant.id}`);
console.log(`Ajouté : ${stats.groupes} groupes, ${stats.biens} biens (${stats.locataires} avec locataire), `
  + `${stats.paiements} paiements, ${stats.elements} éléments d'état des lieux, `
  + `${stats.documents} documents, ${stats.notifications} notifications.`);