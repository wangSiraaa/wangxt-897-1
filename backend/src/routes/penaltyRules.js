const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { now } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT * FROM penalty_rules ORDER BY created_at DESC').all();
  res.json({ data });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.RISK), (req, res, next) => {
  try {
    const db = getDb();
    const { code, name, smuggle_level, penalty_rate, fixed_penalty, description } = req.body;
    if (!code || !name || penalty_rate == null) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const id = uuidv4();
    db.prepare(`INSERT INTO penalty_rules (id, code, name, smuggle_level, penalty_rate, fixed_penalty, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, code, name, smuggle_level || null, Number(penalty_rate), fixed_penalty != null ? Number(fixed_penalty) : null, description || null, now());
    writeAuditLog(req, 'CREATE_PENALTY_RULE', `创建扣罚规则: ${name}`, 'PENALTY_RULE', id);
    res.json({ id, code });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM penalty_rules WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_PENALTY_RULE', `删除扣罚规则`, 'PENALTY_RULE', req.params.id);
  res.json({ success: true });
});

module.exports = router;
