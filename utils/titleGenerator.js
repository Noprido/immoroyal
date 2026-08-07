const categories = require('../data/categories.json');

function findCategorie(typeBien) {
  return categories.find(c => c.value === typeBien) || null;
}

function pieceWordMasculin(n, singulier, pluriel) {
  const num = parseInt(n) || 0;
  if (num === 1) return `un ${singulier}`;
  return `${num} ${pluriel}`;
}

function pieceWordFeminin(n, singulier, pluriel) {
  const num = parseInt(n) || 0;
  if (num === 1) return `une ${singulier}`;
  return `${num} ${pluriel}`;
}

function genererTitre(annonceData) {
  const { typeBien, ville, nbChambres, nbSalons, nbPieces, standing, dimension } = annonceData;
  const cat = findCategorie(typeBien);
  const format = cat ? cat.titreFormat : 'simple';
  const supportsStanding = cat ? cat.champsCaracteristiques.includes('standing') : false;
  const standingSuffix = (supportsStanding && standing) ? ` ${standing}` : '';

  switch (format) {
    case 'chambresSalon': {
      const chambres = pieceWordFeminin(nbChambres, 'chambre', 'chambres');
      const salons = pieceWordMasculin(nbSalons, 'salon', 'salons');
      return `${chambres} ${salons}${standingSuffix} à ${ville}`;
    }
    case 'pieces': {
      const pieces = pieceWordFeminin(nbPieces, 'pièce', 'pièces');
      return `${typeBien} ${pieces}${standingSuffix} à ${ville}`;
    }
    case 'terrain':
      return `Terrain ${dimension}m² à ${ville}`;
    case 'simple':
    default:
      return `${typeBien} à ${ville}`;
  }
}

module.exports = { genererTitre, findCategorie };