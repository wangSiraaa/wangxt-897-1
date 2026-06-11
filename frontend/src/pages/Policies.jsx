import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, DatePicker, Space, Modal, message, Popconfirm, Tag, Typography, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import dayjs from 'dayjs';
const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function Policies() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [ladderForm] = Form.useForm();
  const [editModal, setEditModal] = useState({ open: false, record: null });
  const [ladders, setLadders] = useState([
    { min_rate: 0, max_rate: 80, rebate_rate: 2, bonus_amount: 0 },
    { min_rate: 80, max_rate: 100, rebate_rate: 4, bonus_amount: 0 },
    { min_rate: 100, max_rate: 9999, rebate_rate: 6, bonus_amount: 5000 }
  ]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.policies.list({ page, pageSize });
      setList(r.data || []); setTotal(r.total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, pageSize]);

  const canEdit = hasRole('admin', 'channel_manager');

  const openCreate = () => {
    form.resetFields();
    setLadders([
      { min_rate: 0, max_rate: 80, rebate_rate: 2, bonus_amount: 0 },
      { min_rate: 80, max_rate: 100, rebate_rate: 4, bonus_amount: 0 },
      { min_rate: 100, max_rate: 9999, rebate_rate: 6, bonus_amount: 5000 }
    ]);
    setEditModal({ open: true, record: null });
  };
  const openEdit = (record) => {
    form.setFieldsValue({
      ...record,
      date_range: [dayjs(record.start_date), dayjs(record.end_date)],
      base_condition: record.base_condition || 0
    });
    setLadders(record.ladders || []);
    setEditModal({ open: true, record });
  };

  const submit = async (values) => {
    if (ladders.length === 0) return message.error('请至少添加一条阶梯规则');
    const [sd, ed] = values.date_range || [];
    const data = {
      ...values,
      start_date: sd?.format('YYYY-MM-DD'),
      end_date: ed?.format('YYYY-MM-DD'),
      ladders
    };
    delete data.date_range;
    try {
      if (editModal.record) { await api.policies.update(editModal.record.id, data); message.success('修改成功'); }
      else { await api.policies.create(data); message.success('创建成功'); }
      setEditModal({ open: false }); load();
    } catch (e) {}
  };

  const remove = async (id) => { await api.policies.remove(id); message.success('删除成功'); load(); };

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>返利政策</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建政策</Button>}
      </div>

      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        expandable={{ expandedRowRender: r => (
          <div style={{ padding: '0 24px' }}>
            <div style={{ fontWeight: 500, marginBottom: 8 }}>阶梯规则（达成率区间 → 返利比例 + 阶梯奖金）：</div>
            <Table rowKey={(row, idx) => idx} size="small" pagination={false} dataSource={r.ladders}
              columns={[
                { title: '达成率下限(%)', dataIndex: 'min_rate', width: 130, align: 'right' },
                { title: '达成率上限(%)', dataIndex: 'max_rate', width: 130, align: 'right', render: v => v >= 9999 ? '∞（无上限）' : v },
                { title: '返利比例(%)', dataIndex: 'rebate_rate', width: 130, align: 'right', render: v => <Tag color="green">{v}%</Tag> },
                { title: '阶梯奖金(元)', dataIndex: 'bonus_amount', width: 150, align: 'right', render: v => <b>¥{v?.toLocaleString()}</b> }
              ]} />
          </div>
        ) }}
        columns={[
          { title: '政策编码', dataIndex: 'code', width: 160 },
          { title: '政策名称', dataIndex: 'name' },
          { title: '适用品类', dataIndex: 'product_category', width: 100, render: v => v || '全品类' },
          { title: '生效期', width: 240, render: (_, r) => `${r.start_date} ~ ${r.end_date}` },
          { title: '基础门槛', dataIndex: 'base_condition', width: 140, align: 'right', render: v => '¥' + v?.toLocaleString() },
          { title: '阶梯数', width: 80, align: 'center', render: (_, r) => <Tag>{r.ladders?.length || 0}</Tag> },
          { title: '状态', dataIndex: 'status', width: 100, render: s => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '生效' : '停用'}</Tag> },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          { title: '操作', width: canEdit ? 160 : 40, fixed: 'right', render: (_, r) => (
            <Space size="small">
              {canEdit && <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>修改</Button>}
              {canEdit && <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
            </Space>
          )}
        ]} />

      <Modal open={editModal.open} title={editModal.record ? '修改返利政策' : '新建返利政策'} onCancel={() => setEditModal({ open: false })} footer={null} width={760}>
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ product_category: '白酒', status: 'active' }}>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="code" label="政策编码" style={{ flex: 1 }} rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="name" label="政策名称" style={{ flex: 2 }} rules={[{ required: true }]}><Input /></Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="product_category" label="适用品类" style={{ flex: 1 }}><Select><Option value="">全品类</Option><Option value="白酒">白酒</Option><Option value="红酒">红酒</Option><Option value="啤酒">啤酒</Option></Select></Form.Item>
            <Form.Item name="date_range" label="生效期间" style={{ flex: 2 }} rules={[{ required: true }]}><RangePicker style={{ width: '100%' }} /></Form.Item>
          </Space.Compact>
          <Form.Item name="base_condition" label="基础门槛金额（元）" rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} step={10000} /></Form.Item>
          <Form.Item name="status" label="状态"><Select><Option value="active">生效</Option><Option value="inactive">停用</Option></Select></Form.Item>

          <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b>阶梯返利规则</b>
              <Space>
                <Button size="small" onClick={() => { const last = ladders[ladders.length - 1] || { max_rate: 100 }; setLadders([...ladders, { min_rate: last.max_rate, max_rate: last.max_rate + 30, rebate_rate: Number(last.rebate_rate || 0) + 2, bonus_amount: 0 }]); }}>添加阶梯</Button>
              </Space>
            </div>
            <Table rowKey={(r, i) => i} size="small" pagination={false} dataSource={ladders}
              columns={[
                { title: '达成率下限(%)', dataIndex: 'min_rate', width: 160, render: (v, r, i) => <InputNumber value={v} min={0} style={{ width: '100%' }} onChange={val => { const nl = [...ladders]; nl[i].min_rate = val; setLadders(nl); }} /> },
                { title: '达成率上限(%)', dataIndex: 'max_rate', width: 160, render: (v, r, i) => <InputNumber value={v} min={0} style={{ width: '100%' }} onChange={val => { const nl = [...ladders]; nl[i].max_rate = val; setLadders(nl); }} /> },
                { title: '返利比例(%)', dataIndex: 'rebate_rate', width: 160, render: (v, r, i) => <InputNumber value={v} min={0} max={100} step={0.5} style={{ width: '100%' }} onChange={val => { const nl = [...ladders]; nl[i].rebate_rate = val; setLadders(nl); }} /> },
                { title: '阶梯奖金(元)', dataIndex: 'bonus_amount', width: 160, render: (v, r, i) => <InputNumber value={v} min={0} step={1000} style={{ width: '100%' }} onChange={val => { const nl = [...ladders]; nl[i].bonus_amount = val; setLadders(nl); }} /> },
                { title: '操作', width: 80, render: (_, r, i) => ladders.length > 1 ? <Button type="link" size="small" danger onClick={() => setLadders(ladders.filter((_, idx) => idx !== i))}>删除</Button> : null }
              ]} />
          </div>

          <Form.Item name="description" label="政策说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setEditModal({ open: false })}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
