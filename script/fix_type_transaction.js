const db = require('../utils/db');

const annonces = db.read('annonces');
let count = 0;

for (const annonce of annonces) {
  if (!annonce.typeTransaction) {
    db.update('annonces', annonce.id, { typeTransaction: 'location' });
    count++;
    console.log(`✅ Corrigé : ${annonce.titre}`);
  }
}

console.log(`\nMigration terminée — ${count} annonce(s) corrigée(s).`);