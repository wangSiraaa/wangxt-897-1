import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, DatePicker, Space, Modal, message, Popconfirm, Tag, InputNumber, Typography } from 'antd';
import { PlusOutlined, ImportOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function Sales() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [query, setQuery] = useState({});
  const [form] = Form.useForm();
  const [editModal, setEditModal] = useState({ open: false, record: null });

  const loadDist = async () => {
    const r = await api.distributors.list();
    setDistributors(r.data || []);
  };
  const load = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize, ...query };
      if (query.date_range) {
        params.start_date = query.date_range[0];
        params.end_date = query.date_range[1];
        delete params.date_range;
      }
      const r = await api.sales.list(params);
      setList(r.data || []);
      setTotal(r.total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadDist(); }, []);
  useEffect(() => { load(); }, [page, pageSize, query]);

  const openCreate = () => { form.resetFields(); setEditModal({ open: true, record: null }); };
  const openEdit = (record) => { form.setFieldsValue({ ...record, order_date: dayjs(record.order_date) }); setEditModal({ open: true, record }); };

  const submit = async (values) => {
    const data = {
      ...values,
      order_date: values.order_date?.format('YYYY-MM-DD'),
      total_amount: values.total_amount ?? (values.quantity * values.unit_price),
      paid_amount: values.paid_amount ?? 0
    };
    if (!data.distributor_id) return message.error('请选择经销商');
    try {
      if (editModal.record) {
        await api.sales.update(editModal.record.id, data);
        message.success('修改成功');
      } else {
        const r = await api.sales.create(data);
        if (r.duplicate) message.warning('销售单已存在，幂等返回');
        else message.success('创建成功');
      }
      setEditModal({ open: false });
      load();
    } catch (e) {}
  };

  const remove = async (id) => {
    await api.sales.remove(id);
    message.success('删除成功');
    load();
  };

  const batchImport = () => {
    Modal.confirm({
      title: '批量导入销售单（模拟）',
      content: '模拟导入3条销售数据？实际生产可对接Excel/外部系统。',
      onOk: async () => {
        const did = distributors[0]?.id;
        if (!did) return;
        const items = [
          { distributor_id: did, order_date: dayjs().subtract(3, 'day').format('YYYY-MM-DD'), product_name: '导入白酒A', product_category: '白酒', quantity: 60, unit_price: 1000 },
          { distributor_id: did, order_date: dayjs().subtract(2, 'day').format('YYYY-MM-DD'), product_name: '导入白酒B', product_category: '白酒', quantity: 40, unit_price: 1500 },
          { distributor_id: did, order_date: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), product_name: '导入白酒C', product_category: '白酒', quantity: 30, unit_price: 2000 }
        ];
        const r = await api.sales.batchImport(items);
        message.success(`导入完成：新增${r.newCount}条，重复${r.duplicateCount}条`);
        load();
      }
    });
  };

  const canEdit = hasRole('admin', 'channel_manager');

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>销售管理</Title>
        <Space>
          {canEdit && <Button icon={<ImportOutlined />} onClick={batchImport}>批量导入（模拟）</Button>}
          {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建销售单</Button>}
        </Space>
      </div>

      <Form layout="inline" style={{ marginBottom: 16 }} onFinish={v => { if (v.date_range) { v.date_range = [v.date_range[0].format('YYYY-MM-DD'), v.date_range[1].format('YYYY-MM-DD')]; } setQuery(v); setPage(1); }}>
        <Form.Item name="keyword"><Input placeholder="单号/商品/经销商" allowClear /></Form.Item>
        <Form.Item name="distributor_id"><Select placeholder="经销商" allowClear style={{ width: 180 }}>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select></Form.Item>
        <Form.Item name="status"><Select placeholder="状态" allowClear style={{ width: 130 }}><Option value="confirmed">已确认</Option><Option value="pending">待确认</Option></Select></Form.Item>
        <Form.Item name="date_range"><RangePicker /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
      </Form>

      <Table rowKey="id" loading={loading} size="middle"
        dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '单号', dataIndex: 'order_no', width: 200, render: (v, r) => <span style={{ color: r.batch_id ? '#8c8c8c' : '#1677ff', fontWeight: 500 }}>{v}</span> },
          { title: '日期', dataIndex: 'order_date', width: 110 },
          { title: '经销商', dataIndex: 'distributor_name' },
          { title: '商品', dataIndex: 'product_name' },
          { title: '数量', dataIndex: 'quantity', width: 70, align: 'right' },
          { title: '单价', dataIndex: 'unit_price', width: 100, align: 'right', render: v => '¥' + v?.toLocaleString() },
          { title: '总额', dataIndex: 'total_amount', width: 120, align: 'right', render: v => <b>¥{v?.toLocaleString()}</b> },
          { title: '已回款', dataIndex: 'paid_amount', width: 120, align: 'right', render: (v, r) => { const rate = r.total_amount ? Math.round((v / r.total_amount) * 100) : 0; return <span className={rate >= 100 ? 'paid' : 'unpaid'}>¥{v?.toLocaleString()} ({rate}%)</span>; } },
          { title: '区域', dataIndex: 'region', width: 80 },
          { title: '批次', dataIndex: 'batch_no', width: 200, render: v => v ? <Tag color="blue">{v}</Tag> : <Tag color="default">未结算</Tag> },
          { title: '操作', width: canEdit ? 140 : 60, fixed: 'right', render: (_, r) => (
            <Space size="small">
              {canEdit && !r.batch_id && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>修改</Button>}
              {canEdit && !r.batch_id && <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
              {r.batch_id && <span style={{ color: '#8c8c8c', fontSize: 12 }}>已锁定</span>}
            </Space>
          )}
        ]} />

      <Modal open={editModal.open} title={editModal.record ? '修改销售单' : '新建销售单'} onCancel={() => setEditModal({ open: false })} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="distributor_id" label="经销商" rules={[{ required: true }]}>
            <Select placeholder="请选择" showSearch optionFilterProp="children">{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="order_date" label="销售日期" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="product_name" label="商品名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="product_category" label="商品分类"><Select defaultValue="白酒"><Option value="白酒">白酒</Option><Option value="红酒">红酒</Option><Option value="啤酒">啤酒</Option><Option value="黄酒">黄酒</Option></Select></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="quantity" label="数量" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="unit_price" label="单价" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item>
            <Form.Item name="total_amount" label="总额" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item>
          </Space.Compact>
          <Form.Item name="paid_amount" label="已回款金额"><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item>
          <Form.Item name="region" label="销售区域"><Input /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setEditModal({ open: false })}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
