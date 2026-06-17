const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getBanks, getAllBanks, getBank,
  createBank, updateBank, deleteBank
} = require('../controllers/bankController');

router.get('/', protect, getBanks);
router.get('/all', protect, authorize('admin'), getAllBanks);
router.get('/:id', protect, authorize('admin'), getBank);
router.post('/', protect, authorize('admin'), createBank);
router.put('/:id', protect, authorize('admin'), updateBank);
router.delete('/:id', protect, authorize('admin'), deleteBank);

module.exports = router;
