const { messaging } = require('./firebaseAdmin');
const db = require('./db');

/**
 * Envoie une notification push à un utilisateur pour un nouveau message.
 * @param {string} destinataireId - id de l'utilisateur qui reçoit la notif
 * @param {string} texte - contenu du message
 * @param {string} expediteurNom - nom de la personne qui envoie le message
 * @param {string} conversationId - pour permettre la navigation au tap
 */
async function envoyerNotificationMessage(destinataireId, texte, expediteurNom, conversationId) {
  const destinataire = db.findById('users', destinataireId);
  if (!destinataire || !destinataire.fcmTokens || destinataire.fcmTokens.length === 0) {
    return; // pas de token enregistré, rien à faire
  }

    const message = {
    notification: {
        title: expediteurNom,
        body: texte.length > 100 ? `${texte.slice(0, 100)}...` : texte,
    },
    android: {
        notification: {
        icon: 'ic_notification',
        color: '#000000',
        },
    },
    data: {
        type: 'message',
        conversationId: conversationId || '',
    },
    tokens: destinataire.fcmTokens,
    };

  try {
    const response = await messaging.sendEachForMulticast(message);

    // Nettoyage des tokens invalides/expirés
    const tokensInvalides = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered') {
          tokensInvalides.push(destinataire.fcmTokens[idx]);
        }
      }
    });

    if (tokensInvalides.length > 0) {
      const tokensRestants = destinataire.fcmTokens.filter(t => !tokensInvalides.includes(t));
      db.update('users', destinataireId, { fcmTokens: tokensRestants });
      console.log(`🧹 ${tokensInvalides.length} token(s) FCM invalide(s) retiré(s) pour ${destinataireId}`);
    }

    console.log(`📤 Notification envoyée: ${response.successCount}/${destinataire.fcmTokens.length} succès`);
  } catch (e) {
    console.error('❌ Erreur envoi notification:', e.message);
    // Ne jamais faire planter la route d'envoi de message à cause d'un échec de notif
  }
}

module.exports = { envoyerNotificationMessage };