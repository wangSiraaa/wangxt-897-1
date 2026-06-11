import React, { useState, useEffect, useRef } from 'react';
import { Layout, Menu, Avatar, Dropdown, Button, Badge, List, Typography, Tag, Space, Empty } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  DashboardOutlined, ShoppingCartOutlined, DollarCircleOutlined, FileDoneOutlined,
  BulbOutlined, AlertOutlined, CalculatorOutlined, ProfileOutlined,
  AuditOutlined, TeamOutlined, FileProtectOutlined, EnvironmentOutlined,
  UserOutlined, LogoutOutlined, NotificationOutlined, BellOutlined,
  CheckCircleOutlined, WarningOutlined, InfoCircleOutlined, ExclamationCircleOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext.jsx';
import { api } from '../services/api.js';
import dayjs from 'dayjs';

const { Header, Sider, Content, Footer } = Layout;
const { Text, Paragraph } = Typography;

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
  { key: '/notifications', icon: <BellOutlined />, label: '消息中心', roles: ['admin','channel_manager','finance','risk','dealer'] },
  { key: '/distributors', icon: <TeamOutlined />, label: '经销商', roles: ['admin','channel_manager'] },
  { key: '/region-auths', icon: <EnvironmentOutlined />, label: '区域授权', roles: ['admin','channel_manager'] },
  { key: '/penalty-rules', icon: <FileProtectOutlined />, label: '扣罚规则', roles: ['admin','risk'] },
];

const typeConfig = {
  policy_match: { icon: <CheckCircleOutlined />, color: 'success', label: '政策匹配' },
  unpaid_warning: { icon: <WarningOutlined />, color: 'warning', label: '回款提醒' },
  achievement_change: { icon: <InfoCircleOutlined />, color: 'processing', label: '达成率变化' },
  batch_ready: { icon: <CheckCircleOutlined />, color: 'success', label: '批次就绪' },
  risk_alert: { icon: <ExclamationCircleOutlined />, color: 'error', label: '风险预警' },
  system: { icon: <InfoCircleOutlined />, color: 'default', label: '系统通知' }
};

function NotificationPanel({ onClose, onViewAll }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.notifications.list({ page: 1, pageSize: 5 });
      setNotifications(res.data || []);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const handleRead = async (id) => {
    try {
      await api.notifications.read(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' } : n));
    } catch (e) {}
  };

  const handleReadAll = async () => {
    try {
      await api.notifications.readAll();
      setNotifications(prev => prev.map(n => ({ ...n, status: 'read' })));
    } catch (e) {}
  };

  return (
    <div style={{ width: 380, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
        <Text strong style={{ fontSize: 14 }}>消息通知</Text>
        <Space>
          <Button type="link" size="small" onClick={handleReadAll}>全部已读</Button>
          <Button type="link" size="small" onClick={() => { onViewAll(); onClose(); }}>查看全部</Button>
        </Space>
      </div>
      {notifications.length === 0 ? (
        <Empty description="暂无消息" style={{ padding: '20px 0' }} />
      ) : (
        <List
          size="small"
          dataSource={notifications}
          loading={loading}
          renderItem={item => {
            const cfg = typeConfig[item.type] || typeConfig.system;
            return (
              <List.Item
                onClick={() => handleRead(item.id)}
                style={{ cursor: 'pointer', padding: '8px 4px' }}
                className={item.status === 'unread' ? 'notification-item-unread' : ''}
              >
                <List.Item.Meta
                  avatar={<Tag color={cfg.color} icon={cfg.icon} style={{ margin: 0 }}>{cfg.label}</Tag>}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontWeight: item.status === 'unread' ? 600 : 400, fontSize: 13 }}>{item.title}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{dayjs(item.created_at).format('MM-DD HH:mm')}</Text>
                    </div>
                  }
                  description={
                    <Paragraph ellipsis={{ rows: 2 }} style={{ fontSize: 12, margin: 0, color: '#6b7280' }}>
                      {item.content}
                    </Paragraph>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, roleName, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef(null);

  const loadUnreadCount = async () => {
    try {
      const res = await api.notifications.unreadCount();
      setUnreadCount(res.count || 0);
    } catch (e) {}
  };

  useEffect(() => {
    if (user) {
      loadUnreadCount();
      timerRef.current = setInterval(loadUnreadCount, 30000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [user]);

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));
  const userDropdown = [
    { key: 'profile', icon: <UserOutlined />, label: `${user?.realName || user?.username} (${roleName(user?.role)})`, disabled: true },
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' }
  ];

  const notificationDropdown = (
    <NotificationPanel
      onClose={() => {}}
      onViewAll={() => navigate('/notifications')}
    />
  );

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Dropdown dropdownRender={() => notificationDropdown} trigger={['click']} placement="bottomRight">
              <Badge count={unreadCount} size="small" offset={[-4, 4]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} style={{ fontSize: 18 }} />
              </Badge>
            </Dropdown>
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
