#!/usr/bin/env node
/**
 * Convert a MongoDB export of `customers_deposits` (mongoexport NDJSON or JSON array)
 * into Cloudflare D1-compatible SQL statements (INSERT OR REPLACE).
 *
 * Usage:
 *   node scripts/migrate-mongo-to-d1.mjs --input customers_deposits.json --output migrations/seed_from_mongo.sql
 *
 * Then execute against D1:
 *   npx wrangler d1 execute pinball-db --local --file=migrations/seed_from_mongo.sql
 *   npx wrangler d1 execute pinball-db --remote --file=migrations/seed_from_mongo.sql
 */

import fs from "node:fs";
import path from "node:path";

const VALID_STATUSES = new Set(["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"]);

function parseArgs(argv) {
  const args = { input: "", output: "migrations/seed_from_mongo.sql" };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if ((flag === "--input" || flag === "-i") && argv[i + 1]) {
      args.input = argv[++i];
    } else if ((flag === "--output" || flag === "-o") && argv[i + 1]) {
      args.output = argv[++i];
    } else if (!flag.startsWith("-") && !args.input) {
      args.input = flag;
    }
  }
  return args;
}

function unwrapExtendedJson(value) {
  if (Array.isArray(value)) {
    return value.map(unwrapExtendedJson);
  }
  if (value && typeof value === "object") {
    if (typeof value.$oid === "string") return value.$oid;
    if (value.$date !== undefined) {
      if (typeof value.$date === "string" || typeof value.$date === "number") {
        return new Date(value.$date).toISOString();
      }
      if (value.$date && typeof value.$date.$numberLong === "string") {
        return new Date(Number(value.$date.$numberLong)).toISOString();
      }
    }
    if (typeof value.$numberInt === "string") return Number(value.$numberInt);
    if (typeof value.$numberLong === "string") return Number(value.$numberLong);
    if (typeof value.$numberDouble === "string") return Number(value.$numberDouble);

    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = unwrapExtendedJson(v);
    }
    return out;
  }
  return value;
}

function parseMongoDump(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map(unwrapExtendedJson) : [];
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => unwrapExtendedJson(JSON.parse(line)));
}

function normalizePhone(raw) {
  const cleaned = String(raw || "").trim().replace(/[\s().-]+/g, "");
  return cleaned.startsWith("+84") ? `0${cleaned.slice(3)}` : cleaned;
}

function normalizeSearchText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

function normalizeCardAction(raw) {
  return raw === "Lấy thẻ" || raw === "Lấy" ? "Lấy thẻ" : "Gửi thẻ";
}

function normalizeBallAction(raw) {
  return raw === "Lấy bi" || raw === "Lấy" ? "Lấy bi" : "Gửi bi";
}

function objectIdToMs(id) {
  if (typeof id === "string" && /^[0-9a-f]{24}$/i.test(id)) {
    return parseInt(id.slice(0, 8), 16) * 1000;
  }
  return null;
}

function sqlStr(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlInt(value) {
  const n = Math.max(0, Math.trunc(Number(value) || 0));
  return String(n);
}

function inferHistoryAction(item) {
  if (item.action === "CREATE" || item.action === "UPDATE" || item.action === "SYSTEM") {
    return item.action;
  }
  if (item.action === "AUTO_DEDUCT" || item.action === "AUTO_RESTORE") {
    return "SYSTEM";
  }
  const content = String(item.content || "");
  if (content.startsWith("Tạo mới") || content.startsWith("Tạo bản ghi")) return "CREATE";
  if (content.startsWith("Hệ thống") || content.startsWith("Tự trừ") || item.actorName === "Hệ thống") return "SYSTEM";
  return "UPDATE";
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.input) {
    console.error("Usage: node scripts/migrate-mongo-to-d1.mjs --input <mongo-export.json> [--output migrations/seed_from_mongo.sql]");
    process.exit(1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  const raw = fs.readFileSync(inputPath, "utf8");
  const docs = parseMongoDump(raw);

  const lines = [
    `-- Generated from ${path.basename(inputPath)} at ${new Date().toISOString()}`,
    `-- Total records: ${docs.length}`,
    "",
  ];

  const dailyBuckets = new Map();
  let historyCount = 0;
  let allocationCount = 0;

  for (let idx = 0; idx < docs.length; idx += 1) {
    const doc = docs[idx];
    const id = String(doc._id || doc.id || "").trim() || String(idx + 1).padStart(24, "0");
    const fullName = String(doc.fullName || "").trim();
    const searchName = normalizeSearchText(fullName);
    const phone = normalizePhone(doc.phone);
    const depositDate = String(doc.depositDate || "").trim();
    const depositTime = String(doc.depositTime || "00:00").trim();
    const cardAction = normalizeCardAction(doc.cardAction);
    const ballAction = normalizeBallAction(doc.ballAction);
    const cards = Math.max(0, Math.trunc(Number(doc.cards) || 0));
    const balls = Math.max(0, Math.trunc(Number(doc.balls) || 0));
    const remainingCards = Math.max(
      0,
      Math.trunc(
        doc.remainingCards !== undefined
          ? Number(doc.remainingCards) || 0
          : cardAction === "Gửi thẻ"
            ? cards
            : 0
      )
    );
    const remainingBalls = Math.max(
      0,
      Math.trunc(
        doc.remainingBalls !== undefined
          ? Number(doc.remainingBalls) || 0
          : ballAction === "Gửi bi"
            ? balls
            : 0
      )
    );
    const totalText = String(doc.totalText || "").trim() || `${cards} thẻ · ${balls} bi`;
    const status = VALID_STATUSES.has(doc.status)
      ? doc.status
      : remainingCards > 0 || remainingBalls > 0
        ? "Đang gửi"
        : "Đã nhận lại";
    const createdByName = String(doc.createdByName || "Không rõ").trim();
    const updatedByName = String(doc.updatedByName || createdByName).trim();
    const idempotencyKey = doc.idempotencyKey ? String(doc.idempotencyKey) : null;
    const createdAt = doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString();
    const updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : createdAt;
    const systemCreatedMs = objectIdToMs(id) ?? (new Date(createdAt).getTime() || Date.now());

    lines.push(
      `INSERT OR REPLACE INTO customers_deposits (id, full_name, search_name, phone, deposit_date, deposit_time, card_action, ball_action, cards, balls, remaining_cards, remaining_balls, total_text, status, created_by_name, updated_by_name, idempotency_key, created_at, updated_at, system_created_ms) VALUES (${[
        sqlStr(id),
        sqlStr(fullName),
        sqlStr(searchName),
        sqlStr(phone),
        sqlStr(depositDate),
        sqlStr(depositTime),
        sqlStr(cardAction),
        sqlStr(ballAction),
        sqlInt(cards),
        sqlInt(balls),
        sqlInt(remainingCards),
        sqlInt(remainingBalls),
        sqlStr(totalText),
        sqlStr(status),
        sqlStr(createdByName),
        sqlStr(updatedByName),
        sqlStr(idempotencyKey),
        sqlStr(createdAt),
        sqlStr(updatedAt),
        String(Math.trunc(systemCreatedMs)),
      ].join(", ")});`
    );

    lines.push(`DELETE FROM deposit_history WHERE deposit_id = ${sqlStr(id)};`);
    const historyList = Array.isArray(doc.history) ? doc.history : [];
    historyList.forEach((h, seq) => {
      const hid = String(h._id || h.id || `${id}_h${seq}`).trim();
      const at = h.at ? new Date(h.at).toISOString() : createdAt;
      const actorName = String(h.actorName || createdByName).trim();
      const action = inferHistoryAction(h);
      const content = String(h.content || "").trim();
      const beforeJson = h.before ? JSON.stringify(h.before) : null;
      const afterJson = h.after ? JSON.stringify(h.after) : null;
      historyCount += 1;
      lines.push(
        `INSERT INTO deposit_history (id, deposit_id, seq, at, actor_name, action, content, before_json, after_json) VALUES (${[
          sqlStr(hid),
          sqlStr(id),
          String(seq),
          sqlStr(at),
          sqlStr(actorName),
          sqlStr(action),
          sqlStr(content),
          sqlStr(beforeJson),
          sqlStr(afterJson),
        ].join(", ")});`
      );
    });

    lines.push(`DELETE FROM withdrawal_allocations WHERE withdrawal_id = ${sqlStr(id)};`);
    const allocs = Array.isArray(doc.withdrawalAllocations) ? doc.withdrawalAllocations : [];
    for (const alloc of allocs) {
      const sourceId = String(alloc.sourceId || "").trim();
      if (!sourceId) continue;
      allocationCount += 1;
      lines.push(
        `INSERT INTO withdrawal_allocations (withdrawal_id, source_id, cards, balls) VALUES (${[
          sqlStr(id),
          sqlStr(sourceId),
          sqlInt(alloc.cards),
          sqlInt(alloc.balls),
        ].join(", ")});`
      );
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(depositDate) && phone) {
      const key = `${depositDate}::${phone}`;
      const existing = dailyBuckets.get(key) || {
        date: depositDate,
        phone,
        fullName,
        records: 0,
        cardsDeposited: 0,
        ballsDeposited: 0,
        cardsWithdrawn: 0,
        ballsWithdrawn: 0,
        latestSort: "",
      };
      existing.records += 1;
      if (cardAction === "Gửi thẻ") existing.cardsDeposited += cards;
      else existing.cardsWithdrawn += cards;
      if (ballAction === "Gửi bi") existing.ballsDeposited += balls;
      else existing.ballsWithdrawn += balls;

      const sortKey = `${depositTime}|${createdAt}|${id}`;
      if (fullName && sortKey >= existing.latestSort) {
        existing.latestSort = sortKey;
        existing.fullName = fullName;
      }
      dailyBuckets.set(key, existing);
    }
  }

  lines.push("");
  lines.push("-- Rebuild daily customer aggregates");
  const nowIso = new Date().toISOString();
  for (const row of dailyBuckets.values()) {
    lines.push(
      `INSERT OR REPLACE INTO customers_daily_deposits (date, phone, full_name, records, cards_deposited, balls_deposited, cards_withdrawn, balls_withdrawn, updated_at) VALUES (${[
        sqlStr(row.date),
        sqlStr(row.phone),
        sqlStr(row.fullName),
        sqlInt(row.records),
        sqlInt(row.cardsDeposited),
        sqlInt(row.ballsDeposited),
        sqlInt(row.cardsWithdrawn),
        sqlInt(row.ballsWithdrawn),
        sqlStr(nowIso),
      ].join(", ")});`
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");
  console.log(
    `Converted ${docs.length} deposits, ${historyCount} history rows, ${allocationCount} allocations, ${dailyBuckets.size} daily rows -> ${outputPath}`
  );
}

main();
