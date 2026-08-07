// utils/beninHierarchy.js
const { normalize } = require('./textNormalize');
const departements = require('../data/benin_administratif.json');

// quartierNorm -> [{ quartier, commune, arrondissement }]
// (array car un même nom de quartier peut exister dans plusieurs communes)
const quartierIndex = new Map();
const communesCanoniques = new Set();

for (const dept of departements) {
  for (const commune of dept.communes || []) {
    communesCanoniques.add(commune.nom);
    for (const arr of commune.arrondissements || []) {
      for (const quartier of arr.quartiers || []) {
        const key = normalize(quartier);
        const entry = { quartier, commune: commune.nom, arrondissement: arr.nom };
        if (!quartierIndex.has(key)) quartierIndex.set(key, []);
        // évite les doublons exacts (même commune) si le quartier apparaît 2x dans le même arrondissement
        const list = quartierIndex.get(key);
        if (!list.some(e => e.commune === commune.nom)) list.push(entry);
      }
    }
  }
}

/**
 * Retourne les communes possibles pour un nom de quartier donné.
 * - [] si inconnu
 * - [1 entrée] si non-ambigu (cas majoritaire) -> la ville peut être déduite automatiquement
 * - [2+ entrées] si le quartier existe dans plusieurs communes -> ne pas déduire la ville
 */
function findCommunesForQuartier(quartierBrut) {
  return quartierIndex.get(normalize(quartierBrut)) || [];
}

function getToutesCommunes() {
  return Array.from(communesCanoniques).sort();
}

module.exports = { findCommunesForQuartier, getToutesCommunes };