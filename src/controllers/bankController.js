const Bank = require('../models/Bank');
const Account = require('../models/Account');

exports.getBanks = async (req, res) => {
  try {
    const banks = await Bank.findAll({
      where: { status: 'actif' },
      order: [['name', 'ASC']]
    });
    res.json({ success: true, banks });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllBanks = async (req, res) => {
  try {
    const banks = await Bank.findAll({
      include: [{ model: Account, as: 'accounts', attributes: ['id', 'status'] }],
      order: [['createdAt', 'DESC']]
    });
    const result = banks.map(b => {
      const json = b.toJSON();
      json.accountCount = json.accounts.length;
      json.activeCount = json.accounts.filter(a => a.status === 'actif').length;
      delete json.accounts;
      return json;
    });
    res.json({ success: true, banks: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getBank = async (req, res) => {
  try {
    const bank = await Bank.findByPk(req.params.id, {
      include: [{
        model: Account, as: 'accounts',
        attributes: ['id', 'accountNumber', 'type', 'balance', 'currency', 'status']
      }]
    });
    if (!bank) return res.status(404).json({ success: false, message: 'Banque non trouvée' });
    res.json({ success: true, bank });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createBank = async (req, res) => {
  try {
    const { name, code, email, phone, city, country, description } = req.body;
    const bank = await Bank.create({ name, code, email, phone, city, country, description });
    res.status(201).json({ success: true, bank });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateBank = async (req, res) => {
  try {
    const bank = await Bank.findByPk(req.params.id);
    if (!bank) return res.status(404).json({ success: false, message: 'Banque non trouvée' });
    const { name, code, email, phone, city, country, description, status } = req.body;
    await bank.update({ name, code, email, phone, city, country, description, status });
    res.json({ success: true, bank });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteBank = async (req, res) => {
  try {
    const bank = await Bank.findByPk(req.params.id, {
      include: [{ model: Account, as: 'accounts', attributes: ['id'] }]
    });
    if (!bank) return res.status(404).json({ success: false, message: 'Banque non trouvée' });
    if (bank.accounts && bank.accounts.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer : ${bank.accounts.length} compte(s) lié(s) à cette banque`
      });
    }
    await bank.destroy();
    res.json({ success: true, message: 'Banque supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
