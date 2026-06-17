const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Bank = sequelize.define('Bank', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { notEmpty: { msg: 'Le nom de la banque est requis' } }
  },
  code: {
    type: DataTypes.STRING,
    unique: { msg: 'Ce code banque existe déjà' }
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: { isEmail: { msg: 'Email invalide' } }
  },
  phone: { type: DataTypes.STRING, allowNull: true },
  city:  { type: DataTypes.STRING, allowNull: true },
  country: { type: DataTypes.STRING, defaultValue: 'Cameroon' },
  description: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('actif', 'inactif'),
    defaultValue: 'actif'
  }
}, {
  hooks: {
    beforeValidate: (bank) => {
      if (!bank.code) {
        bank.code = 'BNK' + Math.random().toString(36).substr(2, 6).toUpperCase();
      }
    }
  }
});

module.exports = Bank;
