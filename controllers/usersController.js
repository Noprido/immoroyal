const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '../data/users.json');

function readUsers() {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUserById(id) {
  return readUsers().find(u => u.id === id);
}

function findUserByEmail(email) {
  return readUsers().find(u => u.email === email.toLowerCase().trim());
}

function createUser(userData) {
  const users = readUsers();
  users.push(userData);
  writeUsers(users);
}

function updateUser(id, updates) {
  const users = readUsers();
  const index = users.findIndex(u => u.id === id);
  if (index === -1) return false;
  users[index] = { ...users[index], ...updates };
  writeUsers(users);
  return users[index];
}

function deleteUser(id) {
  const users = readUsers();
  const filtered = users.filter(u => u.id !== id);
  writeUsers(filtered);
}

module.exports = {
  readUsers,
  writeUsers,
  findUserById,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser
};
