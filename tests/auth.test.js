process.env.NODE_ENV  = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const { post, put, get, registerUser } = require('./helpers');

// ─────────────────────────────────────────
// REGISTER
// ─────────────────────────────────────────
describe('POST /api/auth/register', () => {
  const base = {
    firstName: 'Alice',
    lastName:  'Kamga',
    email:     `alice_${Date.now()}@test.cm`,
    password:  'Password1!',
    phone:     '+237 655 000 001'
  };

  test('201 — registers a new user and returns a token', async () => {
    const res = await post('/api/auth/register', null, base);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(base.email);
    expect(res.body.user.password).toBeUndefined(); // hidden by toJSON
  });

  test('400 — rejects duplicate email', async () => {
    await post('/api/auth/register', null, base);
    const res = await post('/api/auth/register', null, base);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/email/i);
  });

  test('500 — rejects missing required fields (no email)', async () => {
    const { email: _e, ...noEmail } = base;
    const res = await post('/api/auth/register', null, noEmail);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });

  test('500 — rejects missing firstName', async () => {
    const res = await post('/api/auth/register', null, {
      ...base,
      email: `miss_${Date.now()}@test.cm`,
      firstName: undefined
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
describe('POST /api/auth/login', () => {
  let email, password;

  beforeAll(async () => {
    const u = await registerUser({ email: `login_${Date.now()}@test.cm` });
    email    = u.email;
    password = u.password;
  });

  test('200 — returns token on valid credentials', async () => {
    const res = await post('/api/auth/login', null, { email, password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
  });

  test('401 — wrong password', async () => {
    const res = await post('/api/auth/login', null, { email, password: 'WrongPass!' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('401 — unknown email', async () => {
    const res = await post('/api/auth/login', null, { email: 'nobody@test.cm', password });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('400 — missing email and password', async () => {
    const res = await post('/api/auth/login', null, {});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────
describe('GET /api/auth/profile', () => {
  let token, userId;

  beforeAll(async () => {
    const u = await registerUser({ email: `prof_${Date.now()}@test.cm` });
    token  = u.token;
    userId = u.id;
  });

  test('200 — returns authenticated user profile', async () => {
    const res = await get('/api/auth/profile', token);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.id).toBe(userId);
    expect(res.body.user.password).toBeUndefined();
  });

  test('401 — no token', async () => {
    const res = await get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  test('401 — invalid token', async () => {
    const res = await get('/api/auth/profile', 'totally.invalid.token');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// UPDATE PROFILE
// ─────────────────────────────────────────
describe('PUT /api/auth/profile', () => {
  let token;

  beforeAll(async () => {
    const u = await registerUser({ email: `upd_${Date.now()}@test.cm` });
    token = u.token;
  });

  test('200 — updates firstName and phone', async () => {
    const res = await put('/api/auth/profile', token, {
      firstName: 'UpdatedName',
      lastName:  'Doe',
      phone:     '+237 699 000 099'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.firstName).toBe('UpdatedName');
    expect(res.body.user.phone).toBe('+237 699 000 099');
  });

  test('401 — requires authentication', async () => {
    const res = await put('/api/auth/profile', null, { firstName: 'X' });
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────
describe('PUT /api/auth/change-password', () => {
  let token, password;

  beforeAll(async () => {
    const u = await registerUser({ email: `pwd_${Date.now()}@test.cm` });
    token    = u.token;
    password = u.password;
  });

  test('200 — changes password successfully', async () => {
    const res = await put('/api/auth/change-password', token, {
      currentPassword: password,
      newPassword:     'NewPass123!'
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('401 — rejects wrong current password', async () => {
    const res = await put('/api/auth/change-password', token, {
      currentPassword: 'WrongOldPass!',
      newPassword:     'AnotherNew1!'
    });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('401 — requires authentication', async () => {
    const res = await put('/api/auth/change-password', null, {
      currentPassword: password,
      newPassword:     'AnotherNew1!'
    });
    expect(res.status).toBe(401);
  });
});
