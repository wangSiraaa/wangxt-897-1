import React, { useState } from 'react';
import { Form, Input, Button, Card, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, LoginOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';

const { Title, Paragraph } = Typography;

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const defaultAccounts = [
    { label: '运营管理员', username: 'admin', password: 'admin123', color: '#1677ff' },
    { label: '渠道经理', username: 'manager', password: 'manager123', color: '#52c41a' },
    { label: '财务复核', username: 'finance', password: 'finance123', color: '#faad14' },
    { label: '风控', username: 'risk', password: 'risk123', color: '#f5222d' },
    { label: '经销商', username: 'dealer01', password: 'dealer123', color: '#722ed1' }
  ];

  const onSubmit = async (values) => {
    setLoading(true);
    try {
      await login(values);
      message.success('登录成功');
      navigate('/dashboard', { replace: true });
    } catch (e) {
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (account) => {
    form.setFieldsValue({ username: account.username, password: account.password });
    form.submit();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #002140 0%, #1677ff 100%)', padding: 20 }}>
      <Card style={{ width: 460, boxShadow: '0 12px 40px rgba(0,0,0,0.2)', borderRadius: 12, border: 'none' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🍶</div>
          <Title level={3} style={{ margin: '8px 0 4px', color: '#002140' }}>酒类经销返利核算系统</Title>
          <Paragraph type="secondary" style={{ margin: 0 }}>Wine Distribution Rebate Management</Paragraph>
        </div>
        <Form form={form} onFinish={onSubmit} layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]} label="用户名">
            <Input prefix={<UserOutlined />} placeholder="请输入用户名" size="large" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]} label="密码">
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" size="large" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 12 }}>
            <Button type="primary" htmlType="submit" size="large" block icon={<LoginOutlined />} loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 16, borderTop: '1px dashed #e5e7eb', paddingTop: 16 }}>
          <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 10 }}>快速登录（演示账户）：</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {defaultAccounts.map(a => (
              <Button key={a.username} size="small"
                style={{ borderColor: a.color, color: a.color }}
                onClick={() => quickLogin(a)}>
                {a.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
