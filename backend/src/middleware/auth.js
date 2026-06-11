const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'rebate-secret-key-2024';

const ROLES = {
  ADMIN: 'admin',
  CHANNEL_MANAGER: 'channel_manager',
  FINANCE: 'finance',
  RISK: 'risk',
  DEALER: 'dealer'
};

const ROLE_NAMES = {
  admin: '运营管理员',
  channel_manager: '渠道经理',
  finance: '财务复核',
  risk: '风控',
  dealer: '经销商'
};

function signToken(user) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    role: user.role,
    realName: user.real_name
  }, JWT_SECRET, { expiresIn: '24h' });
}

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌', code: 'NO_TOKEN' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: '认证令牌无效或已过期', code: 'INVALID_TOKEN' });
  }
}

function requireRoles(...roles) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: '未认证', code: 'UNAUTHORIZED' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: `无权访问，需要角色: ${roles.map(r => ROLE_NAMES[r]).join(' / ')}`, 
        code: 'FORBIDDEN' 
      });
    }
    next();
  };
}

function writeAuditLog(req, action, detail, targetType, targetId, beforeData, afterData) {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO audit_logs 
    (id, user_id, user_name, user_role, action, target_type, target_id, before_data, after_data, detail, ip, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const { v4: uuidv4 } = require('uuid');
  stmt.run(
    uuidv4(),
    req?.user?.id || 'SYSTEM',
    req?.user?.username || 'system',
    req?.user?.role || 'SYSTEM',
    action || 'UNKNOWN',
    targetType || null,
    targetId || null,
    beforeData ? JSON.stringify(beforeData) : null,
    afterData ? JSON.stringify(afterData) : null,
    detail || null,
    req?.ip || req?.headers?.['x-forwarded-for'] || '::1',
    new Date().toISOString()
  );
}

module.exports = { auth, requireRoles, signToken, ROLES, ROLE_NAMES, writeAuditLog };
