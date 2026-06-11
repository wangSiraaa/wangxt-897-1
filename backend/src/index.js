const app = require('./app');
const { initDb } = require('./config/database');
const seedData = require('../scripts/seed');

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  await initDb();
  try {
    await seedData();
  } catch (e) {
    console.log('Seed data skipped or already exists:', e.message);
  }
  
  app.listen(PORT, () => {
    console.log(`
    ========================================
    酒类经销返利核算系统 - 后端服务
    ========================================
    服务地址: http://localhost:${PORT}
    健康检查: http://localhost:${PORT}/health
    API 文档: http://localhost:${PORT}/api/
    ========================================
    默认账户:
      运营管理员: admin / admin123
      渠道经理: manager / manager123
      财务复核: finance / finance123
      风控: risk / risk123
      经销商: dealer01 / dealer123
    ========================================
    `);
  });
}

bootstrap();
