const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const app = require('../src/app');

const api = (method, path, token, body) => {
  const req = request(app)[method](path)
    .set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  if (body)  req.send(body);
  return req;
};

const get    = (path, token)       => api('get',    path, token);
const post   = (path, token, body) => api('post',   path, token, body);
const put    = (path, token, body) => api('put',    path, token, body);
const del    = (path, token)       => api('delete', path, token);

/**
 * Register a user and return { token, user, id }
 */
const registerUser = async (overrides = {}) => {
  const data = {
    firstName: 'Jean',
    lastName:  'Dupont',
    email:     `user_${Date.now()}@test.cm`,
    password:  'Password1!',
    phone:     '+237 600 000 001',
    ...overrides
  };
  const res = await post('/api/auth/register', null, data);
  return { token: res.body.token, user: res.body.user, id: res.body.user?.id, email: data.email, password: data.password };
};

/**
 * Register an admin user and return { token, user, id }
 */
const registerAdmin = async (overrides = {}) => {
  const User = require('../src/models/User');
  const data = {
    firstName: 'Super',
    lastName:  'Admin',
    email:     `admin_${Date.now()}@birec.cm`,
    password:  'Admin123!',
    phone:     '+237 222 000 000',
    role:      'admin',
    ...overrides
  };
  const u = await User.create(data);
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { token, user: u, id: u.id, email: data.email, password: data.password };
};

/**
 * Create a bank (via admin token) and return bank object
 */
const createBank = async (adminToken, overrides = {}) => {
  const data = {
    name:    'Banque Test Cameroun',
    code:    `TST${Date.now().toString().slice(-4)}`,
    city:    'Yaoundé',
    country: 'Cameroon',
    email:   'test@bank.cm',
    phone:   '+237 222 111 000',
    ...overrides
  };
  const res = await post('/api/banks', adminToken, data);
  return res.body.bank;
};

/**
 * Create an account (via user token) and return account object
 */
const createAccount = async (userToken, bankId, overrides = {}) => {
  const data = { type: 'compte_courant', currency: 'XAF', bankId, ...overrides };
  const res = await post('/api/accounts', userToken, data);
  return res.body.account;
};

module.exports = { get, post, put, del, registerUser, registerAdmin, createBank, createAccount };
