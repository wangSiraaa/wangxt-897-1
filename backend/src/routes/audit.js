const express = require('express');
const { getDb } = require('../config/database');
const { auth, requireRoles, ROLES } = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', requireRoles(ROLES.ADMIN, ROLES.FINANCE, ROLES.RISK), (req, res) => {
  const db = getDb();
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 50);
  const userId = req.query.user_id;
  const action = req.query.action;
  const targetType = req.query.target_type;
  const startDate = req.query.start_date;
  const endDate = req.query.end_date;

  let sql = `SELECT * FROM audit_logs WHERE 1=1`;
  let countSql = `SELECT COUNT(*) as c FROM audit_logs WHERE 1=1`;
  const params = [], countParams = [];
  if (userId) { sql += ' AND user_id = ?'; countSql += ' AND user_id = ?'; params.push(userId); countParams.push(userId); }
  if (action) { sql += ' AND action LIKE ?'; countSql += ' AND action LIKE ?'; const kw = `%${action}%`; params.push(kw); countParams.push(kw); }
  if (targetType) { sql += ' AND target_type = ?'; countSql += ' AND target_type = ?'; params.push(targetType); countParams.push(targetType); }
  if (startDate) { sql += ' AND created_at >= ?'; countSql += ' AND created_at >= ?'; params.push(startDate); countParams.push(startDate); }
  if (endDate) { sql += ' AND created_at <= ?'; countSql += ' AND created_at <= ?'; params.push(endDate); countParams.push(endDate); }

  const total = db.prepare(countSql).get(...countParams).c;
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, (page - 1) * pageSize);
  const data = db.prepare(sql).all(...params);
  res.json({ data, total, page, pageSize });
});

module.exports = router;
