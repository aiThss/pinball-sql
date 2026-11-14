import type {
  BallActionType,
  CardActionType,
  DepositDTO,
  DepositHistoryItem,
  DepositHistorySnapshot,
  DepositStatus,
  HistoryAction,
} from "../../shared/types";
import { normalizePhone, normalizeSearchText, type CreateDepositInput, type UpdateDepositInput } from "../../shared/validation";
import { buildRecordTimestamp, formatDate, getHanoiNow } from "../../lib/time";
import { generateId } from "./crypto";

export interface DepositRow {
  id: string;
  full_name: string;
  search_name: string;
  phone: string;
  deposit_date: string;
  deposit_time: string;
  card_action: CardActionType;
  ball_action: BallActionType;
  cards: number;
  balls: number;
  remaining_cards: number;
  remaining_balls: number;
  total_text: string;
  status: DepositStatus;
  created_by_name: string;
  updated_by_name: string;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  system_created_ms: number;
}

export interface HistoryRow {
  id: string;
  deposit_id: string;
  seq: number;
  at: string;
  actor_name: string;
  action: HistoryAction;
  content: string;
  before_json: string | null;
  after_json: string | null;
}

export class ServiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function isValidRecordId(id: string): boolean {
  return /^[0-9a-zA-Z_-]{8,64}$/.test(id.trim());
}

export function formatTotalText(cards: number, balls: number): string {
  return `Thẻ: ${Math.max(0, cards)} | Bi: ${Math.max(0, balls)}`;
}

function parseSnapshot(raw: string | null): DepositHistorySnapshot | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as DepositHistorySnapshot;
  } catch {
    return undefined;
  }
}

function mapHistoryRow(row: HistoryRow): DepositHistoryItem {
  const item: DepositHistoryItem = {
    id: row.id,
    at: row.at,
    actorName: row.actor_name,
    action: row.action,
    content: row.content,
  };
  const before = parseSnapshot(row.before_json);
  const after = parseSnapshot(row.after_json);
  if (before) item.before = before;
  if (after) item.after = after;
  return item;
}

function chunkIds(ids: string[], size = 80): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function execBatchChunked(
  db: D1Database,
  statements: D1PreparedStatement[],
  chunkSize = 100
): Promise<void> {
  if (statements.length === 0) return;
  if (statements.length <= chunkSize) {
    await db.batch(statements);
    return;
  }
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

function compareAscii(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDepositsChronAsc(a: DepositRow, b: DepositRow): number {
  return (
    compareAscii(a.deposit_date, b.deposit_date) ||
    compareAscii(a.deposit_time, b.deposit_time) ||
    compareAscii(a.created_at, b.created_at) ||
    a.system_created_ms - b.system_created_ms ||
    compareAscii(a.id, b.id)
  );
}

function mapDepositDto(
  row: DepositRow,
  fetchedEntries: DepositHistoryItem[],
  adminDisplayName: string,
  includeHistory: boolean
): DepositDTO {
  const updates = fetchedEntries.filter(
    (entry) => entry.action === "UPDATE" && entry.actorName !== adminDisplayName
  );
  const latestUpdate = updates.length > 0 ? updates[updates.length - 1] : null;

  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    depositDate: row.deposit_date,
    depositTime: row.deposit_time,
    cardAction: row.card_action,
    ballAction: row.ball_action,
    cards: row.cards,
    balls: row.balls,
    remainingCards: row.remaining_cards,
    remainingBalls: row.remaining_balls,
    totalText: row.total_text,
    status: row.status,
    createdBy: { displayName: row.created_by_name },
    updatedBy: { displayName: row.updated_by_name },
    createdByName: row.created_by_name,
    updatedByName: row.updated_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestUpdate,
    updates,
    history: includeHistory ? fetchedEntries : [],
  };
}

export async function serializeDeposits(
  db: D1Database,
  rows: DepositRow[],
  adminDisplayName: string,
  includeHistory: boolean,
  prefetchedHistory?: HistoryRow[]
): Promise<DepositDTO[]> {
  if (rows.length === 0) return [];

  const historyByDeposit = new Map<string, DepositHistoryItem[]>();

  if (prefetchedHistory !== undefined) {
    for (const h of prefetchedHistory) {
      const list = historyByDeposit.get(h.deposit_id) ?? [];
      list.push(mapHistoryRow(h));
      historyByDeposit.set(h.deposit_id, list);
    }
  } else {
    const depositIds = rows.map((r) => r.id);
    for (const chunk of chunkIds(depositIds)) {
      const placeholders = chunk.map(() => "?").join(", ");
      const sql = includeHistory
        ? `SELECT id, deposit_id, seq, at, actor_name, action, content, before_json, after_json FROM deposit_history WHERE deposit_id IN (${placeholders}) ORDER BY deposit_id ASC, seq ASC`
        : `SELECT id, deposit_id, seq, at, actor_name, action, content, NULL AS before_json, NULL AS after_json FROM deposit_history WHERE deposit_id IN (${placeholders}) AND +action = 'UPDATE' ORDER BY deposit_id ASC, seq ASC`;
      const result = await db.prepare(sql).bind(...chunk).all<HistoryRow>();
      for (const h of result.results) {
        const list = historyByDeposit.get(h.deposit_id) ?? [];
        list.push(mapHistoryRow(h));
        historyByDeposit.set(h.deposit_id, list);
      }
    }
  }

  return rows.map((row) =>
    mapDepositDto(row, historyByDeposit.get(row.id) ?? [], adminDisplayName, includeHistory)
  );
}

export async function getDepositRowById(db: D1Database, id: string): Promise<DepositRow | null> {
  if (!isValidRecordId(id)) return null;
  const row = await db
    .prepare("SELECT * FROM customers_deposits WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DepositRow>();
  return row ?? null;
}

interface ComputedState {
  id: string;
  remC: number;
  remB: number;
  status: DepositStatus;
  totalText: string;
  allocations: Array<{ sourceId: string; cards: number; balls: number }>;
}

interface CustomerMutationPlan {
  sortedRows: DepositRow[];
  computed: ComputedState[];
  computedById: Map<string, ComputedState>;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  updateStatements: D1PreparedStatement[];
  summaryStatement: D1PreparedStatement;
  dailyStatements: D1PreparedStatement[];
}

function buildCustomerMutationPlan(
  db: D1Database,
  phone: string,
  rawRows: DepositRow[],
  options: {
    skipUpdateIds?: Set<string>;
    datesToSync?: Set<string>;
    nowIso?: string;
  } = {}
): CustomerMutationPlan {
  const sortedRows = [...rawRows].sort(compareDepositsChronAsc);
  const nowIso = options.nowIso ?? new Date().toISOString();

  interface OpenLot {
    index: number;
    id: string;
    remC: number;
    remB: number;
    status: DepositStatus;
  }

  const openLots: OpenLot[] = [];
  const computed: ComputedState[] = [];
  let runningCards = 0;
  let runningBalls = 0;

  for (let i = 0; i < sortedRows.length; i += 1) {
    const row = sortedRows[i];

    if (row.status === "Đã hủy" || row.status === "Đã đổi quà") {
      computed.push({
        id: row.id,
        remC: 0,
        remB: 0,
        status: row.status,
        totalText: formatTotalText(runningCards, runningBalls),
        allocations: [],
      });
      continue;
    }

    const allocMap = new Map<string, { cards: number; balls: number }>();

    if (row.card_action === "Lấy thẻ" && row.cards > 0) {
      let needCards = row.cards;
      for (const lot of openLots) {
        if (needCards <= 0) break;
        if (lot.remC <= 0) continue;
        const take = Math.min(lot.remC, needCards);
        lot.remC -= take;
        needCards -= take;
        runningCards = Math.max(0, runningCards - take);
        computed[lot.index].remC = lot.remC;
        if (lot.remC === 0 && lot.remB === 0) {
          lot.status = "Đã nhận lại";
          computed[lot.index].status = "Đã nhận lại";
        }
        const entry = allocMap.get(lot.id) ?? { cards: 0, balls: 0 };
        entry.cards += take;
        allocMap.set(lot.id, entry);
      }
    }

    if (row.ball_action === "Lấy bi" && row.balls > 0) {
      let needBalls = row.balls;
      for (const lot of openLots) {
        if (needBalls <= 0) break;
        if (lot.remB <= 0) continue;
        const take = Math.min(lot.remB, needBalls);
        lot.remB -= take;
        needBalls -= take;
        runningBalls = Math.max(0, runningBalls - take);
        computed[lot.index].remB = lot.remB;
        if (lot.remC === 0 && lot.remB === 0) {
          lot.status = "Đã nhận lại";
          computed[lot.index].status = "Đã nhận lại";
        }
        const entry = allocMap.get(lot.id) ?? { cards: 0, balls: 0 };
        entry.balls += take;
        allocMap.set(lot.id, entry);
      }
    }

    const ownRemC = row.card_action === "Gửi thẻ" ? row.cards : 0;
    const ownRemB = row.ball_action === "Gửi bi" ? row.balls : 0;
    runningCards += ownRemC;
    runningBalls += ownRemB;

    const ownStatus: DepositStatus = ownRemC > 0 || ownRemB > 0 ? "Đang gửi" : "Đã nhận lại";
    computed.push({
      id: row.id,
      remC: ownRemC,
      remB: ownRemB,
      status: ownStatus,
      totalText: formatTotalText(runningCards, runningBalls),
      allocations: Array.from(allocMap.entries()).map(([sourceId, qty]) => ({
        sourceId,
        cards: qty.cards,
        balls: qty.balls,
      })),
    });

    if (ownStatus === "Đang gửi") {
      openLots.push({
        index: i,
        id: row.id,
        remC: ownRemC,
        remB: ownRemB,
        status: ownStatus,
      });
    }
  }

  const computedById = new Map<string, ComputedState>();
  const updateStatements: D1PreparedStatement[] = [];
  let activeDeposits = 0;
  let totalCards = 0;
  let totalBalls = 0;
  let latestNonCancelledIndex = -1;

  for (let i = 0; i < sortedRows.length; i += 1) {
    const prev = sortedRows[i];
    const next = computed[i];
    computedById.set(next.id, next);

    if (next.status !== "Đã hủy") {
      latestNonCancelledIndex = i;
    }
    if (next.status === "Đang gửi") {
      activeDeposits += 1;
      totalCards += next.remC;
      totalBalls += next.remB;
    }

    if (
      !options.skipUpdateIds?.has(next.id) &&
      (prev.remaining_cards !== next.remC ||
        prev.remaining_balls !== next.remB ||
        prev.status !== next.status ||
        prev.total_text !== next.totalText)
    ) {
      updateStatements.push(
        db
          .prepare(
            "UPDATE customers_deposits SET remaining_cards = ?, remaining_balls = ?, status = ?, total_text = ? WHERE id = ?"
          )
          .bind(next.remC, next.remB, next.status, next.totalText, next.id)
      );
    }
  }

  let summaryStatement: D1PreparedStatement;
  if (latestNonCancelledIndex === -1) {
    summaryStatement = db.prepare("DELETE FROM customers_summary WHERE phone = ?").bind(phone);
  } else {
    const latestRow = sortedRows[latestNonCancelledIndex];
    const latestComputed = computed[latestNonCancelledIndex];
    summaryStatement = db
      .prepare(
        `INSERT INTO customers_summary (
          phone, full_name, search_name, active_deposits, total_cards, total_balls,
          latest_status, latest_deposit_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(phone) DO UPDATE SET
          full_name = excluded.full_name,
          search_name = excluded.search_name,
          active_deposits = excluded.active_deposits,
          total_cards = excluded.total_cards,
          total_balls = excluded.total_balls,
          latest_status = excluded.latest_status,
          latest_deposit_date = excluded.latest_deposit_date,
          updated_at = excluded.updated_at`
      )
      .bind(
        phone,
        latestRow.full_name || "Khách hàng",
        latestRow.search_name || normalizeSearchText(latestRow.full_name || ""),
        activeDeposits,
        totalCards,
        totalBalls,
        latestComputed.status,
        latestRow.deposit_date,
        nowIso
      );
  }

  const dailyStatements: D1PreparedStatement[] = [];
  if (options.datesToSync && options.datesToSync.size > 0) {
    for (const date of options.datesToSync) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

      let records = 0;
      let cardsDeposited = 0;
      let ballsDeposited = 0;
      let cardsWithdrawn = 0;
      let ballsWithdrawn = 0;
      let latestFullName = "Khách hàng";

      for (let i = 0; i < sortedRows.length; i += 1) {
        const row = sortedRows[i];
        const comp = computed[i];
        if (row.deposit_date !== date || comp.status === "Đã hủy") continue;

        records += 1;
        latestFullName = row.full_name || latestFullName;
        if (row.card_action === "Gửi thẻ") cardsDeposited += row.cards;
        else cardsWithdrawn += row.cards;
        if (row.ball_action === "Gửi bi") ballsDeposited += row.balls;
        else ballsWithdrawn += row.balls;
      }

      if (records === 0) {
        dailyStatements.push(
          db
            .prepare("DELETE FROM customers_daily_deposits WHERE date = ? AND phone = ?")
            .bind(date, phone)
        );
      } else {
        dailyStatements.push(
          db
            .prepare(
              `INSERT INTO customers_daily_deposits (date, phone, full_name, records, cards_deposited, balls_deposited, cards_withdrawn, balls_withdrawn, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(date, phone) DO UPDATE SET
                full_name = excluded.full_name,
                records = excluded.records,
                cards_deposited = excluded.cards_deposited,
                balls_deposited = excluded.balls_deposited,
                cards_withdrawn = excluded.cards_withdrawn,
                balls_withdrawn = excluded.balls_withdrawn,
                updated_at = excluded.updated_at`
            )
            .bind(
              date,
              phone,
              latestFullName,
              records,
              cardsDeposited,
              ballsDeposited,
              cardsWithdrawn,
              ballsWithdrawn,
              nowIso
            )
        );
      }
    }
  }

  return {
    sortedRows,
    computed,
    computedById,
    activeDeposits,
    totalCards,
    totalBalls,
    updateStatements,
    summaryStatement,
    dailyStatements,
  };
}

export async function rebuildDailyTotalsForKeys(
  db: D1Database,
  keys: Array<{ date: string; phone: string }>
): Promise<void> {
  const uniqueKeys = new Map<string, { date: string; phone: string }>();
  for (const item of keys) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(item.date) && item.phone) {
      uniqueKeys.set(`${item.date}::${item.phone}`, item);
    }
  }

  if (uniqueKeys.size === 0) return;

  const statements: D1PreparedStatement[] = [];
  const nowIso = new Date().toISOString();

  for (const { date, phone } of uniqueKeys.values()) {
    const agg = await db
      .prepare(
        `SELECT
          COUNT(*) AS records,
          COALESCE(SUM(CASE WHEN card_action = 'Gửi thẻ' THEN cards ELSE 0 END), 0) AS cards_deposited,
          COALESCE(SUM(CASE WHEN ball_action = 'Gửi bi' THEN balls ELSE 0 END), 0) AS balls_deposited,
          COALESCE(SUM(CASE WHEN card_action = 'Lấy thẻ' THEN cards ELSE 0 END), 0) AS cards_withdrawn,
          COALESCE(SUM(CASE WHEN ball_action = 'Lấy bi' THEN balls ELSE 0 END), 0) AS balls_withdrawn
        FROM customers_deposits
        WHERE deposit_date = ? AND phone = ? AND status != 'Đã hủy'`
      )
      .bind(date, phone)
      .first<{
        records: number;
        cards_deposited: number;
        balls_deposited: number;
        cards_withdrawn: number;
        balls_withdrawn: number;
      }>();

    if (!agg || agg.records === 0) {
      statements.push(
        db
          .prepare("DELETE FROM customers_daily_deposits WHERE date = ? AND phone = ?")
          .bind(date, phone)
      );
      continue;
    }

    const latest = await db
      .prepare(
        `SELECT full_name
        FROM customers_deposits
        WHERE deposit_date = ? AND phone = ? AND status != 'Đã hủy'
        ORDER BY deposit_time DESC, created_at DESC, system_created_ms DESC, id DESC
        LIMIT 1`
      )
      .bind(date, phone)
      .first<{ full_name: string }>();

    statements.push(
      db
        .prepare(
          `INSERT INTO customers_daily_deposits (date, phone, full_name, records, cards_deposited, balls_deposited, cards_withdrawn, balls_withdrawn, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, phone) DO UPDATE SET
            full_name = excluded.full_name,
            records = excluded.records,
            cards_deposited = excluded.cards_deposited,
            balls_deposited = excluded.balls_deposited,
            cards_withdrawn = excluded.cards_withdrawn,
            balls_withdrawn = excluded.balls_withdrawn,
            updated_at = excluded.updated_at`
        )
        .bind(
          date,
          phone,
          latest?.full_name || "Khách hàng",
          agg.records,
          agg.cards_deposited,
          agg.balls_deposited,
          agg.cards_withdrawn,
          agg.balls_withdrawn,
          nowIso
        )
    );
  }

  await execBatchChunked(db, statements);
}

export async function recalculateCustomerDepositTotals(db: D1Database, phone: string): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const result = await db
    .prepare(
      `SELECT *
      FROM customers_deposits
      WHERE phone = ?
      ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
    )
    .bind(normalizedPhone)
    .all<DepositRow>();

  const rows = result.results;
  if (rows.length === 0) {
    await db.prepare("DELETE FROM customers_summary WHERE phone = ?").bind(normalizedPhone).run();
    return;
  }

  const plan = buildCustomerMutationPlan(db, normalizedPhone, rows);
  await execBatchChunked(db, [...plan.updateStatements, plan.summaryStatement]);
}

export async function recalculateAllCustomers(db: D1Database): Promise<number> {
  const allRowsResult = await db
    .prepare(
      `SELECT *
      FROM customers_deposits
      ORDER BY phone ASC, deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
    )
    .all<DepositRow>();

  const rowsByPhone = new Map<string, DepositRow[]>();
  for (const row of allRowsResult.results) {
    const normalized = normalizePhone(row.phone);
    if (!normalized) continue;
    const list = rowsByPhone.get(normalized) ?? [];
    list.push(row);
    rowsByPhone.set(normalized, list);
  }

  const nowIso = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM customers_summary"),
    db.prepare("DELETE FROM customers_daily_deposits"),
  ];

  for (const [phone, rows] of rowsByPhone.entries()) {
    const dates = new Set(rows.map((r) => r.deposit_date).filter(Boolean));
    const plan = buildCustomerMutationPlan(db, phone, rows, { datesToSync: dates, nowIso });
    statements.push(...plan.updateStatements, plan.summaryStatement, ...plan.dailyStatements);
  }

  await execBatchChunked(db, statements);
  return rowsByPhone.size;
}

export interface CreateDepositResult {
  deposit: DepositDTO;
  deduplicated: boolean;
  webhookPayload?: Record<string, unknown>;
}

export async function createDeposit(
  db: D1Database,
  input: CreateDepositInput,
  options: {
    isAdmin: boolean;
    adminDisplayName: string;
    idempotencyKey?: string;
  }
): Promise<CreateDepositResult> {
  const now = new Date();
  const hanoiNow = getHanoiNow(now);
  const depositDate = options.isAdmin && input.depositDate ? input.depositDate : hanoiNow.date;
  const depositTime = options.isAdmin && input.depositTime ? input.depositTime : hanoiNow.time;
  const idempotencyKey = options.idempotencyKey?.trim() || null;

  const phoneRowsStmt = db
    .prepare(
      `SELECT * FROM customers_deposits
      WHERE phone = ?
      ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
    )
    .bind(input.phone);

  let existingRows: DepositRow[];
  if (idempotencyKey) {
    const [phoneRes, idempRes] = await db.batch([
      phoneRowsStmt,
      db
        .prepare("SELECT * FROM customers_deposits WHERE idempotency_key = ? LIMIT 1")
        .bind(idempotencyKey),
    ]);
    const existingByKey = (idempRes.results[0] as DepositRow | undefined) ?? null;
    if (existingByKey) {
      const [serialized] = await serializeDeposits(db, [existingByKey], options.adminDisplayName, options.isAdmin);
      return { deposit: serialized, deduplicated: true };
    }
    existingRows = phoneRes.results as DepositRow[];
  } else {
    const phoneRes = await phoneRowsStmt.all<DepositRow>();
    existingRows = phoneRes.results;
  }

  const nowMs = now.getTime();
  const duplicate = existingRows.find(
    (row) =>
      row.system_created_ms >= nowMs - 15_000 &&
      row.card_action === input.cardAction &&
      row.ball_action === input.ballAction &&
      row.cards === input.cards &&
      row.balls === input.balls &&
      row.created_by_name === input.actorName &&
      row.status !== "Đã hủy"
  );
  if (duplicate) {
    const [serialized] = await serializeDeposits(db, [duplicate], options.adminDisplayName, options.isAdmin);
    return { deposit: serialized, deduplicated: true };
  }

  const cardsToTake = input.cardAction === "Lấy thẻ" ? input.cards : 0;
  const ballsToTake = input.ballAction === "Lấy bi" ? input.balls : 0;

  if (cardsToTake > 0 || ballsToTake > 0) {
    let availCards = 0;
    let availBalls = 0;
    for (const row of existingRows) {
      if (row.status === "Đang gửi") {
        availCards += row.remaining_cards;
        availBalls += row.remaining_balls;
      }
    }

    if (cardsToTake > availCards) {
      throw new ServiceError(
        400,
        `Khách chỉ còn ${availCards} thẻ đang gửi, không thể lấy ${cardsToTake} thẻ.`
      );
    }
    if (ballsToTake > availBalls) {
      throw new ServiceError(
        400,
        `Khách chỉ còn ${availBalls} bi đang gửi, không thể lấy ${ballsToTake} bi.`
      );
    }
  }

  const id = generateId();
  const historyId = generateId();
  const createdAt = buildRecordTimestamp(depositDate, depositTime, now);
  const nowIso = now.toISOString();
  const initialRemainingCards = input.cardAction === "Gửi thẻ" ? input.cards : 0;
  const initialRemainingBalls = input.ballAction === "Gửi bi" ? input.balls : 0;
  const initialStatus: DepositStatus =
    initialRemainingCards > 0 || initialRemainingBalls > 0 ? "Đang gửi" : "Đã nhận lại";
  const searchName = normalizeSearchText(input.fullName);

  const actionSummaryParts: string[] = [];
  if (input.cards > 0) actionSummaryParts.push(`${input.cardAction} ${input.cards}`);
  if (input.balls > 0) actionSummaryParts.push(`${input.ballAction} ${input.balls}`);
  const historyContent = `Tạo mới: ${actionSummaryParts.join(" + ")}`;

  const newRow: DepositRow = {
    id,
    full_name: input.fullName,
    search_name: searchName,
    phone: input.phone,
    deposit_date: depositDate,
    deposit_time: depositTime,
    card_action: input.cardAction,
    ball_action: input.ballAction,
    cards: input.cards,
    balls: input.balls,
    remaining_cards: initialRemainingCards,
    remaining_balls: initialRemainingBalls,
    total_text: formatTotalText(initialRemainingCards, initialRemainingBalls),
    status: initialStatus,
    created_by_name: input.actorName,
    updated_by_name: input.actorName,
    idempotency_key: idempotencyKey,
    created_at: createdAt,
    updated_at: nowIso,
    system_created_ms: nowMs,
  };

  const plan = buildCustomerMutationPlan(db, input.phone, [...existingRows, newRow], {
    skipUpdateIds: new Set([id]),
    datesToSync: new Set([depositDate]),
    nowIso,
  });

  const newComputed = plan.computedById.get(id)!;
  newRow.remaining_cards = newComputed.remC;
  newRow.remaining_balls = newComputed.remB;
  newRow.status = newComputed.status;
  newRow.total_text = newComputed.totalText;

  const writeStatements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO customers_deposits (
          id, full_name, search_name, phone, deposit_date, deposit_time,
          card_action, ball_action, cards, balls, remaining_cards, remaining_balls,
          total_text, status, created_by_name, updated_by_name, idempotency_key,
          created_at, updated_at, system_created_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newRow.id,
        newRow.full_name,
        newRow.search_name,
        newRow.phone,
        newRow.deposit_date,
        newRow.deposit_time,
        newRow.card_action,
        newRow.ball_action,
        newRow.cards,
        newRow.balls,
        newRow.remaining_cards,
        newRow.remaining_balls,
        newRow.total_text,
        newRow.status,
        newRow.created_by_name,
        newRow.updated_by_name,
        newRow.idempotency_key,
        newRow.created_at,
        newRow.updated_at,
        newRow.system_created_ms
      ),
    db
      .prepare(
        `INSERT INTO deposit_history (id, deposit_id, seq, at, actor_name, action, content, before_json, after_json)
        VALUES (?, ?, 0, ?, ?, 'CREATE', ?, NULL, NULL)`
      )
      .bind(historyId, id, createdAt, input.actorName, historyContent),
  ];

  for (const alloc of newComputed.allocations) {
    writeStatements.push(
      db
        .prepare(
          "INSERT INTO withdrawal_allocations (withdrawal_id, source_id, cards, balls) VALUES (?, ?, ?, ?)"
        )
        .bind(id, alloc.sourceId, alloc.cards, alloc.balls)
    );
  }

  writeStatements.push(...plan.updateStatements, ...plan.dailyStatements, plan.summaryStatement);

  try {
    await execBatchChunked(db, writeStatements);
  } catch (err) {
    if (idempotencyKey && err instanceof Error && /UNIQUE constraint/i.test(err.message)) {
      const raceRow = await db
        .prepare("SELECT * FROM customers_deposits WHERE idempotency_key = ? LIMIT 1")
        .bind(idempotencyKey)
        .first<DepositRow>();
      if (raceRow) {
        const [serialized] = await serializeDeposits(db, [raceRow], options.adminDisplayName, options.isAdmin);
        return { deposit: serialized, deduplicated: true };
      }
    }
    throw err;
  }

  const createHistoryItem: DepositHistoryItem = {
    id: historyId,
    at: createdAt,
    actorName: input.actorName,
    action: "CREATE",
    content: historyContent,
  };
  const serialized = mapDepositDto(
    newRow,
    options.isAdmin ? [createHistoryItem] : [],
    options.adminDisplayName,
    options.isAdmin
  );

  const actionTypes: string[] = [];
  if (input.cards > 0) actionTypes.push(`${input.cardAction} (${input.cards})`);
  if (input.balls > 0) actionTypes.push(`${input.ballAction} (${input.balls})`);

  return {
    deposit: serialized,
    deduplicated: false,
    webhookPayload: {
      id,
      title: `${input.fullName} (${input.phone})`,
      type: `${actionTypes.join(" + ")} (Bởi ${input.actorName} lúc ${depositTime})`,
      fullName: input.fullName,
      phone: input.phone,
      cards: input.cards,
      balls: input.balls,
      cardAction: input.cardAction === "Lấy thẻ" ? "Lấy" : "Gửi",
      ballAction: input.ballAction === "Lấy bi" ? "Lấy" : "Gửi",
      actorName: input.actorName,
      depositTime,
      depositDate,
      totalCards: plan.totalCards,
      totalBalls: plan.totalBalls,
      totalText: formatTotalText(plan.totalCards, plan.totalBalls),
    },
  };
}

export async function updateDeposit(
  db: D1Database,
  id: string,
  input: UpdateDepositInput,
  options: {
    allowDateEdit: boolean;
    adminDisplayName: string;
    includeHistory?: boolean;
  }
): Promise<{
  deposit: DepositDTO;
  webhookPayload?: Record<string, unknown>;
}> {
  if (!isValidRecordId(id)) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const includeHistory = options.includeHistory ?? true;

  const [phoneRowsRes, seqRes] = await db.batch([
    db
      .prepare(
        `SELECT * FROM customers_deposits
        WHERE phone = (SELECT phone FROM customers_deposits WHERE id = ?)
        ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
      )
      .bind(id),
    db
      .prepare("SELECT COALESCE(MAX(seq), -1) AS max_seq FROM deposit_history WHERE deposit_id = ?")
      .bind(id),
  ]);

  const existingPhoneRows = phoneRowsRes.results as DepositRow[];
  const existing = existingPhoneRows.find((row) => row.id === id);
  if (!existing) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const nextFullName = input.fullName ?? existing.full_name;
  const nextPhone = input.phone ?? existing.phone;
  const nextCards = input.cards ?? existing.cards;
  const nextBalls = input.balls ?? existing.balls;
  const nextStatus = input.status ?? existing.status;
  const nextDate = options.allowDateEdit && input.depositDate ? input.depositDate : existing.deposit_date;
  const nextTime = options.allowDateEdit && input.depositTime ? input.depositTime : existing.deposit_time;

  if (nextCards === 0 && nextBalls === 0) {
    throw new ServiceError(400, "Số thẻ hoặc số bi phải lớn hơn 0.");
  }

  const changes: string[] = [];
  const beforeSnapshot: DepositHistorySnapshot = {};
  const afterSnapshot: DepositHistorySnapshot = {};

  if (nextFullName !== existing.full_name) {
    changes.push(`Tên: ${existing.full_name} → ${nextFullName}`);
    beforeSnapshot.fullName = existing.full_name;
    afterSnapshot.fullName = nextFullName;
  }
  if (nextPhone !== existing.phone) {
    changes.push(`SĐT: ${existing.phone} → ${nextPhone}`);
    beforeSnapshot.phone = existing.phone;
    afterSnapshot.phone = nextPhone;
  }
  if (nextCards !== existing.cards) {
    changes.push(`Thẻ: ${existing.cards} → ${nextCards}`);
    beforeSnapshot.cards = existing.cards;
    afterSnapshot.cards = nextCards;
  }
  if (nextBalls !== existing.balls) {
    changes.push(`Bi: ${existing.balls} → ${nextBalls}`);
    beforeSnapshot.balls = existing.balls;
    afterSnapshot.balls = nextBalls;
  }
  if (nextStatus !== existing.status) {
    changes.push(`Trạng thái: ${existing.status} → ${nextStatus}`);
    beforeSnapshot.status = existing.status;
    afterSnapshot.status = nextStatus;
  }
  if (nextDate !== existing.deposit_date) {
    changes.push(`Ngày: ${formatDate(existing.deposit_date)} → ${formatDate(nextDate)}`);
    beforeSnapshot.depositDate = existing.deposit_date;
    afterSnapshot.depositDate = nextDate;
  }
  if (nextTime !== existing.deposit_time) {
    changes.push(`Giờ: ${existing.deposit_time} → ${nextTime}`);
    beforeSnapshot.depositTime = existing.deposit_time;
    afterSnapshot.depositTime = nextTime;
  }

  if (changes.length === 0) {
    const [unchanged] = await serializeDeposits(
      db,
      [existing],
      options.adminDisplayName,
      includeHistory
    );
    return { deposit: unchanged };
  }

  const nowIso = new Date().toISOString();
  const nextCreatedAt =
    nextDate !== existing.deposit_date || nextTime !== existing.deposit_time
      ? buildRecordTimestamp(nextDate, nextTime)
      : existing.created_at;

  const maxSeq = (seqRes.results[0] as { max_seq: number } | undefined)?.max_seq ?? -1;
  const nextSeq = maxSeq + 1;
  const historyId = generateId();
  const content = changes.join(", ");

  const nextRow: DepositRow = {
    ...existing,
    full_name: nextFullName,
    search_name: normalizeSearchText(nextFullName),
    phone: nextPhone,
    deposit_date: nextDate,
    deposit_time: nextTime,
    cards: nextCards,
    balls: nextBalls,
    status: nextStatus,
    updated_by_name: input.actorName,
    created_at: nextCreatedAt,
    updated_at: nowIso,
  };

  let targetPlan: CustomerMutationPlan;
  const extraStatements: D1PreparedStatement[] = [];

  if (nextPhone === existing.phone) {
    const nextRows = existingPhoneRows.map((r) => (r.id === id ? nextRow : r));
    targetPlan = buildCustomerMutationPlan(db, nextPhone, nextRows, {
      skipUpdateIds: new Set([id]),
      datesToSync: new Set([existing.deposit_date, nextDate]),
      nowIso,
    });
  } else {
    const nextPhoneRes = await db
      .prepare(
        `SELECT * FROM customers_deposits
        WHERE phone = ?
        ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
      )
      .bind(nextPhone)
      .all<DepositRow>();

    const oldPlan = buildCustomerMutationPlan(
      db,
      existing.phone,
      existingPhoneRows.filter((r) => r.id !== id),
      { datesToSync: new Set([existing.deposit_date]), nowIso }
    );
    targetPlan = buildCustomerMutationPlan(db, nextPhone, [...nextPhoneRes.results, nextRow], {
      skipUpdateIds: new Set([id]),
      datesToSync: new Set([nextDate]),
      nowIso,
    });
    extraStatements.push(...oldPlan.updateStatements, ...oldPlan.dailyStatements, oldPlan.summaryStatement);
  }

  const nextComputed = targetPlan.computedById.get(id)!;
  nextRow.remaining_cards = nextComputed.remC;
  nextRow.remaining_balls = nextComputed.remB;
  nextRow.status = nextComputed.status;
  nextRow.total_text = nextComputed.totalText;

  const writeStatements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE customers_deposits
        SET full_name = ?, search_name = ?, phone = ?, deposit_date = ?, deposit_time = ?,
            cards = ?, balls = ?, remaining_cards = ?, remaining_balls = ?, status = ?, total_text = ?,
            updated_by_name = ?, created_at = ?, updated_at = ?
        WHERE id = ?`
      )
      .bind(
        nextRow.full_name,
        nextRow.search_name,
        nextRow.phone,
        nextRow.deposit_date,
        nextRow.deposit_time,
        nextRow.cards,
        nextRow.balls,
        nextRow.remaining_cards,
        nextRow.remaining_balls,
        nextRow.status,
        nextRow.total_text,
        nextRow.updated_by_name,
        nextRow.created_at,
        nextRow.updated_at,
        id
      ),
    db
      .prepare(
        `INSERT INTO deposit_history (id, deposit_id, seq, at, actor_name, action, content, before_json, after_json)
        VALUES (?, ?, ?, ?, ?, 'UPDATE', ?, ?, ?)`
      )
      .bind(
        historyId,
        id,
        nextSeq,
        nowIso,
        input.actorName,
        content,
        JSON.stringify(beforeSnapshot),
        JSON.stringify(afterSnapshot)
      ),
  ];

  if (nextRow.card_action === "Lấy thẻ" || nextRow.ball_action === "Lấy bi") {
    writeStatements.push(
      db.prepare("DELETE FROM withdrawal_allocations WHERE withdrawal_id = ?").bind(id)
    );
    for (const alloc of nextComputed.allocations) {
      writeStatements.push(
        db
          .prepare(
            "INSERT INTO withdrawal_allocations (withdrawal_id, source_id, cards, balls) VALUES (?, ?, ?, ?)"
          )
          .bind(id, alloc.sourceId, alloc.cards, alloc.balls)
      );
    }
  }

  writeStatements.push(
    ...targetPlan.updateStatements,
    ...targetPlan.dailyStatements,
    targetPlan.summaryStatement,
    ...extraStatements
  );

  const historySelectStmt = includeHistory
    ? db
        .prepare(
          "SELECT id, deposit_id, seq, at, actor_name, action, content, before_json, after_json FROM deposit_history WHERE deposit_id = ? ORDER BY seq ASC"
        )
        .bind(id)
    : db
        .prepare(
          "SELECT id, deposit_id, seq, at, actor_name, action, content, NULL AS before_json, NULL AS after_json FROM deposit_history WHERE deposit_id = ? AND +action = 'UPDATE' ORDER BY seq ASC"
        )
        .bind(id);

  let historyRows: HistoryRow[] = [];
  if (writeStatements.length + 1 <= 100) {
    const batchResults = await db.batch([...writeStatements, historySelectStmt]);
    historyRows = batchResults[batchResults.length - 1].results as HistoryRow[];
  } else {
    await execBatchChunked(db, writeStatements);
    const histRes = await historySelectStmt.all<HistoryRow>();
    historyRows = histRes.results;
  }

  const [serialized] = await serializeDeposits(
    db,
    [nextRow],
    options.adminDisplayName,
    includeHistory,
    historyRows
  );

  return {
    deposit: serialized,
    webhookPayload: {
      event: "UPDATE",
      id,
      historyId,
      title: `${nextRow.full_name} (${nextRow.phone})`,
      type: `Cập nhật (Bởi ${input.actorName} lúc ${nextRow.deposit_time})`,
      fullName: nextRow.full_name,
      phone: nextRow.phone,
      actorName: input.actorName,
      depositTime: nextRow.deposit_time,
      depositDate: nextRow.deposit_date,
      content,
      totalCards: targetPlan.totalCards,
      totalBalls: targetPlan.totalBalls,
      totalText: formatTotalText(targetPlan.totalCards, targetPlan.totalBalls),
    },
  };
}

export async function deleteDepositRecord(
  db: D1Database,
  id: string
): Promise<{
  id: string;
  fullName: string;
  restoredCards: number;
  restoredBalls: number;
}> {
  if (!isValidRecordId(id)) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const phoneRowsRes = await db
    .prepare(
      `SELECT * FROM customers_deposits
      WHERE phone = (SELECT phone FROM customers_deposits WHERE id = ?)
      ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
    )
    .bind(id)
    .all<DepositRow>();

  const rows = phoneRowsRes.results;
  const existing = rows.find((r) => r.id === id);
  if (!existing) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  let beforeTotalCards = 0;
  let beforeTotalBalls = 0;
  for (const r of rows) {
    if (r.status === "Đang gửi") {
      beforeTotalCards += r.remaining_cards;
      beforeTotalBalls += r.remaining_balls;
    }
  }

  const remainingRows = rows.filter((r) => r.id !== id);
  const plan = buildCustomerMutationPlan(db, existing.phone, remainingRows, {
    datesToSync: new Set([existing.deposit_date]),
  });

  const restoredCards = Math.max(0, plan.totalCards - beforeTotalCards);
  const restoredBalls = Math.max(0, plan.totalBalls - beforeTotalBalls);

  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM withdrawal_allocations WHERE withdrawal_id = ?").bind(id),
    db.prepare("DELETE FROM deposit_history WHERE deposit_id = ?").bind(id),
    db.prepare("DELETE FROM customers_deposits WHERE id = ?").bind(id),
    ...plan.updateStatements,
    ...plan.dailyStatements,
    plan.summaryStatement,
  ];

  await execBatchChunked(db, statements);

  return {
    id,
    fullName: existing.full_name,
    restoredCards,
    restoredBalls,
  };
}

export async function undoHistoryEntry(
  db: D1Database,
  depositId: string,
  historyId: string
): Promise<{
  id: string;
  historyId: string;
  fullName: string;
  actorName: string;
  content: string;
}> {
  if (!isValidRecordId(depositId)) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const [phoneRowsRes, historyRes] = await db.batch([
    db
      .prepare(
        `SELECT * FROM customers_deposits
        WHERE phone = (SELECT phone FROM customers_deposits WHERE id = ?)
        ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
      )
      .bind(depositId),
    db
      .prepare("SELECT * FROM deposit_history WHERE id = ? AND deposit_id = ? LIMIT 1")
      .bind(historyId, depositId),
  ]);

  const existingPhoneRows = phoneRowsRes.results as DepositRow[];
  const existing = existingPhoneRows.find((r) => r.id === depositId);
  if (!existing) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const historyRow = (historyRes.results[0] as HistoryRow | undefined) ?? null;
  if (!historyRow) {
    throw new ServiceError(404, "Không tìm thấy mục lịch sử cần hoàn tác.");
  }
  if (historyRow.action !== "UPDATE") {
    throw new ServiceError(400, "Chỉ có thể hoàn tác bản ghi cập nhật (UPDATE).");
  }

  const before = parseSnapshot(historyRow.before_json);
  if (!before) {
    throw new ServiceError(400, "Mục lịch sử không có ảnh chụp trạng thái trước để hoàn tác.");
  }

  const nextFullName = before.fullName ?? existing.full_name;
  const nextPhone = before.phone ?? existing.phone;
  const nextCards = before.cards ?? existing.cards;
  const nextBalls = before.balls ?? existing.balls;
  const nextStatus = before.status ?? existing.status;
  const nextDate = before.depositDate ?? existing.deposit_date;
  const nextTime = before.depositTime ?? existing.deposit_time;
  const nowIso = new Date().toISOString();

  const nextRow: DepositRow = {
    ...existing,
    full_name: nextFullName,
    search_name: normalizeSearchText(nextFullName),
    phone: nextPhone,
    deposit_date: nextDate,
    deposit_time: nextTime,
    cards: nextCards,
    balls: nextBalls,
    status: nextStatus,
    updated_at: nowIso,
  };

  let targetPlan: CustomerMutationPlan;
  const extraStatements: D1PreparedStatement[] = [];

  if (nextPhone === existing.phone) {
    const nextRows = existingPhoneRows.map((r) => (r.id === depositId ? nextRow : r));
    targetPlan = buildCustomerMutationPlan(db, nextPhone, nextRows, {
      skipUpdateIds: new Set([depositId]),
      datesToSync: new Set([existing.deposit_date, nextDate]),
      nowIso,
    });
  } else {
    const nextPhoneRes = await db
      .prepare(
        `SELECT * FROM customers_deposits
        WHERE phone = ?
        ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
      )
      .bind(nextPhone)
      .all<DepositRow>();

    const oldPlan = buildCustomerMutationPlan(
      db,
      existing.phone,
      existingPhoneRows.filter((r) => r.id !== depositId),
      { datesToSync: new Set([existing.deposit_date]), nowIso }
    );
    targetPlan = buildCustomerMutationPlan(db, nextPhone, [...nextPhoneRes.results, nextRow], {
      skipUpdateIds: new Set([depositId]),
      datesToSync: new Set([nextDate]),
      nowIso,
    });
    extraStatements.push(...oldPlan.updateStatements, ...oldPlan.dailyStatements, oldPlan.summaryStatement);
  }

  const nextComputed = targetPlan.computedById.get(depositId)!;
  nextRow.remaining_cards = nextComputed.remC;
  nextRow.remaining_balls = nextComputed.remB;
  nextRow.status = nextComputed.status;
  nextRow.total_text = nextComputed.totalText;

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE customers_deposits
        SET full_name = ?, search_name = ?, phone = ?, deposit_date = ?, deposit_time = ?,
            cards = ?, balls = ?, remaining_cards = ?, remaining_balls = ?, status = ?, total_text = ?, updated_at = ?
        WHERE id = ?`
      )
      .bind(
        nextRow.full_name,
        nextRow.search_name,
        nextRow.phone,
        nextRow.deposit_date,
        nextRow.deposit_time,
        nextRow.cards,
        nextRow.balls,
        nextRow.remaining_cards,
        nextRow.remaining_balls,
        nextRow.status,
        nextRow.total_text,
        nowIso,
        depositId
      ),
    db
      .prepare("DELETE FROM deposit_history WHERE id = ? AND deposit_id = ?")
      .bind(historyId, depositId),
  ];

  if (nextRow.card_action === "Lấy thẻ" || nextRow.ball_action === "Lấy bi") {
    statements.push(
      db.prepare("DELETE FROM withdrawal_allocations WHERE withdrawal_id = ?").bind(depositId)
    );
    for (const alloc of nextComputed.allocations) {
      statements.push(
        db
          .prepare(
            "INSERT INTO withdrawal_allocations (withdrawal_id, source_id, cards, balls) VALUES (?, ?, ?, ?)"
          )
          .bind(depositId, alloc.sourceId, alloc.cards, alloc.balls)
      );
    }
  }

  statements.push(
    ...targetPlan.updateStatements,
    ...targetPlan.dailyStatements,
    targetPlan.summaryStatement,
    ...extraStatements
  );

  await execBatchChunked(db, statements);

  return {
    id: depositId,
    historyId,
    fullName: nextFullName,
    actorName: historyRow.actor_name,
    content: historyRow.content,
  };
}
