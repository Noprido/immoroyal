const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');

const db = {
  read(collection) {
    const filePath = path.join(DATA_DIR, `${collection}.json`);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      return [];
    }
  },

  write(collection, data) {
    const filePath = path.join(DATA_DIR, `${collection}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  },

  findById(collection, id) {
    return this.read(collection).find(item => item.id === id) || null;
  },

  insert(collection, item) {
    const data = this.read(collection);
    data.push(item);
    this.write(collection, data);
    return item;
  },

  update(collection, id, updates) {
    const data = this.read(collection);
    const index = data.findIndex(item => item.id === id);
    if (index === -1) return null;
    data[index] = { ...data[index], ...updates };
    this.write(collection, data);
    return data[index];
  },

  delete(collection, id) {
    const data = this.read(collection);
    const filtered = data.filter(item => item.id !== id);
    this.write(collection, filtered);
    return filtered.length < data.length;
  }
};

module.exports = db;
