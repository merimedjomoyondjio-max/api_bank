const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getStats, getAllUsers, toggleUserStatus, setUserRole,
  getAllAccounts, getAllTransactions
} = require('../controllers/adminController');

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', getAllUsers);
router.put('/users/:id/toggle', toggleUserStatus);
router.put('/users/:id/role', setUserRole);
router.get('/accounts', getAllAccounts);
router.get('/transactions', getAllTransactions);

module.exports = router;
