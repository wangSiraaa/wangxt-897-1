const dayjs = require('dayjs');

function formatDate(date, fmt = 'YYYY-MM-DD') {
  if (!date) return null;
  return dayjs(date).format(fmt);
}

function formatDateTime(date) {
  return formatDate(date, 'YYYY-MM-DD HH:mm:ss');
}

function now() {
  return dayjs().format('YYYY-MM-DD HH:mm:ss');
}

function today() {
  return dayjs().format('YYYY-MM-DD');
}

function isBetween(date, start, end) {
  const d = dayjs(date);
  return d.isAfter(dayjs(start).subtract(1, 'day')) && 
         d.isBefore(dayjs(end).add(1, 'day'));
}

function calcDateDiffDays(start, end) {
  return dayjs(end).diff(dayjs(start), 'day');
}

function toFixed(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return 0;
  return Number(Number(n).toFixed(digits));
}

function round(n, digits = 2) {
  return Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits);
}

function hash(obj) {
  const crypto = require('crypto');
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return crypto.createHash('md5').update(str).digest('hex');
}

function generateOrderNo(prefix) {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}${dayjs().format('YYYYMMDDHHmmss')}${rand}`;
}

module.exports = {
  formatDate,
  formatDateTime,
  now,
  today,
  isBetween,
  calcDateDiffDays,
  toFixed,
  round,
  hash,
  generateOrderNo
};
