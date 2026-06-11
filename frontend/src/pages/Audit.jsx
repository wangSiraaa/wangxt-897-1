import React, { useEffect, useState } from 'react';
import { Table, Button, Form, Input, Select, DatePicker, Space, Tag, Typography, Card } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { api } from '../services/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
const { Title } = Typography;
const { RangePicker } = DatePicker;
const { Option } = Select;

export default function Audit() {
  const { roleName } = useAuth();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, pageSize, ...query };
      if (params.date_range) {
        params.start_date = params.date_range[0]; params.end_date = params.date_range[1]; delete params.date_range;
      }
      const r = await api.audit.list(params);
      setList(r.data || []); setTotal(r.total || 0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [page, pageSize, query]);

  const targets = ['SALES_ORDER','PAYMENT','INVOICE','POLICY','BATCH','SMUGGLE','DISTRIBUTOR','REGION_AUTH','PENALTY_RULE','USER'];
  const actions = ['LOGIN','CREATE_SALES_ORDER','BATCH_IMPORT_SALES','UPDATE_SALES_ORDER','DELETE_SALES_ORDER','CREATE_PAYMENT','MATCH_PAYMENT','DELETE_PAYMENT','CREATE_INVOICE','DELETE_INVOICE','CREATE_POLICY','UPDATE_POLICY','DELETE_POLICY','CREATE_SMUGGLE','UPDATE_SMUGGLE','DELETE_SMUGGLE','REBATE_TRIAL','REBATE_SAVE_TRIAL','GENERATE_BATCH','REVIEW_BATCH','UNREVIEW_BATCH','CONFIRM_BATCH','RISK_MARK_BATCH','RISK_UNMARK_BATCH','EXPORT_BATCH','DELETE_BATCH'];

  const colorMap = { CREATE: 'green', UPDATE: 'blue', DELETE: 'red', REVIEW: 'purple', CONFIRM: 'geekblue', RISK: 'orange', EXPORT: 'cyan', LOGIN: 'default', BATCH: 'magenta', REBATE: 'gold', MATCH: 'lime', IMPORT: 'volcano' };
  const tagColor = (a) => Object.keys(colorMap).find(k => a?.includes(k)) ? colorMap[Object.keys(colorMap).find(k => a?.includes(k))] : 'default';

  return (
    <div>
      <div className="page-header">
        <Title level={4} style={{ margin: 0 }}>审计日志</Title>
        <Tag>记录所有关键操作，可追溯全流程</Tag>
      </div>

      <Form layout="inline" style={{ marginBottom: 16 }} onFinish={v => { if (v.date_range) v.date_range = [v.date_range[0].format('YYYY-MM-DD'), v.date_range[1].format('YYYY-MM-DD')]; setQuery(v); setPage(1); }}>
        <Form.Item name="action"><Select placeholder="操作类型" allowClear style={{ width: 240 }} showSearch>{actions.map(a => <Option key={a}>{a}</Option>)}</Select></Form.Item>
        <Form.Item name="target_type"><Select placeholder="操作对象" allowClear style={{ width: 180 }}>{targets.map(t => <Option key={t}>{t}</Option>)}</Select></Form.Item>
        <Form.Item name="date_range"><RangePicker /></Form.Item>
        <Form.Item><Button type="primary" htmlType="submit" icon={<SearchOutlined />}>查询</Button></Form.Item>
      </Form>

      <Card size="small">
        <Table rowKey="id" loading={loading} size="middle" dataSource={list}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          columns={[
            { title: '时间', dataIndex: 'created_at', width: 180, fixed: 'left' },
            { title: '操作人', width: 130, render: (_, r) => r.user_name || '-' },
            { title: '角色', dataIndex: 'user_role', width: 110, render: v => v ? <Tag>{roleName(v) || v}</Tag> : '-' },
            { title: '操作', dataIndex: 'action', width: 200, render: a => <Tag color={tagColor(a)}>{a}</Tag> },
            { title: '对象类型', dataIndex: 'target_type', width: 130, render: t => t ? <Tag color="blue">{t}</Tag> : '-' },
            { title: '对象ID', dataIndex: 'target_id', width: 180, ellipsis: true },
            { title: '详情', dataIndex: 'detail', ellipsis: true },
            { title: 'IP', dataIndex: 'ip', width: 130 }
          ]}
        />
      </Card>
    </div>
  );
}
