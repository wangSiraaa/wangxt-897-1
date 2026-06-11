require('dotenv').config();
const BASE = process.env.BACKEND_URL || 'http://localhost:3001';

const C = { g: '\x1b[32m', r: '\x1b[31m', y: '\x1b[33m', c: '\x1b[36m', x: '\x1b[0m', b: '\x1b[1m' };
const log = (m, c) => console.log(`${C[c] || ''}${m}${C.x}`);

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    log(`  ✅ ${testName}`, 'g');
    if (detail) log(`     ${detail}`, 'y');
  } else {
    failed++;
    log(`  ❌ ${testName}`, 'r');
    if (detail) log(`     ${detail}`, 'r');
  }
  return condition;
}

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  return { status: res.status, data, token: data?.token || data?.data?.token };
}

async function apiCall(method, path, token, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function waitForHealth(timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  return false;
}

async function main() {
  log('\n' + '='.repeat(60), 'c');
  log('  SMOKE-897: 消息提醒 & 未回款拦截 端到端测试', 'b');
  log('='.repeat(60), 'c');

  log('\n[步骤 0] 等待服务就绪...', 'y');
  const healthy = await waitForHealth();
  if (!healthy) {
    log('❌ 服务未就绪，超时退出', 'r');
    process.exit(1);
  }
  log('  ✅ 服务健康检查通过', 'g');

  log('\n[步骤 1] 管理员登录', 'y');
  const loginResult = await login('admin', 'admin123');
  const adminToken = loginResult.token;
  assert(loginResult.status === 200 && !!adminToken, '管理员登录成功', `token长度: ${adminToken?.length || 0}`);

  if (!adminToken) {
    log('\n❌ 登录失败，无法继续测试', 'r');
    process.exit(1);
  }

  log('\n[步骤 2] 获取经销商列表（用于后续测试）', 'y');
  const distributorsRes = await apiCall('GET', '/api/distributors', adminToken);
  const distributors = distributorsRes.data?.data || distributorsRes.data || [];
  assert(distributors.length > 0, '经销商列表非空', `经销商数量: ${distributors.length}`);

  const testDealer = distributors[0];
  assert(!!testDealer?.id, '获取到测试经销商', `经销商: ${testDealer?.name || testDealer?.code}`);

  log('\n[步骤 3] 获取返利政策列表', 'y');
  const policiesRes = await apiCall('GET', '/api/policies', adminToken);
  const policies = policiesRes.data?.data || policiesRes.data || [];
  assert(policies.length > 0, '返利政策列表非空', `政策数量: ${policies.length}`);

  const testPolicy = policies.find(p => p.status === 'active') || policies[0];
  assert(!!testPolicy?.id, '获取到测试政策', `政策: ${testPolicy?.name || testPolicy?.code}`);

  log('\n==============================================', 'c');
  log('  Case 1: 成功分支 - 生成政策匹配消息提醒', 'b');
  log('==============================================', 'c');

  log('\n[Case 1.1] 生成政策匹配通知', 'y');
  const genNotifyRes = await apiCall('POST', '/api/notifications/generate-policy-match', adminToken, {
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    distributor_id: testDealer.id
  });
  assert(genNotifyRes.status === 200, '生成政策匹配通知 API 调用成功');
  assert(genNotifyRes.data?.success === true, '生成成功返回 success=true');
  assert(genNotifyRes.data?.generated > 0, '生成的通知数量 > 0', `生成数量: ${genNotifyRes.data?.generated}`);

  log('\n[Case 1.2] 查询消息列表 - 验证政策匹配类型', 'y');
  const notifyListRes = await apiCall('GET', '/api/notifications?type=policy_match&pageSize=10', adminToken);
  const policyNotifyList = notifyListRes.data?.data || notifyListRes.data || [];
  assert(policyNotifyList.length > 0, '存在政策匹配类型的通知', `政策匹配通知数: ${policyNotifyList.length}`);

  const firstPolicyNotify = policyNotifyList[0];
  assert(firstPolicyNotify?.type === 'policy_match', '通知类型为 policy_match');
  assert(!!firstPolicyNotify?.title, '通知有标题', `标题: ${firstPolicyNotify.title}`);
  assert(!!firstPolicyNotify?.policy_id, '通知关联了政策ID', `政策ID: ${firstPolicyNotify.policy_id}`);
  assert(firstPolicyNotify?.status === 'unread', '新生成的通知状态为未读');

  log('\n[Case 1.3] 未读消息数量查询', 'y');
  const unreadRes = await apiCall('GET', '/api/notifications/unread-count', adminToken);
  assert(unreadRes.status === 200, '未读数量查询成功');
  assert(typeof unreadRes.data?.count === 'number', '返回 count 字段', `未读数量: ${unreadRes.data?.count}`);

  log('\n[Case 1.4] 标记单条消息已读', 'y');
  const readRes = await apiCall('POST', `/api/notifications/${firstPolicyNotify.id}/read`, adminToken);
  assert(readRes.status === 200 && readRes.data?.success === true, '标记已读成功');

  const notifyDetailRes = await apiCall('GET', `/api/notifications?id=${firstPolicyNotify.id}`, adminToken);
  const detailList = notifyDetailRes.data?.data || notifyDetailRes.data || [];
  const updatedNotify = detailList.find(n => n.id === firstPolicyNotify.id);
  assert(updatedNotify?.status === 'read', '消息状态更新为已读');

  log('\n[Case 1.5] 全部已读', 'y');
  const readAllRes = await apiCall('POST', '/api/notifications/read-all', adminToken);
  assert(readAllRes.status === 200 && readAllRes.data?.success === true, '全部已读成功');

  const afterReadAllRes = await apiCall('GET', '/api/notifications/unread-count', adminToken);
  assert(afterReadAllRes.data?.count === 0, '全部已读后未读数量为0', `未读数量: ${afterReadAllRes.data?.count}`);

  log('\n[Case 1.6] 按政策筛选消息', 'y');
  const filteredByPolicyRes = await apiCall('GET', `/api/notifications?policy_id=${testPolicy.id}&pageSize=10`, adminToken);
  const filteredByPolicy = filteredByPolicyRes.data?.data || filteredByPolicyRes.data || [];
  assert(Array.isArray(filteredByPolicy), '按政策筛选返回数组');
  if (filteredByPolicy.length > 0) {
    assert(filteredByPolicy.every(n => n.policy_id === testPolicy.id), '所有返回的通知政策ID一致');
  }

  log('\n==============================================', 'c');
  log('  Case 2: 失败分支 - 未回款销售不计返利要拦截', 'b');
  log('==============================================', 'c');

  log('\n[Case 2.1] 创建未回款销售单（用于测试拦截）', 'y');
  const unpaidOrderRes = await apiCall('POST', '/api/sales', adminToken, {
    distributor_id: testDealer.id,
    order_date: '2025-06-01',
    product_name: 'SMOKE897 测试酒-未回款',
    product_category: '白酒',
    quantity: 100,
    unit_price: 1000,
    total_amount: 100000,
    paid_amount: 0,
    region: testDealer.region || '华东',
    order_no: 'SMOKE897_UNPAID_001'
  });
  assert(unpaidOrderRes.status === 200, '创建未回款销售单成功', `订单号: ${unpaidOrderRes.data?.order_no || 'SMOKE897_UNPAID_001'}`);
  const unpaidOrderId = unpaidOrderRes.data?.id;

  log('\n[Case 2.2] 调用未回款拦截检查接口', 'y');
  const blockCheckRes = await apiCall('POST', '/api/notifications/check-unpaid-block', adminToken, {
    distributor_id: testDealer.id,
    period_start: '2025-01-01',
    period_end: '2025-12-31'
  });
  assert(blockCheckRes.status === 200, '未回款拦截检查 API 调用成功');

  const blockData = blockCheckRes.data;
  assert(blockData?.blocked === true, '返回 blocked=true（检测到未回款，已拦截）');
  assert(blockData?.code === 'UNPAID_SALES_BLOCKED', '错误码为 UNPAID_SALES_BLOCKED');
  assert(blockData?.message?.includes('未回款销售不计返利'), '消息包含「未回款销售不计返利」', `消息: ${blockData?.message}`);
  assert(blockData?.unpaid_count > 0, '未回款订单数 > 0', `未回款数量: ${blockData?.unpaid_count}`);
  assert(blockData?.unpaid_amount > 0, '未回款金额 > 0', `未回款金额: ¥${blockData?.unpaid_amount}`);
  assert(Array.isArray(blockData?.unpaid_orders), '返回未回款订单明细数组', `明细数量: ${blockData?.unpaid_orders?.length || 0}`);
  
  const ourUnpaidOrder = blockData?.unpaid_orders?.find(o => o.order_no === 'SMOKE897_UNPAID_001');
  if (ourUnpaidOrder) {
    assert(ourUnpaidOrder.paid_amount === 0, '拦截检查返回 paid_amount=0', `实际值: ${ourUnpaidOrder.paid_amount}`);
    assert(ourUnpaidOrder.is_explicit_unpaid === true, '拦截检查返回 is_explicit_unpaid=true');
    assert(ourUnpaidOrder.unpaid_reason === '未回款销售不计返利', '拦截检查返回 unpaid_reason 正确', `实际值: ${ourUnpaidOrder.unpaid_reason}`);
  }

  log('\n[Case 2.3] 验证拦截后自动生成未回款提醒通知', 'y');
  const unpaidNotifyRes = await apiCall('GET', '/api/notifications?type=unpaid_warning&pageSize=5', adminToken);
  const unpaidNotifies = unpaidNotifyRes.data?.data || unpaidNotifyRes.data || [];
  assert(unpaidNotifies.length > 0, '生成了未回款提醒类型的通知', `未回款提醒数: ${unpaidNotifies.length}`);

  const latestUnpaid = unpaidNotifies[0];
  assert(latestUnpaid?.type === 'unpaid_warning', '通知类型为 unpaid_warning');
  assert(latestUnpaid?.title?.includes('未回款') || latestUnpaid?.title?.includes('拦截'), '标题包含未回款/拦截关键字', `标题: ${latestUnpaid.title}`);
  assert(!!latestUnpaid?.data || !!latestUnpaid?.data_json, '通知包含详细数据');

  log('\n[Case 2.4] 验证未回款不计入返利（试算验证）', 'y');
  const calcRes = await apiCall('POST', '/api/rebate/calculate', adminToken, {
    period_start: '2025-01-01',
    period_end: '2025-12-31',
    distributor_id: testDealer.id
  });
  assert(calcRes.status === 200, '返利试算成功');

  const calcResults = calcRes.data?.data || calcRes.data || [];
  const dealerCalc = calcResults.find(r => r.distributorId === testDealer.id || r.distributor_id === testDealer.id);
  
  if (dealerCalc) {
    const unpaidOrdersInCalc = dealerCalc.unpaidOrders || dealerCalc.unpaid_orders || [];
    assert(unpaidOrdersInCalc.length > 0, '试算结果包含未回款订单');
    assert(dealerCalc.paidTotal !== undefined, '有回款金额字段', `回款金额: ¥${dealerCalc.paidTotal || dealerCalc.paid_total || 0}`);
    assert(dealerCalc.achievementRate !== undefined, '有达成率字段', `达成率: ${dealerCalc.achievementRate || dealerCalc.achievement_rate || 0}%`);
    
    const allOrders = dealerCalc.orders || [];
    const testOrderInCalc = allOrders.find(o => o.order_no === 'SMOKE897_UNPAID_001');
    if (testOrderInCalc) {
      assert(testOrderInCalc.is_explicit_unpaid === true, 'paid_amount=0 的订单被标记为 is_explicit_unpaid');
      assert(testOrderInCalc.is_paid === false, 'paid_amount=0 的订单 is_paid=false');
      assert(testOrderInCalc.paid_amount_matched === 0, 'paid_amount_matched=0（未被独立回款池补充）', `实际值: ${testOrderInCalc.paid_amount_matched}`);
      assert(testOrderInCalc.paid_amount_from_payment === 0, 'paid_amount_from_payment=0（独立回款池未补充）', `实际值: ${testOrderInCalc.paid_amount_from_payment}`);
      assert(testOrderInCalc.unpaid_reason === '未回款销售不计返利', '未回款原因为「未回款销售不计返利」', `实际值: ${testOrderInCalc.unpaid_reason}`);
      assert(unpaidOrdersInCalc.some(o => o.id === testOrderInCalc.id || o.order_no === testOrderInCalc.order_no), '测试订单出现在 unpaidOrders 中');
    }
  }

  log('\n==============================================', 'c');
  log('  Case 3: 经销商角色消息权限验证', 'b');
  log('==============================================', 'c');

  log('\n[Case 3.1] 经销商登录', 'y');
  const dealerLoginRes = await login('dealer01', 'dealer123');
  const dealerToken = dealerLoginRes.token;
  assert(dealerLoginRes.status === 200 && !!dealerToken, '经销商登录成功');

  log('\n[Case 3.2] 经销商查询自己的消息', 'y');
  const dealerNotifyRes = await apiCall('GET', '/api/notifications?pageSize=10', dealerToken);
  assert(dealerNotifyRes.status === 200, '经销商可查询消息列表');
  const dealerNotifies = dealerNotifyRes.data?.data || dealerNotifyRes.data || [];
  assert(Array.isArray(dealerNotifies), '返回消息数组', `消息数量: ${dealerNotifies.length}`);

  log('\n[Case 3.3] 经销商未读消息数量', 'y');
  const dealerUnreadRes = await apiCall('GET', '/api/notifications/unread-count', dealerToken);
  assert(dealerUnreadRes.status === 200, '经销商可查询未读数量');
  assert(typeof dealerUnreadRes.data?.count === 'number', '返回 count 字段');

  log('\n==============================================', 'c');
  log('  Case 4: 消息中心页面可达性（前端集成）', 'b');
  log('==============================================', 'c');

  log('\n[Case 4.1] 前端页面可访问', 'y');
  try {
    const indexRes = await fetch(`${BASE}/`);
    const indexHtml = await indexRes.text();
    assert(indexRes.status === 200, '前端首页可访问');
    assert(indexHtml.includes('<!DOCTYPE') || indexHtml.includes('<div id="root"'), '返回 HTML 页面');
  } catch (e) {
    log('  ⚠️  前端页面未部署（开发模式下正常），跳过前端验证', 'y');
  }

  log('\n' + '='.repeat(60), 'c');
  log('  SMOKE-897 测试结果汇总', 'b');
  log('='.repeat(60), 'c');
  log(`  ✅ 通过: ${passed} 项`, 'g');
  log(`  ❌ 失败: ${failed} 项`, failed > 0 ? 'r' : 'g');
  log(`  通过率: ${passed + failed > 0 ? Math.round(passed / (passed + failed) * 100) : 0}%`, 'y');
  log('='.repeat(60), 'c');

  if (failed > 0) {
    log('\n❌ 存在测试失败项', 'r');
    process.exit(1);
  } else {
    log('\n🎉 全部 SMOKE-897 测试通过！', 'g');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('测试执行异常:', e);
  process.exit(1);
});
