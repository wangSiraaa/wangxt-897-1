import React, { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Progress, Tag, Statistic, Typography } from 'antd';
import { api } from '../services/api.js';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';

const { Title } = Typography;

export default function Dashboard() {
  const [sales, setSales] = useState([]);
  const [batches, setBatches] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const periodStart = '2025-01-01';
  const periodEnd = '2025-12-31';

  const load = async () => {
    setLoading(true);
    try {
      const [s, b, p] = await Promise.all([
        api.sales.list({ pageSize: 100 }),
        api.batches.list({ pageSize: 100 }),
        api.policies.list({ pageSize: 100 })
      ]);
      setSales(s.data || []);
      setBatches(b.data || []);
      setPolicies(p.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const totalSales = sales.reduce((s, o) => s + (o.total_amount || 0), 0);
  const totalPaid = sales.reduce((s, o) => s + (o.paid_amount || 0), 0);
  const unpaidCount = sales.filter(o => !o.paid_amount || o.paid_amount < o.total_amount).length;
  const rebatedTotal = batches.reduce((s, b) => s + (b.final_rebate || 0), 0);

  const payRate = totalSales > 0 ? Math.round((totalPaid / totalSales) * 100) : 0;

  const byMonth = {};
  for (const o of sales) {
    const m = dayjs(o.order_date).format('YYYY-MM');
    if (!byMonth[m]) byMonth[m] = { sales: 0, paid: 0 };
    byMonth[m].sales += o.total_amount || 0;
    byMonth[m].paid += o.paid_amount || 0;
  }
  const months = Object.keys(byMonth).sort();
  const chartOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['销售总额', '回款总额'] },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', axisLabel: { formatter: v => (v / 10000) + '万' } },
    series: [
      { name: '销售总额', type: 'bar', data: months.map(m => byMonth[m].sales), itemStyle: { color: '#1677ff' } },
      { name: '回款总额', type: 'bar', data: months.map(m => byMonth[m].paid), itemStyle: { color: '#52c41a' } }
    ]
  };

  const statusMap = { draft: { label: '草稿', color: 'default' }, reviewed: { label: '已复核', color: 'processing' }, confirmed: { label: '已确认', color: 'success' } };

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={4} style={{ margin: 0 }}>工作台</Title>
          <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>当前核算周期：{periodStart} ~ {periodEnd}</div>
        </div>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card className="stat-card" size="small"><div className="label">销售总额</div><div className="value">¥{totalSales.toLocaleString()}</div></Card></Col>
        <Col span={6}><Card className="stat-card" size="small"><div className="label">已回款</div><div className="value">¥{totalPaid.toLocaleString()}</div><div className="delta"><Progress percent={payRate} size="small" showInfo={false} /><span style={{ color: payRate >= 90 ? '#52c41a' : '#f59e0b' }}>{payRate}% 回款率</span></div></Card></Col>
        <Col span={6}><Card className="stat-card" size="small"><div className="label">待处理销售单</div><div className="value">{unpaidCount}</div><div className="delta" style={{ color: '#f5222d' }}>{unpaidCount} 单未回款不计返利</div></Card></Col>
        <Col span={6}><Card className="stat-card" size="small"><div className="label">已结算返利</div><div className="value">¥{rebatedTotal.toLocaleString()}</div><div className="delta">共 {batches.length} 个结算批次</div></Card></Col>
      </Row>

      <Row gutter={16}>
        <Col span={14}>
          <Card title="销售与回款趋势" size="small" style={{ marginBottom: 16 }}>
            {months.length > 0 ? <ReactECharts option={chartOption} style={{ height: 300 }} /> : <div style={{ textAlign: 'center', padding: 40, color: '#8c8c8c' }}>暂无数据</div>}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="返利政策（{policies.length}）" size="small" style={{ marginBottom: 16 }}>
            {policies.slice(0, 5).map(p => (
              <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px dashed #e5e7eb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 500 }}>{p.name}</span>
                  <Tag color={p.status === 'active' ? 'green' : 'default'}>{p.status === 'active' ? '生效中' : '停用'}</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  {p.start_date} ~ {p.end_date} · 基础门槛 ¥{p.base_condition?.toLocaleString()} · 阶梯数 {p.ladders?.length || 0}
                </div>
              </div>
            ))}
          </Card>
        </Col>
      </Row>

      <Card title="最近结算批次" size="small">
        <Table rowKey="id" size="small" pagination={false} dataSource={batches.slice(0, 8)} loading={loading}
          columns={[
            { title: '批次号', dataIndex: 'batch_no', width: 200 },
            { title: '经销商', dataIndex: 'distributor_name' },
            { title: '周期', render: (_, r) => `${r.period_start} ~ ${r.period_end}` },
            { title: '达成率', dataIndex: 'achievement_rate', render: v => `${v}%` },
            { title: '最终返利', dataIndex: 'final_rebate', render: v => <span style={{ color: '#16a34a', fontWeight: 600 }}>¥{v?.toLocaleString()}</span> },
            { title: '风控', dataIndex: 'risk_mark', render: v => v ? <Tag color="red">已标记</Tag> : <Tag color="green">正常</Tag> },
            { title: '状态', dataIndex: 'status', render: s => { const t = statusMap[s] || {}; return <Tag color={t.color}>{t.label}</Tag>; } }
          ]} />
      </Card>
    </div>
  );
}
