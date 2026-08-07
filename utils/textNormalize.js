// utils/textNormalize.js
/**
 * Normalise une chaîne pour la recherche : minuscules + suppression des accents/diacritiques.
 * Équivalent du normalize() Dart utilisé côté mobile (core/utils/text_normalize.dart).
 */
function normalize(input) {
  if (!input) return '';
  return input
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // retire les diacritiques (accents, tréma, cédille...)
}

module.exports = { normalize };