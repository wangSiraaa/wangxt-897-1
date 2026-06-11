require('dotenv').config();
const { initDb, getDb } = require('../src/config/database');

const log = (msg, color) => {
  const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', reset: '\x1b[0m', cyan: '\x1b[36m' };
  console.log(`${colors[color] || ''}${msg}${colors.reset}`);
};

const checks = [];

function check(name, fn) {
  try {
    const r = fn();
    checks.push({ name, status: r.ok ? 'OK' : 'FAIL', detail: r.detail, ok: r.ok });
    log(`  ${r.ok ? '✅' : '❌'} ${name}${r.detail ? ' - ' + r.detail : ''}`, r.ok ? 'green' : 'red');
    if (!r.ok) process.exitCode = 1;
  } catch (e) {
    checks.push({ name, status: 'ERROR', detail: e.message, ok: false });
    log(`  ❌ ${name} - 异常: ${e.message}`, 'red');
    process.exitCode = 1;
  }
}

async function run() {
  await initDb();
  const db = getDb();

  log('=============================================', 'cyan');
  log('  酒类经销返利核算系统 - 健康检查', 'cyan');
  log('=============================================', 'cyan');

  log('\n[1] 数据库连接', 'yellow');
  check('数据库连接正常', () => {
    const r = db.prepare('SELECT 1 as n').get();
    return { ok: r && r.n === 1, detail: r?.n };
  });
  check('SQLite 表存在性验证(至少10张)', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    return { ok: rows.length >= 10, detail: `${rows.length} 张表: ${rows.map(r => r.name).join(',')}` };
  });

  log('\n[2] 核心数据表', 'yellow');
  const tables = ['users', 'distributors', 'sales_orders', 'payments', 'rebate_policies', 'policy_ladders', 'smuggle_records', 'settlement_batches', 'rebate_trials', 'audit_logs'];
  for (const t of tables) {
    check(`数据表 [${t}] 存在`, () => {
      const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      return { ok: !!r, detail: r?.name };
    });
  }

  log('\n[3] 基础数据', 'yellow');
  check('用户表至少有5个角色账户', () => {
    const roles = db.prepare('SELECT role, COUNT(*) as c FROM users GROUP BY role').all();
    const total = roles.reduce((s, r) => s + r.c, 0);
    return { ok: total >= 5, detail: `总用户=${total}, 角色分布=${roles.map(r => `${r.role}:${r.c}`).join(',')}` };
  });
  check('至少有1个返利政策', () => {
    const c = db.prepare('SELECT COUNT(*) as c FROM rebate_policies').get().c;
    return { ok: c >= 1, detail: `active=${db.prepare("SELECT COUNT(*) as c FROM rebate_policies WHERE status='active'").get().c}/${c}` };
  });
  check('政策关联了阶梯规则', () => {
    const c = db.prepare('SELECT COUNT(DISTINCT policy_id) as c FROM policy_ladders').get().c;
    return { ok: c >= 1, detail: `${c} 个政策有阶梯` };
  });
  check('至少有4家经销商', () => {
    const c = db.prepare('SELECT COUNT(*) as c FROM distributors').get().c;
    return { ok: c >= 4, detail: `${c} 家` };
  });
  check('扣罚规则至少3条', () => {
    const c = db.prepare('SELECT COUNT(*) as c FROM penalty_rules').get().c;
    return { ok: c >= 3, detail: `${c} 条` };
  });

  log('\n[4] 示例数据', 'yellow');
  const so = db.prepare('SELECT COUNT(*) as c FROM sales_orders').get().c;
  check(`示例销售单 >= 4 条（实际${so}）`, () => ({ ok: so >= 4, detail: so }));
  const pay = db.prepare('SELECT COUNT(*) as c FROM payments').get().c;
  check(`示例回款 >= 3 条（实际${pay}）`, () => ({ ok: pay >= 3, detail: pay }));

  db._persist && db._persist();
  log('\n=============================================', 'cyan');
  const pass = checks.filter(c => c.ok).length;
  const total = checks.length;
  log(`  健康检查结果：${pass}/${total} 通过`, pass === total ? 'green' : 'red');
  log('=============================================', 'cyan');
}

if (require.main === module) (async () => { try { await run(); } catch (e) { console.error(e); process.exit(1); } })();
module.exports = run;
