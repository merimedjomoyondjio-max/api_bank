const Account = require('../models/Account');
const User = require('../models/User');
const sequelize = require('../config/database');

exports.createAccount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { type, currency, initialDeposit, bankId } = req.body;

    const account = await Account.create({
      userId: req.user.id,
      type: type || 'compte_courant',
      currency: currency || 'XAF',
      balance: initialDeposit || 0,
      bankId: bankId || null
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      account
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']]
    });

    res.status(200).json({
      success: true,
      count: accounts.length,
      accounts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAccount = async (req, res) => {
  try {
    const account = await Account.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    res.status(200).json({
      success: true,
      account
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getBalance = async (req, res) => {
  try {
    const account = await Account.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    res.status(200).json({
      success: true,
      balance: account.balance,
      currency: account.currency,
      accountNumber: account.accountNumber
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.closeAccount = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const account = await Account.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    if (account.balance > 0) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de fermer un compte avec un solde positif'
      });
    }

    await account.update({ status: 'ferme' }, { transaction });
    await transaction.commit();

    res.status(200).json({
      success: true,
      message: 'Compte fermé avec succès'
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
