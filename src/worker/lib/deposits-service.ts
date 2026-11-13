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

interface HistoryRow {
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
  return `${Math.max(0, cards)} thẻ · ${Math.max(0, balls)} bi`;
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

export async function serializeDeposits(
  db: D1Database,
  rows: DepositRow[],
  adminDisplayName: string,
  includeHistory: boolean
): Promise<DepositDTO[]> {
  if (rows.length === 0) return [];

  const historyByDeposit = new Map<string, DepositHistoryItem[]>();
  const depositIds = rows.map((r) => r.id);

  for (const chunk of chunkIds(depositIds)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const sql = includeHistory
      ? `SELECT * FROM deposit_history WHERE deposit_id IN (${placeholders}) ORDER BY seq ASC`
      : `SELECT * FROM deposit_history WHERE deposit_id IN (${placeholders}) AND action = 'UPDATE' ORDER BY seq ASC`;
    const result = await db.prepare(sql).bind(...chunk).all<HistoryRow>();
    for (const h of result.results) {
      const list = historyByDeposit.get(h.deposit_id) ?? [];
      list.push(mapHistoryRow(h));
      historyByDeposit.set(h.deposit_id, list);
    }
  }

  return rows.map((row) => {
    const fetchedEntries = historyByDeposit.get(row.id) ?? [];
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
  });
}

export async function getDepositRowById(db: D1Database, id: string): Promise<DepositRow | null> {
  if (!isValidRecordId(id)) return null;
  const row = await db
    .prepare("SELECT * FROM customers_deposits WHERE id = ? LIMIT 1")
    .bind(id)
    .first<DepositRow>();
  return row ?? null;
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

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

export async function recalculateCustomerDepositTotals(db: D1Database, phone: string): Promise<void> {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return;

  const result = await db
    .prepare(
      `SELECT id, deposit_date, deposit_time, card_action, ball_action, cards, balls, remaining_cards, remaining_balls, total_text, status
      FROM customers_deposits
      WHERE phone = ?
      ORDER BY deposit_date ASC, deposit_time ASC, created_at ASC, system_created_ms ASC, id ASC`
    )
    .bind(normalizedPhone)
    .all<{
      id: string;
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
    }>();

  const rows = result.results;
  if (rows.length === 0) return;

  interface OpenLot {
    index: number;
    id: string;
    remC: number;
    remB: number;
    status: DepositStatus;
  }

  interface ComputedState {
    id: string;
    remC: number;
    remB: number;
    status: DepositStatus;
    totalText: string;
    allocations: Array<{ sourceId: string; cards: number; balls: number }>;
  }

  const openLots: OpenLot[] = [];
  const computed: ComputedState[] = [];
  let runningCards = 0;
  let runningBalls = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];

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

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const prev = rows[i];
    const next = computed[i];
    if (
      prev.remaining_cards !== next.remC ||
      prev.remaining_balls !== next.remB ||
      prev.status !== next.status ||
      prev.total_text !== next.totalText
    ) {
      statements.push(
        db
          .prepare(
            "UPDATE customers_deposits SET remaining_cards = ?, remaining_balls = ?, status = ?, total_text = ? WHERE id = ?"
          )
          .bind(next.remC, next.remB, next.status, next.totalText, next.id)
      );
    }

    if (prev.card_action === "Lấy thẻ" || prev.ball_action === "Lấy bi") {
      statements.push(
        db.prepare("DELETE FROM withdrawal_allocations WHERE withdrawal_id = ?").bind(next.id)
      );
      for (const alloc of next.allocations) {
        statements.push(
          db
            .prepare(
              "INSERT INTO withdrawal_allocations (withdrawal_id, source_id, cards, balls) VALUES (?, ?, ?, ?)"
            )
            .bind(next.id, alloc.sourceId, alloc.cards, alloc.balls)
        );
      }
    }
  }

  if (statements.length > 0) {
    for (let i = 0; i < statements.length; i += 100) {
      await db.batch(statements.slice(i, i + 100));
    }
  }
}

export async function recalculateAllCustomers(db: D1Database): Promise<number> {
  const phonesResult = await db
    .prepare("SELECT DISTINCT phone FROM customers_deposits")
    .all<{ phone: string }>();

  for (const { phone } of phonesResult.results) {
    await recalculateCustomerDepositTotals(db, phone);
  }

  const nowIso = new Date().toISOString();
  await db.batch([
    db.prepare("DELETE FROM customers_daily_deposits"),
    db
      .prepare(
        `INSERT INTO customers_daily_deposits (date, phone, full_name, records, cards_deposited, balls_deposited, cards_withdrawn, balls_withdrawn, updated_at)
        SELECT
          d.deposit_date,
          d.phone,
          (SELECT d2.full_name FROM customers_deposits d2 WHERE d2.deposit_date = d.deposit_date AND d2.phone = d.phone AND d2.status != 'Đã hủy' ORDER BY d2.deposit_time DESC, d2.created_at DESC, d2.id DESC LIMIT 1),
          COUNT(*),
          COALESCE(SUM(CASE WHEN d.card_action = 'Gửi thẻ' THEN d.cards ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN d.ball_action = 'Gửi bi' THEN d.balls ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN d.card_action = 'Lấy thẻ' THEN d.cards ELSE 0 END), 0),
          COALESCE(SUM(CASE WHEN d.ball_action = 'Lấy bi' THEN d.balls ELSE 0 END), 0),
          ?
        FROM customers_deposits d
        WHERE d.status != 'Đã hủy'
        GROUP BY d.deposit_date, d.phone`
      )
      .bind(nowIso),
  ]);

  return phonesResult.results.length;
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

  if (idempotencyKey) {
    const existingByKey = await db
      .prepare("SELECT * FROM customers_deposits WHERE idempotency_key = ? LIMIT 1")
      .bind(idempotencyKey)
      .first<DepositRow>();
    if (existingByKey) {
      const [serialized] = await serializeDeposits(db, [existingByKey], options.adminDisplayName, options.isAdmin);
      return { deposit: serialized, deduplicated: true };
    }
  }

  const nowMs = now.getTime();
  const recentRows = await db
    .prepare(
      `SELECT * FROM customers_deposits
      WHERE phone = ? AND system_created_ms >= ?
      ORDER BY system_created_ms DESC
      LIMIT 5`
    )
    .bind(input.phone, nowMs - 15_000)
    .all<DepositRow>();

  const duplicate = recentRows.results.find(
    (row) =>
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
    const activeTotals = await db
      .prepare(
        `SELECT
          COALESCE(SUM(remaining_cards), 0) AS avail_cards,
          COALESCE(SUM(remaining_balls), 0) AS avail_balls
        FROM customers_deposits
        WHERE phone = ? AND status = 'Đang gửi'`
      )
      .bind(input.phone)
      .first<{ avail_cards: number; avail_balls: number }>();

    const availCards = activeTotals?.avail_cards ?? 0;
    const availBalls = activeTotals?.avail_balls ?? 0;

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
  const remainingCards = input.cardAction === "Gửi thẻ" ? input.cards : 0;
  const remainingBalls = input.ballAction === "Gửi bi" ? input.balls : 0;
  const status: DepositStatus = remainingCards > 0 || remainingBalls > 0 ? "Đang gửi" : "Đã nhận lại";
  const searchName = normalizeSearchText(input.fullName);

  const actionSummaryParts: string[] = [];
  if (input.cards > 0) actionSummaryParts.push(`${input.cardAction} ${input.cards}`);
  if (input.balls > 0) actionSummaryParts.push(`${input.ballAction} ${input.balls}`);
  const historyContent = `Tạo mới: ${actionSummaryParts.join(" + ")}`;

  try {
    await db.batch([
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
          id,
          input.fullName,
          searchName,
          input.phone,
          depositDate,
          depositTime,
          input.cardAction,
          input.ballAction,
          input.cards,
          input.balls,
          remainingCards,
          remainingBalls,
          formatTotalText(remainingCards, remainingBalls),
          status,
          input.actorName,
          input.actorName,
          idempotencyKey,
          createdAt,
          nowIso,
          nowMs
        ),
      db
        .prepare(
          `INSERT INTO deposit_history (id, deposit_id, seq, at, actor_name, action, content, before_json, after_json)
          VALUES (?, ?, 0, ?, ?, 'CREATE', ?, NULL, NULL)`
        )
        .bind(historyId, id, createdAt, input.actorName, historyContent),
    ]);
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

  await recalculateCustomerDepositTotals(db, input.phone);
  await rebuildDailyTotalsForKeys(db, [{ date: depositDate, phone: input.phone }]);

  const freshRow = await getDepositRowById(db, id);
  if (!freshRow) {
    throw new ServiceError(500, "Không đọc lại được bản ghi vừa tạo.");
  }

  const [serialized] = await serializeDeposits(db, [freshRow], options.adminDisplayName, options.isAdmin);

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
      totalText: serialized.totalText,
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
  const existing = await getDepositRowById(db, id);
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
      options.includeHistory ?? true
    );
    return { deposit: unchanged };
  }

  const nowIso = new Date().toISOString();
  const nextCreatedAt =
    nextDate !== existing.deposit_date || nextTime !== existing.deposit_time
      ? buildRecordTimestamp(nextDate, nextTime)
      : existing.created_at;

  const seqRow = await db
    .prepare("SELECT COALESCE(MAX(seq), -1) AS max_seq FROM deposit_history WHERE deposit_id = ?")
    .bind(id)
    .first<{ max_seq: number }>();
  const nextSeq = (seqRow?.max_seq ?? -1) + 1;
  const historyId = generateId();
  const content = changes.join(", ");

  await db.batch([
    db
      .prepare(
        `UPDATE customers_deposits
        SET full_name = ?, search_name = ?, phone = ?, deposit_date = ?, deposit_time = ?,
            cards = ?, balls = ?, status = ?, updated_by_name = ?, created_at = ?, updated_at = ?
        WHERE id = ?`
      )
      .bind(
        nextFullName,
        normalizeSearchText(nextFullName),
        nextPhone,
        nextDate,
        nextTime,
        nextCards,
        nextBalls,
        nextStatus,
        input.actorName,
        nextCreatedAt,
        nowIso,
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
  ]);

  await recalculateCustomerDepositTotals(db, existing.phone);
  if (nextPhone !== existing.phone) {
    await recalculateCustomerDepositTotals(db, nextPhone);
  }
  await rebuildDailyTotalsForKeys(db, [
    { date: existing.deposit_date, phone: existing.phone },
    { date: nextDate, phone: nextPhone },
  ]);

  const updated = await getDepositRowById(db, id);
  if (!updated) {
    throw new ServiceError(500, "Không đọc được bản ghi sau cập nhật.");
  }

  const [serialized] = await serializeDeposits(
    db,
    [updated],
    options.adminDisplayName,
    options.includeHistory ?? true
  );

  return {
    deposit: serialized,
    webhookPayload: {
      event: "UPDATE",
      id,
      historyId,
      title: `${updated.full_name} (${updated.phone})`,
      type: `Cập nhật (Bởi ${input.actorName} lúc ${updated.deposit_time})`,
      fullName: updated.full_name,
      phone: updated.phone,
      actorName: input.actorName,
      depositTime: updated.deposit_time,
      depositDate: updated.deposit_date,
      content,
      totalText: updated.total_text,
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
  const existing = await getDepositRowById(db, id);
  if (!existing) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const allocSummary = await db
    .prepare(
      `SELECT COALESCE(SUM(cards), 0) AS restored_cards, COALESCE(SUM(balls), 0) AS restored_balls
      FROM withdrawal_allocations
      WHERE withdrawal_id = ?`
    )
    .bind(id)
    .first<{ restored_cards: number; restored_balls: number }>();

  await db.batch([
    db.prepare("DELETE FROM withdrawal_allocations WHERE withdrawal_id = ?").bind(id),
    db.prepare("DELETE FROM deposit_history WHERE deposit_id = ?").bind(id),
    db.prepare("DELETE FROM customers_deposits WHERE id = ?").bind(id),
  ]);

  await recalculateCustomerDepositTotals(db, existing.phone);
  await rebuildDailyTotalsForKeys(db, [{ date: existing.deposit_date, phone: existing.phone }]);

  return {
    id,
    fullName: existing.full_name,
    restoredCards: allocSummary?.restored_cards ?? 0,
    restoredBalls: allocSummary?.restored_balls ?? 0,
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
  const existing = await getDepositRowById(db, depositId);
  if (!existing) {
    throw new ServiceError(404, "Không tìm thấy bản ghi.");
  }

  const historyRow = await db
    .prepare("SELECT * FROM deposit_history WHERE id = ? AND deposit_id = ? LIMIT 1")
    .bind(historyId, depositId)
    .first<HistoryRow>();

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

  await db.batch([
    db
      .prepare(
        `UPDATE customers_deposits
        SET full_name = ?, search_name = ?, phone = ?, deposit_date = ?, deposit_time = ?,
            cards = ?, balls = ?, status = ?, updated_at = ?
        WHERE id = ?`
      )
      .bind(
        nextFullName,
        normalizeSearchText(nextFullName),
        nextPhone,
        nextDate,
        nextTime,
        nextCards,
        nextBalls,
        nextStatus,
        nowIso,
        depositId
      ),
    db
      .prepare("DELETE FROM deposit_history WHERE id = ? AND deposit_id = ?")
      .bind(historyId, depositId),
  ]);

  await recalculateCustomerDepositTotals(db, existing.phone);
  if (nextPhone !== existing.phone) {
    await recalculateCustomerDepositTotals(db, nextPhone);
  }
  await rebuildDailyTotalsForKeys(db, [
    { date: existing.deposit_date, phone: existing.phone },
    { date: nextDate, phone: nextPhone },
  ]);

  return {
    id: depositId,
    historyId,
    fullName: nextFullName,
    actorName: historyRow.actor_name,
    content: historyRow.content,
  };
}
