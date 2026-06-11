import React, { useEffect, useState } from 'react';
import { DatePicker, Select, Button, Card, Row, Col, Space, Typography, Progress, Divider, Table, Statistic, Descriptions, Tag, message, Empty, Result, Tooltip, List } from 'antd';
import { CalculatorOutlined, SaveOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, InfoCircleOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import dayjs from 'dayjs';
const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function RebateTrial() {
  const [distributors, setDistributors] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [distributorId, setDistributorId] = useState();
  const [policyId, setPolicyId] = useState();
  const [dateRange, setDateRange] = useState([dayjs('2025-01-01'), dayjs('2025-12-31')]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('orders');

  const load = async () => {
    const [d, p] = await Promise.all([api.distributors.list(), api.policies.list({ pageSize: 100 })]);
    setDistributors(d.data || []); setPolicies(p.data || []);
  };
  useEffect(() => { load(); }, []);

  const runCalculate = async (mode = 'all') => {
    if (!dateRange) return message.error('请选择核算周期');
    setLoading(true); setResult(null);
    try {
      const data = { period_start: dateRange[0].format('YYYY-MM-DD'), period_end: dateRange[1].format('YYYY-MM-DD'), policy_id: policyId || null };
      let r;
      if (mode === 'single' && distributorId) {
        const resp = await api.rebate.calculateDist(distributorId, data);
        r = { data: [resp.data], period: resp.period };
      } else {
        const resp = await api.rebate.calculate(data);
        r = resp;
      }
      setResult(r);
      message.success(`试算完成：共 ${r.data?.length || 0} 个经销商`);
    } finally { setLoading(false); }
  };

  const saveTrial = async () => {
    if (!result?.data?.length) return;
    const data = { period_start: dateRange[0].format('YYYY-MM-DD'), period_end: dateRange[1].format('YYYY-MM-DD'), policy_id: policyId || null, distributor_id: distributorId || null };
    await api.rebate.save(data);
    message.success('试算结果已保存，快照版本已记录');
  };

  const calcSum = (list) => ({
    salesTotal: list.reduce((s, r) => s + (r.salesTotal || 0), 0),
    paidTotal: list.reduce((s, r) => s + (r.paidTotal || 0), 0),
    base: list.reduce((s, r) => s + (r.baseRebate || 0), 0),
    ladder: list.reduce((s, r) => s + (r.ladderRebate || 0), 0),
    penalty: list.reduce((s, r) => s + (r.smugglePenalty || 0), 0),
    final: list.reduce((s, r) => s + (r.finalRebate || 0), 0)
  });

  const sum = result?.data ? calcSum(result.data) : null;

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>返利试算 <Tag>与后端共用同一套 RebateCalculator</Tag></Title>
        <Space>
          <Button icon={<CalculatorOutlined />} onClick={() => runCalculate('all')} loading={loading}>全部经销商试算</Button>
          <Button type="primary" icon={<CalculatorOutlined />} onClick={() => runCalculate('single')} loading={loading} disabled={!distributorId}>指定经销商试算</Button>
          <Button icon={<SaveOutlined />} onClick={saveTrial} disabled={!result}>保存版本快照</Button>
        </Space>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <span style={{ color: '#6b7280' }}>核算周期：</span>
          <RangePicker value={dateRange} onChange={setDateRange} />
          <span style={{ color: '#6b7280' }}>经销商：</span>
          <Select style={{ width: 220 }} placeholder="选择后仅对该经销商试算" allowClear showSearch value={distributorId} onChange={setDistributorId} optionFilterProp="label">
            {distributors.map(d => <Option key={d.id} value={d.id} label={d.name}>{d.code} - {d.name} ({d.region})</Option>)}
          </Select>
          <span style={{ color: '#6b7280' }}>指定政策：</span>
          <Select style={{ width: 260 }} placeholder="不选则自动匹配最有利政策" allowClear showSearch value={policyId} onChange={setPolicyId} optionFilterProp="label">
            {policies.map(p => <Option key={p.id} value={p.id} label={p.name}>{p.code} - {p.name}</Option>)}
          </Select>
        </Space>
      </Card>

      {!result && !loading && (
        <div style={{ padding: '80px 0' }}><Empty description="请先执行试算，查看返利核算结果" /></div>
      )}

      {result?.data?.length === 0 && !loading && (
        <Result status="info" title="暂无符合条件的经销商核算数据" subTitle="请检查周期、政策生效期、销售单导入情况" />
      )}

      {sum && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={4}><Card size="small"><Statistic title="经销商数" value={result.data.length} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="销售总额" value={sum.salesTotal} precision={2} prefix="¥" /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="回款总额" value={sum.paidTotal} precision={2} prefix="¥" /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title="基础返利" value={sum.base} precision={2} prefix="¥" valueStyle={{ color: '#16a34a' }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title={<>阶梯奖励 <RiseOutlined /></>} value={sum.ladder} precision={2} prefix="¥" valueStyle={{ color: '#2563eb' }} /></Card></Col>
            <Col span={4}><Card size="small"><Statistic title={<>最终返利 {sum.penalty > 0 && <Tag color="orange">扣罚{sum.penalty.toLocaleString()}</Tag>}</>} value={sum.final} precision={2} prefix="¥" valueStyle={{ color: '#059669', fontSize: 28 }} /></Card></Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Card title="经销商核算清单" size="small" style={{ height: 520, overflow: 'auto' }}>
                <List
                  dataSource={result.data}
                  renderItem={(r, idx) => (
                    <List.Item
                      key={r.distributorId}
                      onClick={() => setResult({ ...result, selectedIdx: idx })}
                      style={{ cursor: 'pointer', background: result.selectedIdx === idx ? '#eff6ff' : undefined, borderRadius: 6, marginBottom: 6, padding: '10px 12px', border: '1px solid ' + (result.selectedIdx === idx ? '#93c5fd' : '#f3f4f6') }}
                    >
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <b>{distributors.find(d => d.id === r.distributorId)?.name || r.distributorId}</b>
                          <Tag color="geekblue">达成率 {r.achievementRate}%</Tag>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>销售¥{r.salesTotal?.toLocaleString()} / 回款¥{r.paidTotal?.toLocaleString()}</Text>
                          <b style={{ color: '#059669' }}>¥{r.finalRebate?.toLocaleString()}</b>
                        </div>
                      </div>
                    </List.Item>
                  )}
                />
              </Card>
            </Col>
            <Col span={16}>
              <Card size="small" title="核算明细" style={{ minHeight: 520 }}
                tabList={[{ key: 'orders', tab: '销售/回款明细' }, { key: 'calc', tab: '计算过程' }, { key: 'penalty', tab: `窜货扣罚 ${(result.data[result.selectedIdx || 0]?.smuggleDetails || []).length > 0 ? `(${result.data[result.selectedIdx || 0].smuggleDetails.length}条)` : ''}` }]}
                activeTabKey={tab}
                onTabChange={setTab}
                extra={
                  <Tag icon={<InfoCircleOutlined />} color="blue">
                    周期：{dateRange[0].format('YYYY-MM-DD')} ~ {dateRange[1].format('YYYY-MM-DD')}
                  </Tag>
                }
              >
                {(() => {
                  const cur = result.data[result.selectedIdx || 0];
                  if (!cur) return <Empty description="请在左侧选择经销商" />;
                  const d = distributors.find(x => x.id === cur.distributorId);

                  if (tab === 'calc') return (
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                      <Descriptions size="small" bordered column={2}>
                        <Descriptions.Item label="经销商">{d?.name} <Tag>{d?.code}</Tag></Descriptions.Item>
                        <Descriptions.Item label="匹配政策">{cur.policyName || '（自动匹配）'}</Descriptions.Item>
                        <Descriptions.Item label="基础门槛">¥{cur.baseCondition?.toLocaleString() || 0}</Descriptions.Item>
                        <Descriptions.Item label="核算周期">{cur.periodStart} ~ {cur.periodEnd}</Descriptions.Item>
                      </Descriptions>
                      <Card size="small" className="rebate-tip" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }} title={<span style={{ color: '#1e40af' }}>达成率计算</span>}>
                        <div className="detail-row"><span className="k">销售单总数</span><span className="v">{cur.orders?.length || 0} 单</span></div>
                        <div className="detail-row"><span className="k">销售总额</span><span className="v">¥{cur.salesTotal?.toLocaleString()}</span></div>
                        <div className="detail-row"><span className="k"><span className="unpaid">未回款单（不计返利）</span></span><span className="v unpaid">{cur.unpaidOrders?.length || 0} 单</span></div>
                        <div className="detail-row"><span className="k"><span className="paid">已回款单（计入核算）</span></span><span className="v paid">{cur.paidOrders?.length || 0} 单</span></div>
                        <div className="detail-row"><span className="k">回款总额（达成率基数）</span><span className="v">¥{cur.paidTotal?.toLocaleString()}</span></div>
                        <div style={{ padding: '8px 0' }}>
                          <Text type="secondary">达成率 = 回款总额 ÷ 基础门槛 × 100%</Text><br />
                          <b style={{ fontSize: 16 }}>{cur.paidTotal?.toLocaleString()} ÷ {cur.baseCondition?.toLocaleString() || 0} × 100% = <Tag color="blue" style={{ fontSize: 18, padding: '2px 12px' }}>{cur.achievementRate}%</Tag></b>
                          <Progress percent={Math.min(100, cur.achievementRate)} showInfo={false} style={{ marginTop: 8 }} />
                        </div>
                      </Card>
                      <Card size="small" className="rebate-tip" title="阶梯匹配（政策阶梯规则）">
                        {cur.matchedLadder ? (
                          <>
                            <div className="detail-row"><span className="k">匹配区间</span><span className="v">{cur.matchedLadder.min_rate}% ~ {cur.matchedLadder.max_rate >= 9999 ? '∞' : cur.matchedLadder.max_rate + '%'}</span></div>
                            <div className="detail-row"><span className="k">返利比例</span><span className="v"><Tag color="green">{cur.matchedLadder.rebate_rate}%</Tag></span></div>
                            <div className="detail-row"><span className="k">阶梯奖金</span><span className="v">¥{cur.matchedLadder.bonus_amount?.toLocaleString()}</span></div>
                          </>
                        ) : <Text type="warning">未匹配到阶梯</Text>}
                      </Card>
                      <Card size="small" title={<span style={{ color: '#059669' }}>最终返利计算</span>}>
                        <div className="detail-row"><span className="k">基础返利 = 回款总额 × 返利比例</span><span className="v" style={{ color: '#16a34a' }}>¥{cur.paidTotal?.toLocaleString()} × {cur.baseRebateRate}% = <b>¥{cur.baseRebate?.toLocaleString()}</b></span></div>
                        <div className="detail-row"><span className="k">阶梯奖励</span><span className="v" style={{ color: '#2563eb' }}>+ ¥{cur.ladderRebate?.toLocaleString()}</span></div>
                        <div className="detail-row"><span className="k" style={{ color: '#dc2626' }}>窜货扣罚</span><span className="v" style={{ color: '#dc2626' }}>- ¥{cur.smugglePenalty?.toLocaleString()}</span></div>
                        <Divider style={{ margin: '8px 0' }} />
                        <div className="detail-row" style={{ fontSize: 16 }}>
                          <span className="k"><b>最终返利</b></span>
                          <span className="v" style={{ color: '#059669', fontSize: 22 }}>
                            <b>¥{cur.finalRebate?.toLocaleString()}</b>
                          </span>
                        </div>
                        {cur.smugglePenalty > 0 && (
                          <div className="penalty-tip" style={{ marginTop: 8 }}>
                            <WarningOutlined /> 本期共发生窜货扣罚 ¥{cur.smugglePenalty?.toLocaleString()}，已从返利中抵减，明细请见「窜货扣罚」页签。
                          </div>
                        )}
                      </Card>
                    </Space>
                  );

                  if (tab === 'penalty') {
                    const dets = cur.smuggleDetails || [];
                    if (dets.length === 0) return <Result status="success" title="本期无窜货扣罚记录" />;
                    return (
                      <Table rowKey="id" size="small" pagination={false} dataSource={dets}
                        columns={[
                          { title: '关联销售单', dataIndex: 'order_no', width: 200 },
                          { title: '窜货区域', dataIndex: 'smuggle_region', render: v => <Tag color="red">{v}</Tag> },
                          { title: '窜货金额', dataIndex: 'smuggle_amount', align: 'right', render: v => '¥' + v?.toLocaleString() },
                          { title: '扣罚率', dataIndex: 'penalty_rate', align: 'right', render: v => <Tag color="orange">{v}%</Tag> },
                          { title: '扣罚金额', dataIndex: 'penalty_amount', align: 'right', render: v => <b style={{ color: '#dc2626' }}>¥{v?.toLocaleString()}</b> },
                          { title: '备注', dataIndex: 'remark' }
                        ]}
                        summary={pageData => {
                          let total = 0; pageData.forEach(r => total += r.penalty_amount || 0);
                          return (
                            <Table.Summary fixed>
                              <Table.Summary.Row>
                                <Table.Summary.Cell index={0} colSpan={4}><b>扣罚合计</b></Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right"><b style={{ color: '#dc2626', fontSize: 16 }}>¥{total.toLocaleString()}</b></Table.Summary.Cell>
                              </Table.Summary.Row>
                            </Table.Summary>
                          );
                        }}
                      />
                    );
                  }

                  return (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Table rowKey="id" size="small" pagination={{ pageSize: 5 }} dataSource={cur.orders || []}
                        rowClassName={r => r.is_paid ? '' : 'unpaid-row'}
                        columns={[
                          { title: '销售单号', dataIndex: 'order_no', width: 200 },
                          { title: '日期', dataIndex: 'order_date', width: 110 },
                          { title: '商品', dataIndex: 'product_name' },
                          { title: '数量', dataIndex: 'quantity', width: 60, align: 'right' },
                          { title: '总额', dataIndex: 'total_amount', width: 110, align: 'right', render: v => '¥' + v?.toLocaleString() },
                          { title: '匹配回款', dataIndex: 'paid_amount_matched', width: 110, align: 'right', render: v => '¥' + (v || 0).toLocaleString() },
                          { title: '是否全回款', dataIndex: 'is_paid', width: 90, align: 'center', render: v => v ? <Tag icon={<CheckCircleOutlined />} color="success">计入返利</Tag> : <Tag icon={<CloseCircleOutlined />} color="default">未回款不计</Tag> }
                        ]}
                      />
                      <div className="rebate-tip" style={{ padding: 12 }}>
                        <InfoCircleOutlined /> 校验规则：<b>未回款销售单不计入返利</b>，仅完全回款（匹配回款≥总额99.99%）的销售单参与核算。
                      </div>
                    </Space>
                  );
                })()}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
