const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Bank = require('./Bank');

const Account = sequelize.define('Account', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  accountNumber: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('compte_courant', 'compte_epargne', 'compte_entreprise'),
    defaultValue: 'compte_courant'
  },
  balance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    validate: {
      min: {
        args: [0],
        msg: 'Le solde ne peut pas être négatif'
      }
    }
  },
  currency: {
    type: DataTypes.STRING,
    defaultValue: 'XAF'
  },
  status: {
    type: DataTypes.ENUM('actif', 'ferme', 'suspendu'),
    defaultValue: 'actif'
  },
  interestRate: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  overdraftLimit: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0
  },
  bankId: {
    type: DataTypes.UUID,
    allowNull: true
  }
}, {
  hooks: {
    beforeValidate: (account) => {
      if (!account.accountNumber) {
        const timestamp = Date.now().toString().slice(-10);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        account.accountNumber = 'CM' + timestamp + random;
      }
    }
  }
});

User.hasMany(Account, { foreignKey: 'userId', as: 'accounts' });
Account.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Bank.hasMany(Account, { foreignKey: 'bankId', as: 'accounts' });
Account.belongsTo(Bank, { foreignKey: 'bankId', as: 'bank' });

module.exports = Account;
