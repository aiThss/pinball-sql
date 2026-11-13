import { Hono } from "hono";
import type { WorkerEnv } from "../lib/env";
import { getAdminDisplayName, isAdminRequest } from "../lib/auth";
import { dispatchTelegramWebhook } from "../lib/telegram";
import { getHanoiNow } from "../../lib/time";
import {
  createDepositSchema,
  normalizePhone,
  normalizeSearchText,
  STATUS_VALUES,
  updateDepositSchema,
} from "../../shared/validation";
import {
  createDeposit,
  deleteDepositRecord,
  type DepositRow,
  recalculateAllCustomers,
  serializeDeposits,
  ServiceError,
  updateDeposit,
} from "../lib/deposits-service";

export const depositsRoutes = new Hono<{ Bindings: WorkerEnv }>();

function getWaitUntil(c: { executionCtx?: { waitUntil: (promise: Promise<unknown>) => void } }): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return ctx ? ctx.waitUntil.bind(ctx) : undefined;
  } catch {
    return undefined;
  }
}

depositsRoutes.get("/lookup", async (c) => {
  const phoneQuery = (c.req.query("phone") || "").trim();
  const textQuery = (c.req.query("q") || "").trim();

  if (phoneQuery) {
    const cleaned = normalizePhone(phoneQuery);
    const digits = phoneQuery.replace(/\D/g, "");
    const searchPattern = cleaned.length >= 2 ? cleaned : digits;

    let exact = {
      found: false,
      phone: cleaned,
      fullName: "",
      activeDeposits: 0,
      totalCards: 0,
      totalBalls: 0,
    };

    if (cleaned.length >= 8) {
      const stats = await c.env.DB.prepare(
        `SELECT
          COUNT(CASE WHEN status = 'Đang gửi' THEN 1 END) AS active_deposits,
          COALESCE(SUM(CASE WHEN status = 'Đang gửi' THEN remaining_cards ELSE 0 END), 0) AS total_cards,
          COALESCE(SUM(CASE WHEN status = 'Đang gửi' THEN remaining_balls ELSE 0 END), 0) AS total_balls,
          (SELECT d2.full_name FROM customers_deposits d2 WHERE d2.phone = ? AND d2.status != 'Đã hủy' ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.id DESC LIMIT 1) AS full_name
        FROM customers_deposits
        WHERE phone = ? AND status != 'Đã hủy'`
      )
        .bind(cleaned, cleaned)
        .first<{
          active_deposits: number;
          total_cards: number;
          total_balls: number;
          full_name: string | null;
        }>();

      if (stats && (stats.full_name || stats.active_deposits > 0)) {
        exact = {
          found: stats.active_deposits > 0,
          phone: cleaned,
          fullName: stats.full_name || "",
          activeDeposits: stats.active_deposits,
          totalCards: stats.total_cards,
          totalBalls: stats.total_balls,
        };
      }
    }

    if (searchPattern.length < 2) {
      return c.json({ ...exact, suggestions: [] });
    }

    const suggestionsResult = await c.env.DB.prepare(
      `SELECT
        d.phone,
        (SELECT d2.full_name FROM customers_deposits d2 WHERE d2.phone = d.phone AND d2.status != 'Đã hủy' ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.id DESC LIMIT 1) AS fullName,
        COUNT(CASE WHEN d.status = 'Đang gửi' THEN 1 END) AS activeDeposits,
        COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_cards ELSE 0 END), 0) AS totalCards,
        COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_balls ELSE 0 END), 0) AS totalBalls,
        (SELECT d3.status FROM customers_deposits d3 WHERE d3.phone = d.phone ORDER BY d3.deposit_date DESC, d3.deposit_time DESC, d3.created_at DESC, d3.id DESC LIMIT 1) AS latestStatus,
        MAX(d.deposit_date) AS latestDepositDate
      FROM customers_deposits d
      WHERE d.phone LIKE ? AND d.status != 'Đã hủy'
      GROUP BY d.phone
      ORDER BY activeDeposits DESC, latestDepositDate DESC
      LIMIT 8`
    )
      .bind(`%${searchPattern}%`)
      .all();

    return c.json({
      ...exact,
      suggestions: suggestionsResult.results,
    });
  }

  if (textQuery) {
    const qDigits = textQuery.replace(/\D/g, "");
    const qName = normalizeSearchText(textQuery);
    const conditions: string[] = [];
    const params: string[] = [];

    if (qDigits.length >= 3) {
      conditions.push("d.phone LIKE ?");
      params.push(`%${qDigits}%`);
    }
    if (qName.length >= 2) {
      conditions.push("d.search_name LIKE ?");
      params.push(`%${qName}%`);
    }

    if (conditions.length === 0) {
      return c.json({
        found: false,
        phone: "",
        fullName: "",
        activeDeposits: 0,
        totalCards: 0,
        totalBalls: 0,
        suggestions: [],
      });
    }

    const whereClause = `(${conditions.join(" OR ")}) AND d.status != 'Đã hủy'`;
    const rows = await c.env.DB.prepare(
      `SELECT
        d.phone,
        (SELECT d2.full_name FROM customers_deposits d2 WHERE d2.phone = d.phone AND d2.status != 'Đã hủy' ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.id DESC LIMIT 1) AS fullName,
        COUNT(CASE WHEN d.status = 'Đang gửi' THEN 1 END) AS activeDeposits,
        COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_cards ELSE 0 END), 0) AS totalCards,
        COALESCE(SUM(CASE WHEN d.status = 'Đang gửi' THEN d.remaining_balls ELSE 0 END), 0) AS totalBalls,
        (SELECT d3.status FROM customers_deposits d3 WHERE d3.phone = d.phone ORDER BY d3.deposit_date DESC, d3.deposit_time DESC, d3.created_at DESC, d3.id DESC LIMIT 1) AS latestStatus,
        MAX(d.deposit_date) AS latestDepositDate
      FROM customers_deposits d
      WHERE ${whereClause}
      GROUP BY d.phone
      ORDER BY activeDeposits DESC, latestDepositDate DESC
      LIMIT 10`
    )
      .bind(...params)
      .all();

    return c.json({
      found: false,
      phone: "",
      fullName: "",
      activeDeposits: 0,
      totalCards: 0,
      totalBalls: 0,
      suggestions: rows.results,
    });
  }

  return c.json({
    found: false,
    phone: "",
    fullName: "",
    activeDeposits: 0,
    totalCards: 0,
    totalBalls: 0,
    suggestions: [],
  });
});

depositsRoutes.get("/summary", async (c) => {
  const today = getHanoiNow().date;

  const [totalsRow, todayRow, historyRow, customersResult] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
        COUNT(*) AS activeDeposits,
        COALESCE(SUM(remaining_cards), 0) AS totalCards,
        COALESCE(SUM(remaining_balls), 0) AS totalBalls
      FROM customers_deposits
      WHERE status = 'Đang gửi'`
    ).first<{ activeDeposits: number; totalCards: number; totalBalls: number }>(),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM customers_deposits WHERE deposit_date = ? AND status != 'Đã hủy'`
    )
      .bind(today)
      .first<{ cnt: number }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM deposit_history`).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT
        d.phone,
        (SELECT d2.full_name FROM customers_deposits d2 WHERE d2.phone = d.phone AND d2.status = 'Đang gửi' ORDER BY d2.deposit_date DESC, d2.deposit_time DESC, d2.created_at DESC, d2.id DESC LIMIT 1) AS fullName,
        COALESCE(SUM(d.remaining_cards), 0) AS totalCards,
        COALESCE(SUM(d.remaining_balls), 0) AS totalBalls
      FROM customers_deposits d
      WHERE d.status = 'Đang gửi' AND (d.remaining_cards > 0 OR d.remaining_balls > 0)
      GROUP BY d.phone
      ORDER BY totalCards DESC, totalBalls DESC`
    ).all<{ phone: string; fullName: string; totalCards: number; totalBalls: number }>(),
  ]);

  const activeCustomers = customersResult.results.map((row) => ({
    fullName: row.fullName,
    phone: row.phone,
    totalCards: row.totalCards,
    totalBalls: row.totalBalls,
  }));

  const cardRankings = activeCustomers
    .filter((row) => row.totalCards > 0)
    .map((row) => ({
      fullName: row.fullName,
      phone: row.phone,
      totalCards: row.totalCards,
    }));

  return c.json({
    activeDeposits: totalsRow?.activeDeposits ?? 0,
    totalCards: totalsRow?.totalCards ?? 0,
    totalBalls: totalsRow?.totalBalls ?? 0,
    todayDeposits: todayRow?.cnt ?? 0,
    historyEntries: historyRow?.cnt ?? 0,
    cardRankings,
    activeCustomers,
  });
});

depositsRoutes.post("/recalculate", async (c) => {
  const customersRecalculated = await recalculateAllCustomers(c.env.DB);
  return c.json({ ok: true, customersRecalculated });
});

depositsRoutes.get("/", async (c) => {
  const isAdmin = await isAdminRequest(c);
  const adminDisplayName = getAdminDisplayName(c.env);

  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1", 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(c.req.query("limit") || "50", 10) || 50));
  const offset = (page - 1) * limit;

  const name = (c.req.query("name") || "").trim();
  const phone = (c.req.query("phone") || "").trim();
  const date = (c.req.query("date") || "").trim();
  const status = (c.req.query("status") || "").trim();
  const includeHistory = isAdmin && c.req.query("includeHistory") === "true";

  const whereClauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (name) {
    whereClauses.push("search_name LIKE ?");
    bindings.push(`%${normalizeSearchText(name)}%`);
  }
  if (phone) {
    whereClauses.push("phone LIKE ?");
    bindings.push(`%${normalizePhone(phone)}%`);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    whereClauses.push("deposit_date = ?");
    bindings.push(date);
  }
  if ((STATUS_VALUES as readonly string[]).includes(status)) {
    whereClauses.push("status = ?");
    bindings.push(status);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const [countRow, rowsResult] = await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM customers_deposits ${whereSql}`)
      .bind(...bindings)
      .first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT * FROM customers_deposits ${whereSql}
      ORDER BY deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC
      LIMIT ? OFFSET ?`
    )
      .bind(...bindings, limit, offset)
      .all<DepositRow>(),
  ]);

  const total = countRow?.total ?? 0;
  const deposits = await serializeDeposits(
    c.env.DB,
    rowsResult.results,
    adminDisplayName,
    includeHistory
  );

  return c.json({
    deposits,
    total,
    page,
    limit,
    hasMore: offset + deposits.length < total,
  });
});

depositsRoutes.post("/", async (c) => {
  const isAdmin = await isAdminRequest(c);
  const adminDisplayName = getAdminDisplayName(c.env);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ message: "Dữ liệu gửi lên không hợp lệ." }, 400);
  }

  const parsed = createDepositSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return c.json({ message: firstIssue?.message || "Dữ liệu không hợp lệ." }, 400);
  }

  const idempotencyKey = c.req.header("x-idempotency-key")?.trim();

  try {
    const result = await createDeposit(c.env.DB, parsed.data, {
      isAdmin,
      adminDisplayName,
      idempotencyKey,
    });

    if (result.webhookPayload) {
      dispatchTelegramWebhook(c.env, result.webhookPayload, getWaitUntil(c));
    }

    return c.json(
      {
        deposit: result.deposit,
        ...(result.deduplicated ? { deduplicated: true } : {}),
      },
      result.deduplicated ? 200 : 201
    );
  } catch (err) {
    if (err instanceof ServiceError) {
      return c.json({ message: err.message }, err.status as 400 | 404 | 500);
    }
    throw err;
  }
});

depositsRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const isAdmin = await isAdminRequest(c);
  const adminDisplayName = getAdminDisplayName(c.env);

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ message: "Dữ liệu cập nhật không hợp lệ." }, 400);
  }

  const parsed = updateDepositSchema.safeParse(rawBody);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return c.json({ message: firstIssue?.message || "Dữ liệu cập nhật không hợp lệ." }, 400);
  }

  const sanitizedInput = isAdmin
    ? parsed.data
    : {
        actorName: parsed.data.actorName,
        fullName: parsed.data.fullName,
        phone: parsed.data.phone,
        cards: parsed.data.cards,
        balls: parsed.data.balls,
      };

  try {
    const result = await updateDeposit(c.env.DB, id, sanitizedInput, {
      allowDateEdit: isAdmin,
      adminDisplayName,
      includeHistory: isAdmin,
    });

    if (result.webhookPayload) {
      dispatchTelegramWebhook(c.env, result.webhookPayload, getWaitUntil(c));
    }

    return c.json({ deposit: result.deposit });
  } catch (err) {
    if (err instanceof ServiceError) {
      return c.json({ message: err.message }, err.status as 400 | 404 | 500);
    }
    throw err;
  }
});

depositsRoutes.delete("/:id", async (c) => {
  if (!(await isAdminRequest(c))) {
    return c.json({ message: "Unauthorized admin request." }, 403);
  }

  const id = c.req.param("id");

  try {
    const result = await deleteDepositRecord(c.env.DB, id);
    return c.json({
      ok: true,
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
