require('dotenv').config();
const { initDb, getDb } = require('../src/config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { now, generateOrderNo } = require('../src/utils/date');

function initUsers(db) {
  const users = [
    { id: uuidv4(), username: 'admin', password: 'admin123', real_name: '系统管理员', role: 'admin' },
    { id: uuidv4(), username: 'manager', password: 'manager123', real_name: '张经理', role: 'channel_manager' },
    { id: uuidv4(), username: 'finance', password: 'finance123', real_name: '李财务', role: 'finance' },
    { id: uuidv4(), username: 'risk', password: 'risk123', real_name: '王风控', role: 'risk' },
    { id: uuidv4(), username: 'dealer01', password: 'dealer123', real_name: '华东总代', role: 'dealer' }
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO users (id, username, password, real_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const u of users) {
      const hashed = bcrypt.hashSync(u.password, 10);
      stmt.run(u.id, u.username, hashed, u.real_name, u.role, now());
    }
  });
  tx();
  console.log('✅ 用户初始化完成:', users.map(u => `${u.username}/${u.password}`).join(' '));
}

function initDistributors(db) {
  const list = [
    { id: uuidv4(), code: 'DEALER001', name: '华东酒水总代理有限公司', contact: '陈总', phone: '13800138001', region: '华东' },
    { id: uuidv4(), code: 'DEALER002', name: '北方酒业贸易有限公司', contact: '刘总', phone: '13800138002', region: '华北' },
    { id: uuidv4(), code: 'DEALER003', name: '南方酒类经销集团', contact: '赵总', phone: '13800138003', region: '华南' },
    { id: uuidv4(), code: 'DEALER004', name: '西部醇酿贸易公司', contact: '孙总', phone: '13800138004', region: '西南' }
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO distributors (id, code, name, contact, phone, region, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => { for (const d of list) stmt.run(d.id, d.code, d.name, d.contact, d.phone, d.region, now()); });
  tx();
  console.log('✅ 经销商初始化完成:', list.length, '家');
  return list;
}

function initRegionAuths(db, distributors) {
  const list = [
    { distributor_idx: 0, region: '华东', product_category: '白酒', start_date: '2024-01-01', end_date: '2025-12-31' },
    { distributor_idx: 1, region: '华北', product_category: '白酒', start_date: '2024-01-01', end_date: '2025-12-31' },
    { distributor_idx: 2, region: '华南', product_category: '白酒', start_date: '2024-01-01', end_date: '2025-12-31' },
    { distributor_idx: 3, region: '西南', product_category: '白酒', start_date: '2024-01-01', end_date: '2025-12-31' }
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO region_auths (id, distributor_id, region, product_category, start_date, end_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    for (const r of list) stmt.run(uuidv4(), distributors[r.distributor_idx].id, r.region, r.product_category, r.start_date, r.end_date, now());
  });
  tx();
  console.log('✅ 区域授权初始化完成:', list.length, '条');
}

function initPenaltyRules(db) {
  const list = [
    { code: 'PEN_L1', name: '轻度窜货', smuggle_level: 'light', penalty_rate: 10, fixed_penalty: 0, description: '窜货金额10%扣罚' },
    { code: 'PEN_L2', name: '中度窜货', smuggle_level: 'medium', penalty_rate: 30, fixed_penalty: 0, description: '窜货金额30%扣罚' },
    { code: 'PEN_L3', name: '严重窜货', smuggle_level: 'heavy', penalty_rate: 50, fixed_penalty: 1000, description: '窜货金额50%扣罚+1000元' }
  ];
  const stmt = db.prepare('INSERT OR IGNORE INTO penalty_rules (id, code, name, smuggle_level, penalty_rate, fixed_penalty, description, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => { for (const r of list) stmt.run(uuidv4(), r.code, r.name, r.smuggle_level, r.penalty_rate, r.fixed_penalty, r.description, now()); });
  tx();
  console.log('✅ 扣罚规则初始化完成:', list.length, '条');
}

function initRebatePolicies(db) {
  const policyId = uuidv4();
  const policyStmt = db.prepare('INSERT OR IGNORE INTO rebate_policies (id, code, name, product_category, start_date, end_date, base_condition, calculation_type, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  policyStmt.run(policyId, 'POLICY_Q1_2025', '2025年Q1白酒返利政策', '白酒', '2025-01-01', '2025-03-31', 500000, 'ladder', '2025年第一季度白酒阶梯返利，基础门槛50万', 'active', now());
  const ladders = [
    { policy_id: policyId, min_rate: 0, max_rate: 80, rebate_rate: 2, bonus_amount: 0 },
    { policy_id: policyId, min_rate: 80, max_rate: 100, rebate_rate: 4, bonus_amount: 0 },
    { policy_id: policyId, min_rate: 100, max_rate: 120, rebate_rate: 6, bonus_amount: 5000 },
    { policy_id: policyId, min_rate: 120, max_rate: 150, rebate_rate: 8, bonus_amount: 20000 },
    { policy_id: policyId, min_rate: 150, max_rate: 9999, rebate_rate: 10, bonus_amount: 50000 }
  ];
  const ladderStmt = db.prepare('INSERT OR IGNORE INTO policy_ladders (id, policy_id, min_rate, max_rate, rebate_rate, bonus_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const tx = db.transaction(() => { for (const l of ladders) ladderStmt.run(uuidv4(), l.policy_id, l.min_rate, l.max_rate, l.rebate_rate, l.bonus_amount, now()); });
  tx();
  console.log('✅ 返利政策初始化完成，阶梯数:', ladders.length);
  return { policyId };
}

function initSampleData(db, distributors, { policyId }) {
  const salesOrders = [
    { distributor_idx: 0, order_no: 'SO202501150001', order_date: '2025-01-15', product_name: '飞天茅台53度500ml', product_category: '白酒', quantity: 100, unit_price: 2800, total_amount: 280000, paid_amount: 280000, region: '华东' },
    { distributor_idx: 0, order_no: 'SO202502100002', order_date: '2025-02-10', product_name: '五粮液52度500ml', product_category: '白酒', quantity: 200, unit_price: 1200, total_amount: 240000, paid_amount: 240000, region: '华东' },
    { distributor_idx: 0, order_no: 'SO202503050003', order_date: '2025-03-05', product_name: '洋河梦之蓝M6', product_category: '白酒', quantity: 150, unit_price: 800, total_amount: 120000, paid_amount: 0, region: '华东' },
    { distributor_idx: 0, order_no: 'SO202503200004', order_date: '2025-03-20', product_name: '剑南春52度', product_category: '白酒', quantity: 100, unit_price: 500, total_amount: 50000, paid_amount: 50000, region: '华东' },
    { distributor_idx: 1, order_no: 'SO202501200010', order_date: '2025-01-20', product_name: '飞天茅台53度500ml', product_category: '白酒', quantity: 80, unit_price: 2800, total_amount: 224000, paid_amount: 224000, region: '华北' },
    { distributor_idx: 1, order_no: 'SO202502280011', order_date: '2025-02-28', product_name: '汾酒青花30', product_category: '白酒', quantity: 200, unit_price: 700, total_amount: 140000, paid_amount: 140000, region: '华北' }
  ];
  const salesStmt = db.prepare('INSERT OR IGNORE INTO sales_orders (id, order_no, distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, import_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const payments = [
    { distributor_idx: 0, pay_no: 'PAY20250116001', pay_date: '2025-01-16', amount: 280000, pay_method: '银行转账', remark: '1月货款' },
    { distributor_idx: 0, pay_no: 'PAY20250212002', pay_date: '2025-02-12', amount: 240000, pay_method: '银行承兑', remark: '2月货款' },
    { distributor_idx: 0, pay_no: 'PAY20250322003', pay_date: '2025-03-22', amount: 50000, pay_method: '银行转账', remark: '3月货款' },
    { distributor_idx: 1, pay_no: 'PAY20250121010', pay_date: '2025-01-21', amount: 224000, pay_method: '银行转账', remark: '华北1月货款' },
    { distributor_idx: 1, pay_no: 'PAY20250301011', pay_date: '2025-03-01', amount: 140000, pay_method: '银行转账', remark: '华北2月货款' }
  ];
  const payStmt = db.prepare('INSERT OR IGNORE INTO payments (id, pay_no, distributor_id, pay_date, amount, pay_method, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  let savedOrders = [];
  const tx = db.transaction(() => {
    for (const o of salesOrders) {
      const hash = require('../src/utils/date').hash(JSON.stringify({ distributor_id: distributors[o.distributor_idx].id, order_date: o.order_date, product_name: o.product_name, quantity: o.quantity, unit_price: o.unit_price, _orderNo: o.order_no }));
      const id = uuidv4();
      savedOrders.push({ id, ...o, distributor_id: distributors[o.distributor_idx].id });
      salesStmt.run(id, o.order_no, distributors[o.distributor_idx].id, o.order_date, o.product_name, o.product_category, o.quantity, o.unit_price, o.total_amount, o.paid_amount, o.region, hash, 'confirmed', now(), now());
    }
    for (const p of payments) {
      payStmt.run(uuidv4(), p.pay_no, distributors[p.distributor_idx].id, p.pay_date, p.amount, p.pay_method, p.remark, now());
    }
  });
  tx();
  console.log('✅ 示例销售/回款数据初始化完成，销售单:', salesOrders.length, '条，回款:', payments.length, '条');
  return savedOrders;
}

function initSmuggleData(db, distributors, orders) {
  const eastDealer = distributors[0];
  const smuggleOrder = orders.find(o => o.order_no === 'SO202502100002');
  if (smuggleOrder) {
    const stmt = db.prepare('INSERT OR IGNORE INTO smuggle_records (id, sales_order_id, distributor_id, report_date, smuggle_region, smuggle_amount, penalty_rate, penalty_amount, remark, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    stmt.run(uuidv4(), smuggleOrder.id, eastDealer.id, '2025-03-10', '华中', smuggleOrder.total_amount, 20, smuggleOrder.total_amount * 0.2, '跨区域销售至河南，违反区域授权', 'confirmed', now());
    console.log('✅ 窜货记录初始化完成，扣罚:', smuggleOrder.total_amount * 0.2);
  }
}

module.exports = async function seed() {
  await initDb();
  const db = getDb();
  initUsers(db);
  const distributors = initDistributors(db);
  initRegionAuths(db, distributors);
  initPenaltyRules(db);
  const policyInfo = initRebatePolicies(db);
  const orders = initSampleData(db, distributors, policyInfo);
  initSmuggleData(db, distributors, orders);
  db._persist && db._persist();
  console.log('🎉 种子数据初始化完成！\n');
  return true;
};

if (require.main === module) {
  (async () => { try { await module.exports(); } catch (e) { console.error(e); process.exit(1); } })();
}
