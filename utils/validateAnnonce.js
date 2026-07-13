const TYPES_BIEN = [
  'Appartement vide', 'Appartement meublé',
  'Boutique', 'Magasin', 'Bureau', 'Terrain', 'Maison', 'Entrée personnelle',
];

// Types pré-sélectionnés sur "vente" par défaut
const TYPES_VENTE_DEFAUT = ['Terrain'];

const DUREES_LOCATION = [
  { value: 'heure', label: 'par heure' },
  { value: '6h', label: 'par 6 heures' },
  { value: '12h', label: 'par 12 heures' },
  { value: '24h', label: 'par 24 heures' },
  { value: 'semaine', label: 'par semaine' },
  { value: 'mois', label: 'par mois' },
];

function validateAnnonce(body) {
  const {
    titre, typeBien, ville, quartier,
    typeTransaction, prix, loyer,
    moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    dureeLocation,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  } = body;
  
  const estVente = typeTransaction === 'vente';

  // ─── Champs toujours obligatoires ────────────────────────────
  const champsCommuns = { titre, typeBien, ville, quartier, commissionDemarcheur };
  for (const [champ, valeur] of Object.entries(champsCommuns)) {
    if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
      return `Le champ "${champ}" est obligatoire.`;
    }
  }

  // ─── Prix / Loyer selon le mode ──────────────────────────────
  if (estVente) {
    if (!prix || prix.toString().trim() === '') return 'Le prix de vente est obligatoire.';
    if (parseInt(prix) <= 0) return 'Le prix de vente doit être supérieur à 0.';
  } else {
    if (!loyer || loyer.toString().trim() === '') return 'Le loyer est obligatoire.';
    if (parseInt(loyer) <= 0) return 'Le loyer doit être supérieur à 0.';

    // Champs spécifiques à la location
    const champsLocation = { moisAvance, cautionEau, cautionElec };
    for (const [champ, valeur] of Object.entries(champsLocation)) {
      if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
        return `Le champ "${champ}" est obligatoire.`;
      }
    }

    if (!dureeLocation) return 'La durée de location est obligatoire.';
  }

  // ─── Caractéristiques (sauf Terrain) ─────────────────────────
  if (typeBien !== 'Terrain') {
    const champsCarac = { nbChambres, nbSalons, nbDouches, nbCuisines, electriciteType, electriciteCompteur, eauType };
    for (const [champ, valeur] of Object.entries(champsCarac)) {
      if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
        return `Le champ "${champ}" est obligatoire.`;
      }
    }

    if (!nbPieces || parseInt(nbPieces) < 1) {
      return 'Au moins une pièce (chambre, salon, douche ou cuisine) est requise.';
    }
  }

  return null;
}

function buildAnnonce(body, medias, extra = {}) {
  const {
    titre, description, typeBien, ville, quartier,
    typeTransaction, prix, loyer,
    moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    dureeLocation,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  } = body;

  const estVente = typeTransaction === 'vente';
  const estTerrain = typeBien === 'Terrain';

  return {
    titre: titre.trim(),
    description: (description || '').trim(),
    typeBien,
    typeTransaction: typeTransaction || 'location',
    ville: ville.trim(),
    quartier: quartier.trim(),

    // Prix unifié
    prix: estVente ? parseInt(prix) || 0 : parseInt(loyer) || 0,
    // Garde loyer pour rétrocompatibilité avec les annonces existantes
    loyer: estVente ? 0 : parseInt(loyer) || 0,

    // Location uniquement
    dureeLocation: estVente ? null : (dureeLocation || 'mois'),
    moisAvance: estVente ? 0 : parseInt(moisAvance) || 0,
    cautionEau: estVente ? 0 : parseInt(cautionEau) || 0,
    cautionElec: estVente ? 0 : parseInt(cautionElec) || 0,

    // Commun
    commissionDemarcheur: parseInt(commissionDemarcheur) || 0,

    // Caractéristiques (0 pour terrain)
    nbPieces: estTerrain ? 0 : parseInt(nbPieces) || 0,
    nbChambres: estTerrain ? 0 : parseInt(nbChambres) || 0,
    nbSalons: estTerrain ? 0 : parseInt(nbSalons) || 0,
    nbDouches: estTerrain ? 0 : parseInt(nbDouches) || 0,
    nbCuisines: estTerrain ? 0 : parseInt(nbCuisines) || 0,
    electriciteType: estTerrain ? '' : electriciteType,
    electriciteCompteur: estTerrain ? '' : electriciteCompteur,
    eauType: estTerrain ? '' : eauType,

    // Médias
    photos: medias.photos || [],
    videos: medias.videos || [],

    ...extra
  };
}

// Helpers pour les vues
function getLabelPrix(annonce) {
  if (annonce.typeTransaction === 'vente') return 'Prix de vente';
  return 'Loyer';
}

function getLabelDuree(annonce) {
  if (annonce.typeTransaction === 'vente') return '';
  const duree = DUREES_LOCATION.find(d => d.value === annonce.dureeLocation);
  return duree ? duree.label : 'par mois';
}

function getPrixAffiche(annonce) {
  return annonce.prix || annonce.loyer || 0;
}

module.exports = {
  validateAnnonce,
  buildAnnonce,
  TYPES_BIEN,
  TYPES_VENTE_DEFAUT,
  DUREES_LOCATION,
  getLabelPrix,
  getLabelDuree,
  getPrixAffiche
};