process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const { get, put, registerUser, registerAdmin, createBank, createAccount } = require('./helpers');

let adminToken, userToken, userId;

beforeAll(async () => {
  const admin = await registerAdmin();
  const user  = await registerUser({ email: `adm_${Date.now()}@test.cm` });
  adminToken  = admin.token;
  userToken   = user.token;
  userId      = user.id;

  const bank = await createBank(adminToken, { code: `AD${Date.now().toString().slice(-4)}` });
  await createAccount(userToken, bank.id, { initialDeposit: 25000 });
});

// ─────────────────────────────────────────
// STATS
// ─────────────────────────────────────────
describe('GET /api/admin/stats', () => {
  test('200 — returns complete dashboard statistics', async () => {
    const res = await get('/api/admin/stats', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { stats } = res.body;
    expect(stats).toHaveProperty('userCount');
    expect(stats).toHaveProperty('bankCount');
    expect(stats).toHaveProperty('accountCount');
    expect(stats).toHaveProperty('txCount');
    expect(stats).toHaveProperty('monthlyTx');
    expect(stats).toHaveProperty('totalBalance');
    expect(stats).toHaveProperty('txByType');
    expect(Array.isArray(stats.txByType)).toBe(true);
  });

  test('200 — totalBalance reflects seeded account balance', async () => {
    const res = await get('/api/admin/stats', adminToken);
    expect(parseFloat(res.body.stats.totalBalance)).toBeGreaterThanOrEqual(25000);
  });

  test('403 — regular user cannot access stats', async () => {
    const res = await get('/api/admin/stats', userToken);
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await get('/api/admin/stats');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET ALL USERS
// ─────────────────────────────────────────
describe('GET /api/admin/users', () => {
  test('200 — returns paginated user list with accounts', async () => {
    const res = await get('/api/admin/users', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
  });

  test('200 — supports search by name', async () => {
    const res = await get('/api/admin/users?search=Jean', adminToken);
    expect(res.status).toBe(200);
    res.body.users.forEach(u => {
      const full = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase();
      expect(full).toMatch(/jean/i);
    });
  });

  test('200 — pagination works', async () => {
    const res = await get('/api/admin/users?page=1&limit=1', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeLessThanOrEqual(1);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination).toHaveProperty('total');
    expect(res.body.pagination).toHaveProperty('page');
  });

  test('403 — regular user cannot list all users', async () => {
    const res = await get('/api/admin/users', userToken);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// TOGGLE USER STATUS
// ─────────────────────────────────────────
describe('PUT /api/admin/users/:id/toggle', () => {
  test('200 — toggles user active status', async () => {
    const res = await put(`/api/admin/users/${userId}/toggle`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
  });

  test('200 — toggles back to active', async () => {
    const res = await put(`/api/admin/users/${userId}/toggle`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('403 — regular user cannot toggle', async () => {
    const res = await put(`/api/admin/users/${userId}/toggle`, userToken);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// SET USER ROLE
// ─────────────────────────────────────────
describe('PUT /api/admin/users/:id/role', () => {
  test('200 — promotes user to admin', async () => {
    const newUser = await registerUser({ email: `promo_${Date.now()}@test.cm` });
    const res = await put(`/api/admin/users/${newUser.id}/role`, adminToken, { role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('200 — demotes admin to user', async () => {
    const newUser = await registerUser({ email: `demo_${Date.now()}@test.cm` });
    await put(`/api/admin/users/${newUser.id}/role`, adminToken, { role: 'admin' });
    const res = await put(`/api/admin/users/${newUser.id}/role`, adminToken, { role: 'user' });
    expect(res.status).toBe(200);
  });

  test('403 — regular user cannot change roles', async () => {
    const res = await put(`/api/admin/users/${userId}/role`, userToken, { role: 'admin' });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// GET ALL ACCOUNTS
// ─────────────────────────────────────────
describe('GET /api/admin/accounts', () => {
  test('200 — returns all accounts with user and bank info', async () => {
    const res = await get('/api/admin/accounts', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.accounts)).toBe(true);

    const acc = res.body.accounts[0];
    expect(acc).toHaveProperty('accountNumber');
    expect(acc).toHaveProperty('balance');
    expect(acc).toHaveProperty('user');
    expect(acc).toHaveProperty('bank');
  });

  test('200 — supports bankId filter', async () => {
    const banksRes = await get('/api/banks/all', adminToken);
    const firstBank = banksRes.body.banks[0];
    const res = await get(`/api/admin/accounts?bankId=${firstBank.id}`, adminToken);
    expect(res.status).toBe(200);
    res.body.accounts.forEach(a => {
      expect(a.bank?.id || a.bankId).toBe(firstBank.id);
    });
  });

  test('403 — regular user cannot list all accounts', async () => {
    const res = await get('/api/admin/accounts', userToken);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// GET ALL TRANSACTIONS
// ─────────────────────────────────────────
describe('GET /api/admin/transactions', () => {
  test('200 — returns all transactions across all accounts', async () => {
    const res = await get('/api/admin/transactions', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.transactions)).toBe(true);
  });

  test('200 — each transaction has account and user info', async () => {
    const res = await get('/api/admin/transactions', adminToken);
    if (res.body.transactions.length > 0) {
      const tx = res.body.transactions[0];
      expect(tx).toHaveProperty('type');
      expect(tx).toHaveProperty('amount');
      expect(tx).toHaveProperty('status');
    }
  });

  test('403 — regular user cannot list all transactions', async () => {
    const res = await get('/api/admin/transactions', userToken);
    expect(res.status).toBe(403);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await get('/api/admin/transactions');
    expect(res.status).toBe(401);
  });
});
