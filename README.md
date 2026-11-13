# Ký gửi PINBALL (Cloudflare Workers + D1)

Ứng dụng quản lý gửi/lấy **thẻ** và **bi** tại quầy Pinball, được tối ưu và chuyển đổi từ Next.js + MongoDB sang **Vite + React 19 SPA + Hono API Worker + Cloudflare D1 (SQLite)**.

## Kiến trúc triển khai

- **Frontend**: Vite + React 19 + Tailwind CSS v4 (PWA hỗ trợ `/`, `/admin`, `/install`, `/telegram/record`).
- **Backend API**: Hono chạy trên Cloudflare Workers (`src/worker/index.ts`), cấu hình Static Assets `not_found_handling: "single-page-application"` và `run_worker_first: ["/api/*"]`.
- **Database**: Cloudflare D1 (`migrations/0001_init.sql`) gồm 4 bảng:
  - `customers_deposits`: Giao dịch gửi/lấy thẻ & bi, số dư còn lại theo từng lô (FIFO), `total_text`, `search_name`, `idempotency_key`.
  - `deposit_history`: Lịch sử tạo/cập nhật kèm snapshot `before_json` / `after_json` hỗ trợ hoàn tác từ Telegram Bot.
  - `withdrawal_allocations`: Ánh xạ khấu trừ FIFO giữa phiếu lấy và lô gửi nguồn.
  - `customers_daily_deposits`: Tổng hợp theo ngày/khách phục vụ báo cáo nhanh và đối soát.

## Phát triển cục bộ (Local)

1. Cài dependencies và tạo file bí mật local:

```powershell
npm install
Copy-Item .dev.vars.example .dev.vars
```

2. Áp dụng migration SQL lên D1 local:

```powershell
npm run db:migrate:local
```

3. Chạy dev server (Vite + Cloudflare Worker + D1 local):

```powershell
npm run dev
```

## Chuyển dữ liệu từ MongoDB sang D1

Nếu đang có dữ liệu xuất từ MongoDB (`mongoexport` NDJSON hoặc JSON array của `customers_deposits`):

```powershell
node scripts/migrate-mongo-to-d1.mjs --input customers_deposits.json --output migrations/seed_from_mongo.sql
npx wrangler d1 execute pinball-db --local --file=migrations/seed_from_mongo.sql
```

## Deploy lên Cloudflare Workers + D1

1. Tạo database D1 (chạy 1 lần) và cập nhật `database_id` trong `wrangler.jsonc`:

```powershell
npx wrangler d1 create pinball-db
```

2. Chạy migration lên D1 remote:

```powershell
npm run db:migrate:remote
```

3. Nạp các biến môi trường bí mật:

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_BOT_WEBHOOK_URL
npx wrangler secret put TELEGRAM_ADMIN_USER_IDS
```

4. Build và deploy:

```powershell
npm run deploy
```

## Kiểm tra chất lượng

- `npm run typecheck`: kiểm tra TypeScript (client + worker)
- `npm run lint`: kiểm tra ESLint
- `npm run build`: build SPA + Worker bundle
