const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Sur Render (ou tout autre hébergeur) : lu depuis la variable d'environnement
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // En local sur ta machine : lu depuis le fichier (jamais commité)
  serviceAccount = require('../config/firebase-service-account.json');
}

const app = initializeApp({
  credential: cert(serviceAccount),
});

const messaging = getMessaging(app);

module.exports = { messaging };