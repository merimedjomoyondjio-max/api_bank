const Transaction = require('../models/Transaction');
const Account = require('../models/Account');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

exports.deposit = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { amount, description } = req.body;
    const accountId = req.params.id;

    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }

    const account = await Account.findOne({
      where: {
        id: accountId,
        userId: req.user.id
      }
    });

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    const newTransaction = await Transaction.create({
      accountId: accountId,
      type: 'depot',
      amount: amount,
      description: description || 'Dépôt en espèces',
      status: 'complete'
    }, { transaction });

    account.balance = parseFloat(account.balance) + parseFloat(amount);
    await account.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      transaction: newTransaction,
      newBalance: account.balance
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.withdraw = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { amount, description } = req.body;
    const accountId = req.params.id;

    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }

    const account = await Account.findOne({
      where: {
        id: accountId,
        userId: req.user.id
      }
    });

    if (!account) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    if (parseFloat(account.balance) < parseFloat(amount)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Solde insuffisant',
        balance: account.balance
      });
    }

    const newTransaction = await Transaction.create({
      accountId: accountId,
      type: 'retrait',
      amount: amount,
      description: description || 'Retrait en espèces',
      status: 'complete'
    }, { transaction });

    account.balance = parseFloat(account.balance) - parseFloat(amount);
    await account.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      transaction: newTransaction,
      newBalance: account.balance
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.transfer = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { toAccountId, amount, description } = req.body;
    const fromAccountId = req.params.id;

    if (!amount || amount <= 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Montant invalide'
      });
    }

    const fromAccount = await Account.findOne({
      where: {
        id: fromAccountId,
        userId: req.user.id
      }
    });

    if (!fromAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Compte source non trouvé'
      });
    }

    if (parseFloat(fromAccount.balance) < parseFloat(amount)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Solde insuffisant',
        balance: fromAccount.balance
      });
    }

    const toAccount = await Account.findByPk(toAccountId);
    if (!toAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Compte destinataire non trouvé'
      });
    }

    if (toAccount.id === fromAccount.id) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Impossible de transférer vers le même compte'
      });
    }

    const newTransaction = await Transaction.create({
      accountId: fromAccountId,
      type: 'transfert',
      amount: amount,
      description: description || `Transfert vers ${toAccount.accountNumber}`,
      fromAccountNumber: fromAccount.accountNumber,
      toAccountNumber: toAccount.accountNumber,
      status: 'complete'
    }, { transaction });

    fromAccount.balance = parseFloat(fromAccount.balance) - parseFloat(amount);
    toAccount.balance = parseFloat(toAccount.balance) + parseFloat(amount);

    await fromAccount.save({ transaction });
    await toAccount.save({ transaction });

    await transaction.commit();

    res.status(200).json({
      success: true,
      transaction: newTransaction,
      fromBalance: fromAccount.balance,
      toBalance: toAccount.balance
    });
  } catch (error) {
    await transaction.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const { limit = 50, page = 1, type, startDate, endDate } = req.query;
    const accountId = req.params.id;

    const account = await Account.findOne({
      where: {
        id: accountId,
        userId: req.user.id
      }
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Compte non trouvé'
      });
    }

    const whereClause = { accountId };
    
    if (type) {
      whereClause.type = type;
    }

    if (startDate && endDate) {
      whereClause.createdAt = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await Transaction.count({ where: whereClause });

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.getAllUserTransactions = async (req, res) => {
  try {
    const { limit = 50, page = 1 } = req.query;

    const accounts = await Account.findAll({
      where: { userId: req.user.id },
      attributes: ['id']
    });

    const accountIds = accounts.map(acc => acc.id);

    const transactions = await Transaction.findAll({
      where: {
        accountId: {
          [Op.in]: accountIds
        }
      },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      include: ['account']
    });

    const total = await Transaction.count({
      where: {
        accountId: {
          [Op.in]: accountIds
        }
      }
    });

    res.status(200).json({
      success: true,
      transactions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
