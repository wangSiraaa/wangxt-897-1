const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { now } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const distributorId = req.query.distributor_id;
  let sql = `SELECT ra.*, d.name as distributor_name, d.code as distributor_code FROM region_auths ra LEFT JOIN distributors d ON d.id = ra.distributor_id WHERE 1=1`;
  const params = [];
  if (distributorId) { sql += ' AND ra.distributor_id = ?'; params.push(distributorId); }
  sql += ' ORDER BY ra.start_date DESC';
  const data = db.prepare(sql).all(...params);
  res.json({ data });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const { distributor_id, region, product_category, start_date, end_date } = req.body;
    if (!distributor_id || !region || !start_date) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const id = uuidv4();
    db.prepare(`INSERT INTO region_auths (id, distributor_id, region, product_category, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, distributor_id, region, product_category || null, start_date, end_date || null, now());
    writeAuditLog(req, 'CREATE_REGION_AUTH', `创建区域授权: ${region}`, 'REGION_AUTH', id);
    res.json({ id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM region_auths WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_REGION_AUTH', `删除区域授权`, 'REGION_AUTH', req.params.id);
  res.json({ success: true });
});

module.exports = router;
