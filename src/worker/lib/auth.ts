import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { WorkerEnv } from "./env";
import { sha256Hex, timingSafeEqualStr } from "./crypto";

export const ADMIN_COOKIE_NAME = "admin_token";

export function getAdminDisplayName(env: WorkerEnv): string {
  return env.ADMIN_DISPLAY_NAME?.trim() || "Danh Thai";
}

export async function getExpectedAdminToken(env: WorkerEnv): Promise<string | null> {
  const password = env.ADMIN_PASSWORD;
  if (!password) return null;
  return sha256Hex(password);
}

export async function isAdminRequest(c: Context<{ Bindings: WorkerEnv }>): Promise<boolean> {
  const expected = await getExpectedAdminToken(c.env);
  if (!expected) return false;
  const token = getCookie(c, ADMIN_COOKIE_NAME);
  if (!token) return false;
  return timingSafeEqualStr(token, expected);
}
