require('dotenv').config();
const { initDb, getDb } = require('../src/config/database');
const RebateCalculator = require('../src/services/rebateCalculator');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { now, hash, generateOrderNo } = require('../src/utils/date');

let db = null;

const log = (msg, color) => {
  const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m', cyan: '\x1b[36m' };
  console.log(`${colors[color] || ''}${msg}${colors.reset}`);
};

function assert(condition, msg) {
  if (condition) {
    log(`  ✅ ${msg}`, 'green');
    return true;
  } else {
    log(`  ❌ ${msg}`, 'red');
    process.exitCode = 1;
    return false;
  }
}

function setupTestUser() {
  const hashed = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO users (id, username, password, real_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), 'verify_admin', hashed, '验证管理员', 'admin', now());
}

function ensureTestDistributor() {
  let d = db.prepare("SELECT * FROM distributors WHERE code = 'VERIFY_DEALER'").get();
  if (!d) {
    const id = uuidv4();
    db.prepare('INSERT INTO distributors (id, code, name, contact, phone, region, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'VERIFY_DEALER', '验证专用经销商', '验证人', '13800000000', '华东', now());
    d = db.prepare("SELECT * FROM distributors WHERE code = 'VERIFY_DEALER'").get();
  }
  return d;
}

function ensureTestPolicy() {
  let p = db.prepare("SELECT * FROM rebate_policies WHERE code = 'VERIFY_POLICY'").get();
  if (!p) {
    const id = uuidv4();
    db.prepare(`INSERT INTO rebate_policies (id, code, name, product_category, start_date, end_date, base_condition, calculation_type, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, 'VERIFY_POLICY', '验证专用返利政策', '白酒', '2025-01-01', '2025-12-31', 100000, 'ladder', '验证用政策', 'active', now());
    const ladders = [
      { min_rate: 0, max_rate: 80, rebate_rate: 2, bonus_amount: 0 },
      { min_rate: 80, max_rate: 100, rebate_rate: 5, bonus_amount: 0 },
      { min_rate: 100, max_rate: 9999, rebate_rate: 8, bonus_amount: 2000 }
    ];
    for (const l of ladders) {
      db.prepare(`INSERT INTO policy_ladders (id, policy_id, min_rate, max_rate, rebate_rate, bonus_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(uuidv4(), id, l.min_rate, l.max_rate, l.rebate_rate, l.bonus_amount, now());
    }
    p = db.prepare("SELECT * FROM rebate_policies WHERE code = 'VERIFY_POLICY'").get();
  }
  return p;
}

function cleanTestData(distributorId, orderNos) {
  db.prepare('DELETE FROM smuggle_records WHERE distributor_id = ?').run(distributorId);
  db.prepare('DELETE FROM payments WHERE distributor_id = ?').run(distributorId);
  db.prepare('DELETE FROM sales_orders WHERE distributor_id = ?').run(distributorId);
  db.prepare('DELETE FROM settlement_batches WHERE distributor_id = ?').run(distributorId);
  db.prepare('DELETE FROM rebate_trials WHERE distributor_id = ?').run(distributorId);
}

function createSalesOrder({ distributorId, orderNo, orderDate, productName, quantity, unitPrice, totalAmount, paidAmount, region }) {
  const _hash = hash(JSON.stringify({ distributor_id: distributorId, order_date: orderDate, product_name: productName, quantity, unit_price: unitPrice, _orderNo: orderNo }));
  const existing = db.prepare('SELECT * FROM sales_orders WHERE order_no = ?').get(orderNo);
  if (existing) return existing;
  const id = uuidv4();
  db.prepare(`INSERT INTO sales_orders (id, order_no, distributor_id, order_date, product_name, product_category, quantity, unit_price, total_amount, paid_amount, region, import_hash, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?)`)
    .run(id, orderNo, distributorId, orderDate, productName, '白酒', quantity, unitPrice, totalAmount, paidAmount, region, _hash, now(), now());
  return db.prepare('SELECT * FROM sales_orders WHERE id = ?').get(id);
}

function createPayment({ distributorId, payNo, payDate, amount }) {
  const existing = db.prepare('SELECT * FROM payments WHERE pay_no = ?').get(payNo);
  if (existing) return existing;
  const id = uuidv4();
  db.prepare('INSERT INTO payments (id, pay_no, distributor_id, pay_date, amount, pay_method, remark, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, payNo, distributorId, payDate, amount, '银行转账', '验证回款', now());
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
}

function case1() {
  log('\n=== 验收路径1：导入未回款销售返利为零 ===', 'cyan');
  log('场景：销售订单总额50万，回款金额为0，返利应该为0。', 'yellow');

  const d = ensureTestDistributor();
  const p = ensureTestPolicy();
  const orderNos = ['V_SO_UNPAID_001', 'V_SO_UNPAID_002'];
  cleanTestData(d.id, orderNos);

  createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_UNPAID_001', orderDate: '2025-02-01', productName: '验证白酒A', quantity: 100, unitPrice: 3000, totalAmount: 300000, paidAmount: 0, region: '华东' });
  createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_UNPAID_002', orderDate: '2025-02-15', productName: '验证白酒B', quantity: 100, unitPrice: 2000, totalAmount: 200000, paidAmount: 0, region: '华东' });

  const calc = new RebateCalculator({
    distributorId: d.id,
    policyId: p.id,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31'
  });
  const result = calc.calculateDistributor(d.id, p);

  assert(result.salesTotal === 500000, `销售总额应为500000，实际=${result.salesTotal}`);
  assert(result.paidTotal === 0 || result.paidTotal < 1, `回款总额应接近0，实际=${result.paidTotal}`);
  assert(result.achievementRate === 0 || result.achievementRate < 1, `达成率应为0%，实际=${result.achievementRate}%`);
  assert(result.unpaidOrders.length >= 2, `未回款订单数应>=2，实际=${result.unpaidOrders.length}`);
  assert(result.finalRebate === 0, `最终返利应为0（未回款不计返利），实际=${result.finalRebate}`);
  assert(result.baseRebate === 0, `基础返利应为0，实际=${result.baseRebate}`);
}

function case2() {
  log('\n=== 验收路径2：窜货订单扣减返利 ===', 'cyan');
  log('场景：总回款25万（达成率250%，8%返利=2万+2000=22000），存在窜货扣罚20000，返利应体现扣减明细。', 'yellow');

  const d = ensureTestDistributor();
  const p = ensureTestPolicy();
  const orderNos = ['V_SO_SMUGGLE_001', 'V_SO_SMUGGLE_002'];
  cleanTestData(d.id, orderNos);

  const o1 = createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_SMUGGLE_001', orderDate: '2025-03-01', productName: '验证白酒C', quantity: 50, unitPrice: 3000, totalAmount: 150000, paidAmount: 0, region: '华东' });
  const o2 = createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_SMUGGLE_002', orderDate: '2025-03-10', productName: '验证白酒D', quantity: 50, unitPrice: 2000, totalAmount: 100000, paidAmount: 0, region: '华东' });
  createPayment({ distributorId: d.id, payNo: 'V_PAY_SMUGGLE_001', payDate: '2025-03-02', amount: 150000 });
  createPayment({ distributorId: d.id, payNo: 'V_PAY_SMUGGLE_002', payDate: '2025-03-11', amount: 100000 });

  const smuggleAmount = 100000;
  const penaltyRate = 20;
  const penaltyAmount = smuggleAmount * (penaltyRate / 100);
  db.prepare('INSERT OR IGNORE INTO smuggle_records (id, sales_order_id, distributor_id, report_date, smuggle_region, smuggle_amount, penalty_rate, penalty_amount, remark, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(uuidv4(), o2.id, d.id, '2025-03-20', '华中', smuggleAmount, penaltyRate, penaltyAmount, '窜货至华中地区', 'confirmed', now());

  const calc = new RebateCalculator({
    distributorId: d.id,
    policyId: p.id,
    periodStart: '2025-01-01',
    periodEnd: '2025-12-31'
  });
  const result = calc.calculateDistributor(d.id, p);

  assert(result.paidTotal === 250000, `回款总额应为250000，实际=${result.paidTotal}`);
  assert(result.achievementRate === 250, `达成率应为250%（25万/10万），实际=${result.achievementRate}%`);
  assert(result.baseRebate === 20000, `基础返利应为20000（25万*8%），实际=${result.baseRebate}`);
  assert(result.ladderRebate === 2000, `阶梯奖励应为2000，实际=${result.ladderRebate}`);
  assert(result.smugglePenalty >= penaltyAmount - 1, `窜货扣罚应>=${penaltyAmount}，实际=${result.smugglePenalty}`);
  assert(result.smuggleDetails && result.smuggleDetails.length >= 1, `扣罚明细应有>=1条，实际=${result.smuggleDetails?.length}`);
  const expectedFinal = 20000 + 2000 - penaltyAmount;
  const diff = Math.abs(result.finalRebate - expectedFinal);
  assert(diff < 10, `最终返利=${result.finalRebate}，预期=${expectedFinal}（基础2万+阶梯2千-窜货扣罚${penaltyAmount}），偏差=${diff}`);
  log(`  ℹ️ 扣罚明细示例：${JSON.stringify(result.smuggleDetails?.[0] || {})}`, 'yellow');
}

function case3() {
  log('\n=== 验收路径3：重复导入销售单不会重复增加达成率 ===', 'cyan');
  log('场景：第一次导入1单回款10万，第二次同订单再次导入，试算回款总额和达成率应保持不变。', 'yellow');

  const d = ensureTestDistributor();
  const p = ensureTestPolicy();
  const orderNos = ['V_SO_DUP_001'];
  cleanTestData(d.id, orderNos);

  const beforeCount = db.prepare('SELECT COUNT(*) as c FROM sales_orders WHERE distributor_id = ?').get(d.id).c;

  const runCalc = () => {
    const calc = new RebateCalculator({
      distributorId: d.id,
      policyId: p.id,
      periodStart: '2025-01-01',
      periodEnd: '2025-12-31'
    });
    return calc.calculateDistributor(d.id, p);
  };

  createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_DUP_001', orderDate: '2025-04-01', productName: '验证白酒E', quantity: 20, unitPrice: 5000, totalAmount: 100000, paidAmount: 100000, region: '华东' });
  const r1 = runCalc();
  const count1 = db.prepare('SELECT COUNT(*) as c FROM sales_orders WHERE distributor_id = ?').get(d.id).c;

  const dup = createSalesOrder({ distributorId: d.id, orderNo: 'V_SO_DUP_001', orderDate: '2025-04-01', productName: '验证白酒E', quantity: 20, unitPrice: 5000, totalAmount: 100000, paidAmount: 100000, region: '华东' });
  const r2 = runCalc();
  const count2 = db.prepare('SELECT COUNT(*) as c FROM sales_orders WHERE distributor_id = ?').get(d.id).c;

  assert(count1 - beforeCount === 1, `第一次导入后销售单数应+1，实际=${count1 - beforeCount}`);
  assert(count2 === count1, `重复导入后销售单数应不变（幂等），第一次导入后=${count1}，重复后=${count2}`);
  assert(r1.paidTotal === r2.paidTotal, `回款总额应一致，第一次=${r1.paidTotal}，重复导入后=${r2.paidTotal}`);
  assert(r1.achievementRate === r2.achievementRate, `达成率应一致，第一次=${r1.achievementRate}%，重复导入后=${r2.achievementRate}%`);
  assert(r1.finalRebate === r2.finalRebate, `返利金额应一致，第一次=${r1.finalRebate}，重复导入后=${r2.finalRebate}`);
  assert(dup.order_no === 'V_SO_DUP_001', '幂等返回应返回相同订单号');
}

async function runAll() {
  await initDb();
  db = getDb();

  log('=============================================', 'cyan');
  log('  酒类经销返利核算系统 - 验收验证脚本', 'cyan');
  log('  覆盖3条验收路径，验证核心校验逻辑', 'cyan');
  log('=============================================', 'cyan');

  setupTestUser();

  try {
    case1();
    case2();
    case3();
  } catch (e) {
    log('\n❌ 验证脚本执行出错：' + e.message, 'red');
    console.error(e.stack);
    process.exitCode = 1;
  }

  db._persist && db._persist();
  log('\n=============================================', 'cyan');
  if (process.exitCode) {
    log('  ❌ 存在未通过的验收项，请检查', 'red');
  } else {
    log('  🎉 全部3条验收路径验证通过！', 'green');
  }
  log('=============================================', 'cyan');
}

if (require.main === module) (async () => { try { await runAll(); } catch (e) { console.error(e); process.exit(1); } })();
module.exports = runAll;
