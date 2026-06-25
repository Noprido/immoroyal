const fs = require('fs');
const path = require('path');

const ANNONCES_FILE = path.join(__dirname, '../data/annonces.json');

function readAnnonces() {
  try {
    const data = fs.readFileSync(ANNONCES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeAnnonces(annonces) {
  fs.writeFileSync(ANNONCES_FILE, JSON.stringify(annonces, null, 2));
}

function findAnnonceById(id) {
  return readAnnonces().find(a => a.id === id);
}

function createAnnonce(annonce) {
  const annonces = readAnnonces();
  annonces.push(annonce);
  writeAnnonces(annonces);
}

function updateAnnonce(id, updates) {
  const annonces = readAnnonces();
  const index = annonces.findIndex(a => a.id === id);
  if (index === -1) return false;
  annonces[index] = { ...annonces[index], ...updates };
  writeAnnonces(annonces);
  return annonces[index];
}

function deleteAnnonce(id) {
  const annonces = readAnnonces();
  const filtered = annonces.filter(a => a.id !== id);
  writeAnnonces(filtered);
}

function searchAnnonces({ ville, quartier, typeBien, prixMin, prixMax }) {
  let annonces = readAnnonces().filter(a => a.statut === 'actif');

  if (ville) annonces = annonces.filter(a => a.ville.toLowerCase().includes(ville.toLowerCase()));
  if (quartier) annonces = annonces.filter(a => a.quartier.toLowerCase().includes(quartier.toLowerCase()));
  if (typeBien) annonces = annonces.filter(a => a.typeBien === typeBien);
  if (prixMin) annonces = annonces.filter(a => a.loyer >= parseInt(prixMin));
  if (prixMax) annonces = annonces.filter(a => a.loyer <= parseInt(prixMax));

  return annonces.sort((a, b) => new Date(b.datePublication) - new Date(a.datePublication));
}

module.exports = {
  readAnnonces,
  writeAnnonces,
  findAnnonceById,
  createAnnonce,
  updateAnnonce,
  deleteAnnonce,
  searchAnnonces
};
