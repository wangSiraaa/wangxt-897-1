const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { auth, signToken, ROLES, ROLE_NAMES, writeAuditLog } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res, next) => {
  try {
    const db = getDb();
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空', code: 'EMPTY_FIELD' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误', code: 'INVALID_CREDENTIALS' });
    }
    writeAuditLog(req, 'LOGIN', `用户登录: ${username}`, 'USER', user.id);
    const token = signToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        roleName: ROLE_NAMES[user.role]
      }
    });
  } catch (e) {
    next(e);
  }
});

router.get('/me', auth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      realName: req.user.realName,
      role: req.user.role,
      roleName: ROLE_NAMES[req.user.role]
    }
  });
});

router.get('/users', auth, (req, res) => {
  const db = getDb();
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ error: '无权访问', code: 'FORBIDDEN' });
  }
  const users = db.prepare('SELECT id, username, real_name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ data: users.map(u => ({ ...u, roleName: ROLE_NAMES[u.role] })) });
});

module.exports = router;
