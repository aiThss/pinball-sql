-- Performance indexes, customer summary table, and total_text format normalization

UPDATE customers_deposits
SET total_text = 'Thẻ: ' || REPLACE(REPLACE(total_text, ' thẻ · ', ' | Bi: '), ' bi', '')
WHERE total_text LIKE '% thẻ · % bi';

CREATE TABLE IF NOT EXISTS customers_summary (
  phone TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  search_name TEXT NOT NULL DEFAULT '',
  active_deposits INTEGER NOT NULL DEFAULT 0,
  total_cards INTEGER NOT NULL DEFAULT 0,
  total_balls INTEGER NOT NULL DEFAULT 0,
  latest_status TEXT NOT NULL DEFAULT 'Đang gửi',
  latest_deposit_date TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_summary_active
  ON customers_summary (total_cards DESC, total_balls DESC)
  WHERE active_deposits > 0;

CREATE INDEX IF NOT EXISTS idx_customers_summary_lookup
  ON customers_summary (active_deposits DESC, latest_deposit_date DESC);

CREATE INDEX IF NOT EXISTS idx_customers_summary_search_name
  ON customers_summary (search_name, active_deposits DESC, latest_deposit_date DESC);

INSERT OR REPLACE INTO customers_summary (
  phone,
  full_name,
  search_name,
  active_deposits,
  total_cards,
  total_balls,
  latest_status,
  latest_deposit_date,
  updated_at
)
SELECT
  d.phone,
  COALESCE(
    (
      SELECT d2.full_name
      FROM customers_deposits d2
      WHERE d2.phone = d.phone AND d2.status != 'Đã hủy'
      ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.system_created_ms DESC, d2.id DESC
      LIMIT 1
    ),
    'Khách hàng'
  ) AS full_name,
  COALESCE(
    (
      SELECT d2.search_name
      FROM customers_deposits d2
      WHERE d2.phone = d.phone AND d2.status != 'Đã hủy'
      ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.system_created_ms DESC, d2.id DESC
      LIMIT 1
    ),
    ''
  ) AS search_name,
  COUNT(CASE WHEN d.status = 'Đang gửi' THEN 1 END) AS active_deposits,
  COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_cards ELSE 0 END), 0) AS total_cards,
  COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_balls ELSE 0 END), 0) AS total_balls,
  COALESCE(
    (
      SELECT d3.status
      FROM customers_deposits d3
      WHERE d3.phone = d.phone AND d3.status != 'Đã hủy'
      ORDER BY d3.deposit_date DESC, d3.deposit_time DESC, d3.created_at DESC, d3.system_created_ms DESC, d3.id DESC
      LIMIT 1
    ),
    'Đã hủy'
  ) AS latest_status,
  MAX(d.deposit_date) AS latest_deposit_date,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS updated_at
FROM customers_deposits d
WHERE d.status != 'Đã hủy' AND d.phone != ''
GROUP BY d.phone;
