import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { WorkerEnv } from "../lib/env";
import { ADMIN_COOKIE_NAME, getAdminDisplayName, getExpectedAdminToken, isAdminRequest } from "../lib/auth";
import { sha256Hex, timingSafeEqualStr } from "../lib/crypto";

export const authRoutes = new Hono<{ Bindings: WorkerEnv }>();

authRoutes.get("/me", async (c) => {
  const authorized = await isAdminRequest(c);
  if (!authorized) {
    return c.json({ authorized: false });
  }
  return c.json({
    authorized: true,
    adminDisplayName: getAdminDisplayName(c.env),
  });
});

authRoutes.post("/login", async (c) => {
  const expected = await getExpectedAdminToken(c.env);
  if (!expected) {
    return c.json({ message: "Chưa cấu hình ADMIN_PASSWORD trên máy chủ." }, 500);
  }

  let body: { password?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ message: "Dữ liệu đăng nhập không hợp lệ." }, 400);
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return c.json({ message: "Vui lòng nhập mật khẩu." }, 400);
  }

  const actual = await sha256Hex(password);
  if (!timingSafeEqualStr(actual, expected)) {
    return c.json({ message: "Mật khẩu không đúng." }, 401);
  }

  const isHttps = new URL(c.req.url).protocol === "https:";
  setCookie(c, ADMIN_COOKIE_NAME, expected, {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: isHttps,
  });

  return c.json({ success: true });
});

authRoutes.post("/logout", (c) => {
  const isHttps = new URL(c.req.url).protocol === "https:";
  deleteCookie(c, ADMIN_COOKIE_NAME, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isHttps,
  });
  return c.json({ success: true });
});
