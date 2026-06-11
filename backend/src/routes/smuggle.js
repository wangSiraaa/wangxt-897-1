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
  const pageSize = Number(req.query.pageSize || 20);
  const distributorId = req.query.distributor_id;
  const status = req.query.status;

  let sql = `SELECT sr.*, so.order_no, so.product_name, d.name as distributor_name, d.code as distributor_code 
             FROM smuggle_records sr 
             LEFT JOIN sales_orders so ON so.id = sr.sales_order_id 
             LEFT JOIN distributors d ON d.id = sr.distributor_id WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM smuggle_records WHERE 1=1`;
  const params = [], countParams = [];
  if (distributorId) { sql += ' AND sr.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (status) { sql += ' AND sr.status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }
  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY sr.report_date DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.RISK, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const { sales_order_id, distributor_id, report_date, smuggle_region, smuggle_amount, penalty_rate, penalty_amount, remark, status } = req.body;
    if (!sales_order_id || !distributor_id || !report_date || !smuggle_region || !smuggle_amount || !penalty_rate) return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    const id = uuidv4();
    const _penaltyAmount = penalty_amount != null ? Number(penalty_amount) : Number(smuggle_amount) * Number(penalty_rate) / 100;
    db.prepare(`INSERT INTO smuggle_records (id, sales_order_id, distributor_id, report_date, smuggle_region, smuggle_amount, penalty_rate, penalty_amount, remark, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, sales_order_id, distributor_id, report_date, smuggle_region, Number(smuggle_amount), Number(penalty_rate), _penaltyAmount, remark || null, status || 'confirmed', now());
    writeAuditLog(req, 'CREATE_SMUGGLE', `创建窜货记录: 销售单 ${sales_order_id}`, 'SMUGGLE', id);
    res.json({ id });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT sr.*, so.order_no, so.product_name, d.name as distributor_name FROM smuggle_records sr LEFT JOIN sales_orders so ON so.id = sr.sales_order_id LEFT JOIN distributors d ON d.id = sr.distributor_id WHERE sr.id = ?`).get(req.params.id);
  if (!data) return res.status(404).json({ error: '窜货记录不存在', code: 'NOT_FOUND' });
  res.json({ data });
});

router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.RISK), (req, res, next) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM smuggle_records WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ error: '窜货记录不存在', code: 'NOT_FOUND' });
    const { report_date, smuggle_region, smuggle_amount, penalty_rate, penalty_amount, remark, status } = req.body;
    db.prepare(`UPDATE smuggle_records SET report_date=?, smuggle_region=?, smuggle_amount=?, penalty_rate=?, penalty_amount=?, remark=?, status=? WHERE id=?`)
      .run(report_date || old.report_date, smuggle_region || old.smuggle_region, smuggle_amount != null ? Number(smuggle_amount) : old.smuggle_amount, penalty_rate != null ? Number(penalty_rate) : old.penalty_rate, penalty_amount != null ? Number(penalty_amount) : old.penalty_amount, remark, status || old.status, req.params.id);
    writeAuditLog(req, 'UPDATE_SMUGGLE', `修改窜货记录`, 'SMUGGLE', req.params.id, old, req.body);
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.RISK), (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM smuggle_records WHERE id = ?').get(req.params.id);
  if (!old) return res.status(404).json({ error: '窜货记录不存在', code: 'NOT_FOUND' });
  db.prepare('DELETE FROM smuggle_records WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_SMUGGLE', `删除窜货记录`, 'SMUGGLE', req.params.id, old);
  res.json({ success: true });
});

module.exports = router;
