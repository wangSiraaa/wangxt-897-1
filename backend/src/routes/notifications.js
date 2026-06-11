const express = require('express');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const { now } = require('../utils/date');
const RebateCalculator = require('../services/rebateCalculator');

const router = express.Router();
router.use(auth);

const NOTIFICATION_TYPES = {
  POLICY_MATCH: 'policy_match',
  UNPAID_WARNING: 'unpaid_warning',
  ACHIEVEMENT_CHANGE: 'achievement_change',
  BATCH_READY: 'batch_ready',
  RISK_ALERT: 'risk_alert',
  SYSTEM: 'system'
};

function createNotification(db, { user_id, distributor_id, type, title, content, policy_id, data_json }) {
  const id = uuidv4();
  db.prepare(`INSERT INTO notifications 
    (id, user_id, distributor_id, type, title, content, policy_id, status, data_json, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, 'unread', ?, ?)`)
    .run(id, user_id || null, distributor_id || null, type, title, content || null, 
         policy_id || null, data_json ? JSON.stringify(data_json) : null, now());
  return id;
}

router.get('/', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const status = req.query.status;
  const type = req.query.type;
  const distributorId = req.query.distributor_id;
  const policyId = req.query.policy_id;

  let sql = `SELECT n.*, d.name as distributor_name, d.code as distributor_code,
             p.name as policy_name, u.username as user_name
             FROM notifications n 
             LEFT JOIN distributors d ON d.id = n.distributor_id
             LEFT JOIN rebate_policies p ON p.id = n.policy_id
             LEFT JOIN users u ON u.id = n.user_id
             WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM notifications n WHERE 1=1`;
  const params = [], countParams = [];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) {
      sql += ' AND n.distributor_id = ?';
      countSql += ' AND distributor_id = ?';
      params.push(me.id);
      countParams.push(me.id);
    }
  }

  if (status) {
    sql += ' AND n.status = ?';
    countSql += ' AND status = ?';
    params.push(status);
    countParams.push(status);
  }
  if (type) {
    sql += ' AND n.type = ?';
    countSql += ' AND type = ?';
    params.push(type);
    countParams.push(type);
  }
  if (distributorId) {
    sql += ' AND n.distributor_id = ?';
    countSql += ' AND distributor_id = ?';
    params.push(distributorId);
    countParams.push(distributorId);
  }
  if (policyId) {
    sql += ' AND n.policy_id = ?';
    countSql += ' AND policy_id = ?';
    params.push(policyId);
    countParams.push(policyId);
  }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);

  data.forEach(item => {
    if (item.data_json) {
      try { item.data = JSON.parse(item.data_json); } catch (e) { item.data = null; }
    }
  });

  res.json({ data, total, page, pageSize });
});

router.get('/unread-count', (req, res) => {
  const db = getDb();
  let sql = `SELECT COUNT(*) as c FROM notifications WHERE status = 'unread'`;
  const params = [];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) {
      sql += ' AND distributor_id = ?';
      params.push(me.id);
    }
  }

  const result = db.prepare(sql).get(...params);
  res.json({ count: result.c });
});

router.post('/:id/read', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '通知不存在', code: 'NOT_FOUND' });

  db.prepare('UPDATE notifications SET status = ?, read_at = ? WHERE id = ?')
    .run('read', now(), req.params.id);
  writeAuditLog(req, 'READ_NOTIFICATION', `已读通知: ${existing.title}`, 'NOTIFICATION', req.params.id);
  res.json({ success: true });
});

router.post('/read-all', (req, res) => {
  const db = getDb();
  let sql = `UPDATE notifications SET status = 'read', read_at = ? WHERE status = 'unread'`;
  const params = [now()];

  if (req.user.role === ROLES.DEALER) {
    const me = db.prepare('SELECT id FROM distributors WHERE code = ? OR name LIKE ?').get(req.user.username, `%${req.user.username}%`);
    if (me) {
      sql += ' AND distributor_id = ?';
      params.push(me.id);
    }
  }

  db.prepare(sql).run(...params);
  writeAuditLog(req, 'READ_ALL_NOTIFICATIONS', '全部已读');
  res.json({ success: true });
});

router.post('/generate-policy-match', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { period_start, period_end, distributor_id, policy_id } = req.body;
    if (!period_start || !period_end) {
      return res.status(400).json({ error: '缺少周期参数', code: 'EMPTY_FIELD' });
    }

    const calc = new RebateCalculator({
      distributorId: distributor_id || null,
      policyId: policy_id || null,
      periodStart: period_start,
      periodEnd: period_end
    });

    const results = calc.calculateAll();
    const generated = [];

    for (const result of results) {
      if (result.policyId && result.paidTotal > 0) {
        const nid = createNotification(db, {
          distributor_id: result.distributorId,
          type: NOTIFICATION_TYPES.POLICY_MATCH,
          title: `返利政策匹配提醒 - ${result.distributor_name || result.distributorId}`,
          content: `周期 ${period_start} ~ ${period_end}，已匹配政策「${result.policyName}」，当前达成率 ${result.achievementRate}%，预计返利 ¥${result.finalRebate}`,
          policy_id: result.policyId,
          data_json: {
            distributor_id: result.distributorId,
            policy_id: result.policyId,
            period_start, period_end,
            achievement_rate: result.achievementRate,
            final_rebate: result.finalRebate,
            paid_total: result.paidTotal,
            sales_total: result.salesTotal
          }
        });
        generated.push(nid);
      }

      if (result.unpaidOrders && result.unpaidOrders.length > 0) {
        const nid = createNotification(db, {
          distributor_id: result.distributorId,
          type: NOTIFICATION_TYPES.UNPAID_WARNING,
          title: `未回款销售提醒 - ${result.distributor_name || result.distributorId}`,
          content: `有 ${result.unpaidOrders.length} 笔销售单未回款，不计入返利。未回款金额 ¥${result.salesTotal - result.paidTotal}`,
          policy_id: result.policyId,
          data_json: {
            distributor_id: result.distributorId,
            unpaid_count: result.unpaidOrders.length,
            unpaid_amount: result.salesTotal - result.paidTotal,
            period_start, period_end
          }
        });
        generated.push(nid);
      }
    }

    writeAuditLog(req, 'GENERATE_NOTIFICATIONS', `生成政策匹配通知: ${generated.length}条`);
    res.json({ success: true, generated: generated.length, notification_ids: generated });
  } catch (e) { next(e); }
});

router.post('/check-unpaid-block', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const db = getDb();
    const { distributor_id, period_start, period_end, sales_order_ids } = req.body;
    if (!distributor_id || !period_start || !period_end) {
      return res.status(400).json({ error: '缺少参数', code: 'EMPTY_FIELD' });
    }

    const calc = new RebateCalculator({
      distributorId: distributor_id,
      policyId: null,
      periodStart: period_start,
      periodEnd: period_end,
      salesOrderIds: sales_order_ids || null
    });

    const allOrders = calc.getSalesOrders();
    const distributorOrders = allOrders.filter(o => o.distributor_id === distributor_id);
    const payments = calc.getPayments(distributor_id);
    const { sortedOrders } = calc.matchPaymentsToOrders(distributorOrders, payments);
    
    const unpaidOrders = sortedOrders.filter(o => !o.is_paid);

    if (unpaidOrders.length > 0) {
      const unpaidAmount = unpaidOrders.reduce((s, o) => s + ((o.total_amount || 0) - (o.paid_amount_matched || 0)), 0);

      createNotification(db, {
        distributor_id,
        type: NOTIFICATION_TYPES.UNPAID_WARNING,
        title: '未回款销售不计返利 - 已拦截',
        content: `检测到 ${unpaidOrders.length} 笔未回款销售单，金额 ¥${unpaidAmount.toFixed(2)}，根据规则不计入返利核算，已自动拦截。`,
        data_json: {
          unpaid_orders: unpaidOrders.map(o => ({
            id: o.id, order_no: o.order_no,
            total_amount: o.total_amount, paid_amount: o.paid_amount_matched,
            unpaid_amount: (o.total_amount || 0) - (o.paid_amount_matched || 0),
            is_explicit_unpaid: o.is_explicit_unpaid,
            unpaid_reason: o.unpaid_reason
          })),
          unpaid_amount: unpaidAmount,
          period_start, period_end,
          blocked: true
        }
      });

      return res.json({
        blocked: true,
        code: 'UNPAID_SALES_BLOCKED',
        message: '未回款销售不计返利，已拦截',
        unpaid_count: unpaidOrders.length,
        unpaid_amount: unpaidAmount,
        unpaid_orders: unpaidOrders.map(o => ({
          id: o.id, order_no: o.order_no,
          total_amount: o.total_amount,
          paid_amount: o.paid_amount_matched,
          is_explicit_unpaid: o.is_explicit_unpaid,
          unpaid_reason: o.unpaid_reason
        }))
      });
    }

    res.json({
      blocked: false,
      code: 'ALL_PAID',
      message: '所有销售单均已回款，可以正常核算',
      unpaid_count: 0,
      unpaid_amount: 0
    });
  } catch (e) { next(e); }
});

router.delete('/:id', requireRoles(ROLES.ADMIN), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '通知不存在', code: 'NOT_FOUND' });

  db.prepare('DELETE FROM notifications WHERE id = ?').run(req.params.id);
  writeAuditLog(req, 'DELETE_NOTIFICATION', `删除通知: ${existing.title}`, 'NOTIFICATION', req.params.id);
  res.json({ success: true });
});

module.exports = { router, createNotification, NOTIFICATION_TYPES };
