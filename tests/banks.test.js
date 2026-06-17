process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const { get, post, put, del, registerUser, registerAdmin } = require('./helpers');

let adminToken, userToken, bankId;

beforeAll(async () => {
  const admin = await registerAdmin();
  const user  = await registerUser({ email: `bk_${Date.now()}@test.cm` });
  adminToken  = admin.token;
  userToken   = user.token;
});

// ─────────────────────────────────────────
// CREATE BANK (admin only)
// ─────────────────────────────────────────
describe('POST /api/banks', () => {
  test('201 — admin creates a bank', async () => {
    const res = await post('/api/banks', adminToken, {
      name:    'Banque BIREC Test',
      code:    `BK${Date.now().toString().slice(-5)}`,
      city:    'Douala',
      country: 'Cameroon',
      email:   'contact@birec-test.cm',
      phone:   '+237 233 000 001'
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.bank).toBeDefined();
    expect(res.body.bank.country).toBe('Cameroon');
    bankId = res.body.bank.id;
  });

  test('201 — auto-generates bank code when omitted', async () => {
    const res = await post('/api/banks', adminToken, {
      name:    'Banque Sans Code',
      city:    'Yaoundé',
      country: 'Cameroon'
    });
    expect(res.status).toBe(201);
    expect(res.body.bank.code).toBeDefined();
    expect(res.body.bank.code.length).toBeGreaterThan(0);
  });

  test('403 — regular user cannot create bank', async () => {
    const res = await post('/api/banks', userToken, {
      name: 'Banque Pirate',
      city: 'Kribi'
    });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await post('/api/banks', null, { name: 'Banque Test' });
    expect(res.status).toBe(401);
  });

  test('400 — missing bank name', async () => {
    const res = await post('/api/banks', adminToken, { city: 'Buea' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// GET ACTIVE BANKS (any authenticated user)
// ─────────────────────────────────────────
describe('GET /api/banks', () => {
  test('200 — authenticated user sees active banks', async () => {
    const res = await get('/api/banks', userToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.banks)).toBe(true);
    res.body.banks.forEach(b => expect(b.status).toBe('actif'));
  });

  test('200 — admin also sees active banks', async () => {
    const res = await get('/api/banks', adminToken);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.banks)).toBe(true);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await get('/api/banks');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET ALL BANKS (admin only)
// ─────────────────────────────────────────
describe('GET /api/banks/all', () => {
  test('200 — admin gets all banks with account stats', async () => {
    const res = await get('/api/banks/all', adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.banks)).toBe(true);
    const bank = res.body.banks[0];
    expect(bank).toHaveProperty('accountCount');
    expect(bank).toHaveProperty('activeCount');
  });

  test('403 — regular user cannot access /all', async () => {
    const res = await get('/api/banks/all', userToken);
    expect(res.status).toBe(403);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await get('/api/banks/all');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// GET SINGLE BANK (admin only)
// ─────────────────────────────────────────
describe('GET /api/banks/:id', () => {
  test('200 — admin gets bank details', async () => {
    const res = await get(`/api/banks/${bankId}`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bank.id).toBe(bankId);
  });

  test('404 — unknown bank id', async () => {
    const res = await get('/api/banks/00000000-0000-0000-0000-000000000000', adminToken);
    expect(res.status).toBe(404);
  });

  test('403 — user cannot access', async () => {
    const res = await get(`/api/banks/${bankId}`, userToken);
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// UPDATE BANK (admin only)
// ─────────────────────────────────────────
describe('PUT /api/banks/:id', () => {
  test('200 — admin updates bank city and phone', async () => {
    const res = await put(`/api/banks/${bankId}`, adminToken, {
      name:   'Banque BIREC Test (Modifiée)',
      city:   'Bafoussam',
      status: 'actif'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.bank.city).toBe('Bafoussam');
  });

  test('200 — can deactivate bank', async () => {
    const res = await put(`/api/banks/${bankId}`, adminToken, {
      name:   'Banque BIREC Test (Modifiée)',
      status: 'inactif'
    });
    expect(res.status).toBe(200);
    expect(res.body.bank.status).toBe('inactif');

    // reactivate for subsequent tests
    await put(`/api/banks/${bankId}`, adminToken, { name: 'Banque BIREC Test (Modifiée)', status: 'actif' });
  });

  test('403 — user cannot update bank', async () => {
    const res = await put(`/api/banks/${bankId}`, userToken, { name: 'Hack' });
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────
// DELETE BANK (admin only)
// ─────────────────────────────────────────
describe('DELETE /api/banks/:id', () => {
  let tempBankId;

  beforeAll(async () => {
    const res = await post('/api/banks', adminToken, {
      name:    'Banque Temporaire',
      country: 'Cameroon'
    });
    tempBankId = res.body.bank.id;
  });

  test('200 — admin deletes bank with no accounts', async () => {
    const res = await del(`/api/banks/${tempBankId}`, adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('403 — user cannot delete bank', async () => {
    const res = await del(`/api/banks/${bankId}`, userToken);
    expect(res.status).toBe(403);
  });

  test('401 — unauthenticated request refused', async () => {
    const res = await del(`/api/banks/${bankId}`);
    expect(res.status).toBe(401);
  });
});
