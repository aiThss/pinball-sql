import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { WorkerEnv } from "./env";
import { sha256Hex, timingSafeEqualStr } from "./crypto";

export const ADMIN_COOKIE_NAME = "admin_token";

export function getAdminDisplayName(env: WorkerEnv): string {
  return env.ADMIN_DISPLAY_NAME?.trim() || "Danh Thai";
}

let cachedPassword: string | undefined;
let cachedPasswordHash: string | null = null;

export async function getExpectedAdminToken(env: WorkerEnv): Promise<string | null> {
  const password = env.ADMIN_PASSWORD;
  if (!password) return null;
  if (cachedPassword === password && cachedPasswordHash) {
    return cachedPasswordHash;
  }
  cachedPassword = password;
  cachedPasswordHash = await sha256Hex(password);
  return cachedPasswordHash;
}

export async function isAdminRequest(c: Context<{ Bindings: WorkerEnv }>): Promise<boolean> {
  const token = getCookie(c, ADMIN_COOKIE_NAME);
  if (!token) return false;
  const expected = await getExpectedAdminToken(c.env);
  if (!expected) return false;
  return timingSafeEqualStr(token, expected);
}
