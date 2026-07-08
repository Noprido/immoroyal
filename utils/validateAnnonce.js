const TYPES_BIEN = [
  'Appartement vide', 'Appartement meublé',
  'Boutique', 'Magasin', 'Bureau', 'Terrain', 'Maison', 'Entrée personelle',
];

function validateAnnonce(body) {
  const {
    titre, typeBien, ville, quartier,
    loyer, moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  } = body;

  const champsObligatoires = {
    titre, typeBien, ville, quartier,
    loyer, moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  };

  for (const [champ, valeur] of Object.entries(champsObligatoires)) {
    if (valeur === undefined || valeur === null || valeur.toString().trim() === '') {
      return `Le champ "${champ}" est obligatoire.`;
    }
  }

  if (!nbPieces || parseInt(nbPieces) < 1) {
    return 'Au moins une pièce (chambre, salon, douche ou cuisine) est requise.';
  }

  return null; // null = pas d'erreur
}

function buildAnnonce(body, photos, extra = {}) {
  const {
    titre, description, typeBien, ville, quartier,
    loyer, moisAvance, cautionEau, cautionElec, commissionDemarcheur,
    nbPieces, nbChambres, nbSalons, nbDouches, nbCuisines,
    electriciteType, electriciteCompteur, eauType
  } = body;

  return {
    titre: titre.trim(),
    description: (description || '').trim(),
    typeBien,
    ville: ville.trim(),
    quartier: quartier.trim(),
    loyer: parseInt(loyer),
    moisAvance: parseInt(moisAvance) || 0,
    cautionEau: parseInt(cautionEau) || 0,
    cautionElec: parseInt(cautionElec) || 0,
    commissionDemarcheur: parseInt(commissionDemarcheur) || 0,
    nbPieces: parseInt(nbPieces),
    nbChambres: parseInt(nbChambres) || 0,
    nbSalons: parseInt(nbSalons) || 0,
    nbDouches: parseInt(nbDouches) || 0,
    nbCuisines: parseInt(nbCuisines) || 0,
    electriciteType,
    electriciteCompteur,
    eauType,
    photos,
    ...extra // id, auteurId, enAvant, actif, createdAt, updatedAt etc.
  };
}

module.exports = { validateAnnonce, buildAnnonce, TYPES_BIEN };