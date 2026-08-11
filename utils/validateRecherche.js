const { TYPES_BIEN } = require('./validateAnnonce');

const TYPES_BIEN_RECHERCHE = [...TYPES_BIEN, 'Autre'];
const TYPES_TRANSACTION_RECHERCHE = ['location', 'achat'];

function validateRecherche(body) {
  const {
    titre, typeBien, autreTypeBien, typeTransaction,
    localisationImporte, ville,
    budgetMax
  } = body;

  if (!titre || titre.trim() === '') return 'Le titre est obligatoire.';
  if (titre.trim().length > 120) return 'Le titre ne peut pas dépasser 120 caractères.';

  if (!typeBien) return 'Le type de bien est obligatoire.';
  if (!TYPES_BIEN_RECHERCHE.includes(typeBien)) return 'Type de bien invalide.';

  if (typeBien === 'Autre' && (!autreTypeBien || autreTypeBien.trim() === '')) {
    return 'Précisez le type de bien recherché.';
  }

  if (!typeTransaction) return 'Le type de transaction est obligatoire.';
  if (!TYPES_TRANSACTION_RECHERCHE.includes(typeTransaction)) return 'Type de transaction invalide.';

  const importe = localisationImporte === 'on';
  if (!importe && (!ville || ville.trim() === '')) {
    return 'Indiquez une ville ou cochez "La localisation m\'importe peu".';
  }

  if (!budgetMax || budgetMax.toString().trim() === '') return 'Le budget maximum est obligatoire.';
  if (parseInt(budgetMax) <= 0) return 'Le budget maximum doit être supérieur à 0.';

  return null; // pas d'erreur
}

module.exports = { validateRecherche, TYPES_BIEN_RECHERCHE, TYPES_TRANSACTION_RECHERCHE };