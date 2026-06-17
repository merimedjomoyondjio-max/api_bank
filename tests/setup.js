/**
 * Global test setup — runs before every test file
 * Uses SQLite :memory: (NODE_ENV=test set in jest.config.js)
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'birec-test-secret-2026';
process.env.JWT_EXPIRE = '1h';

const sequelize = require('../src/config/database');
require('../src/models/User');
require('../src/models/Bank');
require('../src/models/Account');
require('../src/models/Transaction');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

afterAll(async () => {
  await sequelize.close();
});
