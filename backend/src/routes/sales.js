const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { hash, generateOrderNo, now } = require('../utils/date');

const router = express.Router();

router.use(auth);

router.get('/', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const keyword = req.query.keyword;
  const distributorId = req.query.distributor_id;
  const status = req.query.status;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let sql = `SELECT so.*, d.name as distributor_name, d.code as distributor_code, 
             sb.batch_no as batch_no 
             FROM sales_orders so 
             JOIN distributors d ON d.id = so.distributor_id 
             LEFT JOIN settlement_batches sb ON sb.id = so.batch_id 
             WHERE 1=1`;
  const countSql = `SELECT COUNT(*) as c FROM sales_orders so WHERE 1=1`;
  const params = [];
  const countParams = [];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) {
      sql += ' AND so.distributor_id = ?';
      countSql += ' AND distributor_id = ?';
      params.push(me.id);
      countParams.push(me.id);
    }
  }
  if (distributorId) { sql += ' AND so.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (status) { sql += ' AND so.status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }
  if (keyword) { sql += ' AND (so.order_no LIKE ? OR so.product_name LIKE ? OR d.name LIKE ? OR d.code LIKE ?)'; countSql += ' AND (order_no LIKE ? OR product_name LIKE ?)'; 
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw, kw);
    countParams.push(kw, kw);
  }
  if (startDate) { sql += ' AND so.order_date >= ?'; countSql += ' AND order_date >= ?'; params.push(startDate); countParams.push(startDate); }
  if (endDate) { sql += ' AND so.order_date <= ?'; countSql += ' AND order_date <= ?'; params.push(endDate); countParams.push(endDate); }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY so.order_date DESC, so.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  
  res.json({ data, total, page, pageSize });
});

router.post('/', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const { distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, order_no } = req.body;
    if (!distributor_id || !order_date || !product_name || quantity == null || !unit_price) {
      return res.status(400).json({ error: '缺少必填字段', code: 'EMPTY_FIELD' });
    }
    const _orderNo = order_no || generateOrderNo('SO');
    const _total = total_amount ?? (quantity * unit_price);
    const _paid = paid_amount ?? 0;
    const _hash = hash(JSON.stringify({ distributor_id, order_date, product_name, quantity, unit_price, _orderNo }));
    
    const existing = db.prepare('SELECT * FROM sales_orders WHERE import_hash = ? OR order_no = ?').get(_hash, _orderNo);
    if (existing) {
      return res.json({ 
        id: existing.id, 
        order_no: existing.order_no, 
        duplicate: true, 
        message: '销售单已存在，幂等返回' 
      });
    }
    
    const id = uuidv4();
    db.prepare(`INSERT INTO sales_orders 
      (id, order_no, distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, import_hash, status, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`)
      .run(id, _orderNo, distributor_id, order_date, product_name, product_category || null, 
           Number(quantity), Number(unit_price), Number(_total), Number(_paid), region || null, _hash, now(), now());
    
    writeAuditLog(req, 'CREATE_SALES_ORDER', `创建销售单: ${_orderNo}`, 'SALES_ORDER', id);
    res.json({ id, order_no: _orderNo, duplicate: false });
  } catch (e) { next(e); }
});

router.post('/batch-import', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const items = req.body.items || [];
    const results = [];
    const tx = db.transaction(() => {
      for (const item of items) {
        const { distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, order_no } = item;
        if (!distributor_id || !order_date || !product_name || quantity == null || !unit_price) continue;
        const _orderNo = order_no || generateOrderNo('SO');
        const _total = total_amount ?? (quantity * unit_price);
        const _paid = paid_amount ?? 0;
        const _hash = hash(JSON.stringify({ distributor_id, order_date, product_name, quantity, unit_price, _orderNo }));
        const existing = db.prepare('SELECT * FROM sales_orders WHERE import_hash = ? OR order_no = ?').get(_hash, _orderNo);
        if (existing) {
          results.push({ id: existing.id, order_no: existing.order_no, duplicate: true });
          continue;
        }
        const id = uuidv4();
        db.prepare(`INSERT INTO sales_orders 
          (id, order_no, distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, import_hash, status, created_at, updated_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`)
          .run(id, _orderNo, distributor_id, order_date, product_name, product_category || null, 
               Number(quantity), Number(unit_price), Number(_total), Number(_paid), region || null, _hash, now(), now());
        results.push({ id, order_no: _orderNo, duplicate: false });
      }
    });
    tx();
    writeAuditLog(req, 'BATCH_IMPORT_SALES', `批量导入销售单: ${results.length}条，其中重复${results.filter(r => r.duplicate).length}条`, 'SALES_ORDER');
    res.json({ data: results, total: results.length, duplicateCount: results.filter(r => r.duplicate).length, newCount: results.filter(r => !r.duplicate).length });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare(`SELECT so.*, d.name as distributor_name, d.code as distributor_code 
    FROM sales_orders so JOIN distributors d ON d.id = so.distributor_id WHERE so.id = ?`).get(req.params.id);
  if (!data) return res.status(404).json({ error: '销售单不存在', code: 'NOT_FOUND' });
  res.json({ data });
});

router.put('/:id', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res, next) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: '销售单不存在', code: 'NOT_FOUND' });
    if (existing.batch_id) {
      return res.status(400).json({ error: '销售单已关联结算批次，不能修改', code: 'LOCKED_BY_BATCH' });
    }
    const { order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, status } = req.body;
    db.prepare(`UPDATE sales_orders SET order_date=?, product_name=?, product_category=?, quantity=?, unit_price=?, total_amount=?, paid_amount=?, region=?, status=?, updated_at=? WHERE id=?`)
      .run(order_date || existing.order_date, product_name || existing.product_name, product_category, 
           quantity != null ? Number(quantity) : existing.quantity, 
           unit_price != null ? Number(unit_price) : existing.unit_price,
           total_amount != null ? Number(total_amount) : existing.total_amount,
           paid_amount != null ? Number(paid_amount) : existing.paid_amount,
           region, status || existing.status, now(), req.params.id);
    writeAuditLog(req, 'UPDATE_SALES_ORDER', `修改销售单: ${existing.order_no}`, 'SALES_ORDER', req.params.id, existing, req.body);
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '销售单不存在', code: 'NOT_FOUND' });
  if (existing.batch_id) {
    return res.status(400).json({ error: '销售单已关联结算批次，不能删除', code: 'LOCKED_BY_BATCH' });
  }
  db.prepare('DELETE FROM sales_orders WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_SALES_ORDER', `删除销售单: ${existing.order_no}`, 'SALES_ORDER', req.params.id, existing);
  res.json({ success: true });
});

module.exports = router;
