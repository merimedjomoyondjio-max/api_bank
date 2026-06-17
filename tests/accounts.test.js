process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const { get, post, del, registerUser, registerAdmin, createBank, createAccount } = require('./helpers');

let userToken, adminToken, bankId, accountId;

beforeAll(async () => {
  const admin = await registerAdmin();
  const user  = await registerUser({ email: `acc_${Date.now()}@test.cm` });
  adminToken  = admin.token;
  userToken   = user.token;

  const bank = await createBank(adminToken, { code: `AB${Date.now().toString().slice(-4)}` });
  bankId = bank.id;
});

// ─────────────────────────────────────────
// CREATE ACCOUNT
// ─────────────────────────────────────────
describe('POST /api/accounts', () => {
  test('201 — creates a current account', async () => {
    const res = await post('/api/accounts', userToken, {
      type:     'compte_courant',
      currency: 'XAF',
      bankId
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.account).toBeDefined();
    expect(res.body.account.accountNumber).toMatch(/^CM/);
    expect(res.body.account.currency).toBe('XAF');
    accountId = res.body.account.id;
  });

  test('201 — creates a savings account with initial deposit', async () => {
    const res = await post('/api/accounts', userToken, {
      type:           'compte_epargne',
      currency:       'XAF',
      bankId,
      initialDeposit: 50000
    });
    expect(res.status).toBe(201);
    expect(res.body.account.type).toBe('compte_epargne');
    expect(parseFloat(res.body.account.balance)).toBe(50000);
  });

  test('201 — creates a business account', async () => {
    const res = await post('/api/accounts', userToken, {
      type:     'compte_entreprise',
      currency: 'XAF',
      bankId
    });
    expect(res.status).toBe(201);
    expect(res.body.account.type).toBe('compte_entreprise');
  });

  test('401 — requires authentication', async () => {
    const res = await post('/api/accounts', null, { type: 'compte_courant', bankId });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET ALL ACCOUNTS
// ─────────────────────────────────────────
describe('GET /api/accounts', () => {
  test('200 — returns list of user accounts', async () => {
    const res = await get('/api/accounts', userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.accounts)).toBe(true);
    expect(res.body.accounts.length).toBeGreaterThanOrEqual(1);
  });

  test('401 — requires authentication', async () => {
    const res = await get('/api/accounts');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET SINGLE ACCOUNT
// ─────────────────────────────────────────
describe('GET /api/accounts/:id', () => {
  test('200 — returns account details', async () => {
    const res = await get(`/api/accounts/${accountId}`, userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.account.id).toBe(accountId);
  });

  test('404 — returns 404 for unknown account', async () => {
    const res = await get('/api/accounts/00000000-0000-0000-0000-000000000000', userToken);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('404 — cannot access another user account', async () => {
    const other = await registerUser({ email: `other_${Date.now()}@test.cm` });
    const res   = await get(`/api/accounts/${accountId}`, other.token);
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────
// GET BALANCE
// ─────────────────────────────────────────
describe('GET /api/accounts/:id/balance', () => {
  test('200 — returns account balance', async () => {
    const res = await get(`/api/accounts/${accountId}/balance`, userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.balance).toBeDefined();
    expect(res.body.currency).toBe('XAF');
    expect(res.body.accountNumber).toMatch(/^CM/);
  });
});

// ─────────────────────────────────────────
// CLOSE ACCOUNT
// ─────────────────────────────────────────
describe('DELETE /api/accounts/:id', () => {
  test('400 — cannot close account with positive balance', async () => {
    // savings account has 50 000 FCFA balance
    const listRes = await get('/api/accounts', userToken);
    const withBalance = listRes.body.accounts.find(a => parseFloat(a.balance) > 0);
    expect(withBalance).toBeDefined();

    const res = await del(`/api/accounts/${withBalance.id}`, userToken);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('200 — closes account with zero balance', async () => {
    // accountId was created with 0 balance
    const res = await del(`/api/accounts/${accountId}`, userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('401 — requires authentication', async () => {
    const res = await del(`/api/accounts/${accountId}`);
    expect(res.status).toBe(401);
  });
});
