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
  const status = req.query.status;

  let sql = `SELECT inv.*, so.order_no, so.product_name, d.name as distributor_name 
             FROM invoices inv 
             LEFT JOIN sales_orders so ON so.id = inv.sales_order_id 
             LEFT JOIN distributors d ON d.id = inv.distributor_id WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM invoices WHERE 1=1`;
  const params = [], countParams = [];

  if (distributorId) { sql += ' AND inv.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (status) { sql += ' AND inv.status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY inv.invoice_date DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { sales_order_id, distributor_id, invoice_date, invoice_amount, tax_amount, status, invoice_no } = req.body;
    if (!sales_order_id || !invoice_date || !invoice_amount) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const id = uuidv4();
    const _invNo = invoice_no || generateOrderNo('INV');
    db.prepare(`INSERT INTO invoices (id, invoice_no, sales_order_id, distributor_id, invoice_date, invoice_amount, tax_amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, _invNo, sales_order_id, distributor_id, invoice_date, Number(invoice_amount), Number(tax_amount || 0), status || 'issued', now());
    writeAuditLog(req, 'CREATE_INVOICE', `创建发票: ${_invNo}`, 'INVOICE', id);
    res.json({ id, invoice_no: _invNo });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT inv.*, so.order_no, d.name as distributor_name FROM invoices inv LEFT JOIN sales_orders so ON so.id = inv.sales_order_id LEFT JOIN distributors d ON d.id = inv.distributor_id WHERE inv.id = ?`).get(req.params.id);
  if (!data) return res.status(404).json({ error: '发票不存在', code: 'NOT_FOUND' });
  res.json({ data });
});

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.FINANCE), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: '发票不存在', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_INVOICE', `删除发票: ${p.invoice_no}`, 'INVOICE', req.params.id);
  res.json({ success: true });
});

module.exports = router;
