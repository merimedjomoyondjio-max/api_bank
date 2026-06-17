const User = require('../models/User');
const Account = require('../models/Account');
const Transaction = require('../models/Transaction');
const Bank = require('../models/Bank');
const sequelize = require('../config/database');
const { Op } = require('sequelize');

exports.getStats = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [userCount, bankCount, accountCount, txCount, monthlyTx, accounts, txByType] = await Promise.all([
      User.count(),
      Bank.count(),
      Account.count({ where: { status: 'actif' } }),
      Transaction.count({ where: { status: 'complete' } }),
      Transaction.count({ where: { createdAt: { [Op.gte]: startOfMonth }, status: 'complete' } }),
      Account.findAll({ attributes: ['balance'] }),
      Transaction.findAll({
        attributes: ['type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['type'],
        raw: true
      })
    ]);

    const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.balance || 0), 0);

    const recentTx = await Transaction.findAll({
      order: [['createdAt', 'DESC']],
      limit: 8,
      include: [{
        model: Account, as: 'account',
        attributes: ['accountNumber'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }]
      }]
    });

    res.json({
      success: true,
      stats: { userCount, bankCount, accountCount, txCount, monthlyTx, totalBalance, txByType },
      recentTx
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const { limit = 20, page = 1, search } = req.query;
    const where = {};
    if (search) {
      where[Op.or] = [
        { firstName: { [Op.like]: `%${search}%` } },
        { lastName:  { [Op.like]: `%${search}%` } },
        { email:     { [Op.like]: `%${search}%` } }
      ];
    }
    const users = await User.findAll({
      where,
      attributes: { exclude: ['password'] },
      include: [{ model: Account, as: 'accounts', attributes: ['id', 'balance', 'status', 'type', 'accountNumber'] }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    const total = await User.count({ where });
    res.json({ success: true, users, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    if (user.role === 'admin') return res.status(400).json({ success: false, message: 'Impossible de modifier un admin' });
    await user.update({ isActive: !user.isActive });
    res.json({ success: true, isActive: user.isActive, message: user.isActive ? 'Compte activé' : 'Compte suspendu' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.setUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ success: false, message: 'Rôle invalide' });
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    await user.update({ role });
    res.json({ success: true, message: `Rôle mis à jour : ${role}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllAccounts = async (req, res) => {
  try {
    const { limit = 20, page = 1, bankId } = req.query;
    const where = bankId ? { bankId } : {};
    const accounts = await Account.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] },
        { model: Bank, as: 'bank', attributes: ['name', 'code'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    const total = await Account.count({ where });
    res.json({ success: true, accounts, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const transactions = await Transaction.findAll({
      include: [{
        model: Account, as: 'account',
        attributes: ['accountNumber'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }]
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    const total = await Transaction.count();
    res.json({ success: true, transactions, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
