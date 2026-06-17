const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  deposit,
  withdraw,
  transfer,
  getTransactions,
  getAllUserTransactions
} = require('../controllers/transactionController');

router.use(protect);

router.get('/all', getAllUserTransactions);
router.post('/:id/deposit', deposit);
router.post('/:id/withdraw', withdraw);
router.post('/:id/transfer', transfer);
router.get('/:id/transactions', getTransactions);

module.exports = router;
