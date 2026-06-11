import React, { useState, useEffect } from 'react';
import { Card, Table, Tag, Select, Button, Space, Typography, Modal, message, Row, Col, Statistic, DatePicker } from 'antd';
import {
  BellOutlined, CheckCircleOutlined, WarningOutlined,
  InfoCircleOutlined, ExclamationCircleOutlined, ReadOutlined,
  DeleteOutlined, ReloadOutlined
} from '@ant-design/icons';
import { api } from '../services/api.js';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { RangePicker } = DatePicker;

const typeConfig = {
  policy_match: { icon: <CheckCircleOutlined />, color: 'success', label: '政策匹配' },
  unpaid_warning: { icon: <WarningOutlined />, color: 'warning', label: '回款提醒' },
  achievement_change: { icon: <InfoCircleOutlined />, color: 'processing', label: '达成率变化' },
  batch_ready: { icon: <CheckCircleOutlined />, color: 'success', label: '批次就绪' },
  risk_alert: { icon: <ExclamationCircleOutlined />, color: 'error', label: '风险预警' },
  system: { icon: <InfoCircleOutlined />, color: 'default', label: '系统通知' }
};

const statusConfig = {
  unread: { color: 'processing', label: '未读' },
  read: { color: 'default', label: '已读' }
};

export default function Notifications() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState();
  const [typeFilter, setTypeFilter] = useState();
  const [dateRange, setDateRange] = useState();
  const [detailModal, setDetailModal] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.type = typeFilter;
      if (dateRange && dateRange.length === 2) {
        params.start_date = dateRange[0].format('YYYY-MM-DD');
        params.end_date = dateRange[1].format('YYYY-MM-DD');
      }
      const res = await api.notifications.list(params);
      setData(res.data || []);
      setTotal(res.total || 0);
    } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [page, pageSize, statusFilter, typeFilter, dateRange]);

  const handleRead = async (id) => {
    try {
      await api.notifications.read(id);
      message.success('已标记为已读');
      loadData();
    } catch (e) {}
  };

  const handleReadAll = async () => {
    try {
      await api.notifications.readAll();
      message.success('全部已读');
      loadData();
    } catch (e) {}
  };

  const handleViewDetail = (item) => {
    setCurrentItem(item);
    setDetailModal(true);
    if (item.status === 'unread') {
      api.notifications.read(item.id).catch(() => {});
    }
  };

  const unreadCount = data.filter(d => d.status === 'unread').length;
  const warningCount = data.filter(d => d.type === 'unpaid_warning').length;
  const policyCount = data.filter(d => d.type === 'policy_match').length;

  const columns = [
    {
      title: '类型', dataIndex: 'type', width: 120,
      render: (t) => {
        const cfg = typeConfig[t] || typeConfig.system;
        return <Tag icon={cfg.icon} color={cfg.color}>{cfg.label}</Tag>;
      }
    },
    { title: '标题', dataIndex: 'title', render: (t, r) => (
      <a onClick={() => handleViewDetail(r)} style={{ fontWeight: r.status === 'unread' ? 600 : 400 }}>{t}</a>
    )},
    { title: '经销商', dataIndex: 'distributor_name', width: 180 },
    { title: '关联政策', dataIndex: 'policy_name', width: 200 },
    {
      title: '状态', dataIndex: 'status', width: 100,
      render: (s) => {
        const cfg = statusConfig[s] || statusConfig.unread;
        return <Tag color={cfg.color}>{cfg.label}</Tag>;
      }
    },
    { title: '时间', dataIndex: 'created_at', width: 180, render: d => dayjs(d).format('YYYY-MM-DD HH:mm:ss') },
    {
      title: '操作', width: 150,
      render: (_, r) => (
        <Space>
          <Button size="small" type="link" icon={<ReadOutlined />} onClick={() => handleRead(r.id)} disabled={r.status === 'read'}>标记已读</Button>
          <Button size="small" type="link" onClick={() => handleViewDetail(r)}>详情</Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>消息中心</Title>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>查看系统通知、政策匹配提醒、回款提醒等消息</div>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small"><Statistic title="消息总数" value={total} prefix={<BellOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="未读消息" value={unreadCount} valueStyle={{ color: '#1677ff' }} prefix={<InfoCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="政策匹配" value={policyCount} valueStyle={{ color: '#52c41a' }} prefix={<CheckCircleOutlined />} /></Card></Col>
        <Col span={6}><Card size="small"><Statistic title="回款提醒" value={warningCount} valueStyle={{ color: '#faad14' }} prefix={<WarningOutlined />} /></Card></Col>
      </Row>

      <Card size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <Space>
            <Select placeholder="全部状态" style={{ width: 120 }} allowClear value={statusFilter} onChange={setStatusFilter}>
              <Select.Option value="unread">未读</Select.Option>
              <Select.Option value="read">已读</Select.Option>
            </Select>
            <Select placeholder="全部类型" style={{ width: 140 }} allowClear value={typeFilter} onChange={setTypeFilter}>
              {Object.entries(typeConfig).map(([key, val]) => (
                <Select.Option key={key} value={key}>{val.label}</Select.Option>
              ))}
            </Select>
            <RangePicker value={dateRange} onChange={setDateRange} />
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadData}>刷新</Button>
            <Button type="primary" icon={<ReadOutlined />} onClick={handleReadAll}>全部已读</Button>
          </Space>
        </div>

        <Table rowKey="id" size="small" loading={loading} dataSource={data} columns={columns}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showQuickJumper: true, showTotal: t => `共 ${t} 条`,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); } }} />
      </Card>

      <Modal title="消息详情" open={detailModal} onCancel={() => setDetailModal(false)} footer={null} width={600}>
        {currentItem && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Tag icon={typeConfig[currentItem.type]?.icon} color={typeConfig[currentItem.type]?.color}>
                {typeConfig[currentItem.type]?.label || '系统通知'}
              </Tag>
              <Text type="secondary">{dayjs(currentItem.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
            </div>
            <Title level={5} style={{ marginTop: 0 }}>{currentItem.title}</Title>
            <Paragraph style={{ color: '#4b5563' }}>{currentItem.content}</Paragraph>
            {currentItem.data && (
              <div style={{ background: '#f9fafb', padding: 12, borderRadius: 6, marginTop: 12 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>详细数据：</Text>
                <pre style={{ margin: '8px 0 0', fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(currentItem.data, null, 2)}
                </pre>
              </div>
            )}
            {currentItem.distributor_name && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #f0f0f0' }}>
                <Text type="secondary">经销商：{currentItem.distributor_name}</Text>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
