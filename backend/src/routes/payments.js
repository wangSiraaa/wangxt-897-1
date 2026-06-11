const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { generateOrderNo, now } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const distributorId = req.query.distributor_id;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let sql = `SELECT p.*, d.name as distributor_name, d.code as distributor_code 
             FROM payments p JOIN distributors d ON d.id = p.distributor_id WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM payments WHERE 1=1`;
  const params = [], countParams = [];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) {
      sql += ' AND p.distributor_id = ?';
      countSql += ' AND distributor_id = ?';
      params.push(me.id); countParams.push(me.id);
    }
  }
  if (distributorId) { sql += ' AND p.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (startDate) { sql += ' AND p.pay_date >= ?'; countSql += ' AND pay_date >= ?'; params.push(startDate); countParams.push(startDate); }
  if (endDate) { sql += ' AND p.pay_date <= ?'; countSql += ' AND pay_date <= ?'; params.push(endDate); countParams.push(endDate); }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY p.pay_date DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { distributor_id, pay_date, amount, pay_method, remark, pay_no } = req.body;
    if (!distributor_id || !pay_date || amount == null) {
      return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    }
    const id = uuidv4();
    const _payNo = pay_no || generateOrderNo('PAY');
    db.prepare(`INSERT INTO payments (id, pay_no, distributor_id, pay_date, amount, pay_method, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, _payNo, distributor_id, pay_date, Number(amount), pay_method || null, remark || null, now());
    writeAuditLog(req, 'CREATE_PAYMENT', `创建回款: ${_payNo} 金额 ${amount}`, 'PAYMENT', id);
    res.json({ id, pay_no: _payNo });
  } catch (e) { next(e); }
});

router.post('/match', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { payment_id, sales_order_ids } = req.body;
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(payment_id);
    if (!payment) return res.status(404).json({ error: '回款记录不存在', code: 'NOT_FOUND' });
    const orderIds = sales_order_ids || [];
    db.prepare('UPDATE payments SET matched_order_ids = ? WHERE id = ?')
      .run(JSON.stringify(orderIds), payment_id);
    writeAuditLog(req, 'MATCH_PAYMENT', `匹配回款: ${payment.pay_no} 到 ${orderIds.length} 个销售单`, 'PAYMENT', payment_id);
    res.json({ success: true, matched_count: orderIds.length });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT p.*, d.name as distributor_name FROM payments p JOIN distributors d ON d.id = p.distributor_id WHERE p.id = ?`).get(req.params.id);
  if (!data) return res.status(404).json({ error: '回款不存在', code: 'NOT_FOUND' });
  res.json({ data });
});

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.FINANCE), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '回款不存在', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_PAYMENT', `删除回款: ${p.pay_no}`, 'PAYMENT', req.params.id);
  res.json({ success: true });
});

module.exports = router;
