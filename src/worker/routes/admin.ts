import { Hono } from "hono";
import type { WorkerEnv } from "../lib/env";
import { getAdminDisplayName, isAdminRequest } from "../lib/auth";
import { buildRecordTimestamp, getHanoiNow } from "../../lib/time";
import {
  getDepositRowById,
  recalculateAllCustomers,
  serializeDeposits,
} from "../lib/deposits-service";

export const adminRoutes = new Hono<{ Bindings: WorkerEnv }>();

adminRoutes.use("*", async (c, next) => {
  if (!(await isAdminRequest(c))) {
    return c.json({ message: "Bạn chưa đăng nhập quyền Admin." }, 401);
  }
  await next();
});

adminRoutes.get("/dashboard", async (c) => {
  const adminDisplayName = getAdminDisplayName(c.env);
  const rawDate = (c.req.query("date") || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getHanoiNow().date;

  const dayStartUtc = buildRecordTimestamp(date, "00:00");
  const nextDayDate = new Date(`${date}T00:00:00+07:00`);
  nextDayDate.setUTCDate(nextDayDate.getUTCDate() + 1);
  const dayEndUtc = nextDayDate.toISOString();

  const [summaryRes, updatedCountRes, recentUpdatesRes, dailyTotalsRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS totalRecords,
        COUNT(DISTINCT phone) AS uniqueCustomers,
        COALESCE(SUM(CASE WHEN card_action = 'Gửi thẻ' THEN cards ELSE 0 END), 0) AS cardsDeposited,
        COALESCE(SUM(CASE WHEN ball_action = 'Gửi bi' THEN balls ELSE 0 END), 0) AS ballsDeposited,
        COALESCE(SUM(CASE WHEN card_action = 'Lấy thẻ' THEN cards ELSE 0 END), 0) AS cardsWithdrawn,
        COALESCE(SUM(CASE WHEN ball_action = 'Lấy bi' THEN balls ELSE 0 END), 0) AS ballsWithdrawn
      FROM customers_deposits
      WHERE deposit_date = ? AND status != 'Đã hủy'`
    ).bind(date),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt
      FROM deposit_history
      WHERE action = 'UPDATE' AND at >= ? AND at < ?`
    ).bind(dayStartUtc, dayEndUtc),
    c.env.DB.prepare(
      `SELECT
        h.id,
        h.deposit_id AS depositId,
        d.full_name AS fullName,
        d.phone,
        h.actor_name AS updatedByName,
        h.at AS updatedAt,
        h.content
      FROM deposit_history h
      JOIN customers_deposits d ON d.id = h.deposit_id
      WHERE h.action = 'UPDATE' AND h.actor_name != ?
      ORDER BY h.at DESC
      LIMIT 100`
    ).bind(adminDisplayName),
    c.env.DB.prepare(
      `SELECT
        CAST(id AS TEXT) AS id,
        full_name AS fullName,
        phone,
        records,
        cards_deposited AS cardsDeposited,
        balls_deposited AS ballsDeposited,
        cards_withdrawn AS cardsWithdrawn,
        balls_withdrawn AS ballsWithdrawn
      FROM customers_daily_deposits
      WHERE date = ?
      ORDER BY cards_deposited DESC, balls_deposited DESC, records DESC
      LIMIT 100`
    ).bind(date),
  ]);

  const summaryRow = summaryRes.results[0] as
    | {
        totalRecords: number;
        uniqueCustomers: number;
        cardsDeposited: number;
        ballsDeposited: number;
        cardsWithdrawn: number;
        ballsWithdrawn: number;
      }
    | undefined;
  const updatedCountRow = updatedCountRes.results[0] as { cnt: number } | undefined;

  return c.json({
    date,
    dateSummary: {
      totalRecords: summaryRow?.totalRecords ?? 0,
      uniqueCustomers: summaryRow?.uniqueCustomers ?? 0,
      cardsDeposited: summaryRow?.cardsDeposited ?? 0,
      ballsDeposited: summaryRow?.ballsDeposited ?? 0,
      cardsWithdrawn: summaryRow?.cardsWithdrawn ?? 0,
      ballsWithdrawn: summaryRow?.ballsWithdrawn ?? 0,
      recordsUpdated: updatedCountRow?.cnt ?? 0,
    },
    recentUpdates: recentUpdatesRes.results,
    customerDailyTotals: dailyTotalsRes.results,
  });
});

adminRoutes.get("/deposits/:id", async (c) => {
  const id = c.req.param("id");
  const adminDisplayName = getAdminDisplayName(c.env);
  const row = await getDepositRowById(c.env.DB, id);

  if (!row) {
    return c.json({ message: "Không tìm thấy bản ghi." }, 404);
  }

  const [deposit] = await serializeDeposits(c.env.DB, [row], adminDisplayName, true);
  return c.json({ deposit });
});

adminRoutes.get("/system", async (c) => {
  const pingStart = Date.now();
  const [depositsRes, historyRes, dailyRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS totalRecords,
        COALESCE(SUM(CASE WHEN status != 'Đã hủy' AND card_action = 'Gửi thẻ' THEN cards ELSE 0 END), 0) AS cardsDeposited,
        COALESCE(SUM(CASE WHEN status != 'Đã hủy' AND ball_action = 'Gửi bi' THEN balls ELSE 0 END), 0) AS ballsDeposited,
        COALESCE(SUM(CASE WHEN status != 'Đã hủy' AND card_action = 'Lấy thẻ' THEN cards ELSE 0 END), 0) AS cardsWithdrawn,
        COALESCE(SUM(CASE WHEN status != 'Đã hủy' AND ball_action = 'Lấy bi' THEN balls ELSE 0 END), 0) AS ballsWithdrawn,
        MIN(created_at) AS firstRecordAt,
        MAX(created_at) AS lastRecordAt
      FROM customers_deposits`
    ),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM deposit_history`),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM customers_daily_deposits`),
  ]);
  const databaseMs = Math.max(1, Date.now() - pingStart);

  const depositsAgg = depositsRes.results[0] as
    | {
        totalRecords: number;
        cardsDeposited: number;
        ballsDeposited: number;
        cardsWithdrawn: number;
        ballsWithdrawn: number;
        firstRecordAt: string | null;
        lastRecordAt: string | null;
      }
    | undefined;
  const historyAgg = historyRes.results[0] as { cnt: number } | undefined;
  const dailyAgg = dailyRes.results[0] as { cnt: number } | undefined;

  return c.json({
    checkedAt: new Date().toISOString(),
    databaseMs,
    totalRecords: depositsAgg?.totalRecords ?? 0,
    totalHistoryEntries: historyAgg?.cnt ?? 0,
    cardsDeposited: depositsAgg?.cardsDeposited ?? 0,
    ballsDeposited: depositsAgg?.ballsDeposited ?? 0,
    cardsWithdrawn: depositsAgg?.cardsWithdrawn ?? 0,
    ballsWithdrawn: depositsAgg?.ballsWithdrawn ?? 0,
    dailySummaryRecords: dailyAgg?.cnt ?? 0,
    firstRecordAt: depositsAgg?.firstRecordAt ?? null,
    lastRecordAt: depositsAgg?.lastRecordAt ?? null,
  });
});

adminRoutes.post("/system", async (c) => {
  const customersRecalculated = await recalculateAllCustomers(c.env.DB);
  return c.json({ ok: true, customersRecalculated });
});
