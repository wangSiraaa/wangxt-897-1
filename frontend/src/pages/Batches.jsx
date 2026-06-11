import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Select, DatePicker, Space, Modal, message, Popconfirm, Tag, Typography, Descriptions, Row, Col, Card, Progress, Drawer, Input, Tooltip, List } from 'antd';
import { PlusOutlined, CheckOutlined, UndoOutlined, FileExportOutlined, DeleteOutlined, EyeOutlined, ExclamationCircleOutlined, SafetyOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import dayjs from 'dayjs';
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

const STATUS = { draft: { l: '草稿', c: 'default' }, reviewed: { l: '已复核', c: 'processing' }, confirmed: { l: '已确认', c: 'success' } };

export default function Batches() {
  const { hasRole, roleName, user } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [query, setQuery] = useState({});
  const [detail, setDetail] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [form] = Form.useForm();
  const [riskModal, setRiskModal] = useState({ open: false, record: null });
  const [riskForm] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [r, d, p] = await Promise.all([
        api.batches.list({ page, pageSize, ...query }),
        api.distributors.list(),
        api.policies.list({ pageSize: 100 })
      ]);
      setList(r.data || []); setTotal(r.total || 0);
      setDistributors(d.data || []); setPolicies(p.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, pageSize, query]);

  const isLocked = (b) => b && (b.status === 'reviewed' || b.status === 'confirmed');

  const openDetail = async (record) => {
    setLoading(true);
    try {
      const r = await api.batches.get(record.id);
      setDetail(r.data);
    } finally { setLoading(false); }
  };

  const submitCreate = async (values) => {
    try {
      const [sd, ed] = values.date_range;
      const r = await api.batches.generate({
        distributor_id: values.distributor_id,
        policy_id: values.policy_id || null,
        period_start: sd.format('YYYY-MM-DD'),
        period_end: ed.format('YYYY-MM-DD')
      });
      message.success(`生成结算批次成功：${r.batch_no}，最终返利¥${r.data?.finalRebate?.toLocaleString()}`);
      setCreateModal(false); form.resetFields(); load();
    } catch (e) {
      if (e.response?.data?.code === 'BATCH_CONFLICT') message.warning(e.response?.data?.error);
    }
  };

  const review = async (id) => { await api.batches.review(id); message.success('财务复核成功，批次已锁定，不能再修改基础数据'); load(); setDetail(null); };
  const unreview = async (id) => { await api.batches.unreview(id); message.success('取消复核成功'); load(); setDetail(null); };
  const confirm = async (id) => { await api.batches.confirm(id); message.success('批次已确认结算'); load(); setDetail(null); };
  const remove = async (id) => { await api.batches.remove(id); message.success('删除成功'); load(); };
  const riskMark = async (values) => { await api.batches.riskMark(riskModal.record.id, values); message.success('风控标记完成'); setRiskModal({ open: false }); load(); };
  const riskUnmark = async (id) => { await api.batches.riskUnmark(id); message.success('已解除风控标记'); load(); };

  const exportExcel = (id) => { window.open(api.batches.exportUrl(id), '_blank'); };

  const canCreate = hasRole('admin', 'channel_manager', 'finance');
  const canReview = hasRole('finance', 'admin');
  const canRisk = hasRole('risk', 'admin');

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>结算批次</Title>
        <Space>
          {canCreate && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModal(true)}>生成结算批次</Button>}
        </Space>
      </div>

      <Form layout="inline" style={{ marginBottom: 16 }} onFinish={v => { if (v.period_range) { v.period_start = v.period_range[0].format('YYYY-MM-DD'); v.period_end = v.period_range[1].format('YYYY-MM-DD'); delete v.period_range; } setQuery(v); setPage(1); }}>
        <Form.Item name="distributor_id"><Select placeholder="经销商" allowClear style={{ width: 200 }}>{distributors.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}</Select></Form.Item>
        <Form.Item name="status"><Select placeholder="状态" allowClear style={{ width: 140 }}>{Object.keys(STATUS).map(k => <Option key={k}>{STATUS[k].l}</Option>)}</Select></Form.Item>
        <Form.Item name="period_range"><RangePicker /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit">查询</Button></Form.Item>
      </Form>

      <Table rowKey="id" loading={loading} size="middle" dataSource={list}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
        columns={[
          { title: '批次号', dataIndex: 'batch_no', width: 200, render: v => <a onClick={() => openDetail(list.find(x => x.batch_no === v))}><b>{v}</b></a> },
          { title: '经销商', dataIndex: 'distributor_name' },
          { title: '匹配政策', dataIndex: 'policy_name', render: v => v || '-' },
          { title: '核算周期', width: 230, render: (_, r) => `${r.period_start} ~ ${r.period_end}` },
          { title: '达成率', width: 130, render: (_, r) => <span><Progress percent={Math.min(100, r.achievement_rate)} size="small" showInfo={false} style={{ width: 60, marginRight: 6 }} />{r.achievement_rate}%</span> },
          { title: '回款总额', dataIndex: 'paid_total', width: 120, align: 'right', render: v => '¥' + v?.toLocaleString() },
          { title: '基础返利', dataIndex: 'base_rebate', width: 110, align: 'right', render: v => <span style={{ color: '#16a34a' }}>¥{v?.toLocaleString()}</span> },
          { title: '阶梯奖励', dataIndex: 'ladder_rebate', width: 100, align: 'right', render: v => v ? <span style={{ color: '#2563eb' }}>+¥{v?.toLocaleString()}</span> : '-' },
          { title: '窜货扣罚', dataIndex: 'smuggle_penalty', width: 110, align: 'right', render: v => v > 0 ? <span style={{ color: '#dc2626' }}>-¥{v?.toLocaleString()}</span> : '-' },
          { title: '最终返利', dataIndex: 'final_rebate', width: 130, align: 'right', render: v => <b style={{ color: '#059669', fontSize: 15 }}>¥{v?.toLocaleString()}</b> },
          { title: '风控', width: 80, align: 'center', render: (_, r) => r.risk_mark ? <Tooltip title={r.risk_reason}><Tag icon={<ExclamationCircleOutlined />} color="red">异常</Tag></Tooltip> : <Tag color="green">正常</Tag> },
          { title: '状态', width: 100, render: (_, r) => <Tag color={STATUS[r.status]?.c || 'default'} icon={isLocked(r) ? <LockOutlined /> : undefined}>{STATUS[r.status]?.l}</Tag> },
          { title: '操作', width: 300, fixed: 'right', render: (_, r) => (
            <Space size="small" wrap>
              <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>详情</Button>
              <Button type="link" size="small" icon={<FileExportOutlined />} onClick={() => exportExcel(r.id)}>导出</Button>
              {canReview && r.status === 'draft' && <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => review(r.id)}>财务复核</Button>}
              {canReview && r.status === 'reviewed' && <Button type="link" size="small" icon={<UndoOutlined />} onClick={() => unreview(r.id)}>取消复核</Button>}
              {canReview && r.status === 'reviewed' && !r.risk_mark && <Button type="link" size="small" icon={<SafetyOutlined />} onClick={() => confirm(r.id)}>确认结算</Button>}
              {canRisk && r.status !== 'confirmed' && !r.risk_mark && <Button type="link" size="small" danger icon={<ExclamationCircleOutlined />} onClick={() => { riskForm.resetFields(); setRiskModal({ open: true, record: r }); }}>风控标记</Button>}
              {canRisk && r.risk_mark && <Button type="link" size="small" icon={<UnlockOutlined />} onClick={() => riskUnmark(r.id)}>解除风控</Button>}
              {r.status === 'draft' && hasRole('admin') && <Popconfirm title="删除此草稿批次？销售单将解除锁定" onConfirm={() => remove(r.id)}><Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>}
            </Space>
          )}
        ]} />

      <Modal open={createModal} title="生成结算批次" onCancel={() => setCreateModal(false)} footer={null} width={600}>
        <div className="rebate-tip" style={{ marginBottom: 16 }}>
          生成批次后：①未回款的销售单不计入；②政策外日期不匹配；③已锁定到其他批次的销售单不会重复计入。
        </div>
        <Form form={form} layout="vertical" onFinish={submitCreate} initialValues={{ date_range: [dayjs('2025-01-01'), dayjs('2025-12-31')] }}>
          <Form.Item name="distributor_id" label="选择经销商" rules={[{ required: true, message: '请选择' }]}>
            <Select placeholder="请选择经销商" showSearch>{distributors.map(d => <Option key={d.id} value={d.id}>{d.code} - {d.name} ({d.region})</Option>)}</Select>
          </Form.Item>
          <Form.Item name="policy_id" label="指定返利政策（留空自动匹配最有利政策）">
            <Select placeholder="留空自动匹配" showSearch allowClear>{policies.map(p => <Option key={p.id} value={p.id}>{p.code} - {p.name}</Option>)}</Select>
          </Form.Item>
          <Form.Item name="date_range" label="核算周期" rules={[{ required: true, message: '请选择周期' }]}>
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setCreateModal(false)}>取消</Button><Button type="primary" htmlType="submit">生成批次</Button></Space>
          </Form.Item>
        </Form>
      </Modal>

      <Drawer open={riskModal.open} title={`风控标记异常批次 - ${riskModal.record?.batch_no}`} onClose={() => setRiskModal({ open: false, record: null })} width={460}>
        <div className="penalty-tip" style={{ marginBottom: 16 }}>
          <ExclamationCircleOutlined /> 风控角色仅能标记异常，不能确认结算；标记后财务需先解除风控才能确认。
        </div>
        <Form form={riskForm} layout="vertical" onFinish={riskMark}>
          <Form.Item name="reason" label="异常原因（必填）" rules={[{ required: true }]}>
            <Input.TextArea rows={5} placeholder="请详细描述标记风控异常的原因，如数据异常、政策不合规、窜货情况等" />
          </Form.Item>
          <Form.Item style={{ textAlign: 'right', marginBottom: 0 }}>
            <Space><Button onClick={() => setRiskModal({ open: false })}>取消</Button><Button type="primary" danger htmlType="submit">确认标记异常</Button></Space>
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`结算批次详情 - ${detail?.batch_no}`} width={900}>
        {detail && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Row gutter={12}>
              <Col span={6}><Card size="small" className="stat-card"><div className="label">最终返利</div><div className="value" style={{ color: '#059669' }}>¥{detail.final_rebate?.toLocaleString()}</div></Card></Col>
              <Col span={6}><Card size="small" className="stat-card"><div className="label">达成率</div><div className="value">{detail.achievement_rate}%</div></Card></Col>
              <Col span={6}><Card size="small" className="stat-card"><div className="label">已结算销售单</div><div className="value">{detail.sales_count}</div></Card></Col>
              <Col span={6}><Card size="small" className="stat-card"><div className="label">状态</div><div className="value" style={{ fontSize: 16 }}>{isLocked(detail) ? <><LockOutlined /> </> : <></>}{STATUS[detail.status]?.l}</div></Card></Col>
            </Row>

            <Card size="small" title="基本信息">
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="批次号">{detail.batch_no}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS[detail.status]?.c}>{STATUS[detail.status]?.l}</Tag></Descriptions.Item>
                <Descriptions.Item label="经销商">{detail.distributor_name} <Tag>{detail.distributor_code}</Tag></Descriptions.Item>
                <Descriptions.Item label="匹配政策">{detail.policy_name || '自动匹配'}</Descriptions.Item>
                <Descriptions.Item label="周期">{detail.period_start} ~ {detail.period_end}</Descriptions.Item>
                <Descriptions.Item label="创建人">{detail.created_by_name}</Descriptions.Item>
                {detail.reviewed_by_name && <Descriptions.Item label="财务复核">{detail.reviewed_by_name} @ {detail.reviewed_at}</Descriptions.Item>}
                {detail.risk_marked_by_name && <Descriptions.Item label="风控标记" style={{ color: '#dc2626' }}>{detail.risk_marked_by_name} - {detail.risk_reason}</Descriptions.Item>}
              </Descriptions>
            </Card>

            <Card size="small" title="返利计算明细">
              <div className="detail-row"><span className="k">销售总额</span><span className="v">¥{detail.sales_total?.toLocaleString()}</span></div>
              <div className="detail-row"><span className="k">回款总额（核算基数）</span><span className="v">¥{detail.paid_total?.toLocaleString()}</span></div>
              <div className="detail-row"><span className="k">达成率</span><span className="v"><b>{detail.achievement_rate}%</b></span></div>
              <div className="detail-row"><span className="k">基础返利</span><span className="v" style={{ color: '#16a34a' }}>+ ¥{detail.base_rebate?.toLocaleString()}</span></div>
              <div className="detail-row"><span className="k">阶梯奖励</span><span className="v" style={{ color: '#2563eb' }}>+ ¥{detail.ladder_rebate?.toLocaleString()}</span></div>
              <div className="detail-row"><span className="k">窜货扣罚</span><span className="v" style={{ color: '#dc2626' }}>- ¥{detail.smuggle_penalty?.toLocaleString()}</span></div>
              <div className="detail-row" style={{ fontSize: 18, paddingTop: 8 }}><span className="k"><b>最终返利</b></span><span className="v" style={{ color: '#059669' }}><b>¥{detail.final_rebate?.toLocaleString()}</b></span></div>
            </Card>

            {(detail.smuggles || []).length > 0 && (
              <Card size="small" title={<span style={{ color: '#dc2626' }}>窜货扣罚明细（{(detail.smuggles || []).length}条）</span>}>
                <Table rowKey="id" size="small" pagination={false} dataSource={detail.smuggles}
                  columns={[
                    { title: '关联销售单', dataIndex: 'order_no', width: 200 },
                    { title: '窜货区域', dataIndex: 'smuggle_region', render: v => <Tag color="red">{v}</Tag> },
                    { title: '窜货金额', dataIndex: 'smuggle_amount', align: 'right', render: v => '¥' + v?.toLocaleString() },
                    { title: '扣罚率', dataIndex: 'penalty_rate', align: 'right', render: v => v + '%' },
                    { title: '扣罚金额', dataIndex: 'penalty_amount', align: 'right', render: v => <b style={{ color: '#dc2626' }}>¥{v?.toLocaleString()}</b> }
                  ]}
                  summary={d => {
                    let s = 0; d.forEach(r => s += r.penalty_amount || 0);
                    return <Table.Summary fixed><Table.Summary.Row><Table.Summary.Cell index={0} colSpan={4}>合计扣罚</Table.Summary.Cell><Table.Summary.Cell index={4} align="right" style={{ color: '#dc2626', fontWeight: 600 }}>¥{s.toLocaleString()}</Table.Summary.Cell></Table.Summary.Row></Table.Summary>;
                  }}
                />
              </Card>
            )}

            <Card size="small" title={`销售明细（${(detail.orders || []).length}单）`}>
              <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={detail.orders || []}
                columns={[
                  { title: '单号', dataIndex: 'order_no', width: 180 },
                  { title: '日期', dataIndex: 'order_date', width: 100 },
                  { title: '商品', dataIndex: 'product_name' },
                  { title: '数量', dataIndex: 'quantity', width: 60, align: 'right' },
                  { title: '单价', dataIndex: 'unit_price', width: 100, align: 'right', render: v => '¥' + v?.toLocaleString() },
                  { title: '总额', dataIndex: 'total_amount', width: 110, align: 'right', render: v => '¥' + v?.toLocaleString() },
                  { title: '区域', dataIndex: 'region' }
                ]} />
            </Card>

            {detail.status === 'reviewed' && (
              <div className="penalty-tip">
                <LockOutlined /> 本批次已财务复核，处于锁定状态，不能修改相关基础数据（销售单/回款/窜货）。
              </div>
            )}

            <Space wrap style={{ justifyContent: 'flex-end' }}>
              <Button icon={<FileExportOutlined />} onClick={() => exportExcel(detail.id)}>导出Excel</Button>
              {canReview && detail.status === 'draft' && <Button icon={<CheckOutlined />} type="primary" onClick={() => review(detail.id)}>财务复核</Button>}
              {canReview && detail.status === 'reviewed' && <Button icon={<UndoOutlined />} onClick={() => unreview(detail.id)}>取消复核</Button>}
              {canReview && detail.status === 'reviewed' && !detail.risk_mark && <Button icon={<SafetyOutlined />} type="primary" onClick={() => confirm(detail.id)}>确认结算</Button>}
            </Space>
          </Space>
        )}
      </Drawer>
    </div>
  );
}
