import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, DatePicker, Space, Modal, message, Popconfirm, Tag, Typography, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import dayjs from 'dayjs';
const { Title } = Typography;
const { Option } = Select;

export default function Smuggle() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState({});
  const [form] = Form.useForm();
  const [editModal, setEditModal] = useState({ open: false, record: null });

  const load = async () => {
    setLoading(true);
    try {
      const [r, d, so] = await Promise.all([
        api.smuggle.list({ page, pageSize, ...query }),
        api.distributors.list(),
        api.sales.list({ pageSize: 200 })
      ]);
      setList(r.data || []); setTotal(r.total || 0);
      setDistributors(d.data || []); setOrders(so.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, pageSize, query]);

  const canEdit = hasRole('admin', 'risk', 'channel_manager');

  const openCreate = () => { form.resetFields(); setEditModal({ open: true, record: null }); };
  const openEdit = (record) => {
    form.setFieldsValue({ ...record, report_date: dayjs(record.report_date) });
    setEditModal({ open: true, record });
  };

  const submit = async (values) => {
    const smuggleAmount = values.smuggle_amount;
    const penaltyRate = values.penalty_rate;
    const data = {
      ...values,
      report_date: values.report_date?.format('YYYY-MM-DD'),
      smuggle_amount: smuggleAmount,
      penalty_rate: penaltyRate,
      penalty_amount: values.penalty_amount ?? (smuggleAmount * penaltyRate / 100)
    };
    try {
      if (editModal.record) { await api.smuggle.update(editModal.record.id, data); message.success('修改成功'); }
      else { await api.smuggle.create(data); message.success('创建成功'); }
      setEditModal({ open: false }); load();
    } catch (e) {}
  };
  const remove = async (id) => { await api.smuggle.remove(id); message.success('删除成功'); load(); };

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>窜货记录</Title>
        <div className="penalty-tip" style={{ maxWidth: 520, margin: 0 }}>窜货扣罚将在返利试算时自动抵减返利金额，扣罚明细会在结算单中完整展示。</div>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>登记窜货</Button>}
      </div>

      <Form layout="inline" style={{ marginBottom: 16 }} onFinish={v => { setQuery(v); setPage(1); }}>
        <Form.Item name="distributor_id"><Select placeholder="经销商" allowClear style={{ width: 200 }}>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select></Form.Item>
        <Form.Item name="status"><Select placeholder="状态" allowClear style={{ width: 130 }}><Option value="confirmed">已确认</Option><Option value="pending">待确认</Option></Select></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
      </Form>

      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '关联销售单', dataIndex: 'order_no', width: 200, render: v => v || '-' },
          { title: '经销商', dataIndex: 'distributor_name' },
          { title: '举报日期', dataIndex: 'report_date', width: 120 },
          { title: '窜货区域', dataIndex: 'smuggle_region', width: 120, render: v => <Tag color="red">{v}</Tag> },
          { title: '窜货金额', dataIndex: 'smuggle_amount', width: 130, align: 'right', render: v => <b style={{ color: '#dc2626' }}>¥{v?.toLocaleString()}</b> },
          { title: '扣罚率', dataIndex: 'penalty_rate', width: 100, align: 'right', render: v => <Tag color="orange">{v}%</Tag> },
          { title: '扣罚金额', dataIndex: 'penalty_amount', width: 130, align: 'right', render: v => <b style={{ color: '#dc2626' }}>¥{v?.toLocaleString()}</b> },
          { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={s === 'confirmed' ? 'red' : 'default'}>{s === 'confirmed' ? '已确认' : '待确认'}</Tag> },
          { title: '备注', dataIndex: 'remark', ellipsis: true },
          { title: '操作', width: canEdit ? 160 : 40, fixed: 'right', render: (_, r) => (
            <Space size="small">
              {canEdit && hasRole('admin', 'risk') && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>修改</Button>}
              {canEdit && hasRole('admin', 'risk') && <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
            </Space>
          )}
        ]} />

      <Modal open={editModal.open} title={editModal.record ? '修改窜货记录' : '登记窜货记录'} onCancel={() => setEditModal({ open: false })} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ status: 'confirmed' }}>
          <Form.Item name="distributor_id" label="经销商" rules={[{ required: true }]}>
            <Select placeholder="请选择" showSearch onChange={v => { const related = orders.filter(o => o.distributor_id === v); form.setFieldsValue({ sales_order_id: null }); }}>
              {distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="sales_order_id" label="关联销售单" rules={[{ required: true }]} noStyle dependencies={['distributor_id']}>
            {({ getFieldValue }) => {
              const did = getFieldValue('distributor_id');
              const related = did ? orders.filter(o => o.distributor_id === did) : orders;
              return (
                <Form.Item name="sales_order_id" label="关联销售单" rules={[{ required: true }]}>
                  <Select placeholder="请选择销售单" showSearch optionFilterProp="label">
                    {related.map(o => <Option key={o.id} value={o.id} label={`${o.order_no} / ${o.product_name} / ¥${o.total_amount}`}>{o.order_no} - {o.product_name} - ¥{o.total_amount?.toLocaleString()}</Option>)}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Form.Item name="report_date" label="举报/发现日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="smuggle_region" label="窜货区域" style={{ flex: 1 }} rules={[{ required: true }]}><Input placeholder="如：华中/河南" /></Form.Item>
            <Form.Item name="smuggle_amount" label="窜货金额(元)" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={1000} /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="penalty_rate" label="扣罚率(%)" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} step={5} /></Form.Item>
            <Form.Item name="penalty_amount" label="扣罚金额(元，自动)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item>
          </Space.Compact>
          <Form.Item name="status" label="状态"><Select><Option value="confirmed">已确认（参与扣罚）</Option><Option value="pending">待确认</Option></Select></Form.Item>
          <Form.Item name="remark" label="备注/情况说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setEditModal({ open: false })}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
