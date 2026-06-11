const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const RebateCalculator = require('../services/rebateCalculator');
const { generateOrderNo, now, toFixed } = require('../utils/date');

const router = express.Router();
router.use(auth);

function isBatchLocked(batch) {
  return batch && (batch.status === 'reviewed' || batch.status === 'confirmed');
}

router.get('/', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const distributorId = req.query.distributor_id;
  const status = req.query.status;
  const periodStart = req.query.period_start;
  const periodEnd = req.query.period_end;
  const keyword = req.query.keyword;

  let sql = `SELECT sb.*, d.name as distributor_name, d.code as distributor_code, p.name as policy_name, 
             u1.real_name as reviewed_by_name, u2.real_name as risk_marked_by_name, u3.real_name as created_by_name 
             FROM settlement_batches sb 
             LEFT JOIN distributors d ON d.id = sb.distributor_id 
             LEFT JOIN rebate_policies p ON p.id = sb.policy_id 
             LEFT JOIN users u1 ON u1.id = sb.reviewed_by 
             LEFT JOIN users u2 ON u2.id = sb.risk_marked_by 
             LEFT JOIN users u3 ON u3.id = sb.created_by 
             WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM settlement_batches WHERE 1=1`;
  const params = [], countParams = [];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) { sql += ' AND sb.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(me.id); countParams.push(me.id); }
  }
  if (distributorId) { sql += ' AND sb.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (status) { sql += ' AND sb.status = ?'; countSql += ' AND status = ?'; params.push(status); countParams.push(status); }
  if (periodStart) { sql += ' AND sb.period_start >= ?'; countSql += ' AND period_start >= ?'; params.push(periodStart); countParams.push(periodStart); }
  if (periodEnd) { sql += ' AND sb.period_end <= ?'; countSql += ' AND period_end <= ?'; params.push(periodEnd); countParams.push(periodEnd); }
  if (keyword) {
    sql += ' AND (sb.batch_no LIKE ? OR d.name LIKE ? OR d.code LIKE ?';
    countSql += ' AND batch_no LIKE ?';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw); countParams.push(kw);
  }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY sb.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

router.post('/generate', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { distributor_id, policy_id, period_start, period_end, sales_order_ids } = req.body;
    if (!distributor_id || !period_start || !period_end) return res.status(400).json({ error: '缺少参数', code: 'EMPTY_FIELD' });

    const policy = policy_id ? db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(policy_id) : null;
    const calc = new RebateCalculator({
      distributorId: distributor_id,
      policyId: policy_id || null,
      periodStart: period_start,
      periodEnd: period_end,
      salesOrderIds: sales_order_ids || null,
      excludeBatchLocks: true
    });

    const result = calc.calculateDistributor(distributor_id, policy);
    const orderIds = result.paidOrders.map(o => o.id);

    const conflict = db.prepare(`SELECT COUNT(*) as c FROM sales_orders WHERE id IN (${orderIds.map(() => '?').join(',')}) AND batch_id IS NOT NULL`)
      .all(...orderIds);
    if (conflict[0].c > 0) {
      return res.status(400).json({ error: `存在 ${conflict[0].c} 个销售单已被其他批次占用，不能重复计入`, code: 'BATCH_CONFLICT' });
    }

    const id = uuidv4();
    const batchNo = generateOrderNo('BATCH');
    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO settlement_batches 
        (id, batch_no, period_start, period_end, distributor_id, policy_id, 
         sales_count, sales_total, paid_total, achievement_rate, 
         base_rebate, ladder_rebate, smuggle_penalty, final_rebate, 
         status, sales_order_ids, created_by, created_at, updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`)
        .run(id, batchNo, period_start, period_end, distributor_id, policy?.id || null,
             result.paidOrders.length, result.salesTotal, result.paidTotal, result.achievementRate,
             result.baseRebate, result.ladderRebate, result.smugglePenalty, result.finalRebate,
             JSON.stringify(orderIds), req.user.id, now(), now());

      if (orderIds.length > 0) {
        const stmt = db.prepare('UPDATE sales_orders SET batch_id = ?, updated_at = ? WHERE id = ?');
        for (const oid of orderIds) stmt.run(id, now(), oid);
      }
    });
    tx();
    writeAuditLog(req, 'GENERATE_BATCH', `生成结算批次: ${batchNo}`, 'BATCH', id);
    res.json({ id, batch_no: batchNo, data: result });
  } catch (e) { next(e); }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const b = db.prepare(`SELECT sb.*, d.name as distributor_name, d.code as distributor_code, p.name as policy_name, 
    u1.real_name as reviewed_by_name, u2.real_name as risk_marked_by_name, u3.real_name as created_by_name 
    FROM settlement_batches sb 
    LEFT JOIN distributors d ON d.id = sb.distributor_id 
    LEFT JOIN rebate_policies p ON p.id = sb.policy_id 
    LEFT JOIN users u1 ON u1.id = sb.reviewed_by 
    LEFT JOIN users u2 ON u2.id = sb.risk_marked_by 
    LEFT JOIN users u3 ON u3.id = sb.created_by 
    WHERE sb.id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
  try { b.sales_order_ids_arr = JSON.parse(b.sales_order_ids || '[]'); } catch (e) { b.sales_order_ids_arr = []; }
  if (b.sales_order_ids_arr.length > 0) {
    b.orders = db.prepare(`SELECT so.* FROM sales_orders so WHERE so.id IN (${b.sales_order_ids_arr.map(() => '?').join(',')})`)
      .all(...b.sales_order_ids_arr);
  } else {
    b.orders = [];
  }
  b.smuggles = db.prepare(`SELECT sr.*, so.order_no FROM smuggle_records sr LEFT JOIN sales_orders so ON so.id = sr.sales_order_id WHERE sr.distributor_id = ? AND sr.status = 'confirmed' AND sr.report_date BETWEEN ? AND ?`)
    .all(b.distributor_id, b.period_start, b.period_end);
  res.json({ data: b });
});

router.post('/:id/review', requireRoles(ROLES.FINANCE, ROLES.ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
    if (isBatchLocked(b)) return res.status(400).json({ error: '批次已复核，不能再次复核', code: 'ALREADY_REVIEWED' });
    db.prepare(`UPDATE settlement_batches SET status = 'reviewed', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`)
      .run(req.user.id, now(), now(), req.params.id);
    db.prepare('INSERT INTO batch_locks (batch_id, locked_by, locked_at, lock_reason) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING')
      .run(req.params.id, req.user.id, now(), '财务复核锁定');
    writeAuditLog(req, 'REVIEW_BATCH', `财务复核批次: ${b.batch_no}`, 'BATCH', req.params.id);
    res.json({ success: true, status: 'reviewed' });
  } catch (e) { next(e); }
});

router.post('/:id/unreview', requireRoles(ROLES.FINANCE, ROLES.ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
    if (b.status === 'confirmed') return res.status(400).json({ error: '批次已确认，不能取消复核', code: 'ALREADY_CONFIRMED' });
    db.prepare(`UPDATE settlement_batches SET status = 'draft', reviewed_by = NULL, reviewed_at = NULL, updated_at = ? WHERE id = ?`)
      .run(now(), req.params.id);
    db.prepare('DELETE FROM batch_locks WHERE batch_id = ?').run(req.params.id);
    writeAuditLog(req, 'UNREVIEW_BATCH', `取消财务复核: ${b.batch_no}`, 'BATCH', req.params.id);
    res.json({ success: true, status: 'draft' });
  } catch (e) { next(e); }
});

router.post('/:id/confirm', requireRoles(ROLES.FINANCE, ROLES.ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
    if (b.status !== 'reviewed') return res.status(400).json({ error: '批次需先财务复核', code: 'NEED_REVIEW' });
    if (b.risk_mark) return res.status(400).json({ error: '批次有风控标记，需先解除', code: 'RISK_MARKED' });
    db.prepare(`UPDATE settlement_batches SET status = 'confirmed', updated_at = ? WHERE id = ?`).run(now(), req.params.id);
    writeAuditLog(req, 'CONFIRM_BATCH', `确认结算批次: ${b.batch_no}`, 'BATCH', req.params.id);
    res.json({ success: true, status: 'confirmed' });
  } catch (e) { next(e); }
});

router.post('/:id/risk-mark', requireRoles(ROLES.RISK, ROLES.ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
    if (b.status === 'confirmed') return res.status(400).json({ error: '批次已确认', code: 'ALREADY_CONFIRMED' });
    const { reason } = req.body;
    db.prepare(`UPDATE settlement_batches SET risk_mark = 1, risk_reason = ?, risk_marked_by = ?, risk_marked_at = ?, updated_at = ? WHERE id = ?`)
      .run(reason || '风控标记异常', req.user.id, now(), now(), req.params.id);
    writeAuditLog(req, 'RISK_MARK_BATCH', `风控标记批次: ${b.batch_no}, 原因: ${reason || ''}`, 'BATCH', req.params.id);
    res.json({ success: true, risk_mark: 1 });
  } catch (e) { next(e); }
});

router.post('/:id/risk-unmark', requireRoles(ROLES.RISK, ROLES.ADMIN), (req, res, next) => {
  try {
    const db = getDb();
    const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
    if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
    db.prepare(`UPDATE settlement_batches SET risk_mark = 0, risk_reason = NULL, risk_marked_by = NULL, risk_marked_at = NULL, updated_at = ? WHERE id = ?`)
      .run(now(), req.params.id);
    writeAuditLog(req, 'RISK_UNMARK_BATCH', `解除风控标记: ${b.batch_no}`, 'BATCH', req.params.id);
    res.json({ success: true, risk_mark: 0 });
  } catch (e) { next(e); }
});

router.get('/:id/export', (req, res) => {
  const db = getDb();
  const b = db.prepare(`SELECT sb.*, d.name as distributor_name, d.code as distributor_code, p.name as policy_name 
    FROM settlement_batches sb LEFT JOIN distributors d ON d.id = sb.distributor_id LEFT JOIN rebate_policies p ON p.id = sb.policy_id WHERE sb.id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
  let ids = [];
  try { ids = JSON.parse(b.sales_order_ids || '[]'); } catch (e) {}
  const orders = ids.length > 0 ? db.prepare(`SELECT so.* FROM sales_orders so WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) : [];
  const smuggles = db.prepare(`SELECT sr.*, so.order_no FROM smuggle_records sr LEFT JOIN sales_orders so ON so.id = sr.sales_order_id WHERE sr.distributor_id = ? AND sr.report_date BETWEEN ? AND ?`).all(b.distributor_id, b.period_start, b.period_end);

  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  const header = ['批次号', '经销商', '政策', '周期', '销售单数', '销售总额', '回款总额', '达成率(%)', '基础返利', '阶梯返利', '窜货扣罚', '最终返利', '状态', '风控标记'];
  const row = [b.batch_no, b.distributor_name, b.policy_name || '-', `${b.period_start} ~ ${b.period_end}`,
    b.sales_count, b.sales_total, b.paid_total, b.achievement_rate, b.base_rebate, b.ladder_rebate, b.smuggle_penalty, b.final_rebate,
    b.status, b.risk_mark ? `是: ${b.risk_reason}` : '否'];
  const ws1 = XLSX.utils.aoa_to_sheet([header, row]);
  XLSX.utils.book_append_sheet(wb, ws1, '结算汇总');

  if (orders.length > 0) {
    const oHeader = ['单号', '日期', '商品', '数量', '单价', '总额', '已回款', '区域'];
    const oRows = orders.map(o => [o.order_no, o.order_date, o.product_name, o.quantity, o.unit_price, o.total_amount, o.paid_amount_matched || o.paid_amount, o.region || '']);
    const ws2 = XLSX.utils.aoa_to_sheet([oHeader, ...oRows]);
    XLSX.utils.book_append_sheet(wb, ws2, '销售明细');
  }

  if (smuggles.length > 0) {
    const sHeader = ['关联销售单', '举报日期', '窜货区域', '窜货金额', '扣罚率(%)', '扣罚金额', '备注'];
    const sRows = smuggles.map(s => [s.order_no, s.report_date, s.smuggle_region, s.smuggle_amount, s.penalty_rate, s.penalty_amount, s.remark || '']);
    const ws3 = XLSX.utils.aoa_to_sheet([sHeader, ...sRows]);
    XLSX.utils.book_append_sheet(wb, ws3, '窜货扣罚明细');
  }

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  writeAuditLog(req, 'EXPORT_BATCH', `导出结算批次: ${b.batch_no}`, 'BATCH', req.params.id);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="rebate_batch_${b.batch_no}.xlsx"`);
  res.send(Buffer.from(buf));
});

router.delete('/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const db = getDb();
  const b = db.prepare('SELECT * FROM settlement_batches WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: '结算批次不存在', code: 'NOT_FOUND' });
  if (b.status !== 'draft') return res.status(400).json({ error: '只有草稿状态可以删除', code: 'STATUS_INVALID' });
  let ids = [];
  try { ids = JSON.parse(b.sales_order_ids || '[]'); } catch (e) {}
  const tx = db.transaction(() => {
    if (ids.length > 0) db.prepare(`UPDATE sales_orders SET batch_id = NULL, updated_at = ? WHERE id IN (${ids.map(() => '?').join(',')})`).run(now(), ...ids);
    db.prepare('DELETE FROM batch_locks WHERE batch_id = ?').run(req.params.id);
    db.prepare('DELETE FROM settlement_batches WHERE id = ?').run(req.params.id);
  });
  tx();
  writeAuditLog(req, 'DELETE_BATCH', `删除结算批次: ${b.batch_no}`, 'BATCH', req.params.id);
  res.json({ success: true });
});

module.exports = router;
