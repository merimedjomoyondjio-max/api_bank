const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

const isTest = process.env.NODE_ENV === 'test';

let storage;
/* istanbul ignore else */
if (isTest) {
  storage = ':memory:';
} else {
  const dataDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  storage = path.join(dataDir, 'database.sqlite');
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage,
  logging: false,
  define: {
    timestamps: true,
    underscored: true
  }
});

module.exports = sequelize;
