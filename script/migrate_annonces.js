// scripts/migrate_annonces.js
const fs = require('fs');
const path = require('path');
const categories = require('../data/categories.json');
const { genererTitre } = require('../utils/titleGenerator');

const DATA_PATH = path.join(__dirname, '../data/annonces.json');
const BACKUP_PATH = path.join(__dirname, '../data/annonces.backup-' + Date.now() + '.json');

function findCategorie(typeBien) {
  return categories.find(c => c.value === typeBien) || null;
}

function migrer(annonce) {
  const cat = findCategorie(annonce.typeBien);
  const champs = cat ? cat.champsCaracteristiques : [];
  const estDimension = cat ? cat.afficheDimension : false;
  const supportsStanding = champs.includes('standing');

  const nbChambres = champs.includes('nbChambres') ? (parseInt(annonce.nbChambres) || 0) : 0;
  const nbSalons   = champs.includes('nbSalons')   ? (parseInt(annonce.nbSalons)   || 0) : 0;
  const nbDouches  = champs.includes('nbDouches')  ? (parseInt(annonce.nbDouches)  || 0) : 0;
  const nbCuisines = champs.includes('nbCuisines') ? (parseInt(annonce.nbCuisines) || 0) : 0;
  const nbPieces = nbChambres + nbSalons + nbDouches + nbCuisines;

  // standing/dimension : conserve la valeur si déjà migrée manuellement, sinon null/0
  const standing = supportsStanding
    ? (annonce.standing !== undefined ? annonce.standing : null)
    : null;
  const dimension = estDimension
    ? (annonce.dimension !== undefined ? annonce.dimension : 0)
    : 0;

  // prix/loyer : uniformise selon typeTransaction (certaines vieilles annonces n'ont que "loyer")
  const estVente = annonce.typeTransaction === 'vente';
  const prix  = estVente ? (annonce.prix || annonce.loyer || 0) : 0;
  const loyer = estVente ? 0 : (annonce.loyer || annonce.prix || 0);

  const dataPourTitre = {
    typeBien: annonce.typeBien,
    ville: annonce.ville,
    nbChambres,
    nbSalons,
    nbPieces,
    standing,
    dimension
  };

  const titre = cat ? genererTitre(dataPourTitre) : annonce.titre;

  return {
    ...annonce,
    prix,
    loyer,
    nbChambres,
    nbSalons,
    nbDouches,
    nbCuisines,
    nbPieces,
    standing,
    dimension,
    electriciteType: estDimension ? '' : (annonce.electriciteType || ''),
    electriciteCompteur: estDimension ? '' : (annonce.electriciteCompteur || ''),
    eauType: estDimension ? '' : (annonce.eauType || ''),
    titre
  };
}

function run() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const annonces = JSON.parse(raw);

  fs.writeFileSync(BACKUP_PATH, raw);

  const idsVus = new Map();
  const anomalies = [];

  const migrees = annonces.map((a, i) => {
    if (!findCategorie(a.typeBien)) {
      anomalies.push(`Ligne ${i} (id: ${a.id || 'absent'}) : typeBien inconnu "${a.typeBien}" — titre NON régénéré.`);
    }
    if (a.id) {
      if (idsVus.has(a.id)) {
        anomalies.push(`Id dupliqué "${a.id}" : présent aux index ${idsVus.get(a.id)} et ${i} (typeBien différents possibles).`);
      } else {
        idsVus.set(a.id, i);
      }
    }
    return migrer(a);
  });

  fs.writeFileSync(DATA_PATH, JSON.stringify(migrees, null, 2));

  console.log(`✅ Migration terminée : ${migrees.length} annonces traitées.`);
  console.log(`📦 Sauvegarde de l'ancien fichier : ${BACKUP_PATH}`);

  if (anomalies.length > 0) {
    console.log(`\n⚠️  ${anomalies.length} anomalie(s) à vérifier manuellement :`);
    anomalies.forEach(a => console.log(' - ' + a));
  }
}

run();