import React, { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button, Badge } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined, ShoppingCartOutlined, DollarCircleOutlined, FileDoneOutlined,
  BulbOutlined, AlertOutlined, CalculatorOutlined, ProfileOutlined,
  AuditOutlined, TeamOutlined, FileProtectOutlined, EnvironmentOutlined,
  UserOutlined, LogoutOutlined, SettingOutlined, NotificationOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext.jsx';

const { Header, Sider, Content, Footer } = Layout;

const menuItems = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/sales', icon: <ShoppingCartOutlined />, label: '销售管理', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/payments', icon: <DollarCircleOutlined />, label: '回款管理', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/invoices', icon: <FileDoneOutlined />, label: '发票管理', roles: ['admin','finance','risk'] },
  { key: '/policies', icon: <BulbOutlined />, label: '返利政策', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/smuggle', icon: <AlertOutlined />, label: '窜货记录', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/rebate/trial', icon: <CalculatorOutlined />, label: '返利试算', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/batches', icon: <ProfileOutlined />, label: '结算批次', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/audit', icon: <AuditOutlined />, label: '审计日志', roles: ['admin','finance','risk'] },
  { key: '/distributors', icon: <TeamOutlined />, label: '经销商', roles: ['admin','channel_manager'] },
  { key: '/region-auths', icon: <EnvironmentOutlined />, label: '区域授权', roles: ['admin','channel_manager'] },
  { key: '/penalty-rules', icon: <FileProtectOutlined />, label: '扣罚规则', roles: ['admin','risk'] },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, roleName, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));
  const userDropdown = [
    { key: 'profile', icon: <UserOutlined />, label: `${user?.realName || user?.username} (${roleName(user?.role)})`, disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} theme="dark" width={220}
        style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
        <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: collapsed ? 14 : 16, background: '#002140', letterSpacing: 1 }}>
          {collapsed ? '返利' : '酒类经销返利核算'}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]}
          items={filteredMenu.map(m => ({ key: m.key, icon: m.icon, label: m.label }))}
          onClick={({ key }) => navigate(key)} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,21,41,.08)' }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#1f2937' }}>
            酒类经销返利核算管理系统
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Badge count={0}><Button type="text" icon={<NotificationOutlined />} /></Badge>
            <Dropdown menu={{ items: userDropdown, onClick: ({ key }) => { if (key === 'logout') { logout(); navigate('/login', { replace: true }); } } }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <Avatar icon={<UserOutlined />} style={{ background: '#1677ff' }} />
                <span>{user?.realName || user?.username}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: 20 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, minHeight: 'calc(100vh - 180px)' }}>
            <Outlet />
          </div>
        </Content>
        <Footer style={{ textAlign: 'center', color: '#8c8c8c' }}>
          酒类经销返利核算系统 © 2025 Powered by React + Node.js
        </Footer>
      </Layout>
    </Layout>
  );
}
