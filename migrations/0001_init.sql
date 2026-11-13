-- Cloudflare D1 (SQLite) initial schema for Pinball Card & Ball Management
-- Do not include BEGIN/COMMIT statements; Wrangler / D1 migrations handle transactions automatically.

CREATE TABLE IF NOT EXISTS customers_deposits (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  search_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL,
  deposit_date TEXT NOT NULL,
  deposit_time TEXT NOT NULL,
  card_action TEXT NOT NULL CHECK (card_action IN ('Gửi thẻ', 'Lấy thẻ')),
  ball_action TEXT NOT NULL CHECK (ball_action IN ('Gửi bi', 'Lấy bi')),
  cards INTEGER NOT NULL DEFAULT 0 CHECK (cards >= 0),
  balls INTEGER NOT NULL DEFAULT 0 CHECK (balls >= 0),
  remaining_cards INTEGER NOT NULL DEFAULT 0 CHECK (remaining_cards >= 0),
  remaining_balls INTEGER NOT NULL DEFAULT 0 CHECK (remaining_balls >= 0),
  total_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Đang gửi' CHECK (status IN ('Đang gửi', 'Đã nhận lại', 'Đã đổi quà', 'Đã hủy')),
  created_by_name TEXT NOT NULL,
  updated_by_name TEXT NOT NULL,
  idempotency_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  system_created_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deposits_status_chron_desc
  ON customers_deposits (status, deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_phone_chron_asc
  ON customers_deposits (phone, deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_deposits_date_chron_desc
  ON customers_deposits (deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_phone_sys_created
  ON customers_deposits (phone, system_created_ms DESC);

CREATE INDEX IF NOT EXISTS idx_deposits_search_name
  ON customers_deposits (search_name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_idempotency_key
  ON customers_deposits (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS deposit_history (
  id TEXT PRIMARY KEY,
  deposit_id TEXT NOT NULL REFERENCES customers_deposits(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  at TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'SYSTEM')),
  content TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_history_deposit_seq
  ON deposit_history (deposit_id, seq ASC);

CREATE INDEX IF NOT EXISTS idx_history_updates_recent
  ON deposit_history (action, at DESC)
  WHERE action = 'UPDATE';

CREATE TABLE IF NOT EXISTS withdrawal_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  withdrawal_id TEXT NOT NULL REFERENCES customers_deposits(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL,
  cards INTEGER NOT NULL DEFAULT 0 CHECK (cards >= 0),
  balls INTEGER NOT NULL DEFAULT 0 CHECK (balls >= 0)
);

CREATE INDEX IF NOT EXISTS idx_allocations_withdrawal
  ON withdrawal_allocations (withdrawal_id);

CREATE INDEX IF NOT EXISTS idx_allocations_source
  ON withdrawal_allocations (source_id);

CREATE TABLE IF NOT EXISTS customers_daily_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  phone TEXT NOT NULL,
  full_name TEXT NOT NULL,
  records INTEGER NOT NULL DEFAULT 0,
  cards_deposited INTEGER NOT NULL DEFAULT 0,
  balls_deposited INTEGER NOT NULL DEFAULT 0,
  cards_withdrawn INTEGER NOT NULL DEFAULT 0,
  balls_withdrawn INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (date, phone)
);

CREATE INDEX IF NOT EXISTS idx_daily_date_totals
  ON customers_daily_deposits (date, cards_deposited DESC, balls_deposited DESC);
