import type { WorkerEnv } from "./env";
import { hmacSha256Hex, hmacSha256Raw, timingSafeEqualStr } from "./crypto";

const encoder = new TextEncoder();

export interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export function getTelegramBotToken(env: WorkerEnv): string {
  return (env.TELEGRAM_BOT_TOKEN || env.BOT_TOKEN || "").trim();
}

export function getTelegramWebhookUrl(env: WorkerEnv): string {
  return (
    env.TELEGRAM_BOT_WEBHOOK_URL ||
    env.PINBALL_BOT_WEBHOOK_URL ||
    env.BOT_WEBHOOK_URL ||
    ""
  ).trim();
}

export function isValidBotBearerToken(env: WorkerEnv, authorization?: string): boolean {
  const expected = getTelegramBotToken(env);
  if (!expected || !authorization) return false;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return timingSafeEqualStr(match[1].trim(), expected);
}

export async function verifyTelegramInitData(
  initData: string,
  env: WorkerEnv,
  maxAgeSeconds = 6 * 60 * 60
): Promise<
  | { ok: true; user: TelegramWebAppUser | null; authDate: number }
  | { ok: false; status: number; error: string }
> {
  const botToken = getTelegramBotToken(env);
  if (!botToken) {
    return { ok: false, status: 500, error: "Chưa cấu hình TELEGRAM_BOT_TOKEN" };
  }

  const trimmed = initData.trim();
  if (!trimmed) {
    return { ok: false, status: 401, error: "Thiếu dữ liệu xác thực Telegram" };
  }

  const params = new URLSearchParams(trimmed);
  const hash = (params.get("hash") || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, status: 401, error: "Chữ ký Telegram không hợp lệ" };
  }

  const authDateRaw = Number(params.get("auth_date") || "0");
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDateRaw) || authDateRaw <= 0) {
    return { ok: false, status: 401, error: "Thiếu auth_date Telegram" };
  }
  if (nowSec - authDateRaw > maxAgeSeconds || authDateRaw > nowSec + 300) {
    return { ok: false, status: 401, error: "Phiên Telegram Mini App đã hết hạn, vui lòng mở lại từ bot" };
  }

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      pairs.push(`${key}=${value}`);
    }
  }
  pairs.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const dataCheckString = pairs.join("\n");

  const secretKey = await hmacSha256Raw(encoder.encode("WebAppData"), botToken);
  const computedHash = await hmacSha256Hex(secretKey, dataCheckString);
  if (!timingSafeEqualStr(computedHash, hash)) {
    return { ok: false, status: 401, error: "Xác thực chữ ký Telegram thất bại" };
  }

  let user: TelegramWebAppUser | null = null;
  const userRaw = params.get("user");
  if (userRaw) {
    try {
      const parsed = JSON.parse(userRaw) as TelegramWebAppUser;
      if (parsed && typeof parsed.id === "number") {
        user = parsed;
      }
    } catch {
      return { ok: false, status: 401, error: "Dữ liệu tài khoản Telegram không hợp lệ" };
    }
  }

  const allowedIdsRaw = (env.TELEGRAM_ADMIN_USER_IDS || "").trim();
  if (allowedIdsRaw) {
    const allowedSet = new Set(
      allowedIdsRaw
        .split(/[,\s]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    );
    if (!user || !allowedSet.has(String(user.id))) {
      return { ok: false, status: 403, error: "Tài khoản Telegram không có quyền chỉnh sửa" };
    }
  }

  return { ok: true, user, authDate: authDateRaw };
}

export function dispatchTelegramWebhook(
  env: WorkerEnv,
  payload: Record<string, unknown>,
  waitUntil?: (promise: Promise<unknown>) => void
): void {
  const webhookUrl = getTelegramWebhookUrl(env);
  if (!webhookUrl) return;

  const botToken = getTelegramBotToken(env);
  const task = (async () => {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (botToken) {
        headers.Authorization = `Bearer ${botToken}`;
      }
      await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.error("[telegram-webhook] dispatch error:", err);
    }
  })();

  if (waitUntil) {
    waitUntil(task);
  }
}
