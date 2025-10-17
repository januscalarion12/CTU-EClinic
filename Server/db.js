const sql = require('mssql');

const config = {
  server: process.env.DB_HOST || 'LAPTOP-CO8MFUK2\SQLEXPRESS',
  port: parseInt(process.env.DB_PORT) || 1433,
  user: process.env.DB_USER || 'eclinic',
  password: process.env.DB_PASSWORD || 'Eclinic2025@',
  database: process.env.DB_NAME || 'CTU_ClinicDB',
  options: {
    encrypt: true, // Use encryption
    trustServerCertificate: true, // For local development
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to SQL Server');
    return pool;
  })
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });

module.exports = {
  sql,
  poolPromise,
};