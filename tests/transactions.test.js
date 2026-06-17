process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const { get, post, registerUser, registerAdmin, createBank, createAccount } = require('./helpers');

let userToken, adminToken, bankId, accA, accB;

beforeAll(async () => {
  const admin = await registerAdmin();
  const user  = await registerUser({ email: `tx_${Date.now()}@test.cm` });
  adminToken  = admin.token;
  userToken   = user.token;

  const bank = await createBank(adminToken, { code: `TX${Date.now().toString().slice(-4)}` });
  bankId = bank.id;

  accA = await createAccount(userToken, bankId);
  accB = await createAccount(userToken, bankId);
});

// ─────────────────────────────────────────
// DEPOSIT
// ─────────────────────────────────────────
describe('POST /api/transactions/:id/deposit', () => {
  test('200 — deposits 10 000 FCFA', async () => {
    const res = await post(`/api/transactions/${accA.id}/deposit`, userToken, {
      amount:      10000,
      description: 'Versement initial'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.type).toBe('depot');
    expect(parseFloat(res.body.newBalance)).toBe(10000);
  });

  test('200 — deposits again, balance accumulates', async () => {
    const res = await post(`/api/transactions/${accA.id}/deposit`, userToken, {
      amount: 5000
    });
    expect(res.status).toBe(200);
    expect(parseFloat(res.body.newBalance)).toBe(15000);
  });

  test('400 — rejects amount = 0', async () => {
    const res = await post(`/api/transactions/${accA.id}/deposit`, userToken, { amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — rejects negative amount', async () => {
    const res = await post(`/api/transactions/${accA.id}/deposit`, userToken, { amount: -500 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('404 — account not found', async () => {
    const res = await post('/api/transactions/00000000-0000-0000-0000-000000000000/deposit', userToken, {
      amount: 1000
    });
    expect(res.status).toBe(404);
  });

  test('401 — requires authentication', async () => {
    const res = await post(`/api/transactions/${accA.id}/deposit`, null, { amount: 1000 });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// WITHDRAWAL
// ─────────────────────────────────────────
describe('POST /api/transactions/:id/withdraw', () => {
  test('200 — withdraws 3 000 FCFA', async () => {
    const res = await post(`/api/transactions/${accA.id}/withdraw`, userToken, {
      amount:      3000,
      description: 'Retrait guichet'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.type).toBe('retrait');
    expect(parseFloat(res.body.newBalance)).toBe(12000);
  });

  test('400 — refuses withdrawal exceeding balance', async () => {
    const res = await post(`/api/transactions/${accA.id}/withdraw`, userToken, {
      amount: 999999
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — rejects zero amount', async () => {
    const res = await post(`/api/transactions/${accA.id}/withdraw`, userToken, { amount: 0 });
    expect(res.status).toBe(400);
  });

  test('401 — requires authentication', async () => {
    const res = await post(`/api/transactions/${accA.id}/withdraw`, null, { amount: 500 });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// TRANSFER
// ─────────────────────────────────────────
describe('POST /api/transactions/:id/transfer', () => {
  test('200 — transfers 5 000 FCFA from accA to accB', async () => {
    const res = await post(`/api/transactions/${accA.id}/transfer`, userToken, {
      toAccountId:  accB.id,
      amount:       5000,
      description:  'Virement test'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transaction.type).toBe('transfert');
    expect(parseFloat(res.body.fromBalance)).toBe(7000); // 12000 - 5000
  });

  test('400 — refuses transfer with insufficient funds', async () => {
    const res = await post(`/api/transactions/${accA.id}/transfer`, userToken, {
      toAccountId: accB.id,
      amount:      999999
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — refuses transfer to same account', async () => {
    const res = await post(`/api/transactions/${accA.id}/transfer`, userToken, {
      toAccountId: accA.id,
      amount:      1000
    });
    expect(res.status).toBe(400);
  });

  test('401 — requires authentication', async () => {
    const res = await post(`/api/transactions/${accA.id}/transfer`, null, {
      toAccountId: accB.id,
      amount:      100
    });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET TRANSACTION HISTORY
// ─────────────────────────────────────────
describe('GET /api/transactions/:id/transactions', () => {
  test('200 — returns transaction history for account', async () => {
    const res = await get(`/api/transactions/${accA.id}/transactions`, userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThan(0);
  });

  test('200 — each transaction has required fields', async () => {
    const res = await get(`/api/transactions/${accA.id}/transactions`, userToken);
    const tx  = res.body.transactions[0];
    expect(tx).toHaveProperty('id');
    expect(tx).toHaveProperty('type');
    expect(tx).toHaveProperty('amount');
    expect(tx).toHaveProperty('status');
    expect(tx).toHaveProperty('reference');
  });

  test('401 — requires authentication', async () => {
    const res = await get(`/api/transactions/${accA.id}/transactions`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET ALL USER TRANSACTIONS
// ─────────────────────────────────────────
describe('GET /api/transactions/all', () => {
  test('200 — returns all transactions across all accounts', async () => {
    const res = await get('/api/transactions/all', userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.transactions)).toBe(true);
    expect(res.body.transactions.length).toBeGreaterThan(0);
  });

  test('200 — supports pagination params', async () => {
    const res = await get('/api/transactions/all?page=1&limit=2', userToken);
    expect(res.status).toBe(200);
    expect(res.body.transactions.length).toBeLessThanOrEqual(2);
  });

  test('401 — requires authentication', async () => {
    const res = await get('/api/transactions/all');
    expect(res.status).toBe(401);
  });
});
