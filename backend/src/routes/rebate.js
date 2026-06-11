const express = require('express');
const { getDb } = require('../config/database');
const { auth, requireRoles, ROLES, writeAuditLog } = require('../middleware/auth');
const RebateCalculator = require('../services/rebateCalculator');
const { toFixed } = require('../utils/date');

const router = express.Router();
router.use(auth);

router.post('/calculate', (req, res, next) => {
  try {
    const { distributor_id, policy_id, period_start, period_end, sales_order_ids } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: '缺少周期参数', code: 'EMPTY_FIELD' });

    const calc = new RebateCalculator({
      distributorId: distributor_id || null,
      policyId: policy_id || null,
      periodStart: period_start,
      periodEnd: period_end,
      salesOrderIds: sales_order_ids || null
    });

    const results = calc.calculateAll();
    writeAuditLog(req, 'REBATE_TRIAL', `返利试算：${period_start} ~ ${period_end}, 经销商数量: ${results.length}`);
    res.json({ data: results, period: { period_start, period_end } });
  } catch (e) { next(e); }
});

router.post('/calculate/:distributor_id', (req, res, next) => {
  try {
    const db = getDb();
    const { policy_id, period_start, period_end, sales_order_ids } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: '缺少周期参数', code: 'EMPTY_FIELD' });

    const calc = new RebateCalculator({
      distributorId: req.params.distributor_id,
      policyId: policy_id || null,
      periodStart: period_start,
      periodEnd: period_end,
      salesOrderIds: sales_order_ids || null
    });
    const policy = policy_id ? db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(policy_id) : null;
    const result = calc.calculateDistributor(req.params.distributor_id, policy);
    writeAuditLog(req, 'REBATE_TRIAL_DIST', `经销商返利试算: ${req.params.distributor_id}, 周期: ${period_start} ~ ${period_end}`);
    res.json({ data: result, period: { period_start, period_end } });
  } catch (e) { next(e); }
});

router.post('/save', requireRoles(ROLES.ADMIN, ROLES.CHANNEL_MANAGER, ROLES.FINANCE), (req, res, next) => {
  try {
    const { distributor_id, policy_id, period_start, period_end } = req.body;
    if (!period_start || !period_end) return res.status(400).json({ error: '缺少周期参数', code: 'EMPTY_FIELD' });
    const calc = new RebateCalculator({
      distributorId: distributor_id || null,
      policyId: policy_id || null,
      periodStart: period_start,
      periodEnd: period_end
    });
    const saved = calc.saveTrial(req.user.id);
    writeAuditLog(req, 'REBATE_SAVE_TRIAL', `保存返利试算版本: ${saved.length}条`);
    res.json({ data: saved, count: saved.length });
  } catch (e) { next(e); }
});

router.get('/trials', (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);
  const distributorId = req.query.distributor_id;
  const ps = req.query.period_start;
  const pe = req.query.period_end;

  let sql = `SELECT t.*, d.name as distributor_name, d.code as distributor_code, p.name as policy_name 
             FROM rebate_trials t 
             LEFT JOIN distributors d ON d.id = t.distributor_id 
             LEFT JOIN rebate_policies p ON p.id = t.policy_id WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM rebate_trials t WHERE 1=1`;
  const params = [], countParams = [];
  if (distributorId) { sql += ' AND t.distributor_id = ?'; countSql += ' AND distributor_id = ?'; params.push(distributorId); countParams.push(distributorId); }
  if (ps) { sql += ' AND t.period_start = ?'; countSql += ' AND period_start = ?'; params.push(ps); countParams.push(ps); }
  if (pe) { sql += ' AND t.period_end = ?'; countSql += ' AND period_end = ?'; params.push(pe); countParams.push(pe); }
  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY t.created_at DESC, t.version DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

router.get('/trials/:id', (req, res) => {
  const db = getDb();
  const t = db.prepare(`SELECT t.*, d.name as distributor_name, p.name as policy_name 
    FROM rebate_trials t LEFT JOIN distributors d ON d.id = t.distributor_id LEFT JOIN rebate_policies p ON p.id = t.policy_id WHERE t.id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: '试算记录不存在', code: 'NOT_FOUND' });
  try { t.detail = JSON.parse(t.detail_json); } catch (e) { t.detail = null; }
  try { t.input_snapshot_obj = JSON.parse(t.input_snapshot); } catch (e) { t.input_snapshot_obj = null; }
  res.json({ data: t });
});

module.exports = router;
