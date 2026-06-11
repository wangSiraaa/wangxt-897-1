const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { isBetween, toFixed, formatDate, now } = require('../utils/date');

class RebateCalculator {
  constructor(opts = {}) {
    this.db = getDb();
    this.distributorId = opts.distributorId;
    this.policyId = opts.policyId;
    this.periodStart = opts.periodStart;
    this.periodEnd = opts.periodEnd;
    this.salesOrderIds = opts.salesOrderIds || null;
    this.excludeBatchLocks = opts.excludeBatchLocks !== false;
  }

  getPolicy() {
    if (this.policyId) {
      return this.db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(this.policyId);
    }
    return null;
  }

  getActivePolicies() {
    let sql = 'SELECT * FROM rebate_policies WHERE status = ?';
    const params = ['active'];
    if (this.periodStart && this.periodEnd) {
      sql += ' AND start_date <= ? AND end_date >= ?';
      params.push(this.periodEnd, this.periodStart);
    }
    return this.db.prepare(sql).all(...params);
  }

  getPolicyLadders(policyId) {
    return this.db.prepare('SELECT * FROM policy_ladders WHERE policy_id = ? ORDER BY min_rate ASC').all(policyId);
  }

  getSalesOrders() {
    let sql = `SELECT so.*, d.name as distributor_name, d.code as distributor_code 
               FROM sales_orders so 
               JOIN distributors d ON d.id = so.distributor_id 
               WHERE 1=1`;
    const params = [];

    if (this.distributorId) {
      sql += ' AND so.distributor_id = ?';
      params.push(this.distributorId);
    }
    if (this.periodStart) {
      sql += ' AND so.order_date >= ?';
      params.push(this.periodStart);
    }
    if (this.periodEnd) {
      sql += ' AND so.order_date <= ?';
      params.push(this.periodEnd);
    }
    if (this.salesOrderIds && this.salesOrderIds.length > 0) {
      const placeholders = this.salesOrderIds.map(() => '?').join(',');
      sql += ` AND so.id IN (${placeholders})`;
      params.push(...this.salesOrderIds);
    }
    if (this.excludeBatchLocks) {
      sql += ' AND so.batch_id IS NULL';
    }
    sql += ' ORDER BY so.order_date DESC';
    return this.db.prepare(sql).all(...params);
  }

  getPayments(distributorId) {
    let sql = `SELECT * FROM payments WHERE distributor_id = ?`;
    const params = [distributorId];
    if (this.periodStart) {
      sql += ' AND pay_date >= ?';
      params.push(this.periodStart);
    }
    if (this.periodEnd) {
      sql += ' AND pay_date <= ?';
      params.push(this.periodEnd);
    }
    return this.db.prepare(sql).all(...params);
  }

  getSmuggleRecords(distributorId) {
    let sql = `SELECT sr.*, so.order_no, so.product_name 
               FROM smuggle_records sr 
               LEFT JOIN sales_orders so ON so.id = sr.sales_order_id 
               WHERE sr.distributor_id = ? AND sr.status = 'confirmed'`;
    const params = [distributorId];
    if (this.periodStart) {
      sql += ' AND sr.report_date >= ?';
      params.push(this.periodStart);
    }
    if (this.periodEnd) {
      sql += ' AND sr.report_date <= ?';
      params.push(this.periodEnd);
    }
    return this.db.prepare(sql).all(...params);
  }

  matchPaymentsToOrders(orders, payments) {
    const sortedOrders = [...orders].sort((a, b) => new Date(a.order_date) - new Date(b.order_date));
    
    let directPaidSum = 0;
    for (const order of sortedOrders) {
      directPaidSum += (order.paid_amount || 0);
    }

    const paymentSum = payments.reduce((s, p) => s + (p.amount || 0), 0);
    let remaining = paymentSum;
    for (const order of sortedOrders) {
      const already = (order.paid_amount || 0);
      const need = Math.max(0, (order.total_amount || 0) - already);
      let fromPayment = 0;
      if (need > 0 && remaining > 0) {
        fromPayment = Math.min(need, remaining);
        remaining -= fromPayment;
      }
      order.paid_amount_direct = already;
      order.paid_amount_from_payment = fromPayment;
      order.paid_amount_matched = already + fromPayment;
      order.is_paid = order.paid_amount_matched / (order.total_amount || 1) >= 0.9999;
    }

    const totalPaid = directPaidSum + (paymentSum - remaining);
    return { sortedOrders, totalPaid };
  }

  matchPolicyToOrder(order, policy) {
    if (!policy) return false;
    if (order.product_category && policy.product_category && order.product_category !== policy.product_category) return false;
    return isBetween(order.order_date, policy.start_date, policy.end_date);
  }

  calcAchievementRate(paidAmount, baseCondition) {
    if (!baseCondition || baseCondition <= 0) return 100;
    return toFixed((paidAmount / baseCondition) * 100, 2);
  }

  getLadderRebate(rate, ladders) {
    let baseRebateRate = 0;
    let bonusAmount = 0;
    let matchedLadder = null;

    const sorted = [...ladders].sort((a, b) => a.min_rate - b.min_rate);
    for (let i = 0; i < sorted.length; i++) {
      const ladder = sorted[i];
      const isLast = i === sorted.length - 1;
      const upperOk = isLast || (ladder.max_rate > 0 && rate < ladder.max_rate);
      if (rate >= ladder.min_rate && upperOk) {
        matchedLadder = ladder;
        baseRebateRate = ladder.rebate_rate;
        bonusAmount = ladder.bonus_amount || 0;
        break;
      }
    }
    return { baseRebateRate, bonusAmount, matchedLadder };
  }

  calculateDistributor(distributorId, policy) {
    const allOrders = this.getSalesOrders();
    const orders = allOrders.filter(o => o.distributor_id === distributorId);
    const payments = this.getPayments(distributorId);
    const smuggles = this.getSmuggleRecords(distributorId);
    const ladders = policy ? this.getPolicyLadders(policy.id) : [];

    const matchedOrders = [];
    const unmatchedOrders = [];
    for (const order of orders) {
      if (policy && !this.matchPolicyToOrder(order, policy)) {
        unmatchedOrders.push(order);
      } else {
        matchedOrders.push(order);
      }
    }

    const { sortedOrders, totalPaid } = this.matchPaymentsToOrders(matchedOrders, payments);

    const paidOrders = sortedOrders.filter(o => o.is_paid);
    const unpaidOrders = sortedOrders.filter(o => !o.is_paid);
    const paidTotal = paidOrders.reduce((s, o) => s + (o.paid_amount_matched || 0), 0);
    const salesTotal = sortedOrders.reduce((s, o) => s + (o.total_amount || 0), 0);

    const baseCondition = policy?.base_condition || 0;
    const achievementRate = this.calcAchievementRate(paidTotal, baseCondition);

    let { baseRebateRate, bonusAmount, matchedLadder } = policy ? 
      this.getLadderRebate(achievementRate, ladders) : { baseRebateRate: 0, bonusAmount: 0, matchedLadder: null };

    const baseRebate = toFixed(paidTotal * (baseRebateRate / 100), 2);
    const ladderRebate = toFixed(bonusAmount, 2);

    const smugglePenalty = toFixed(smuggles.reduce((s, r) => s + (r.penalty_amount || 0), 0), 2);

    let finalRebate = toFixed(baseRebate + ladderRebate - smugglePenalty, 2);
    if (finalRebate < 0) finalRebate = 0;

    return {
      distributorId,
      policyId: policy?.id || null,
      policyName: policy?.name || null,
      periodStart: this.periodStart,
      periodEnd: this.periodEnd,
      orders: sortedOrders,
      paidOrders,
      unpaidOrders,
      unmatchedOrders,
      payments,
      smuggles,
      ladders,
      matchedLadder,
      salesTotal: toFixed(salesTotal, 2),
      totalPaid: toFixed(totalPaid, 2),
      paidTotal,
      achievementRate,
      baseRebateRate,
      baseCondition,
      baseRebate,
      ladderRebate,
      smugglePenalty,
      finalRebate,
      smuggleDetails: smuggles.map(r => ({
        id: r.id,
        order_no: r.order_no,
        smuggle_region: r.smuggle_region,
        smuggle_amount: r.smuggle_amount,
        penalty_rate: r.penalty_rate,
        penalty_amount: r.penalty_amount,
        remark: r.remark
      }))
    };
  }

  calculateAll() {
    const results = [];
    const policies = this.getActivePolicies();
    const allOrders = this.getSalesOrders();
    const distributorIds = [...new Set(allOrders.map(o => o.distributor_id))];

    for (const did of distributorIds) {
      let bestResult = null;
      let bestFinal = -1;

      for (const policy of policies) {
        this.policyId = policy.id;
        const r = this.calculateDistributor(did, policy);
        if (r.finalRebate > bestFinal) {
          bestFinal = r.finalRebate;
          bestResult = r;
        }
      }
      if (!bestResult && policies.length === 0) {
        this.policyId = null;
        bestResult = this.calculateDistributor(did, null);
      }
      if (bestResult) results.push(bestResult);
    }
    return results;
  }

  saveTrial(userId) {
    const results = this.calculateAll();
    const saved = [];

    for (const r of results) {
      const distributorId = r.distributorId;
      const maxVer = this.db.prepare('SELECT MAX(version) as mv FROM rebate_trials WHERE distributor_id = ? AND period_start = ? AND period_end = ?')
        .get(distributorId, this.periodStart, this.periodEnd);
      const version = (maxVer?.mv || 0) + 1;

      const id = uuidv4();
      const stmt = this.db.prepare(`INSERT INTO rebate_trials 
        (id, version, distributor_id, policy_id, period_start, period_end, input_snapshot, 
         sales_total, paid_total, achievement_rate, base_rebate, ladder_rebate, smuggle_penalty, 
         final_rebate, detail_json, created_by, created_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      const inputSnapshot = JSON.stringify({
        orders: r.orders,
        payments: r.payments,
        smuggles: r.smuggles,
        policy: r.policyId ? this.db.prepare('SELECT * FROM rebate_policies WHERE id = ?').get(r.policyId) : null,
        ladders: r.ladders,
        baseCondition: r.baseCondition
      });

      stmt.run(
        id, version, distributorId, r.policyId, this.periodStart, this.periodEnd, inputSnapshot,
        r.salesTotal, r.paidTotal, r.achievementRate, r.baseRebate, r.ladderRebate, r.smugglePenalty,
        r.finalRebate, JSON.stringify(r), userId, now()
      );
      saved.push({ id, version, ...r });
    }
    return saved;
  }
}

module.exports = RebateCalculator;
