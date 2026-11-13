export interface WorkerEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  ADMIN_PASSWORD?: string;
  ADMIN_DISPLAY_NAME?: string;
  TELEGRAM_BOT_WEBHOOK_URL?: string;
  PINBALL_BOT_WEBHOOK_URL?: string;
  BOT_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  BOT_TOKEN?: string;
  TELEGRAM_ADMIN_USER_IDS?: string;
}
