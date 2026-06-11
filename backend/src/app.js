require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('combined'));

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rebate-backend',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/distributors', require('./routes/distributors'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/policies', require('./routes/policies'));
app.use('/api/smuggle', require('./routes/smuggle'));
app.use('/api/rebate', require('./routes/rebate'));
app.use('/api/batches', require('./routes/batches'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/region-auths', require('./routes/regionAuths'));
app.use('/api/penalty-rules', require('./routes/penaltyRules'));
app.use('/api/notifications', require('./routes/notifications').router);

if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    code: err.code || 'ERROR'
  });
});

module.exports = app;
