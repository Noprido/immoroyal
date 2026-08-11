const TELEPHONE_REGEX = /^\+?[0-9]{8,15}$/;
const NOM_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/;
const NOM_MIN_LETTRES = 2;

function normalizeTelephone(tel) {
  return (tel || '').replace(/[\s\-\.]/g, '').trim();
}

function validateRegisterInput(body) {
  const { nom, telephone, whatsapp, whatsappSame, password, confirmPassword } = body;

  const nomTrim = (nom || '').trim();
  if (!nomTrim) return 'Le nom est obligatoire.';
  if (nomTrim.length > 100) return 'Le nom ne peut pas dépasser 100 caractères.';

  // ─── AJOUT ────────────────────────────────────────────────
  if (!NOM_REGEX.test(nomTrim)) {
    return 'Le nom ne peut contenir que des lettres, espaces, tirets et apostrophes.';
  }
  const nbLettres = (nomTrim.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
  if (nbLettres < NOM_MIN_LETTRES) {
    return 'Veuillez saisir un nom valide.';
  }

  const telNorm = normalizeTelephone(telephone);
  if (!telNorm) return 'Le numéro de téléphone est obligatoire.';
  if (!TELEPHONE_REGEX.test(telNorm)) return 'Le format du numéro de téléphone est invalide.';

  if (!password || !confirmPassword) return 'Veuillez remplir tous les champs obligatoires.';
  if (password.length < 6) return 'Le mot de passe doit contenir au moins 6 caractères.';
  if (password.length > 72) return 'Le mot de passe ne peut pas dépasser 72 caractères.';
  if (password !== confirmPassword) return 'Les mots de passe ne correspondent pas.';

  const memeNumeroWhatsapp = whatsappSame === '1';
  if (!memeNumeroWhatsapp) {
    const waNorm = normalizeTelephone(whatsapp);
    if (!waNorm) return 'Veuillez renseigner votre numéro WhatsApp.';
    if (!TELEPHONE_REGEX.test(waNorm)) return 'Le format du numéro WhatsApp est invalide.';
  }

  return null;
}

function validateLoginInput(body) {
  const { telephone, password } = body;
  const telNorm = normalizeTelephone(telephone);
  if (!telNorm || !password) return 'Veuillez remplir tous les champs.';
  if (password.length > 72) return 'Mot de passe invalide.'; // évite un hash inutile sur un input énorme
  return null;
}

module.exports = { normalizeTelephone, validateRegisterInput, validateLoginInput, TELEPHONE_REGEX };