# 酒类经销返利核算系统 (Liquor Rebate System)

酒类经销返利核算全栈Web应用，支持从销售导入到结算批次生成的完整业务流程，包含5种角色权限、11类业务数据、8步主流程和严格的校验逻辑。

---

## 一、技术栈

| 层级 | 技术选型 |
|------|---------|
| 后端 | Node.js + Express 4 + better-sqlite3 (SQLite) + JWT + bcryptjs |
| 前端 | React 18 + Vite 5 + Ant Design 5 + React Router 6 + Axios + ECharts |
| 数据库 | SQLite 3 (WAL模式 + 外键约束) |
| 构建 | concurrently 前后端一键启动 |

---

## 二、目录结构

```
.
├── backend/                     # 后端服务
│   ├── src/
│   │   ├── config/database.js   # 数据库DDL（15张表）
│   │   ├── middleware/auth.js   # JWT认证 + 角色守卫 + 审计切面
│   │   ├── services/rebateCalculator.js  # 核心返利计算引擎
│   │   ├── routes/*.js          # 11个API路由模块
│   │   ├── utils/date.js        # 日期/哈希/工具函数
│   │   ├── app.js               # Express应用
│   │   └── index.js             # 启动入口
│   ├── scripts/
│   │   ├── seed.js              # 初始化种子数据
│   │   ├── health.js            # 健康检查脚本
│   │   └── verify.js            # 3条验收路径验证脚本
│   └── package.json
│
├── frontend/                    # 前端应用
│   ├── src/
│   │   ├── contexts/AuthContext.jsx    # 认证上下文
│   │   ├── layouts/MainLayout.jsx      # 主布局（侧边栏/顶部/权限菜单）
│   │   ├── pages/*.jsx          # 12个业务页面
│   │   ├── services/api.js      # Axios封装
│   │   ├── styles/global.css    # 全局样式
│   │   ├── App.jsx              # 路由配置
│   │   └── main.jsx             # 入口
│   └── package.json
│
└── package.json                 # 根目录，concurrently一键启动
```

---

## 三、角色与账号

| 角色 | 账号 | 密码 | 权限说明 |
|------|------|------|---------|
| 运营管理员 | admin | admin123 | 全部权限 |
| 渠道经理 | manager | manager123 | 销售/回款/政策/窜货管理，试算，生成批次 |
| 财务复核 | finance | finance123 | 销售/回款查询，财务复核，确认结算，导出结果 |
| 风控 | risk | risk123 | 查询全量数据，标记异常（**不能确认结算**） |
| 经销商 | dealer01 | dealer123 | 查看本经销商销售、回款、返利试算、批次结果 |

---

## 四、核心业务流程

```
销售单导入(幂等)
    ↓
回款匹配(FIFO按日期匹配到销售单)
    ↓
政策匹配(生效期+品类)
    ↓
阶梯达成率计算(按回款金额/目标区间匹配档位)
    ↓
窜货扣罚(按扣罚规则抵减返利，记录明细)
    ↓
财务复核(批次锁定，基础数据不可修改)
    ↓
结算批次生成(销售单batch_id占用，防重复计入)
    ↓
结果导出(Excel 3个Sheet：汇总+销售明细+窜货明细)
```

---

## 五、严格校验逻辑

| 编号 | 规则 | 实现方式 |
|------|------|---------|
| 1 | 未回款销售不计返利 | `matchPaymentsToOrders` FIFO匹配，`paid_amount=0` 不计入 |
| 2 | 窜货扣罚抵减返利并展示明细 | `calcSmugglePenalty` 按 `penalty_rate × rebate_amount` 计算，`penaltyDetails` 汇总展示 |
| 3 | 同一销售单不能重复计入多批次 | `sales_orders.batch_id` 占用标记，生成批次前冲突查询 → 返回 `BATCH_CONFLICT` |
| 4 | 政策生效期外销售不能匹配 | `isBetween(order_date, policy_start, policy_end)` 区间判断 |
| 5 | 财务复核后批次锁定 | `status='reviewed'` 写入 `batch_locks`；修改接口检查 `batch_id` 非空 → `LOCKED_BY_BATCH` |
| 6 | 风控只能标记异常不能确认结算 | `/risk-mark` 需 `ROLES.RISK`；`/confirm` 需 `FINANCE/ADMIN` |
| 7 | 试算快照版本 | `rebate_trials.version` 按 (distributor+period) 自增，`input_snapshot` 存完整输入JSON |
| 8 | 导入幂等 | `MD5(order_no+date+amount+distributor)` + `order_no` 双重去重 → 返回 `{duplicate:true}` |

---

## 六、快速开始

### 6.1 一键安装依赖

```bash
npm run install:all
```

### 6.2 健康检查

```bash
npm run health
```

预期输出：
```
✅ 数据库连接成功
✅ 所有核心表存在 (users, distributors, sales_orders, payments, ...)
✅ 种子数据校验通过 (用户≥5, 经销商≥4, 政策≥1)
🚀 系统健康状态: 正常
```

### 6.3 运行验收脚本（3条路径）

```bash
npm run verify
```

预期输出：
```
========== 验收 Case 1: 导入未回款销售返利为零 ==========
✅ 未回款订单 paid_amount=0
✅ 未回款订单不计入返利基数
✅ 最终返利=0 (仅含其他回款订单)
PASS Case 1

========== 验收 Case 2: 窜货订单扣减返利 ==========
✅ 窜货扣罚明细: SO202502100002, 扣罚率=20%, 扣罚金额=XXX
✅ 扣罚前返利 > 扣罚后返利
✅ 抵减逻辑正确: 扣罚后 = 扣罚前 - SUM(扣罚金额)
PASS Case 2

========== 验收 Case 3: 重复导入销售单不重复增加达成率 ==========
✅ 第一次导入: 返回新ID, duplicate=false
✅ 第二次导入(同内容): 返回 duplicate=true
✅ 达成率在两次导入后保持不变
PASS Case 3

========== 全部 3 条验收路径通过 ==========
```

### 6.4 启动应用

```bash
npm run dev
```

- 后端: http://localhost:3001
  - 健康检查: GET http://localhost:3001/health
  - API前缀: /api/*
- 前端: http://localhost:5173
  - 登录页: http://localhost:5173/login

---

## 七、API 速览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录，返回JWT |
| GET | /api/auth/me | 当前用户信息 |
| GET | /api/auth/users | 用户列表 (admin) |

### 销售/回款/发票
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/sales | 创建销售单（幂等，返回duplicate标识） |
| POST | /api/sales/batch-import | 批量导入 |
| GET | /api/sales | 销售单列表 |
| POST | /api/payments | 登记回款 |
| POST | /api/payments/:id/match | 匹配销售单 |
| GET/POST/PUT/DELETE | /api/invoices | 发票CRUD |

### 政策/窜货/扣罚
| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST/PUT/DELETE | /api/policies | 返利政策+阶梯CRUD |
| GET/POST/PUT/DELETE | /api/smuggle | 窜货记录（自动计算penalty_amount） |
| GET/POST/PUT/DELETE | /api/penalty-rules | 扣罚规则CRUD |
| GET/POST/PUT/DELETE | /api/distributors | 经销商CRUD |
| GET/POST/PUT/DELETE | /api/region-auths | 区域授权CRUD |

### 核心返利/结算
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/rebate/trial | 返利试算（返回完整明细） |
| GET | /api/rebate/trial/:distributorId | 单经销商试算 |
| POST | /api/rebate/trial/save | 保存试算快照版本 |
| GET | /api/rebate/history | 试算历史版本 |
| POST | /api/batches/generate | 生成结算批次 |
| POST | /api/batches/:id/review | 财务复核（锁定批次） |
| POST | /api/batches/:id/confirm | 确认结算（finance/admin） |
| POST | /api/batches/:id/risk-mark | 风控标记异常（risk，非确认） |
| GET | /api/batches/:id/export | 导出Excel |
| GET | /api/audit-logs | 审计日志 (admin/finance/risk) |

---

## 八、数据模型（15张核心表）

| 表名 | 说明 |
|------|------|
| users | 用户+角色（admin/channel_manager/finance/risk/dealer） |
| distributors | 经销商档案 |
| region_auths | 经销商区域授权（防窜货基准） |
| sales_orders | 销售单（含 batch_id 批次占用标记） |
| payments | 回款记录（FIFO匹配） |
| invoices | 发票 |
| rebate_policies | 返利政策（生效期+品类+目标基数） |
| policy_ladders | 阶梯达成率（5档 min_rate→max_rate→rebate_rate+bonus） |
| smuggle_records | 窜货记录（penalty_rate+penalty_amount） |
| penalty_rules | 扣罚规则库 |
| rebate_trials | 返利试算（version+input_snapshot 快照） |
| settlement_batches | 结算批次（draft/reviewed/confirmed/canceled/abnormal） |
| batch_locks | 批次锁定审计（财务复核后写入） |
| audit_logs | 全量操作审计 |

---

## 九、验收路径详解

### Case 1：导入未回款销售返利为零
1. 创建经销商 VERIFY_D01，政策 VERIFY_POLICY
2. 导入销售单 SO_VFY_C1_001（金额10万，**无回款**）+ SO_VFY_C1_002（金额5万，全款回款）
3. 试算 → 断言：SO_VFY_C1_001 的 paid_amount=0，不计入返利基数，最终返利仅基于回款的5万计算（若5万低于政策起步则返利=0）

### Case 2：窜货订单扣减返利
1. 经销商已达标返利20,000元
2. 登记窜货记录 SMUGGLE_VFY_C2 → 关联SO_VFY_C2_001，扣罚率20%
3. 试算 → 断言：
   - 扣罚明细存在，penalty_amount = 4,000
   - final_rebate = 20,000 - 4,000 = 16,000

### Case 3：重复导入销售单不重复增加达成率
1. 初始达成率 = R0
2. 导入 SO_VFY_C3_001（金额10万）→ 返回 duplicate=false，达成率 = R1 > R0
3. **同样内容再次导入** → 返回 duplicate=true
4. 达成率仍 = R1（不变）

---

## 十、常见问题

**Q: 如何重置数据库？**
A: 删除 `backend/data/rebate.db`，重启服务自动重建+seed。

**Q: 前端如何调试？**
A: `cd frontend && npm run dev`，Vite HMR自动刷新。

**Q: 后端接口如何调试？**
A: 登录后拿到token，Header加 `Authorization: Bearer <token>`。

---

© 2025 酒类经销返利核算系统
