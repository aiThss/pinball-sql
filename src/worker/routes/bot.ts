import { Hono } from "hono";
import type { WorkerEnv } from "../lib/env";
import { isValidBotBearerToken } from "../lib/telegram";
import { getHanoiNow } from "../../lib/time";
import {
  deleteDepositRecord,
  ServiceError,
  undoHistoryEntry,
} from "../lib/deposits-service";

export const botRoutes = new Hono<{ Bindings: WorkerEnv }>();

botRoutes.use("*", async (c, next) => {
  if (!isValidBotBearerToken(c.env, c.req.header("authorization"))) {
    return c.json({ message: "Unauthorized bot request." }, 401);
  }
  await next();
});

botRoutes.get("/daily-report", async (c) => {
  const rawDate = (c.req.query("date") || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getHanoiNow().date;

  const rowsResult = await c.env.DB.prepare(
    `SELECT
      full_name AS fullName,
      phone,
      records,
      cards_deposited AS cardsDeposited,
      balls_deposited AS ballsDeposited,
      cards_withdrawn AS cardsWithdrawn,
      balls_withdrawn AS ballsWithdrawn
    FROM customers_daily_deposits
    WHERE date = ?
    ORDER BY cards_deposited DESC, balls_deposited DESC, records DESC`
  )
    .bind(date)
    .all<{
      fullName: string;
      phone: string;
      records: number;
      cardsDeposited: number;
      ballsDeposited: number;
      cardsWithdrawn: number;
      ballsWithdrawn: number;
    }>();

  let totalRecords = 0;
  let cardsDeposited = 0;
  let ballsDeposited = 0;
  for (const row of rowsResult.results) {
    totalRecords += row.records;
    cardsDeposited += row.cardsDeposited;
    ballsDeposited += row.ballsDeposited;
  }

  return c.json({
    date,
    totalRecords,
    uniqueCustomers: rowsResult.results.length,
    cardsDeposited,
    ballsDeposited,
    customers: rowsResult.results,
  });
});

botRoutes.delete("/deposits/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const result = await deleteDepositRecord(c.env.DB, id);
    return c.json({
      ok: true,
      id: result.id,
      fullName: result.fullName,
      restoredCards: result.restoredCards,
      restoredBalls: result.restoredBalls,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return c.json({ message: err.message }, err.status as 400 | 404 | 500);
    }
    throw err;
  }
});

botRoutes.delete("/deposits/:id/history/:historyId", async (c) => {
  const id = c.req.param("id");
  const historyId = c.req.param("historyId");
  try {
    const result = await undoHistoryEntry(c.env.DB, id, historyId);
    return c.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    if (err instanceof ServiceError) {
      return c.json({ message: err.message }, err.status as 400 | 404 | 500);
    }
    throw err;
  }
});
