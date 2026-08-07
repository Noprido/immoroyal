const categories = require('../data/categories.json');
const { genererTitre } = require('./titleGenerator');

const TYPES_BIEN         = categories.map(c => c.value);
const TYPES_VENTE_DEFAUT = categories.filter(c => c.venteParDefaut).map(c => c.value);

const DUREES_LOCATION = [
  { value: 'heure', label: 'par heure' },
  { value: '6h', label: 'par 6 heures' },
  { value: '12h', label: 'par 12 heures' },
  { value: '24h', label: 'par 24 heures' },
  { value: 'semaine', label: 'par semaine' },
  { value: 'mois', label: 'par mois' },
];

const STANDINGS = ['sanitaire', 'semi-sanitaire', 'ordinaire'];

function getCategorie(typeBien) {
  return categories.find(c => c.value === typeBien) || null;
}

function champsAutorises(typeBien) {
  const cat = getCategorie(typeBien);
  return cat ? cat.champsCaracteristiques : [];
}

function afficheDimension(typeBien) {
  const cat = getCategorie(typeBien);
  return cat ? cat.afficheDimension : false;
}

function validateAnnonce(body) {
  const {
    typeBien, ville, quartier,
    typeTransaction, prix, loyer,
    moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, eauType,
    standing, dimension
  } = body;

  const estVente = typeTransaction === 'vente';
  const champs = champsAutorises(typeBien);
  const estDimension = afficheDimension(typeBien);

  const champsCommuns = { typeBien, ville, quartier, commissionDemarcheur };
  for (const [champ, valeur] of Object.entries(champsCommuns)) {
    if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
      return `Le champ "${champ}" est obligatoire.`;
    }
  }

  if (!TYPES_BIEN.includes(typeBien)) return 'Type de bien invalide.';

  if (estVente) {
    if (!prix || prix.toString().trim() === '') return 'Le prix de vente est obligatoire.';
    if (parseInt(prix) <= 0) return 'Le prix de vente doit être supérieur à 0.';
  } else {
    if (!loyer || loyer.toString().trim() === '') return 'Le loyer est obligatoire.';
    if (parseInt(loyer) <= 0) return 'Le loyer doit être supérieur à 0.';

    const champsLocation = { moisAvance, cautionEau, cautionElec };
    for (const [champ, valeur] of Object.entries(champsLocation)) {
      if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
        return `Le champ "${champ}" est obligatoire.`;
      }
    }
    if (!dureeLocation) return 'La durée de location est obligatoire.';
  }

  if (estDimension) {
    if (!dimension || parseFloat(dimension) <= 0) return 'La dimension du terrain est obligatoire.';
  } else {
    if (!electriciteType) return 'Le type d\'électricité est obligatoire.';
    if (!eauType) return 'Le type d\'eau est obligatoire.';
  }

  if (champs.length > 0) {
    const champsNombres = ['nbChambres', 'nbSalons', 'nbDouches', 'nbCuisines'].filter(c => champs.includes(c));
    const valeurs = { nbChambres, nbSalons, nbDouches, nbCuisines };
    for (const champ of champsNombres) {
      if (valeurs[champ] === undefined || valeurs[champ] === null || valeurs[champ].toString().trim() === '') {
        return `Le champ "${champ}" est obligatoire.`;
      }
    }
    if (champsNombres.length > 0) {
      const totalPieces = champsNombres.reduce((sum, c) => sum + (parseInt(valeurs[c]) || 0), 0);
      if (totalPieces < 1) return 'Au moins une pièce (chambre, salon, douche ou cuisine) est requise.';
    }
    if (champs.includes('standing')) {
      if (!standing || !STANDINGS.includes(standing)) return 'Le standing (sanitaire/semi-sanitaire/ordinaire) est obligatoire.';
    }
  }

  return null;
}

function buildAnnonce(body, medias, extra = {}) {
  const {
    description, typeBien, ville, quartier,
    typeTransaction, prix, loyer,
    moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    dureeLocation,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType,
    standing, dimension
  } = body;

  const estVente = typeTransaction === 'vente';
  const champs = champsAutorises(typeBien);
  const estDimension = afficheDimension(typeBien);
  const supportsStanding = champs.includes('standing');

  const nbChambresFinal = champs.includes('nbChambres') ? parseInt(nbChambres) || 0 : 0;
  const nbSalonsFinal   = champs.includes('nbSalons')   ? parseInt(nbSalons)   || 0 : 0;
  const nbDouchesFinal  = champs.includes('nbDouches')  ? parseInt(nbDouches)  || 0 : 0;
  const nbCuisinesFinal = champs.includes('nbCuisines') ? parseInt(nbCuisines) || 0 : 0;
  const nbPiecesFinal   = nbChambresFinal + nbSalonsFinal + nbDouchesFinal + nbCuisinesFinal;

  const data = {
    typeBien,
    typeTransaction: typeTransaction || 'location',
    ville: ville.trim(),
    quartier: quartier.trim(),
    description: (description || '').trim(),

    prix: estVente ? parseInt(prix) || 0 : parseInt(loyer) || 0,
    loyer: estVente ? 0 : parseInt(loyer) || 0,

    dureeLocation: estVente ? null : (dureeLocation || 'mois'),
    moisAvance: estVente ? 0 : parseInt(moisAvance) || 0,
    cautionEau: estVente ? 0 : parseInt(cautionEau) || 0,
    cautionElec: estVente ? 0 : parseInt(cautionElec) || 0,

    commissionDemarcheur: parseInt(commissionDemarcheur) || 0,

    nbPieces: nbPiecesFinal,
    nbChambres: nbChambresFinal,
    nbSalons: nbSalonsFinal,
    nbDouches: nbDouchesFinal,
    nbCuisines: nbCuisinesFinal,
    electriciteType: !estDimension ? electriciteType : '',
    electriciteCompteur: !estDimension ? electriciteCompteur : '',
    eauType: !estDimension ? eauType : '',

    standing: supportsStanding ? (standing || null) : null,
    dimension: estDimension ? (parseFloat(dimension) || 0) : 0,

    photos: medias.photos || [],
    videos: medias.videos || [],

    ...extra
  };

  // Titre généré côté serveur : source de vérité, jamais confiance au client.
  data.titre = genererTitre(data);

  return data;
}

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
  STANDINGS,
  CATEGORIES: categories,
  champsAutorises,
  afficheDimension,
  getLabelPrix,
  getLabelDuree,
  getPrixAffiche
};