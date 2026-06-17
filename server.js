const app = require('./src/app');
const sequelize = require('./src/config/database');
const dotenv = require('dotenv');

dotenv.config();

const PORT = process.env.PORT || 3000;

const seedDefaults = async () => {
  const User = require('./src/models/User');
  const Bank = require('./src/models/Bank');

  const adminExists = await User.findOne({ where: { role: 'admin' } });
  if (!adminExists) {
    await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@birec.cm',
      password: 'Admin123!',
      phone: '+237 222 000 000',
      role: 'admin'
    });
    console.log('👤 Admin créé : admin@birec.fr / Admin123!');
  }

  const bankExists = await Bank.findOne();
  if (!bankExists) {
    await Bank.create({
      name: 'BIREC Central Bank',
      code: 'BNK001',
      email: 'contact@birec.cm',
      phone: '+237 222 000 001',
      city: 'Yaoundé',
      country: 'Cameroon',
      description: 'Central bank of the BIREC Group — Cameroon'
    });
    console.log(' Banque par défaut créée : BIREC Banque Centrale');
  }
};

const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log(' Connexion à SQLite établie');
    console.log(' Fichier:', sequelize.options.storage);
    await sequelize.sync({ alter: true });
    console.log(' Base de données synchronisée');
    await seedDefaults();
    return true;
  } catch (error) {
    console.error(' Erreur de base de données:', error.message);
    return false;
  }
};

const startServer = async () => {
  const dbConnected = await initDatabase();
  if (!dbConnected) {
    console.log('  Le serveur démarre mais sans base de données');
  }

  const server = app.listen(PORT, () => {
    console.log(' Serveur lancé sur le port', PORT);
    console.log(' http://localhost:' + PORT);
    console.log(' Mode:', process.env.NODE_ENV || 'development');
  });

  process.on('unhandledRejection', (err) => {
    console.log(' Erreur non gérée:', err);
    server.close(() => process.exit(1));
  });

  process.on('SIGTERM', () => {
    console.log(' Arrêt du serveur...');
    server.close(() => {
      console.log(' Serveur arrêté');
      process.exit(0);
    });
  });
};

startServer();