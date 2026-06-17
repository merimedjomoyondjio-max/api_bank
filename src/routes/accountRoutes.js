const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  createAccount,
  getAccounts,
  getAccount,
  getBalance,
  closeAccount
} = require('../controllers/accountController');

router.use(protect);

router.post('/', createAccount);
router.get('/', getAccounts);
router.get('/:id', getAccount);
router.get('/:id/balance', getBalance);
router.delete('/:id', closeAccount);

module.exports = router;
