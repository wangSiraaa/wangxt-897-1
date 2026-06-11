import axios from 'axios';
import { message } from 'antd';

const request = axios.create({ baseURL: '/', timeout: 60000 });

request.interceptors.request.use(config => {
  const token = localStorage.getItem('REBATE_TOKEN');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, err => Promise.reject(err));

request.interceptors.response.use(resp => resp.data, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('REBATE_TOKEN');
    localStorage.removeItem('REBATE_USER');
    if (!location.pathname.includes('/login')) location.href = '/login';
  }
  const msg = err.response?.data?.error || err.message || '请求失败';
  message.error(msg);
  return Promise.reject(err);
});

export const api = {
  auth: {
    login: data => request.post('/api/auth/login', data),
    me: () => request.get('/api/auth/me')
  },
  distributors: {
    list: params => request.get('/api/distributors', { params }),
    create: data => request.post('/api/distributors', data),
    update: (id, data) => request.put(`/api/distributors/${id}`, data),
    remove: id => request.delete(`/api/distributors/${id}`)
  },
  regionAuths: { list: params => request.get('/api/region-auths', { params }), create: data => request.post('/api/region-auths', data), remove: id => request.delete(`/api/region-auths/${id}`) },
  penaltyRules: { list: () => request.get('/api/penalty-rules'), create: data => request.post('/api/penalty-rules', data), remove: id => request.delete(`/api/penalty-rules/${id}`) },
  sales: {
    list: params => request.get('/api/sales', { params }),
    get: id => request.get(`/api/sales/${id}`),
    create: data => request.post('/api/sales', data),
    batchImport: items => request.post('/api/sales/batch-import', { items }),
    update: (id, data) => request.put(`/api/sales/${id}`, data),
    remove: id => request.delete(`/api/sales/${id}`)
  },
  payments: {
    list: params => request.get('/api/payments', { params }),
    create: data => request.post('/api/payments', data),
    match: data => request.post('/api/payments/match', data),
    remove: id => request.delete(`/api/payments/${id}`)
  },
  invoices: {
    list: params => request.get('/api/invoices', { params }),
    create: data => request.post('/api/invoices', data),
    remove: id => request.delete(`/api/invoices/${id}`)
  },
  policies: {
    list: params => request.get('/api/policies', { params }),
    get: id => request.get(`/api/policies/${id}`),
    create: data => request.post('/api/policies', data),
    update: (id, data) => request.put(`/api/policies/${id}`, data),
    remove: id => request.delete(`/api/policies/${id}`)
  },
  smuggle: {
    list: params => request.get('/api/smuggle', { params }),
    create: data => request.post('/api/smuggle', data),
    update: (id, data) => request.put(`/api/smuggle/${id}`, data),
    remove: id => request.delete(`/api/smuggle/${id}`)
  },
  rebate: {
    calculate: data => request.post('/api/rebate/calculate', data),
    calculateDist: (id, data) => request.post(`/api/rebate/calculate/${id}`, data),
    save: data => request.post('/api/rebate/save', data),
    trials: params => request.get('/api/rebate/trials', { params }),
    trial: id => request.get(`/api/rebate/trials/${id}`)
  },
  batches: {
    list: params => request.get('/api/batches', { params }),
    get: id => request.get(`/api/batches/${id}`),
    generate: data => request.post('/api/batches/generate', data),
    review: id => request.post(`/api/batches/${id}/review`),
    unreview: id => request.post(`/api/batches/${id}/unreview`),
    confirm: id => request.post(`/api/batches/${id}/confirm`),
    riskMark: (id, data) => request.post(`/api/batches/${id}/risk-mark`, data),
    riskUnmark: id => request.post(`/api/batches/${id}/risk-unmark`),
    exportUrl: id => `/api/batches/${id}/export`,
    remove: id => request.delete(`/api/batches/${id}`)
  },
  audit: { list: params => request.get('/api/audit', { params }) },
  notifications: {
    list: params => request.get('/api/notifications', { params }),
    unreadCount: () => request.get('/api/notifications/unread-count'),
    read: id => request.post(`/api/notifications/${id}/read`),
    readAll: () => request.post('/api/notifications/read-all'),
    generatePolicyMatch: data => request.post('/api/notifications/generate-policy-match', data),
    checkUnpaidBlock: data => request.post('/api/notifications/check-unpaid-block', data),
    remove: id => request.delete(`/api/notifications/${id}`)
  },
  health: () => request.get('/health')
};

export default request;
