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
  type HistoryRow,
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

    const exactStmt =
      cleaned.length >= 8
        ? c.env.DB.prepare(
            `SELECT phone, full_name, active_deposits, total_cards, total_balls
            FROM customers_summary
            WHERE phone = ?
            LIMIT 1`
          ).bind(cleaned)
        : null;

    const suggestionsStmt =
      searchPattern.length >= 2
        ? c.env.DB.prepare(
            `SELECT
              phone,
              full_name AS fullName,
              active_deposits AS activeDeposits,
              total_cards AS totalCards,
              total_balls AS totalBalls,
              latest_status AS latestStatus,
              latest_deposit_date AS latestDepositDate
            FROM customers_summary
            WHERE phone LIKE ?
            ORDER BY active_deposits DESC, latest_deposit_date DESC
            LIMIT 8`
          ).bind(`%${searchPattern}%`)
        : null;

    if (exactStmt && suggestionsStmt) {
      const [exactRes, suggestionsRes] = await c.env.DB.batch([exactStmt, suggestionsStmt]);
      const stats = exactRes.results[0] as
        | {
            phone: string;
            full_name: string;
            active_deposits: number;
            total_cards: number;
            total_balls: number;
          }
        | undefined;
      if (stats) {
        exact = {
          found: stats.active_deposits > 0,
          phone: cleaned,
          fullName: stats.full_name || "",
          activeDeposits: stats.active_deposits,
          totalCards: stats.total_cards,
          totalBalls: stats.total_balls,
        };
      }
      return c.json({
        ...exact,
        suggestions: suggestionsRes.results,
      });
    }

    if (exactStmt) {
      const stats = await exactStmt.first<{
        phone: string;
        full_name: string;
        active_deposits: number;
        total_cards: number;
        total_balls: number;
      }>();
      if (stats) {
        exact = {
          found: stats.active_deposits > 0,
          phone: cleaned,
          fullName: stats.full_name || "",
          activeDeposits: stats.active_deposits,
          totalCards: stats.total_cards,
          totalBalls: stats.total_balls,
        };
      }
      return c.json({ ...exact, suggestions: [] });
    }

    if (suggestionsStmt) {
      const suggestionsRes = await suggestionsStmt.all();
      return c.json({
        ...exact,
        suggestions: suggestionsRes.results,
      });
    }

    return c.json({ ...exact, suggestions: [] });
  }

  if (textQuery) {
    const qDigits = textQuery.replace(/\D/g, "");
    const qName = normalizeSearchText(textQuery);
    const conditions: string[] = [];
    const params: string[] = [];

    if (qDigits.length >= 3) {
      conditions.push("phone LIKE ?");
      params.push(`%${qDigits}%`);
    }
    if (qName.length >= 2) {
      conditions.push("search_name LIKE ?");
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

    const whereClause = conditions.join(" OR ");
    const rows = await c.env.DB.prepare(
      `SELECT
        phone,
        full_name AS fullName,
        active_deposits AS activeDeposits,
        total_cards AS totalCards,
        total_balls AS totalBalls,
        latest_status AS latestStatus,
        latest_deposit_date AS latestDepositDate
      FROM customers_summary
      WHERE ${whereClause}
      ORDER BY active_deposits DESC, latest_deposit_date DESC
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

  const [customersRes, todayRes, historyRes] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT
        phone,
        full_name AS fullName,
        active_deposits AS activeDeposits,
        total_cards AS totalCards,
        total_balls AS totalBalls
      FROM customers_summary
      WHERE active_deposits > 0
      ORDER BY total_cards DESC, total_balls DESC`
    ),
    c.env.DB.prepare(
      `SELECT COUNT(*) AS cnt FROM customers_deposits WHERE deposit_date = ? AND status != 'Đã hủy'`
    ).bind(today),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM deposit_history`),
  ]);

  const summaryRows = customersRes.results as Array<{
    phone: string;
    fullName: string;
    activeDeposits: number;
    totalCards: number;
    totalBalls: number;
  }>;

  let activeDeposits = 0;
  let totalCards = 0;
  let totalBalls = 0;
  const activeCustomers: Array<{
    fullName: string;
    phone: string;
    totalCards: number;
    totalBalls: number;
  }> = [];
  const cardRankings: Array<{
    fullName: string;
    phone: string;
    totalCards: number;
  }> = [];

  for (const row of summaryRows) {
    activeDeposits += row.activeDeposits;
    totalCards += row.totalCards;
    totalBalls += row.totalBalls;
    if (row.totalCards > 0 || row.totalBalls > 0) {
      activeCustomers.push({
        fullName: row.fullName,
        phone: row.phone,
        totalCards: row.totalCards,
        totalBalls: row.totalBalls,
      });
      if (row.totalCards > 0) {
        cardRankings.push({
          fullName: row.fullName,
          phone: row.phone,
          totalCards: row.totalCards,
        });
      }
    }
  }

  const todayRow = todayRes.results[0] as { cnt: number } | undefined;
  const historyRow = historyRes.results[0] as { cnt: number } | undefined;

  return c.json({
    activeDeposits,
    totalCards,
    totalBalls,
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
  const historySql = includeHistory
    ? `SELECT id, deposit_id, seq, at, actor_name, action, content, before_json, after_json
       FROM deposit_history
       WHERE deposit_id IN (
         SELECT id FROM customers_deposits ${whereSql}
         ORDER BY deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC
         LIMIT ? OFFSET ?
       )
       ORDER BY deposit_id ASC, seq ASC`
    : `SELECT id, deposit_id, seq, at, actor_name, action, content, NULL AS before_json, NULL AS after_json
       FROM deposit_history
       WHERE deposit_id IN (
         SELECT id FROM customers_deposits ${whereSql}
         ORDER BY deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC
         LIMIT ? OFFSET ?
       ) AND +action = 'UPDATE'
       ORDER BY deposit_id ASC, seq ASC`;

  const [countRes, rowsRes, historyRes] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM customers_deposits ${whereSql}`).bind(...bindings),
    c.env.DB.prepare(
      `SELECT * FROM customers_deposits ${whereSql}
      ORDER BY deposit_date DESC, deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC
      LIMIT ? OFFSET ?`
    ).bind(...bindings, limit, offset),
    c.env.DB.prepare(historySql).bind(...bindings, limit, offset),
  ]);

  const countRow = countRes.results[0] as { total: number } | undefined;
  const total = countRow?.total ?? 0;
  const rows = rowsRes.results as DepositRow[];
  const historyRows = historyRes.results as HistoryRow[];
  const deposits = await serializeDeposits(
    c.env.DB,
    rows,
    adminDisplayName,
    includeHistory,
    historyRows
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
