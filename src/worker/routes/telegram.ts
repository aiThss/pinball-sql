import { Hono } from "hono";
import type { WorkerEnv } from "../lib/env";
import { getAdminDisplayName } from "../lib/auth";
import { dispatchTelegramWebhook, verifyTelegramInitData, type TelegramWebAppUser } from "../lib/telegram";
import { updateDepositSchema } from "../../shared/validation";
import {
  getDepositRowById,
  serializeDeposits,
  ServiceError,
  updateDeposit,
} from "../lib/deposits-service";

export const telegramRoutes = new Hono<{ Bindings: WorkerEnv }>();

function getActorFromTelegramUser(user: TelegramWebAppUser | null): string {
  if (!user) return "Telegram Admin";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  if (fullName) return fullName.slice(0, 60);
  if (user.username) return `@${user.username}`.slice(0, 60);
  return `Telegram #${user.id}`;
}

function getWaitUntil(c: { executionCtx?: { waitUntil: (promise: Promise<unknown>) => void } }): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return ctx ? ctx.waitUntil.bind(ctx) : undefined;
  } catch {
    return undefined;
  }
}

telegramRoutes.get("/deposits/:id", async (c) => {
  const initData = c.req.header("x-telegram-init-data") || "";
  const verified = await verifyTelegramInitData(initData, c.env);
  if (!verified.ok) {
    return c.json({ message: verified.error }, verified.status as 401 | 403 | 500);
  }

  const id = c.req.param("id");
  const row = await getDepositRowById(c.env.DB, id);
  if (!row) {
    return c.json({ message: "Không tìm thấy bản ghi." }, 404);
  }

  const [deposit] = await serializeDeposits(c.env.DB, [row], getAdminDisplayName(c.env), true);
  return c.json({ deposit });
});

telegramRoutes.patch("/deposits/:id", async (c) => {
  const initData = c.req.header("x-telegram-init-data") || "";
  const verified = await verifyTelegramInitData(initData, c.env);
  if (!verified.ok) {
    return c.json({ message: verified.error }, verified.status as 401 | 403 | 500);
  }

  let rawBody: Record<string, unknown>;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ message: "Dữ liệu cập nhật không hợp lệ." }, 400);
  }

  const actorName = getActorFromTelegramUser(verified.user);
  const parsed = updateDepositSchema.safeParse({
    ...rawBody,
    actorName,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return c.json({ message: firstIssue?.message || "Dữ liệu cập nhật không hợp lệ." }, 400);
  }

  const id = c.req.param("id");
  try {
    const result = await updateDeposit(c.env.DB, id, parsed.data, {
      allowDateEdit: true,
      adminDisplayName: getAdminDisplayName(c.env),
      includeHistory: true,
    });

    if (result.webhookPayload) {
      dispatchTelegramWebhook(c.env, result.webhookPayload, getWaitUntil(c));
    }

    return c.json({
      deposit: result.deposit,
      active: result.deposit.status === "Đang gửi",
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return c.json({ message: err.message }, err.status as 400 | 404 | 500);
    }
    throw err;
  }
});
