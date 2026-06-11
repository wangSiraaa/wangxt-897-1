import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, Space, Modal, message, Popconfirm, Tag, Typography, InputNumber } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
const { Title } = Typography;
const { Option } = Select;

const PAGES = [
  { name: 'Invoices', comp: 'i' }, { name: 'Distributors', comp: 'd' },
  { name: 'PenaltyRules', comp: 'p' }, { name: 'RegionAuths', comp: 'r' }
];

function Invoices() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]); const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false); const [form] = Form.useForm(); const [distributors, setDistributors] = useState([]);
  const [orders, setOrders] = useState([]); const [modal, setModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [r, d, so] = await Promise.all([api.invoices.list({ page, pageSize }), api.distributors.list(), api.sales.list({ pageSize: 200 })]);
      setList(r.data || []); setTotal(r.total || 0); setDistributors(d.data || []); setOrders(so.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, pageSize]);
  const canEdit = hasRole('admin', 'finance');
  const submit = async (values) => {
    await api.invoices.create(values); message.success('创建成功'); setModal(false); load();
  };
  const remove = async (id) => { await api.invoices.remove(id); message.success('删除成功'); load(); };

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>发票管理</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>登记发票</Button>}
      </div>
      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '发票号', dataIndex: 'invoice_no', width: 200 },
          { title: '开票日期', dataIndex: 'invoice_date', width: 120 },
          { title: '关联销售单', dataIndex: 'order_no' },
          { title: '经销商', dataIndex: 'distributor_name' },
          { title: '发票金额', dataIndex: 'invoice_amount', align: 'right', render: v => <b>¥{v?.toLocaleString()}</b> },
          { title: '税额', dataIndex: 'tax_amount', align: 'right', render: v => '¥' + v?.toLocaleString() },
          { title: '状态', dataIndex: 'status', render: s => <Tag color={s === 'issued' ? 'green' : 'default'}>{s === 'issued' ? '已开具' : s}</Tag> },
          { title: '操作', width: canEdit ? 120 : 40, render: (_, r) => canEdit ? <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null }
        ]} />
      <Modal open={modal} title="登记发票" onCancel={() => setModal(false)} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="distributor_id" label="经销商" rules={[{ required: true }]}>
            <Select showSearch onChange={v => form.setFieldsValue({ sales_order_id: null })}>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select>
          </Form.Item>
          <Form.Item noStyle dependencies={['distributor_id']}>
            {({ getFieldValue }) => {
              const did = getFieldValue('distributor_id');
              return (
                <Form.Item name="sales_order_id" label="关联销售单" rules={[{ required: true }]}>
                  <Select showSearch>
                    {orders.filter(o => !did || o.distributor_id === did).map(o => <Option key={o.id} value={o.id}>{o.order_no} - {o.product_name} - ¥{o.total_amount?.toLocaleString()}</Option>)}
                  </Select>
                </Form.Item>
              );
            }}
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="invoice_date" label="开票日期" style={{ flex: 1 }} rules={[{ required: true }]}><Input style={{ width: '100%' }} placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="invoice_amount" label="金额" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
            <Form.Item name="tax_amount" label="税额" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} min={0} /></Form.Item>
          </Space.Compact>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}><Space><Button onClick={() => setModal(false)}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function Distributors() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false); const [form] = Form.useForm(); const [modal, setModal] = useState({ open: false, record: null });

  const load = async () => { setLoading(true); try { const r = await api.distributors.list(); setList(r.data || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, [page, pageSize]);

  const canEdit = hasRole('admin', 'channel_manager');
  const submit = async (values) => {
    if (modal.record) { await api.distributors.update(modal.record.id, values); message.success('修改成功'); }
    else { await api.distributors.create(values); message.success('创建成功'); }
    setModal({ open: false }); load();
  };
  const remove = async (id) => { await api.distributors.remove(id); message.success('删除成功'); load(); };

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>经销商管理</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal({ open: true, record: null }); }}>新增经销商</Button>}
      </div>
      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total: list.length, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '编码', dataIndex: 'code', width: 140 },
          { title: '经销商名称', dataIndex: 'name' },
          { title: '联系人', dataIndex: 'contact' },
          { title: '电话', dataIndex: 'phone' },
          { title: '区域', dataIndex: 'region', render: r => r ? <Tag color="blue">{r}</Tag> : '-' },
          { title: '创建时间', dataIndex: 'created_at', width: 180 },
          { title: '操作', width: canEdit ? 160 : 40, render: (_, r) => canEdit ? (
            <Space size="small">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => { form.setFieldsValue(r); setModal({ open: true, record: r }); }}>修改</Button>
              <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
            </Space>) : null }
        ]} />
      <Modal open={modal.open} title={modal.record ? '修改经销商' : '新增经销商'} onCancel={() => setModal({ open: false })} footer={null} width={500}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="经销商编码" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="name" label="经销商名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="contact" label="联系人" style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="phone" label="联系电话" style={{ flex: 1 }}><Input /></Form.Item>
          </Space.Compact>
          <Form.Item name="region" label="主营区域">
            <Select allowClear>
              {['华东','华南','华北','华中','西南','西北','东北'].map(r => <Option key={r}>{r}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}><Space><Button onClick={() => setModal({ open: false })}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function PenaltyRules() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]); const [loading, setLoading] = useState(false); const [form] = Form.useForm(); const [modal, setModal] = useState(false);
  const load = async () => { setLoading(true); try { const r = await api.penaltyRules.list(); setList(r.data || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const canEdit = hasRole('admin', 'risk');
  const submit = async (values) => { await api.penaltyRules.create(values); message.success('创建成功'); setModal(false); load(); };
  const remove = async (id) => { await api.penaltyRules.remove(id); message.success('删除成功'); load(); };
  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>扣罚规则配置</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>新增扣罚规则</Button>}
      </div>
      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        columns={[
          { title: '规则编码', dataIndex: 'code', width: 140 },
          { title: '规则名称', dataIndex: 'name' },
          { title: '窜货级别', dataIndex: 'smuggle_level', render: v => v ? <Tag color={v === 'heavy' ? 'red' : v === 'medium' ? 'orange' : 'yellow'}>{v === 'light' ? '轻度' : v === 'medium' ? '中度' : '严重'}</Tag> : '-' },
          { title: '扣罚率(%)', dataIndex: 'penalty_rate', align: 'right', width: 120, render: v => <Tag color="red">{v}%</Tag> },
          { title: '固定罚款(元)', dataIndex: 'fixed_penalty', align: 'right', width: 130, render: v => v ? '¥' + v?.toLocaleString() : '-' },
          { title: '说明', dataIndex: 'description' },
          { title: '操作', width: canEdit ? 120 : 40, render: (_, r) => canEdit ? <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null }
        ]} />
      <Modal open={modal} title="新增扣罚规则" onCancel={() => setModal(false)} footer={null} width={500}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="规则编码" rules={[{ required: true }]}><Input placeholder="如 PEN_L1" /></Form.Item>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="smuggle_level" label="窜货级别"><Select allowClear><Option value="light">轻度</Option><Option value="medium">中度</Option><Option value="heavy">严重</Option></Select></Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="penalty_rate" label="扣罚率(%)" style={{ flex: 1 }} rules={[{ required: true }]}><InputNumber style={{ width: '100%' }} min={0} max={100} /></Form.Item>
            <Form.Item name="fixed_penalty" label="固定罚款(元)" style={{ flex: 1 }}><InputNumber style={{ width: '100%' }} min={0} step={100} /></Form.Item>
          </Space.Compact>
          <Form.Item name="description" label="说明"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}><Space><Button onClick={() => setModal(false)}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function RegionAuths() {
  const { hasRole } = useAuth();
  const [list, setList] = useState([]); const [loading, setLoading] = useState(false); const [form] = Form.useForm(); const [modal, setModal] = useState(false); const [distributors, setDistributors] = useState([]);
  const load = async () => { setLoading(true); try { const [r, d] = await Promise.all([api.regionAuths.list(), api.distributors.list()]); setList(r.data || []); setDistributors(d.data || []); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const canEdit = hasRole('admin', 'channel_manager');
  const submit = async (values) => { await api.regionAuths.create(values); message.success('创建成功'); setModal(false); load(); };
  const remove = async (id) => { await api.regionAuths.remove(id); message.success('删除成功'); load(); };
  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>区域授权管理</Title>
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModal(true); }}>新增授权</Button>}
      </div>
      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        columns={[
          { title: '经销商', width: 240, render: (_, r) => `${r.distributor_code} - ${r.distributor_name}` },
          { title: '授权区域', dataIndex: 'region', render: v => <Tag color="blue">{v}</Tag> },
          { title: '授权品类', dataIndex: 'product_category', render: v => v || '全部' },
          { title: '有效期', width: 260, render: (_, r) => `${r.start_date} ~ ${r.end_date || '长期'}` },
          { title: '创建时间', dataIndex: 'created_at', width: 180 },
          { title: '操作', width: canEdit ? 120 : 40, render: (_, r) => canEdit ? <Popconfirm title="确认删除？" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm> : null }
        ]} />
      <Modal open={modal} title="新增区域授权" onCancel={() => setModal(false)} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="distributor_id" label="经销商" rules={[{ required: true }]}>
            <Select showSearch>{distributors.map(d => <Option key={d.id} value={d.id}>{d.code} - {d.name}</Option>)}</Select>
          </Form.Item>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="region" label="授权区域" style={{ flex: 1 }} rules={[{ required: true }]}>
              <Select>{['华东','华南','华北','华中','西南','西北','东北','港澳台','海外'].map(r => <Option key={r}>{r}</Option>)}</Select>
            </Form.Item>
            <Form.Item name="product_category" label="授权品类" style={{ flex: 1 }}>
              <Select allowClear><Option value="白酒">白酒</Option><Option value="红酒">红酒</Option><Option value="啤酒">啤酒</Option><Option value="黄酒">黄酒</Option></Select>
            </Form.Item>
          </Space.Compact>
          <Space.Compact style={{ width: '100%' }}>
            <Form.Item name="start_date" label="开始日期" style={{ flex: 1 }} rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="end_date" label="结束日期" style={{ flex: 1 }}><Input placeholder="YYYY-MM-DD (留空长期)" /></Form.Item>
          </Space.Compact>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}><Space><Button onClick={() => setModal(false)}>取消</Button><Button type="primary" htmlType="submit">提交</Button></Space></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default {
  Invoices, Distributors, PenaltyRules, RegionAuths,
  _all: { Invoices, Distributors, PenaltyRules, RegionAuths }
};
export { Invoices, Distributors, PenaltyRules, RegionAuths };
