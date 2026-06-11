const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { now } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const keyword = req.query.keyword;
  let sql = `SELECT * FROM distributors WHERE 1=1`;
  const params = [];
  if (keyword) { sql += ' AND (name LIKE ? OR code LIKE ? OR contact LIKE ? OR phone LIKE ?)'; const kw = `%${keyword}%`; params.push(kw, kw, kw, kw); }
  sql += ' ORDER BY created_at DESC';
  const data = db.prepare(sql).all(...params);
  res.json({ data });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const { code, name, contact, phone, region } = req.body;
    if (!code || !name) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const existing = db.prepare('SELECT * FROM distributors WHERE code = ?').get(code);
    if (existing) return res.status(400).json({ error: '经销商编码已存在', code: 'DUPLICATE' });
    const id = uuidv4();
    db.prepare(`INSERT INTO distributors (id, code, name, contact, phone, region, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(id, code, name, contact || null, phone || null, region || null, now());
    writeAuditLog(req, 'CREATE_DISTRIBUTOR', `创建经销商: ${name} (${code})`, 'DISTRIBUTOR', id);
    res.json({ id, code });
  } catch (e) { next(e); }
});

router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: '经销商不存在', code: 'NOT_FOUND' });
    const { code, name, contact, phone, region } = req.body;
    db.prepare(`UPDATE distributors SET code=?, name=?, contact=?, phone=?, region=? WHERE id=?`)
      .run(code || old.code, name || old.name, contact, phone, region, req.params.id);
    writeAuditLog(req, 'UPDATE_DISTRIBUTOR', `修改经销商: ${old.name}`, 'DISTRIBUTOR', req.params.id, old, req.body);
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM distributors WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '经销商不存在', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM distributors WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_DISTRIBUTOR', `删除经销商: ${old.name}`, 'DISTRIBUTOR', req.params.id, old);
  res.json({ success: true });
});

module.exports = router;
