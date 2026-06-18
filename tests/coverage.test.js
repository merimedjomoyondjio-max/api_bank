/**
 * Targeted tests to reach 100% coverage.
 * Covers: catch blocks (via mock), missing 404/400 paths,
 * conditional branches, errorHandler, app OPTIONS, auth edge case.
 *
 * NOTE: Sequelize v6 — findByPk → findOne → findAll internally.
 * Never mock User.findAll when auth middleware is active (it would
 * intercept the findByPk call and return 401). Mock User.count instead
 * for getAllUsers, or mock findByPk directly with .mockResolvedValueOnce.
 */
process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const request = require('supertest');
const app     = require('../src/app');
const jwt     = require('jsonwebtoken');

const { get, post, put, del, registerUser, registerAdmin, createBank, createAccount } = require('./helpers');

/* ── shared state ─────────────────────────────────────────── */
let adminToken, userToken, userId, bankId, accId;

beforeAll(async () => {
  const admin = await registerAdmin();
  const user  = await registerUser({ email: `cov_${Date.now()}@test.cm` });
  adminToken  = admin.token;
  userToken   = user.token;
  userId      = user.id;

  const bank  = await createBank(adminToken, { code: `CV${Date.now().toString().slice(-4)}` });
  bankId      = bank.id;
  const acc   = await createAccount(userToken, bankId, { initialDeposit: 10000 });
  accId       = acc.id;
});

afterEach(() => jest.restoreAllMocks());

/* ════════════════════════════════════════════════════════════
   1. ERROR HANDLER — unit test (direct call)
   ════════════════════════════════════════════════════════════ */
describe('Middleware — errorHandler (unit)', () => {
  const handler = require('../src/middleware/errorHandler');
  const mockRes = () => {
    const r = {};
    r.status = jest.fn().mockReturnValue(r);
    r.json   = jest.fn().mockReturnValue(r);
    return r;
  };

  test('handles SequelizeValidationError → 400', () => {
    const err = { name: 'SequelizeValidationError', errors: [{ message: 'Field required' }] };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, errors: ['Field required'] }));
  });

  test('handles SequelizeUniqueConstraintError → 400', () => {
    const err = { name: 'SequelizeUniqueConstraintError', errors: [{ message: 'Duplicate entry' }] };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles SequelizeForeignKeyConstraintError → 400', () => {
    const err = { name: 'SequelizeForeignKeyConstraintError', message: 'FK fail' };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('handles generic error with custom statusCode', () => {
    const err = { message: 'Unprocessable', statusCode: 422 };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Unprocessable' }));
  });

  test('handles generic error without statusCode → 500', () => {
    const err = { message: 'Something broke' };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('handles generic error without message → default message', () => {
    // covers the `error.message || 'Erreur interne...'` false branch (line 34)
    const err = { statusCode: 503 };
    const res = mockRes();
    handler(err, {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Erreur interne du serveur' }));
  });
});

/* ════════════════════════════════════════════════════════════
   2. APP — catch-all SPA route + OPTIONS preflight
   ════════════════════════════════════════════════════════════ */
describe('App — catch-all + CORS OPTIONS', () => {
  test('GET /any/page serves index.html (200)', async () => {
    const res = await get('/some/frontend/page');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/BIREC/i);
  });

  test('OPTIONS request returns 200 (CORS preflight branch)', async () => {
    // covers `if (req.method === 'OPTIONS') return res.sendStatus(200)` true branch
    const res = await request(app).options('/api/auth/login');
    expect(res.status).toBe(200);
  });
});

/* ════════════════════════════════════════════════════════════
   3. AUTH MIDDLEWARE — valid JWT but user not in DB (line 25)
   ════════════════════════════════════════════════════════════ */
describe('Auth middleware — deleted user', () => {
  test('401 — valid JWT for non-existent user ID', async () => {
    const ghost = jwt.sign({ id: '00000000-0000-0000-0000-000000000099' }, 'birec-test-secret-2026', { expiresIn: '1h' });
    const res = await get('/api/auth/profile', ghost);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/trouvé|found/i);
  });
});

/* ════════════════════════════════════════════════════════════
   4. AUTH CONTROLLER — catch blocks
   ════════════════════════════════════════════════════════════ */
describe('authController — 500 catch blocks', () => {
  test('login — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post('/api/auth/login', null, { email: 'x@x.cm', password: 'pass' });
    expect(res.status).toBe(500);
  });

  test('register — User.create crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findOne').mockResolvedValueOnce(null);
    jest.spyOn(User, 'create').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post('/api/auth/register', null, {
      firstName: 'A', lastName: 'B',
      email: `crash_${Date.now()}@test.cm`,
      password: 'Pass1!', phone: '+237 600 000 000'
    });
    expect(res.status).toBe(500);
  });

  test('getProfile — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findByPk')
      .mockResolvedValueOnce({ id: 'u1', role: 'user' })
      .mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/auth/profile', userToken);
    expect(res.status).toBe(500);
  });

  test('updateProfile — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findByPk')
      .mockResolvedValueOnce({ id: 'u1', role: 'user' })
      .mockRejectedValueOnce(new Error('DB crash'));
    const res = await put('/api/auth/profile', userToken, { firstName: 'X', lastName: 'Y' });
    expect(res.status).toBe(500);
  });

  test('changePassword — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findByPk')
      .mockResolvedValueOnce({ id: 'u1', role: 'user' })
      .mockRejectedValueOnce(new Error('DB crash'));
    const res = await put('/api/auth/change-password', userToken, {
      currentPassword: 'p', newPassword: 'q'
    });
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   5. ACCOUNT CONTROLLER — catch blocks + missing 404 paths + branches
   ════════════════════════════════════════════════════════════ */
describe('accountController — 500 catch blocks + missing paths', () => {
  test('createAccount without type/initialDeposit → uses defaults (branch coverage)', async () => {
    // covers the `type || "compte_courant"` and `initialDeposit || 0` false branches
    const res = await post('/api/accounts', userToken, { bankId });
    expect(res.status).toBe(201);
    expect(res.body.account.type).toBe('compte_courant');
    expect(parseFloat(res.body.account.balance)).toBe(0);
  });

  test('createAccount without bankId → bankId defaults to null (line 16 branch)', async () => {
    // covers the `bankId || null` false branch
    const res = await post('/api/accounts', userToken, { type: 'compte_courant' });
    expect(res.status).toBe(201);
    expect(res.body.account.bankId).toBeNull();
  });

  test('createAccount — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'create').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post('/api/accounts', userToken, { type: 'compte_courant', bankId });
    expect(res.status).toBe(500);
  });

  test('getAccounts — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/accounts', userToken);
    expect(res.status).toBe(500);
  });

  test('getAccount — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get(`/api/accounts/${accId}`, userToken);
    expect(res.status).toBe(500);
  });

  test('getBalance — 404 for unknown account', async () => {
    const res = await get('/api/accounts/00000000-0000-0000-0000-000000000000/balance', userToken);
    expect(res.status).toBe(404);
  });

  test('getBalance — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get(`/api/accounts/${accId}/balance`, userToken);
    expect(res.status).toBe(500);
  });

  test('closeAccount — 404 for unknown account', async () => {
    const res = await del('/api/accounts/00000000-0000-0000-0000-000000000000', userToken);
    expect(res.status).toBe(404);
  });

  test('closeAccount — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await del(`/api/accounts/${accId}`, userToken);
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   6. TRANSACTION CONTROLLER — catch blocks + missing paths + branches
   ════════════════════════════════════════════════════════════ */
describe('transactionController — 500 catch blocks + missing paths', () => {
  test('deposit — DB crash inside tx → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post(`/api/transactions/${accId}/deposit`, userToken, { amount: 500 });
    expect(res.status).toBe(500);
  });

  test('withdraw — 404 for unknown account (lines 86-87)', async () => {
    const res = await post('/api/transactions/00000000-0000-0000-0000-000000000000/withdraw', userToken, { amount: 100 });
    expect(res.status).toBe(404);
  });

  test('withdraw — success without description → uses default (line 106 branch)', async () => {
    // covers `description || "Retrait en espèces"` false branch
    const res = await post(`/api/transactions/${accId}/withdraw`, userToken, { amount: 100 });
    expect(res.status).toBe(200);
    expect(res.body.transaction.description).toBe('Retrait en espèces');
  });

  test('withdraw — DB crash inside tx → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findOne').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post(`/api/transactions/${accId}/withdraw`, userToken, { amount: 100 });
    expect(res.status).toBe(500);
  });

  test('transfer — 400 for zero amount (lines 137-138)', async () => {
    const res = await post(`/api/transactions/${accId}/transfer`, userToken, {
      toAccountId: accId, amount: 0
    });
    expect(res.status).toBe(400);
  });

  test('transfer — 404 for unknown fromAccount (lines 152-153)', async () => {
    const res = await post('/api/transactions/00000000-0000-0000-0000-000000000000/transfer', userToken, {
      toAccountId: accId, amount: 100
    });
    expect(res.status).toBe(404);
  });

  test('transfer — 404 for unknown toAccount (lines 170-171)', async () => {
    const res = await post(`/api/transactions/${accId}/transfer`, userToken, {
      toAccountId: '00000000-0000-0000-0000-000000000000', amount: 100
    });
    expect(res.status).toBe(404);
  });

  test('transfer — DB crash inside tx → 500', async () => {
    const accB = await createAccount(userToken, bankId);
    const Transaction = require('../src/models/Transaction');
    jest.spyOn(Transaction, 'create').mockRejectedValueOnce(new Error('DB crash'));
    const res = await post(`/api/transactions/${accId}/transfer`, userToken, {
      toAccountId: accB.id, amount: 100
    });
    expect(res.status).toBe(500);
  });

  test('getTransactions — 404 for unknown account', async () => {
    const res = await get('/api/transactions/00000000-0000-0000-0000-000000000000/transactions', userToken);
    expect(res.status).toBe(404);
  });

  test('getTransactions — with type filter (branch)', async () => {
    const res = await get(`/api/transactions/${accId}/transactions?type=depot`, userToken);
    expect(res.status).toBe(200);
  });

  test('getTransactions — with date range filter (branch)', async () => {
    const start = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const end   = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const res = await get(`/api/transactions/${accId}/transactions?startDate=${start}&endDate=${end}`, userToken);
    expect(res.status).toBe(200);
  });

  test('getTransactions — DB crash → 500', async () => {
    const Transaction = require('../src/models/Transaction');
    jest.spyOn(Transaction, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get(`/api/transactions/${accId}/transactions`, userToken);
    expect(res.status).toBe(500);
  });

  test('getAllUserTransactions — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/transactions/all', userToken);
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   7. BANK CONTROLLER — catch blocks + missing 404 paths
   ════════════════════════════════════════════════════════════ */
describe('bankController — 500 catch blocks + missing paths', () => {
  test('getBanks — DB crash → 500', async () => {
    const Bank = require('../src/models/Bank');
    jest.spyOn(Bank, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/banks', userToken);
    expect(res.status).toBe(500);
  });

  test('getAllBanks — DB crash → 500', async () => {
    const Bank = require('../src/models/Bank');
    jest.spyOn(Bank, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/banks/all', adminToken);
    expect(res.status).toBe(500);
  });

  test('getBank — DB crash → 500', async () => {
    const Bank = require('../src/models/Bank');
    jest.spyOn(Bank, 'findByPk').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get(`/api/banks/${bankId}`, adminToken);
    expect(res.status).toBe(500);
  });

  test('updateBank — 404 for unknown bank (line 63 true branch)', async () => {
    const res = await put('/api/banks/00000000-0000-0000-0000-000000000000', adminToken, {
      name: 'X', code: 'XX', status: 'actif'
    });
    expect(res.status).toBe(404);
  });

  test('updateBank — DB crash on update → 500', async () => {
    const Bank = require('../src/models/Bank');
    const fakeBank = {
      id: bankId,
      name: 'Test',
      update: jest.fn().mockRejectedValue(new Error('DB crash'))
    };
    jest.spyOn(Bank, 'findByPk').mockResolvedValueOnce(fakeBank);
    const res = await put(`/api/banks/${bankId}`, adminToken, { name: 'X', status: 'actif' });
    expect(res.status).toBe(500);
  });

  test('deleteBank — 404 for unknown bank (line 77 true branch)', async () => {
    const res = await del('/api/banks/00000000-0000-0000-0000-000000000000', adminToken);
    expect(res.status).toBe(404);
  });

  test('deleteBank — 400 when bank has linked accounts', async () => {
    // bankId already has accId linked to it
    const res = await del(`/api/banks/${bankId}`, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/compte/i);
  });

  test('deleteBank — DB crash → 500', async () => {
    const Bank = require('../src/models/Bank');
    jest.spyOn(Bank, 'findByPk').mockRejectedValueOnce(new Error('DB crash'));
    const res = await del(`/api/banks/${bankId}`, adminToken);
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   8. ADMIN CONTROLLER — catch blocks + uncovered paths
   ════════════════════════════════════════════════════════════ */
describe('adminController — 500 catch blocks + missing paths', () => {
  test('getStats — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'count').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/admin/stats', adminToken);
    expect(res.status).toBe(500);
  });

  test('getAllUsers — with search query (branch coverage)', async () => {
    const res = await get('/api/admin/users?search=Jean', adminToken);
    expect(res.status).toBe(200);
  });

  test('getAllUsers — DB crash → 500 (mock User.count, not findAll)', async () => {
    // IMPORTANT: User.findAll is used internally by findByPk (Sequelize v6: findByPk→findOne→findAll)
    // Mocking findAll would block the auth middleware. Mock count instead — it's called after findAll.
    const User = require('../src/models/User');
    jest.spyOn(User, 'count').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/admin/users', adminToken);
    expect(res.status).toBe(500);
  });

  test('toggleUserStatus — 404 for unknown user', async () => {
    const res = await put('/api/admin/users/00000000-0000-0000-0000-000000000000/toggle', adminToken);
    expect(res.status).toBe(404);
  });

  test('toggleUserStatus — 400 when trying to toggle an admin', async () => {
    const admin2 = await registerAdmin();
    const res = await put(`/api/admin/users/${admin2.id}/toggle`, adminToken);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/admin/i);
  });

  test('toggleUserStatus — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findByPk')
      .mockResolvedValueOnce({ id: 'a1', role: 'admin' })
      .mockRejectedValueOnce(new Error('DB crash'));
    const res = await put(`/api/admin/users/${userId}/toggle`, adminToken);
    expect(res.status).toBe(500);
  });

  test('setUserRole — 400 for invalid role', async () => {
    const res = await put(`/api/admin/users/${userId}/role`, adminToken, { role: 'superuser' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/rôle|role/i);
  });

  test('setUserRole — 404 for unknown user', async () => {
    const res = await put('/api/admin/users/00000000-0000-0000-0000-000000000000/role', adminToken, { role: 'user' });
    expect(res.status).toBe(404);
  });

  test('setUserRole — DB crash → 500', async () => {
    const User = require('../src/models/User');
    jest.spyOn(User, 'findByPk')
      .mockResolvedValueOnce({ id: 'a1', role: 'admin' })
      .mockRejectedValueOnce(new Error('DB crash'));
    const res = await put(`/api/admin/users/${userId}/role`, adminToken, { role: 'user' });
    expect(res.status).toBe(500);
  });

  test('getAllAccounts — DB crash → 500', async () => {
    const Account = require('../src/models/Account');
    jest.spyOn(Account, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/admin/accounts', adminToken);
    expect(res.status).toBe(500);
  });

  test('getAllTransactions — DB crash → 500', async () => {
    const Transaction = require('../src/models/Transaction');
    jest.spyOn(Transaction, 'findAll').mockRejectedValueOnce(new Error('DB crash'));
    const res = await get('/api/admin/transactions', adminToken);
    expect(res.status).toBe(500);
  });
});

/* ════════════════════════════════════════════════════════════
   9. TRANSACTION MODEL — beforeCreate reference branch
   ════════════════════════════════════════════════════════════ */
describe('Transaction model — beforeCreate hook branch', () => {
  test('skips reference generation when reference is already provided (line 48 false branch)', async () => {
    const Transaction = require('../src/models/Transaction');
    const tx = await Transaction.create({
      accountId:   accId,
      type:        'depot',
      amount:      1.00,
      reference:   'COVREF001',
      status:      'complete'
    });
    // hook should NOT overwrite the pre-supplied reference
    expect(tx.reference).toBe('COVREF001');
  });
});

/* ════════════════════════════════════════════════════════════
   10. HELPERS — default parameter branches
   ════════════════════════════════════════════════════════════ */
describe('Helpers — default parameter branches', () => {
  test('registerUser() without overrides uses defaults', async () => {
    const { token, user } = await registerUser();
    expect(token).toBeDefined();
    expect(user.firstName).toBe('Jean');
  });

  test('createAccount() without overrides uses defaults', async () => {
    const acc = await createAccount(userToken, bankId);
    expect(acc).toBeDefined();
    expect(acc.type).toBe('compte_courant');
  });

  test('createBank() without overrides uses defaults (line 61 branch)', async () => {
    const bank = await createBank(adminToken);
    expect(bank).toBeDefined();
    expect(bank.name).toBe('Banque Test Cameroun');
  });
});
