const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'rebate.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let SQL = null;
let db = null;

function rowsToObjects(columns, valuesRows) {
  const rows = [];
  for (const values of valuesRows) {
    const obj = {};
    for (let i = 0; i < columns.length; i++) {
      obj[columns[i]] = values[i];
    }
    rows.push(obj);
  }
  return rows;
}

function createStatement(_sql) {
  const stmt = {
    sql: _sql,
    _db: null,
    _prepared: null,
    run(...params) {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      try {
        const prep = this._db._inner.prepare(this.sql);
        if (flatParams.length) {
          prep.bind(flatParams.map(p => p === null || p === undefined ? null : p));
        }
        prep.step();
        prep.free();
        return {
          changes: this._db._inner.getRowsModified() || 0,
          lastInsertRowid: this._db._inner.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] || null
        };
      } catch (e) {
        throw new Error(`SQL Error (${this.sql}): ${e.message}, params=${JSON.stringify(flatParams)}`);
      } finally {
        this._db._markDirty();
      }
    },
    get(...params) {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const all = this.all(...flatParams);
      return all.length ? all[0] : undefined;
    },
    all(...params) {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const safeParams = flatParams.map(p => p === null || p === undefined ? null : p);
      try {
        const results = this._db._inner.exec(this.sql, safeParams);
        if (!results.length) return [];
        return rowsToObjects(results[0].columns, results[0].values);
      } catch (e) {
        throw new Error(`SQL Error (${this.sql}): ${e.message}, params=${JSON.stringify(flatParams)}`);
      }
    }
  };
  return stmt;
}

function createDbWrapper(innerDb) {
  const wrapper = {
    _inner: innerDb,
    _dirty: false,
    _lastPersist: Date.now(),
    _markDirty() {
      this._dirty = true;
      const now = Date.now();
      if (now - this._lastPersist > 2000) {
        this._persist();
      }
    },
    _persist() {
      try {
        const data = this._inner.export();
        const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        const tmpPath = dbPath + '.tmp';
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, dbPath);
        this._dirty = false;
        this._lastPersist = Date.now();
      } catch (e) {
        console.error('[DB] Persist failed:', e.message);
      }
    },
    pragma(stmt) {
      try {
        this._inner.exec('PRAGMA ' + stmt);
      } catch (e) {
        // some pragmas are not supported in sql.js, ignore
      }
      return [];
    },
    exec(sql) {
      try {
        const statements = sql.split(/;\s*(?=CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|PRAGMA|BEGIN|COMMIT|ROLLBACK|WITH|SELECT)/g)
          .map(s => s.trim()).filter(Boolean);
        for (const s of statements) {
          if (s) this._inner.exec(s + (s.endsWith(';') ? '' : ';'));
        }
        this._markDirty();
      } catch (e) {
        throw new Error(`exec Error: ${e.message}\nSQL: ${sql.substring(0, 300)}`);
      }
    },
    prepare(sql) {
      const stmt = createStatement(sql);
      stmt._db = this;
      return stmt;
    },
    transaction(fn) {
      const self = this;
      return function txnWrapped(...args) {
        self._inner.exec('BEGIN');
        try {
          const result = fn.apply(self, args);
          self._inner.exec('COMMIT');
          self._markDirty();
          return result;
        } catch (e) {
          try { self._inner.exec('ROLLBACK'); } catch (_) {}
          throw e;
        }
      };
    },
    close() {
      this._persist();
      try { this._inner.close(); } catch (_) {}
    },
    onExit() {
      if (this._dirty) this._persist();
    }
  };
  return wrapper;
}

let _initPromise = null;

async function initDb(forceNew = false) {
  if (_initPromise && !forceNew) return _initPromise;
  _initPromise = (async () => {
    SQL = await initSqlJs();
    let inner;
    if (!forceNew && fs.existsSync(dbPath)) {
      try {
        const buf = fs.readFileSync(dbPath);
        inner = new SQL.Database(new Uint8Array(buf));
      } catch (e) {
        console.warn('[DB] Corrupt db file, recreating:', e.message);
        fs.renameSync(dbPath, dbPath + '.bak.' + Date.now());
        inner = new SQL.Database();
      }
    } else {
      inner = new SQL.Database();
    }
    const wrapper = createDbWrapper(inner);
    wrapper.pragma('journal_mode = WAL');
    wrapper.pragma('foreign_keys = ON');
    initTables(wrapper);
    wrapper._persist();
    db = wrapper;
    process.on('beforeExit', () => wrapper.onExit());
    process.on('SIGINT', () => { wrapper.onExit(); process.exit(0); });
    return wrapper;
  })();
  return _initPromise;
}

function initTables(dbConn) {
  const sqlScript = `
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      real_name TEXT,
      role TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS distributors (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      contact TEXT,
      phone TEXT,
      region TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS region_auths (
      id TEXT PRIMARY KEY,
      distributor_id TEXT NOT NULL,
      region TEXT NOT NULL,
      product_category TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales_orders (
      id TEXT PRIMARY KEY,
      order_no TEXT UNIQUE NOT NULL,
      distributor_id TEXT NOT NULL,
      order_date TEXT NOT NULL,
      product_name TEXT NOT NULL,
      product_category TEXT,
      quantity INTEGER NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      paid_amount REAL NOT NULL DEFAULT 0,
      region TEXT,
      status TEXT DEFAULT 'pending',
      batch_id TEXT,
      import_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      pay_no TEXT UNIQUE NOT NULL,
      distributor_id TEXT NOT NULL,
      pay_date TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      pay_method TEXT,
      remark TEXT,
      matched_order_ids TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_no TEXT UNIQUE NOT NULL,
      sales_order_id TEXT NOT NULL,
      distributor_id TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      invoice_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'issued',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rebate_policies (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      product_category TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      base_condition REAL DEFAULT 0,
      calculation_type TEXT DEFAULT 'ladder',
      description TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS policy_ladders (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL,
      min_rate REAL NOT NULL DEFAULT 0,
      max_rate REAL NOT NULL DEFAULT 100,
      rebate_rate REAL NOT NULL DEFAULT 0,
      bonus_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS smuggle_records (
      id TEXT PRIMARY KEY,
      sales_order_id TEXT NOT NULL,
      distributor_id TEXT NOT NULL,
      report_date TEXT NOT NULL,
      smuggle_region TEXT NOT NULL,
      smuggle_amount REAL NOT NULL DEFAULT 0,
      penalty_rate REAL NOT NULL DEFAULT 0,
      penalty_amount REAL NOT NULL DEFAULT 0,
      remark TEXT,
      status TEXT DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS penalty_rules (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      smuggle_level TEXT,
      penalty_rate REAL NOT NULL DEFAULT 0,
      fixed_penalty REAL DEFAULT 0,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rebate_trials (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      distributor_id TEXT NOT NULL,
      policy_id TEXT,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      input_snapshot TEXT NOT NULL,
      sales_total REAL DEFAULT 0,
      paid_total REAL DEFAULT 0,
      achievement_rate REAL DEFAULT 0,
      base_rebate REAL DEFAULT 0,
      ladder_rebate REAL DEFAULT 0,
      smuggle_penalty REAL DEFAULT 0,
      final_rebate REAL DEFAULT 0,
      detail_json TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settlement_batches (
      id TEXT PRIMARY KEY,
      batch_no TEXT UNIQUE NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      distributor_id TEXT NOT NULL,
      policy_id TEXT,
      sales_count INTEGER DEFAULT 0,
      sales_total REAL DEFAULT 0,
      paid_total REAL DEFAULT 0,
      achievement_rate REAL DEFAULT 0,
      base_rebate REAL DEFAULT 0,
      ladder_rebate REAL DEFAULT 0,
      smuggle_penalty REAL DEFAULT 0,
      final_rebate REAL DEFAULT 0,
      status TEXT DEFAULT 'draft',
      trial_id TEXT,
      sales_order_ids TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      risk_mark INTEGER DEFAULT 0,
      risk_reason TEXT,
      risk_marked_by TEXT,
      risk_marked_at TEXT,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      before_data TEXT,
      after_data TEXT,
      detail TEXT,
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS batch_locks (
      batch_id TEXT PRIMARY KEY,
      locked_by TEXT,
      locked_at TEXT,
      lock_reason TEXT
    );
  `;
  dbConn.exec(sqlScript);
}

module.exports = {
  initDb,
  getDb: () => db,
  dbPath,
};
