const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { now } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);
  const keyword = req.query.keyword;
  const status = req.query.status;
  let sql = `SELECT p.* FROM rebate_policies p WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM rebate_policies WHERE 1=1`;
  const params = [], countParams = [];
  if (keyword) { sql += ' AND (p.name LIKE ? OR p.code LIKE ?)'; countSql += ' AND (name LIKE ? OR code LIKE ?)'; const kw = `%${keyword}%`; params.push(kw, kw); countParams.push(kw, kw); }
  if (status) { sql += ' AND p.status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }
  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  for (const policy of data) {
    policy.ladders = db.prepare('SELECT * FROM policy_ladders WHERE policy_id = ? ORDER BY min_rate ASC').all(policy.id);
  }
  res.json({ data, total, page, pageSize });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const { code, name, product_category, start_date, end_date, base_condition, calculation_type, description, status, ladders } = req.body;
    if (!code || !name || !start_date || !end_date || !base_condition) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const id = uuidv4();
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO rebate_policies (id, code, name, product_category, start_date, end_date, base_condition, calculation_type, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(id, code, name, product_category || null, start_date, end_date, Number(base_condition || 0), calculation_type || 'ladder', description || null, status || 'active', now());
      if (ladders && Array.isArray(ladders)) {
        for (const ladder of ladders) {
          const lid = uuidv4();
          db.prepare(`INSERT INTO policy_ladders (id, policy_id, min_rate, max_rate, rebate_rate, bonus_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(lid, id, Number(ladder.min_rate || 0), Number(ladder.max_rate || 100), Number(ladder.rebate_rate || 0), Number(ladder.bonus_amount || 0), now());
        }
      }
    });
    tx();
    writeAuditLog(req, 'CREATE_POLICY', `创建返利政策: ${name}`, 'POLICY', id);
    res.json({ id, code });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(req.params.id);
  if (!data) return res.status(404).json({ error: '政策不存在', code: 'NOT_FOUND' });
  data.ladders = db.prepare('SELECT * FROM policy_ladders WHERE policy_id = ? ORDER BY min_rate ASC').all(req.params.id);
  res.json({ data });
});

router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: '政策不存在', code: 'NOT_FOUND' });
    const { code, name, product_category, start_date, end_date, base_condition, calculation_type, description, status, ladders } = req.body;
    const tx = db.transaction(() => {
      db.prepare(`UPDATE rebate_policies SET code=?, name=?, product_category=?, start_date=?, end_date=?, base_condition=?, calculation_type=?, description=?, status=? WHERE id=?`)
        .run(code || old.code, name || old.name, product_category || old.product_category, start_date || old.start_date, end_date || old.end_date, base_condition != null ? Number(base_condition) : old.base_condition, calculation_type || old.calculation_type, description, status || old.status, req.params.id);
      if (ladders && Array.isArray(ladders)) {
        db.prepare('DELETE FROM policy_ladders WHERE policy_id = ?').run(req.params.id);
        for (const ladder of ladders) {
          const lid = uuidv4();
          db.prepare(`INSERT INTO policy_ladders (id, policy_id, min_rate, max_rate, rebate_rate, bonus_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(lid, req.params.id, Number(ladder.min_rate || 0), Number(ladder.max_rate || 100), Number(ladder.rebate_rate || 0), Number(ladder.bonus_amount || 0), now());
        }
      }
    });
    tx();
    writeAuditLog(req, 'UPDATE_POLICY', `修改返利政策: ${old.name}`, 'POLICY', req.params.id, old, req.body);
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '政策不存在', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM rebate_policies WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_POLICY', `删除返利政策: ${old.name}`, 'POLICY', req.params.id, old);
  res.json({ success: true });
});

module.exports = router;
