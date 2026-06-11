import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, DatePicker, Space, Modal, message, Popconfirm, Tag, Typography, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import dayjs from 'dayjs';
const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function Payments() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [query, setQuery] = useState({});
  const [form] = Form.useForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [matchModal, setMatchModal] = useState({ open: false, record: null, orders: [] });

  const loadDist = async () => { const r = await api.distributors.list(); setDistributors(r.data || []); };
  const load = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize, ...query };
      if (query.date_range) { params.start_date = query.date_range[0]; params.end_date = query.date_range[1]; delete params.date_range; }
      const r = await api.payments.list(params);
      setList(r.data || []); setTotal(r.total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadDist(); }, []);
  useEffect(() => { load(); }, [page, pageSize, query]);

  const canEdit = hasRole('admin', 'channel_manager', 'finance');

  const submit = async (values) => {
    try {
      await api.payments.create({ ...values, pay_date: values.pay_date?.format('YYYY-MM-DD') });
      message.success('创建成功'); setModalOpen(false); form.resetFields(); load();
    } catch (e) {}
  };

  const openMatch = async (record) => {
    const r = await api.sales.list({ distributor_id: record.distributor_id, pageSize: 50 });
    setMatchModal({ open: true, record, orders: r.data || [] });
  };
  const remove = async (id) => { await api.payments.remove(id); message.success('删除成功'); load(); };

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>回款管理</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>登记回款</Button>}
      </div>

      <Form layout="inline" style={{ marginBottom: 16 }} onFinish={v => { if (v.date_range) v.date_range = [v.date_range[0].format('YYYY-MM-DD'), v.date_range[1].format('YYYY-MM-DD')]; setQuery(v); setPage(1); }}>
        <Form.Item name="distributor_id"><Select placeholder="经销商" allowClear style={{ width: 200 }}>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select></Form.Item>
        <Form.Item name="date_range"><RangePicker /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
      </Form>

      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '回款单号', dataIndex: 'pay_no', width: 220 },
          { title: '回款日期', dataIndex: 'pay_date', width: 120 },
          { title: '经销商', dataIndex: 'distributor_name' },
          { title: '金额', dataIndex: 'amount', width: 140, align: 'right', render: v => <b style={{ color: '#16a34a' }}>¥{v?.toLocaleString()}</b> },
          { title: '支付方式', dataIndex: 'pay_method', width: 110, render: v => v || '-' },
          { title: '备注', dataIndex: 'remark', ellipsis: true },
          { title: '创建时间', dataIndex: 'created_at', width: 180 },
          { title: '操作', width: canEdit ? 180 : 100, fixed: 'right', render: (_, r) => (
            <Space size="small">
              {canEdit && <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => openMatch(r)}>匹配销售</Button>}
              {canEdit && <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
            </Space>
          )}
        ]} />

      <Modal open={modalOpen} title="登记回款" onCancel={() => setModalOpen(false)} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="distributor_id" label="经销商" rules={[{ required: true }]}>
            <Select placeholder="请选择" showSearch>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="pay_date" label="回款日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="amount" label="回款金额" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={1000} /></Form.Item>
          <Form.Item name="pay_method" label="支付方式">
            <Select allowClear><Option>银行转账</Option><Option>银行承兑</Option><Option>商业承兑</Option><Option>现金</Option><Option>其他</Option></Select>
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setModalOpen(false)}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal open={matchModal.open} title={`匹配销售单 - ${matchModal.record?.pay_no}`} onCancel={() => setMatchModal({ open: false, record: null, orders: [] })}
        footer={<Button type="primary" onClick={() => { message.success('匹配成功（演示）'); setMatchModal({ open: false }); }}>确认匹配</Button>} width={820}>
        <div style={{ marginBottom: 8, color: '#6b7280' }}>提示：系统会按销售日期顺序自动匹配回款到销售单，此处仅为示意。</div>
        <Table rowKey="id" size="small" dataSource={matchModal.orders} rowSelection={{ type: 'checkbox' }}
          columns={[
            { title: '单号', dataIndex: 'order_no' },
            { title: '日期', dataIndex: 'order_date' },
            { title: '商品', dataIndex: 'product_name' },
            { title: '总额', dataIndex: 'total_amount', render: v => '¥' + v?.toLocaleString() },
            { title: '已回款', dataIndex: 'paid_amount', render: v => '¥' + v?.toLocaleString() }
          ]} />
      </Modal>
    </div>
  );
}
