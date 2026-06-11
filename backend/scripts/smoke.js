require('dotenv').config();
const BASE = process.env.BACKEND_URL || 'http://localhost:3001';
const BASE_FRONT = 'http://localhost:5173';

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', x: '\x1b[0m' };
const log = (m, c) => console.log(`${C[c] || ''}${m}${C.x}`);

async function check(url, label, expects) {
  try {
    const r = await fetch(url);
    const t = await r.text();
    const ok = expects ? expects(r.status, t) : r.status === 200;
    log(`  ${ok ? '✅' : '❌'} [${r.status}] ${label}${t.length > 80 ? ' - preview:' + t.slice(0, 80).replace(/\n/g, ' ') : ''}`, ok ? 'g' : 'r');
    return { ok, status: r.status, text: t };
  } catch (e) {
    log(`  ❌ ${label}: ${e.message}`, 'r');
    return { ok: false };
  }
}

async function main() {
  log('\n=== 端到端冒烟测试 ===', 'c');

  log('\n[后端 HTTP]', 'y');
  await check(`${BASE}/health`, '健康检查');
  await check(`${BASE}/api/`, 'API 根路径', (s, t) => s === 200 || s === 404);

  log('\n[前端 HTTP]', 'y');
  await check(`${BASE_FRONT}/`, '首页 index.html', (s, t) => s === 200 && /<\!doctype/i.test(t));

  log('\n[后端 API 登录]', 'y');
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  const lj = await login.json();
  const tok = lj?.token || lj?.data?.token;
  const ok1 = login.status === 200 && !!tok;
  log(`  ${ok1 ? '✅' : '❌'} [${login.status}] admin 登录 token_len=${tok?.length || 0}`, ok1 ? 'g' : 'r');
  if (!tok) return;
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  log('\n[业务 API]', 'y');
  const tests = [
    ['GET /api/sales', `${BASE}/api/sales?page=1&pageSize=2`, null],
    ['GET /api/payments', `${BASE}/api/payments`, null],
    ['GET /api/policies', `${BASE}/api/policies`, null],
    ['GET /api/smuggle', `${BASE}/api/smuggle`, null],
    ['GET /api/batches', `${BASE}/api/batches`, null],
    ['GET /api/audit', `${BASE}/api/audit?page=1&pageSize=3`, null],
  ];
  for (const [name, url, body] of tests) {
    const r = await fetch(url, { headers: H });
    const ok = r.status === 200;
    let preview = '';
    try { const t = await r.text(); preview = t.slice(0, 60); } catch { }
    log(`  ${ok ? '✅' : '❌'} [${r.status}] ${name}${preview ? ' ' + preview : ''}`, ok ? 'g' : 'r');
  }

  log('\n[返利计算 & 试算]', 'y');
  const body = JSON.stringify({ period_start: '2025-01-01', period_end: '2025-12-31' });
  const rc = await fetch(`${BASE}/api/rebate/calculate`, { method: 'POST', headers: H, body });
  const rj = await rc.json();
  const dealers = Array.isArray(rj) ? rj : (rj.data || []);
  const ok2 = rc.status === 200 && dealers.length > 0;
  log(`  ${ok2 ? '✅' : '❌'} 返利计算: ${dealers.length} 家经销商`, ok2 ? 'g' : 'r');
  dealers.slice(0, 3).forEach(d => {
    log(`    - ${d.distributor_name?.slice(0, 12) || d.distributorId?.slice(0, 8)}: 销售=${(d.salesTotal || d.sales_total || 0) / 10000}万/回款=${(d.paidTotal || d.paid_total || 0) / 10000}万/达成=${d.achievementRate || d.achievement_rate}%/返利=${d.finalRebate || d.final_rebate}${(d.smugglePenalty || d.smuggle_penalty) > 0 ? `(窜货扣${d.smugglePenalty || d.smuggle_penalty})` : ''}`, 'y');
  });

  const rt = await fetch(`${BASE}/api/rebate/save`, { method: 'POST', headers: H, body });
  const rj2 = await rt.json();
  const trials = Array.isArray(rj2) ? rj2 : (rj2.data || []);
  log(`  ${rt.status === 200 ? '✅' : '❌'} 试算快照保存: ${trials.length} 条记录`, rt.status === 200 ? 'g' : 'r');

  const rg = await fetch(`${BASE}/api/rebate/trials?page=1&pageSize=2`, { headers: H });
  const rj3 = await rg.json();
  const trials2 = rj3.data || [];
  log(`  ${rg.status === 200 && trials2.length > 0 ? '✅' : '❌'} 试算快照查询: ${trials2.length} 条/${rj3.total || 0} 总`, rg.status === 200 ? 'g' : 'r');

  log('\n[风控权限]', 'y');
  const rlogin = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'risk', password: 'risk123' })
  });
  const riskLogin = await rlogin.json();
  const rtok = riskLogin?.token || riskLogin?.data?.token;
  if (rtok) {
    log('  ✅ 风控账户登录成功', 'g');
    const cr = await fetch(`${BASE}/api/batches/0/confirm`, { method: 'POST', headers: { Authorization: `Bearer ${rtok}`, 'Content-Type': 'application/json' }, body: '{}' });
    const cj = await cr.json().catch(() => ({}));
    const forbid = cr.status === 403 || cj.code === 'FORBIDDEN_ROLE' || cj.code === 'FORBIDDEN';
    log(`  ${forbid ? '✅' : '❌'} 风控确认结算被禁止: status=${cr.status} code=${cj.code || '-'}`, forbid ? 'g' : 'y');
  }

  log('\n=== 冒烟测试完成 ===', 'c');
}

main().catch(e => { console.error(e); process.exit(1); });
