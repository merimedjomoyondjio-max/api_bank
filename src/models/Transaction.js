const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Account = require('./Account');

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  reference: {
    type: DataTypes.STRING,
    unique: true
  },
  type: {
    type: DataTypes.ENUM('depot', 'retrait', 'transfert', 'paiement'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: {
        args: [0.01],
        msg: 'Le montant doit être supérieur à 0'
      }
    }
  },
  description: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  status: {
    type: DataTypes.ENUM('en_attente', 'complete', 'echoue', 'annule'),
    defaultValue: 'en_attente'
  },
  fromAccountNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  toAccountNumber: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  hooks: {
    beforeCreate: (transaction) => {
      if (!transaction.reference) {
        const timestamp = Date.now().toString();
        const random = Math.random().toString(36).substr(2, 6).toUpperCase();
        transaction.reference = 'TXN' + timestamp + random;
      }
    }
  }
});

Account.hasMany(Transaction, { 
  foreignKey: 'accountId', 
  as: 'transactions' 
});
Transaction.belongsTo(Account, { 
  foreignKey: 'accountId', 
  as: 'account' 
});

module.exports = Transaction;