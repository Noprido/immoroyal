const fs = require('fs');
const path = require('path');

const CONV_FILE = path.join(__dirname, '../data/conversations.json');
const MSG_FILE = path.join(__dirname, '../data/messages.json');

function readConversations() {
  try { return JSON.parse(fs.readFileSync(CONV_FILE, 'utf-8')); }
  catch { return []; }
}

function writeConversations(data) {
  fs.writeFileSync(CONV_FILE, JSON.stringify(data, null, 2));
}

function readMessages() {
  try { return JSON.parse(fs.readFileSync(MSG_FILE, 'utf-8')); }
  catch { return []; }
}

function writeMessages(data) {
  fs.writeFileSync(MSG_FILE, JSON.stringify(data, null, 2));
}

// Trouver ou créer une conversation entre deux users sur une annonce
function getOrCreateConversation(annonceId, userId1, userId2) {
  const convs = readConversations();
  let conv = convs.find(c =>
    c.annonceId === annonceId &&
    ((c.userId1 === userId1 && c.userId2 === userId2) ||
     (c.userId1 === userId2 && c.userId2 === userId1))
  );
  if (!conv) {
    const { v4: uuidv4 } = require('uuid');
    conv = {
      id: uuidv4(),
      annonceId,
      userId1,
      userId2,
      dateCreation: new Date().toISOString(),
      dernierMessage: null
    };
    convs.push(conv);
    writeConversations(convs);
  }
  return conv;
}

function getMessagesOfConversation(convId) {
  return readMessages()
    .filter(m => m.conversationId === convId)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function sendMessage(convId, senderId, texte) {
  const { v4: uuidv4 } = require('uuid');
  const messages = readMessages();
  const msg = {
    id: uuidv4(),
    conversationId: convId,
    senderId,
    texte,
    date: new Date().toISOString(),
    lu: false
  };
  messages.push(msg);
  writeMessages(messages);

  // Mettre à jour le dernier message dans la conversation
  const convs = readConversations();
  const idx = convs.findIndex(c => c.id === convId);
  if (idx !== -1) {
    convs[idx].dernierMessage = { texte, date: msg.date, senderId };
    writeConversations(convs);
  }

  return msg;
}

function getUserConversations(userId) {
  return readConversations()
    .filter(c => c.userId1 === userId || c.userId2 === userId)
    .sort((a, b) => {
      const da = a.dernierMessage?.date || a.dateCreation;
      const db = b.dernierMessage?.date || b.dateCreation;
      return new Date(db) - new Date(da);
    });
}

function countUnread(userId) {
  const convIds = getUserConversations(userId).map(c => c.id);
  return readMessages().filter(m =>
    convIds.includes(m.conversationId) && m.senderId !== userId && !m.lu
  ).length;
}

module.exports = {
  readConversations,
  readMessages,
  getOrCreateConversation,
  getMessagesOfConversation,
  sendMessage,
  getUserConversations,
  countUnread
};
