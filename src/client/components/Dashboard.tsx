"use client";

import { Fragment, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppLink, useAppRouter } from "../lib/router";
import type { Cell, Sheet, SheetData } from "write-excel-file/browser";
import {
  CalendarDays,
  Clock3,
  Coins,
  Download,
  Eye,
  FileDown,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Ticket,
  Trash2,
  Trophy,
  UserRound,
  X,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { formatDate, getHanoiNow, getHanoiParts } from "@/lib/time";

type Mode = "staff" | "admin";
type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";
type CardAction = "Gửi thẻ" | "Lấy thẻ";
type BallAction = "Gửi bi" | "Lấy bi";

type HistoryEntry = {
  id: string;
  at: string;
  actorName: string;
  action: string;
  content: string;
};

type Deposit = {
  id: string;
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cardAction: CardAction;
  ballAction: BallAction;
  cards: number;
  balls: number;
  totalText: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  createdBy: { displayName: string } | null;
  updatedBy: { displayName: string } | null;
  createdByName?: string;
  updatedByName?: string;
  latestUpdate?: HistoryEntry | null;
  updates?: HistoryEntry[];
  history: HistoryEntry[];
};

type Notice = {
  type: "success" | "error";
  text: string;
};

type DepositFilters = {
  name: string;
  phone: string;
  date: string;
  status: string;
};

type DepositListResponse = {
  deposits: Deposit[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

type CardRanking = {
  fullName: string;
  phone: string;
  totalCards: number;
};

type ActiveCustomer = {
  fullName: string;
  phone: string;
  totalCards: number;
  totalBalls: number;
};

type DepositSummary = {
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  todayDeposits: number;
  historyEntries: number;
  cardRankings: CardRanking[];
  activeCustomers: ActiveCustomer[];
};

type AdminDateSummary = {
  totalRecords: number;
  uniqueCustomers: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
  recordsUpdated: number;
};

type RecentStaffUpdate = {
  id: string;
  depositId: string;
  fullName: string;
  phone: string;
  updatedByName: string;
  updatedAt: string;
  content: string;
};

type CustomerDailyTotal = {
  id: string;
  fullName: string;
  phone: string;
  records: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
};

type AdminDashboardResponse = {
  date: string;
  dateSummary: AdminDateSummary;
  recentUpdates: RecentStaffUpdate[];
  customerDailyTotals: CustomerDailyTotal[];
};

type AdminSystemOverview = {
  checkedAt: string;
  databaseMs: number;
  totalRecords: number;
  totalHistoryEntries: number;
  cardsDeposited: number;
  ballsDeposited: number;
  cardsWithdrawn: number;
  ballsWithdrawn: number;
  dailySummaryRecords: number;
  firstRecordAt: string | null;
  lastRecordAt: string | null;
};

type DepositSuggestion = {
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  latestStatus: Status;
  latestDepositDate: string;
};

type DepositLookup = {
  found: boolean;
  phone: string;
  fullName: string;
  activeDeposits: number;
  totalCards: number;
  totalBalls: number;
  suggestions: DepositSuggestion[];
};

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];
const cardActions: CardAction[] = ["Gửi thẻ", "Lấy thẻ"];
const ballActions: BallAction[] = ["Gửi bi", "Lấy bi"];
const staffStorageKey = "pinball_staff_name";
const appTitle = "Ký gửi PINBALL";
const adminDisplayName = "Danh Thai";
const emptyFilters: DepositFilters = {
  name: "",
  phone: "",
  date: "",
  status: "",
};
const emptySummary: DepositSummary = {
  activeDeposits: 0,
  totalCards: 0,
  totalBalls: 0,
  todayDeposits: 0,
  historyEntries: 0,
  cardRankings: [],
  activeCustomers: [],
};
const emptyAdminDateSummary: AdminDateSummary = {
  totalRecords: 0,
  uniqueCustomers: 0,
  cardsDeposited: 0,
  ballsDeposited: 0,
  cardsWithdrawn: 0,
  ballsWithdrawn: 0,
  recordsUpdated: 0,
};
const emptyAdminSystemOverview: AdminSystemOverview = {
  checkedAt: "",
  databaseMs: 0,
  totalRecords: 0,
  totalHistoryEntries: 0,
  cardsDeposited: 0,
  ballsDeposited: 0,
  cardsWithdrawn: 0,
  ballsWithdrawn: 0,
  dailySummaryRecords: 0,
  firstRecordAt: null,
  lastRecordAt: null,
};
const depositPageLimit = 50;
const exportPageLimit = 100;
const minPhoneSuggestionDigits = 3;
const customerSearchDebounceMs = 50;

function getDefaultDepositForm(includeDateTime = false) {
  const now = getHanoiNow();

  return {
    fullName: "",
    phone: "",
    cardAction: "Gửi thẻ" as CardAction,
    ballAction: "Gửi bi" as BallAction,
    cards: "0",
    balls: "0",
    depositDate: includeDateTime ? now.date : "",
    depositTime: includeDateTime ? now.time : "",
  };
}

const inputClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const selectClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const labelClass = "mb-2 block text-sm font-semibold text-[#0F172A]";
const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#111827] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F2937] disabled:opacity-50";
const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50";
const iconButton =
  "inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7]";

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: Status) {
  if (status === "Đang gửi") {
    return "bg-[#DBEAFE] text-[#2563EB]";
  }

  if (status === "Đã nhận lại") {
    return "bg-[#DCFCE7] text-[#16A34A]";
  }

  if (status === "Đã đổi quà") {
    return "bg-[#FEF3C7] text-[#B45309]";
  }

  return "bg-[#FEE2E2] text-[#DC2626]";
}

function cardActionClass(cardAction: CardAction) {
  return cardAction === "Lấy thẻ"
    ? "bg-[#FEE2E2] text-[#B91C1C]"
    : "bg-[#DCFCE7] text-[#166534]";
}

function ballActionClass(ballAction: BallAction) {
  return ballAction === "Lấy bi"
    ? "bg-[#FEF3C7] text-[#B45309]"
    : "bg-[#E0F2FE] text-[#0369A1]";
}

function creatorName(deposit: Deposit) {
  return deposit.createdByName || deposit.createdBy?.displayName || "N/A";
}

function getRecordUpdateEntries(deposit: Deposit): HistoryEntry[] {
  if (Array.isArray(deposit.updates) && deposit.updates.length > 0) {
    return deposit.updates.filter((u) => u.actorName !== adminDisplayName);
  }

  const historyUpdates = deposit.history.filter(
    (entry) => entry.action === "UPDATE" && entry.actorName !== adminDisplayName,
  );

  if (historyUpdates.length > 0) {
    return historyUpdates;
  }

  if (deposit.latestUpdate?.action === "UPDATE" && deposit.latestUpdate.actorName !== adminDisplayName) {
    return [deposit.latestUpdate];
  }

  return [];
}

function CompactUpdateInfo({
  changeClassName,
  deposit,
  lineClassName,
}: {
  changeClassName?: string;
  deposit: Deposit;
  lineClassName: string;
}) {
  const updates = getRecordUpdateEntries(deposit);

  if (updates.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 space-y-1">
      {updates.map((update, idx) => (
        <div
          className="border-t border-[#E2E8F0] pt-0.5 first:border-0 first:pt-0"
          key={update.id || `${update.at}-${idx}`}
        >
          <div className={lineClassName}>
            Cập nhật bởi: <span className="font-semibold text-[#1E293B]">{update.actorName}</span> lúc{" "}
            {formatShortDateTime(update.at)}
          </div>
          {update.content ? (
            <div className={changeClassName ?? lineClassName}>Thay đổi: {update.content}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1000) {
    return `${milliseconds} ms`;
  }

  return `${(milliseconds / 1000).toFixed(1)} s`;
}

function AdminMetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#334155]">
          <Icon aria-hidden="true" size={17} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[#64748B]">{label}</div>
          <div className="mt-0.5 text-2xl font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}

function formatShortDateTime(value?: string) {
  if (!value) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.hour}h${byType.minute} ${byType.day}/${byType.month}/${byType.year}`;
}

function normalizePhoneInput(phone: string) {
  return phone.trim().replace(/[\s().-]/g, "");
}

function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the current React session usable even when browser storage is unavailable.
  }
}

function removeLocalStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; state is still cleared in memory.
  }
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
}

function PhoneSuggestionBubble({
  suggestions,
  onSelect,
}: {
  suggestions: DepositSuggestion[];
  onSelect: (suggestion: DepositSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="phone-suggestion-bubble mt-2 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white shadow-lg">
      {suggestions.map((suggestion) => (
        <button
          className="flex w-full items-center justify-between gap-3 border-b border-[#E5E7EB] px-3 py-2 text-left text-sm transition last:border-b-0 hover:bg-[#F8FAFC]"
          key={suggestion.phone}
          onClick={() => onSelect(suggestion)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block truncate font-bold text-[#0F172A]">{suggestion.fullName}</span>
            <span data-phone-number className="block text-xs font-semibold text-[#2563EB]">{suggestion.phone}</span>
          </span>
          <span className="shrink-0 text-right text-xs font-semibold text-[#64748B]">
            {suggestion.activeDeposits > 0 ? (
              <>
                <span className="block text-[#2563EB]">
                  {suggestion.totalCards} thẻ · {suggestion.totalBalls} bi
                </span>
                <span>{suggestion.activeDeposits} dòng đang gửi</span>
              </>
            ) : (
              <>
                <span className={`inline-flex rounded px-2 py-0.5 ${statusClass(suggestion.latestStatus)}`}>
                  {suggestion.latestStatus}
                </span>
                <span className="mt-1 block">{formatDate(suggestion.latestDepositDate)}</span>
              </>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

function lookupFromSuggestion(suggestion: DepositSuggestion, suggestions: DepositSuggestion[]): DepositLookup {
  return {
    found: suggestion.activeDeposits > 0,
    phone: suggestion.phone,
    fullName: suggestion.fullName,
    activeDeposits: suggestion.activeDeposits,
    totalCards: suggestion.totalCards,
    totalBalls: suggestion.totalBalls,
    suggestions,
  };
}

function StaffGate({ initialName = "", onEnter }: { initialName?: string; onEnter: (name: string) => void }) {
  const [name, setName] = useState(initialName);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();

    if (!value) {
      return;
    }

    writeLocalStorage(staffStorageKey, value);
    onEnter(value);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#0F172A]">
      <section className="w-full max-w-md rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111827] text-white">
            <UserRound aria-hidden="true" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{appTitle}</h1>
            <p className="text-sm text-[#64748B]">Nhập tên nhân viên ca hiện tại</p>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <label>
            <span className={labelClass}>Tên nhân viên</span>
            <input
              autoFocus={!initialName}
              className={inputClass}
              placeholder="Ví dụ: Danh Thai"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <button className={`${primaryButton} w-full`} type="submit">
            Tiếp tục
          </button>
        </form>
      </section>
    </main>
  );
}

export default function Dashboard({ mode }: { mode: Mode }) {
  const router = useAppRouter();
  const isAdmin = mode === "admin";
  const [staffName, setStaffName] = useState(isAdmin ? adminDisplayName : "");
  const [staffSessionLoaded, setStaffSessionLoaded] = useState(isAdmin);
  const [clock, setClock] = useState<ReturnType<typeof getHanoiParts> | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [summary, setSummary] = useState<DepositSummary>(emptySummary);
  const [adminDashboardDate, setAdminDashboardDate] = useState(() => getHanoiNow().date);
  const [adminDateSummary, setAdminDateSummary] = useState<AdminDateSummary>(emptyAdminDateSummary);
  const [adminSystemOverview, setAdminSystemOverview] = useState<AdminSystemOverview>(emptyAdminSystemOverview);
  const [recentStaffUpdates, setRecentStaffUpdates] = useState<RecentStaffUpdate[]>([]);
  const [customerDailyTotals, setCustomerDailyTotals] = useState<CustomerDailyTotal[]>([]);
  const [showRecentStaffUpdates, setShowRecentStaffUpdates] = useState(false);
  const [recentStaffUpdatesPage, setRecentStaffUpdatesPage] = useState(1);
  const [adminDashboardLoading, setAdminDashboardLoading] = useState(false);
  const [adminSystemLoading, setAdminSystemLoading] = useState(false);
  const [recalculatingTotals, setRecalculatingTotals] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: depositPageLimit,
    hasMore: false,
  });
  const paginationRef = useRef(pagination);
  const depositsRef = useRef(deposits);

  useEffect(() => {
    paginationRef.current = pagination;
    depositsRef.current = deposits;
  }, [deposits, pagination]);

  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [editingDeposit, setEditingDeposit] = useState<Deposit | null>(null);
  const [showCardRanking, setShowCardRanking] = useState(false);
  const [showActiveCustomers, setShowActiveCustomers] = useState(false);
  const [filters, setFilters] = useState<DepositFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<DepositFilters>(emptyFilters);
  const [depositForm, setDepositForm] = useState(() => getDefaultDepositForm());
  const [depositLookup, setDepositLookup] = useState<DepositLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const [historyQuery, setHistoryQuery] = useState("");
  const [historyQueryResults, setHistoryQueryResults] = useState<DepositSuggestion[]>([]);
  const [historyQueryLoading, setHistoryQueryLoading] = useState(false);
  const [selectedHistoryCustomer, setSelectedHistoryCustomer] = useState<DepositSuggestion | null>(null);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickLookupResults, setQuickLookupResults] = useState<DepositSuggestion[]>([]);
  const [quickLookupLoading, setQuickLookupLoading] = useState(false);
  const createFormRef = useRef<HTMLElement>(null);
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    depositDate: "",
    depositTime: "",
    cards: "0",
    balls: "0",
    status: "Đang gửi" as Status,
  });

  useEffect(() => {
    if (isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStaffName(readLocalStorage(staffStorageKey));
      setStaffSessionLoaded(true);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isAdmin]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setClock(getHanoiParts()), 0);
    const intervalId = window.setInterval(() => setClock(getHanoiParts()), 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const now = getHanoiNow();

      setDepositForm((current) => ({
        ...current,
        depositDate: current.depositDate || now.date,
        depositTime: current.depositTime || now.time,
      }));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAdmin]);

  const { activeDeposits, totalBalls, totalCards } = summary;
  const cardRankings = summary.cardRankings ?? [];
  const topCardRanking = cardRankings[0] ?? null;
  const normalizedDepositPhone = normalizePhoneInput(depositForm.phone);
  const activeDepositLookup =
    normalizedDepositPhone.length >= 8 && depositLookup?.phone === normalizedDepositPhone
      ? depositLookup
      : null;
  const depositSuggestions =
    normalizedDepositPhone.length >= minPhoneSuggestionDigits && depositLookup?.phone === normalizedDepositPhone
      ? depositLookup.suggestions
      : [];

  const pendingDepositTotals = useMemo(() => {
    if (!activeDepositLookup?.found) {
      return null;
    }

    const cardAmount = Number(depositForm.cards) || 0;
    const ballAmount = Number(depositForm.balls) || 0;

    return {
      cards:
        depositForm.cardAction === "Lấy thẻ"
          ? activeDepositLookup.totalCards - cardAmount
          : activeDepositLookup.totalCards + cardAmount,
      balls:
        depositForm.ballAction === "Lấy bi"
          ? activeDepositLookup.totalBalls - ballAmount
          : activeDepositLookup.totalBalls + ballAmount,
    };
  }, [activeDepositLookup, depositForm.ballAction, depositForm.balls, depositForm.cardAction, depositForm.cards]);

  const showNotice = useCallback((type: Notice["type"], text: string) => {
    setNotice({ type, text });
  }, []);

  const loadSummary = useCallback(
    async (silent = false) => {
      try {
        const data = await apiRequest<DepositSummary>("/api/deposits/summary");
        setSummary(data);
      } catch (error) {
        if (!silent) {
          showNotice("error", error instanceof Error ? error.message : "Không tải được tổng.");
        }
      }
    },
    [showNotice],
  );

  const loadAdminDashboard = useCallback(
    async (date: string, silent = false) => {
      if (!isAdmin) {
        return;
      }

      if (!silent) {
        setAdminDashboardLoading(true);
      }

      try {
        const params = new URLSearchParams({ date });
        const data = await apiRequest<AdminDashboardResponse>(`/api/admin/dashboard?${params.toString()}`);
        setAdminDateSummary(data.dateSummary);
        setRecentStaffUpdates(data.recentUpdates);
        setCustomerDailyTotals(data.customerDailyTotals ?? []);
        if (!silent) {
          setRecentStaffUpdatesPage(1);
        }
      } catch (error) {
        if (!silent) {
          showNotice("error", error instanceof Error ? error.message : "Không tải được bảng admin.");
        }
      } finally {
        if (!silent) {
          setAdminDashboardLoading(false);
        }
      }
    },
    [isAdmin, showNotice],
  );

  const loadAdminSystem = useCallback(
    async (silent = false) => {
      if (!isAdmin) {
        return;
      }

      if (!silent) {
        setAdminSystemLoading(true);
      }

      try {
        const data = await apiRequest<AdminSystemOverview>("/api/admin/system");
        setAdminSystemOverview(data);
      } catch (error) {
        if (!silent) {
          showNotice("error", error instanceof Error ? error.message : "Không tải được tình trạng hệ thống.");
        }
      } finally {
        if (!silent) {
          setAdminSystemLoading(false);
        }
      }
    },
    [isAdmin, showNotice],
  );

  const buildDepositQuery = useCallback(
    (filterValues: DepositFilters, pageToLoad: number, limit: number, includeHistory = false) => {
      const params = new URLSearchParams();
      params.set("page", String(pageToLoad));
      params.set("limit", String(limit));

      const name = filterValues.name.trim();
      const phone = filterValues.phone.trim();

      if (name) {
        params.set("name", name);
      }

      if (phone) {
        params.set("phone", phone);
      }

      if (filterValues.date) {
        params.set("date", filterValues.date);
      }

      if (filterValues.status) {
        params.set("status", filterValues.status);
      }

      if (includeHistory && isAdmin) {
        params.set("includeHistory", "true");
      }

      return params;
    },
    [isAdmin],
  );

  const loadDeposits = useCallback(
    async (
      filterValues: DepositFilters,
      pageToLoad = 1,
      append = false,
      silent = false,
      customLimit?: number,
    ) => {
      if (!silent) {
        if (append) {
          setIsLoadingMore(true);
        } else {
          setLoading(true);
        }
      }

      try {
        const limitToUse = customLimit ?? depositPageLimit;
        const params = buildDepositQuery(filterValues, pageToLoad, limitToUse);
        const data = await apiRequest<DepositListResponse>(`/api/deposits?${params.toString()}`);
        setDeposits((current) => (append ? [...current, ...data.deposits] : data.deposits));

        const effectivePage = append
          ? pageToLoad
          : customLimit
          ? Math.max(1, Math.ceil(data.deposits.length / depositPageLimit))
          : data.page;

        const totalRendered = append
          ? depositsRef.current.length + data.deposits.length
          : data.deposits.length;

        setPagination({
          total: data.total,
          page: effectivePage,
          limit: depositPageLimit,
          hasMore: totalRendered < data.total,
        });
      } catch (error) {
        if (!silent) {
          showNotice("error", error instanceof Error ? error.message : "Không tải được dữ liệu.");
        }
      } finally {
        if (!silent) {
          if (append) {
            setIsLoadingMore(false);
          } else {
            setLoading(false);
          }
        }
      }
    },
    [buildDepositQuery, showNotice],
  );

  const refreshData = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const currentCount = Math.max(
          paginationRef.current.page * depositPageLimit,
          depositsRef.current.length,
          depositPageLimit,
        );

        await Promise.all([
          loadSummary(silent),
          loadDeposits(appliedFilters, 1, false, silent, currentCount),
          isAdmin ? loadAdminDashboard(adminDashboardDate, silent) : Promise.resolve(),
        ]);
      } finally {
        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    [adminDashboardDate, appliedFilters, isAdmin, loadAdminDashboard, loadDeposits, loadSummary],
  );

  const handleRecalculateAllTotals = useCallback(async () => {
    if (
      !window.confirm(
        "Bạn có chắc chắn muốn tính toán lại dữ liệu cho toàn bộ khách hàng không? Hệ thống sẽ rà soát và chuẩn hóa lại số thẻ/bi của tất cả khách từ trước đến nay.",
      )
    ) {
      return;
    }

    setRecalculatingTotals(true);
    try {
      const endpoint = isAdmin ? "/api/admin/system" : "/api/deposits/recalculate";
      const res = await apiRequest<{ ok: boolean; customersRecalculated: number }>(endpoint, {
        method: "POST",
      });
      showNotice(
        "success",
        `Đã tính toán lại dữ liệu cho ${res.customersRecalculated ?? 0} khách hàng thành công.`,
      );
      if (isAdmin) {
        await Promise.all([refreshData(), loadAdminSystem()]);
      } else {
        await refreshData();
      }
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Tính toán lại dữ liệu thất bại.");
    } finally {
      setRecalculatingTotals(false);
    }
  }, [isAdmin, loadAdminSystem, refreshData, showNotice]);

  const fetchAllDeposits = useCallback(async (filterValues: DepositFilters) => {
    const allDeposits: Deposit[] = [];
    let pageToLoad = 1;

    while (true) {
      const params = buildDepositQuery(filterValues, pageToLoad, exportPageLimit, isAdmin);
      const data = await apiRequest<DepositListResponse>(`/api/deposits?${params.toString()}`);

      allDeposits.push(...data.deposits);

      if (!data.hasMore || data.deposits.length === 0) {
        break;
      }

      pageToLoad += 1;
    }

    return allDeposits;
  }, [buildDepositQuery, isAdmin]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => {
      setNotice(null);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

  useEffect(() => {
    if (!staffName) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSummary();
      void loadDeposits(emptyFilters, 1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadDeposits, loadSummary, staffName]);

  useEffect(() => {
    if (!staffName || !isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadAdminDashboard(adminDashboardDate);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [adminDashboardDate, isAdmin, loadAdminDashboard, staffName]);

  useEffect(() => {
    if (!staffName || !isAdmin) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadAdminSystem();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [isAdmin, loadAdminSystem, staffName]);

  useEffect(() => {
    if (!staffName || !autoRefreshEnabled) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshData({ silent: true });
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshData({ silent: true });
      }
    }, 8000);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoRefreshEnabled, refreshData, staffName]);

  useEffect(() => {
    if (normalizedDepositPhone.length < minPhoneSuggestionDigits) {
      const timeoutId = window.setTimeout(() => {
        setDepositLookup(null);
        setLookupLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setLookupLoading(true);

      try {
        const data = await apiRequest<DepositLookup>(
          `/api/deposits/lookup?phone=${encodeURIComponent(normalizedDepositPhone)}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) {
          return;
        }

        setDepositLookup(data);

        if (data.found && data.fullName) {
          setDepositForm((current) => {
            if (normalizePhoneInput(current.phone) !== data.phone || current.fullName.trim()) {
              return current;
            }

            return {
              ...current,
              fullName: data.fullName,
            };
          });
        }
      } catch {
        if (!controller.signal.aborted) {
          setDepositLookup(null);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLookupLoading(false);
        }
      }
    }, customerSearchDebounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedDepositPhone]);

  // History customer search (debounced, q-based)
  useEffect(() => {
    const trimmed = historyQuery.trim();
    const digits = trimmed.replace(/\D/g, "");
    const hasText = trimmed.replace(/\d/g, "").trim().length >= 2;
    const hasDigits = digits.length >= 3;

    if (!hasText && !hasDigits) {
      const timeoutId = window.setTimeout(() => {
        setHistoryQueryResults([]);
        setHistoryQueryLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setHistoryQueryLoading(true);

      try {
        const data = await apiRequest<DepositLookup>(
          `/api/deposits/lookup?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setHistoryQueryResults(data.suggestions);
        }
      } catch {
        if (!controller.signal.aborted) {
          setHistoryQueryResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setHistoryQueryLoading(false);
        }
      }
    }, customerSearchDebounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [historyQuery]);

  // Quick customer lookup effect (debounced, triggered by quickQuery)
  useEffect(() => {
    const trimmed = quickQuery.trim();
    const digits = trimmed.replace(/\D/g, "");
    const hasText = trimmed.replace(/\d/g, "").trim().length >= 2;
    const hasDigits = digits.length >= 3;

    if (!hasText && !hasDigits) {
      const timeoutId = window.setTimeout(() => {
        setQuickLookupResults([]);
        setQuickLookupLoading(false);
      }, 0);

      return () => window.clearTimeout(timeoutId);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setQuickLookupLoading(true);

      try {
        const data = await apiRequest<DepositLookup>(
          `/api/deposits/lookup?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setQuickLookupResults(data.suggestions);
        }
      } catch {
        if (!controller.signal.aborted) {
          setQuickLookupResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setQuickLookupLoading(false);
        }
      }
    }, customerSearchDebounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [quickQuery]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    void loadDeposits(nextFilters, 1);
  }

  function handleClearFilters() {
    setFilters(emptyFilters);
    setAppliedFilters(emptyFilters);
    setHistoryQuery("");
    setHistoryQueryResults([]);
    setSelectedHistoryCustomer(null);
    void loadDeposits(emptyFilters, 1);
  }

  function handleReloadDeposits() {
    void refreshData({ silent: false });
  }

  function handleLoadMore() {
    if (isLoadingMore || loading) {
      return;
    }
    void loadDeposits(appliedFilters, pagination.page + 1, true);
  }

  async function handleToggleHistory(depositId: string) {
    if (expandedHistoryId === depositId) {
      setExpandedHistoryId(null);
      return;
    }

    setHistoryLoadingId(depositId);

    try {
      const data = await apiRequest<{ deposit: Deposit }>(`/api/admin/deposits/${depositId}`);
      setDeposits((current) =>
        current.map((deposit) => (deposit.id === depositId ? data.deposit : deposit)),
      );
      setExpandedHistoryId(depositId);
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không tải được lịch sử bản ghi.");
    } finally {
      setHistoryLoadingId(null);
    }
  }

  function getJsonWriteHeaders() {
    return {
      "Content-Type": "application/json",
    };
  }

  function applyAdminDateFilter(date: string) {
    setAdminDashboardDate(date);

    const next = { ...filters, date };
    setFilters(next);
    setAppliedFilters(next);
    void loadDeposits(next, 1);
  }

  function selectDepositSuggestion(suggestion: DepositSuggestion) {
    setDepositForm((current) => ({
      ...current,
      fullName: suggestion.fullName,
      phone: suggestion.phone,
    }));
    setDepositLookup(lookupFromSuggestion(suggestion, [suggestion]));
  }

  function selectQuickLookupSuggestion(suggestion: DepositSuggestion) {
    setDepositForm((current) => ({
      ...current,
      fullName: suggestion.fullName,
      phone: suggestion.phone,
    }));
    setDepositLookup(lookupFromSuggestion(suggestion, [suggestion]));
    setQuickQuery("");
    setQuickLookupResults([]);
  }

  function fillFromDeposit(deposit: Deposit) {
    setDepositForm((current) => ({
      ...current,
      fullName: deposit.fullName,
      phone: deposit.phone,
    }));
    setDepositLookup(null);
    createFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function selectHistoryCustomer(suggestion: DepositSuggestion) {
    setSelectedHistoryCustomer(suggestion);
    setHistoryQuery("");
    setHistoryQueryResults([]);
    const next: DepositFilters = { ...filters, name: suggestion.fullName, phone: suggestion.phone };
    setFilters(next);
    setAppliedFilters(next);
    void loadDeposits(next, 1);
  }

  if (!isAdmin && !staffSessionLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#0F172A]">
        <p className="text-sm font-semibold text-[#475569]">Đang mở ứng dụng...</p>
      </main>
    );
  }

  if (!isAdmin && !staffName) {
    return (
      <StaffGate
        initialName={staffName}
        onEnter={(name) => {
          setStaffName(name);
        }}
      />
    );
  }

  async function handleCreateDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Khóa đồng bộ ngay lập tức: state React chưa kịp cập nhật giữa 2 lần click/Enter liên tiếp.
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const payload = {
        fullName: depositForm.fullName,
        phone: depositForm.phone,
        actorName: staffName,
        cardAction: depositForm.cardAction,
        ballAction: depositForm.ballAction,
        cards: Number(depositForm.cards),
        balls: Number(depositForm.balls),
        ...(isAdmin
          ? {
              depositDate: depositForm.depositDate,
              depositTime: depositForm.depositTime,
            }
          : {}),
      };
      const data = await apiRequest<{ deposit: Deposit; deduplicated?: boolean }>("/api/deposits", {
        method: "POST",
        headers: { ...getJsonWriteHeaders(), "X-Idempotency-Key": idempotencyKey },
        body: JSON.stringify(payload),
      });

      setDeposits((current) => {
        const existingIndex = current.findIndex((deposit) => deposit.id === data.deposit.id);

        if (existingIndex === -1) {
          return [data.deposit, ...current];
        }

        return current.map((deposit) => (deposit.id === data.deposit.id ? data.deposit : deposit));
      });
      setDepositForm(getDefaultDepositForm(isAdmin));
      setDepositLookup(null);
      void loadSummary();
      const currentCount = Math.max(
        paginationRef.current.page * depositPageLimit,
        depositsRef.current.length,
        depositPageLimit,
      );
      void loadDeposits(appliedFilters, 1, false, true, currentCount);
      if (isAdmin) {
        void loadAdminDashboard(adminDashboardDate);
      }
      showNotice(
        "success",
        data.deduplicated ? "Bản ghi này vừa được lưu, không tạo trùng." : "Đã lưu chi tiết lần gửi mới.",
      );
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không lưu được bản ghi.");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  function openEdit(deposit: Deposit) {
    setEditingDeposit(deposit);
    setEditForm({
      fullName: deposit.fullName,
      phone: deposit.phone,
      depositDate: deposit.depositDate,
      depositTime: deposit.depositTime,
      cards: String(deposit.cards),
      balls: String(deposit.balls),
      status: deposit.status,
    });
  }

  async function handleUpdateDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingDeposit) {
      return;
    }

    const payload = isAdmin
      ? {
          ...editForm,
          actorName: staffName,
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
        }
      : {
          actorName: staffName,
          fullName: editForm.fullName,
          phone: editForm.phone,
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
          status: editForm.status,
        };

    try {
      const data = await apiRequest<{ deposit: Deposit }>(
        `/api/deposits/${editingDeposit.id}`,
        {
          method: "PATCH",
          headers: getJsonWriteHeaders(),
          body: JSON.stringify(payload),
        },
      );

      setDeposits((current) =>
        current.map((deposit) => (deposit.id === data.deposit.id ? data.deposit : deposit)),
      );
      setEditingDeposit(null);
      void loadSummary();
      const currentCount = Math.max(
        paginationRef.current.page * depositPageLimit,
        depositsRef.current.length,
        depositPageLimit,
      );
      void loadDeposits(appliedFilters, 1, false, true, currentCount);
      if (isAdmin) {
        void loadAdminDashboard(adminDashboardDate);
      }
      showNotice("success", "Đã cập nhật bản ghi.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không cập nhật được.");
    }
  }

  async function handleDeleteDeposit(deposit: Deposit) {
    const confirmed = window.confirm(`Xóa bản ghi của ${deposit.fullName}?`);

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest<{ ok: boolean }>(`/api/deposits/${deposit.id}`, {
        method: "DELETE",
      });
      setDeposits((current) => current.filter((item) => item.id !== deposit.id));
      void loadSummary();
      const currentCount = Math.max(
        paginationRef.current.page * depositPageLimit,
        depositsRef.current.length,
        depositPageLimit,
      );
      void loadDeposits(appliedFilters, 1, false, true, currentCount);
      if (isAdmin) {
        void loadAdminDashboard(adminDashboardDate);
      }
      showNotice("success", "Đã xóa bản ghi.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xóa được.");
    }
  }

  function switchStaff() {
    removeLocalStorage(staffStorageKey);
    setStaffName("");
  }

  async function handleAdminLogout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      router.replace("/");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không đăng xuất được.");
    }
  }

  async function handleExportExcel() {
    if (pagination.total === 0) {
      showNotice("error", "Không có dữ liệu để xuất Excel.");
      return;
    }

    setExporting(true);

    try {
      const exportDeposits = await fetchAllDeposits(appliedFilters);

      if (exportDeposits.length === 0) {
        showNotice("error", "Không có dữ liệu để xuất Excel.");
        return;
      }

      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const exportedAt = getHanoiParts();
      const titleCell: Cell = {
        value: `${appTitle} - Danh sách gửi giữ`,
        fontWeight: "bold",
        fontSize: 16,
      };
      const noteCell: Cell = {
        value: `Xuất lúc ${exportedAt.time} ${formatDate(exportedAt.date)} - Nhân viên: ${staffName}`,
        textColor: "#64748B",
      };
      const headerStyle = {
        fontWeight: "bold" as const,
        backgroundColor: "#F1F5F9",
        textColor: "#0F172A",
        borderColor: "#CBD5E1",
        borderStyle: "thin" as const,
      };
      const header = (value: string): Cell => ({
        value,
        ...headerStyle,
      });
      const depositRows = exportDeposits.map((deposit, index) => [
        index + 1,
        deposit.fullName,
        deposit.phone,
        formatDate(deposit.depositDate),
        deposit.depositTime,
        deposit.cards,
        deposit.balls,
        deposit.totalText,
        deposit.cardAction,
        deposit.ballAction,
        creatorName(deposit),
      ]);
      const depositSheet: SheetData = [
        [titleCell],
        [noteCell],
        [],
        [
          header("STT"),
          header("Họ và tên"),
          header("SĐT"),
          header("Ngày gửi"),
          header("Giờ gửi"),
          header("Thẻ"),
          header("Bi"),
          header("Tổng sau bản ghi"),
          header("Gửi/Lấy thẻ"),
          header("Gửi/Lấy bi"),
          header("Nhân viên tạo"),
        ],
        ...depositRows,
      ];
      const sheets: Sheet<Blob>[] = [
        {
          sheet: "Gui giu",
          data: depositSheet,
          columns: [
            { width: 8 },
            { width: 26 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 10 },
            { width: 10 },
            { width: 22 },
            { width: 14 },
            { width: 14 },
            { width: 18 },
          ],
          stickyRowsCount: 4,
        },
      ];

      if (isAdmin) {
        const historyRows = exportDeposits.flatMap((deposit) =>
          deposit.history.map((entry) => [
            deposit.fullName,
            deposit.phone,
            formatDate(deposit.depositDate),
            deposit.depositTime,
            entry.actorName,
            entry.action,
            formatDateTime(entry.at),
            entry.content,
          ]),
        );

        sheets.push({
          sheet: "Lich su",
          data: [
            [
              {
                value: `${appTitle} - Lịch sử cập nhật`,
                fontWeight: "bold",
                fontSize: 16,
              },
            ],
            [noteCell],
            [],
            [
              header("Họ và tên"),
              header("SĐT"),
              header("Ngày gửi"),
              header("Giờ gửi"),
              header("Nhân viên"),
              header("Hành động"),
              header("Thời gian"),
              header("Nội dung thay đổi"),
            ],
            ...historyRows,
          ],
          columns: [
            { width: 26 },
            { width: 18 },
            { width: 14 },
            { width: 12 },
            { width: 18 },
            { width: 14 },
            { width: 20 },
            { width: 56 },
          ],
          stickyRowsCount: 4,
        });
      }

      await writeExcelFile(sheets, {
        fontFamily: "Arial",
        fontSize: 11,
      }).toFile(
        `pinball-gui-giu-${exportedAt.date}-${exportedAt.shortTime.replace(":", "-")}.xlsx`,
      );
      showNotice("success", "Đã xuất file Excel.");
    } catch (error) {
      showNotice("error", error instanceof Error ? error.message : "Không xuất được Excel.");
    } finally {
      setExporting(false);
    }
  }

  const hasActiveFilters = Boolean(
    historyQuery.trim() ||
      selectedHistoryCustomer ||
      filters.status ||
      filters.date ||
      filters.name.trim() ||
      filters.phone.trim(),
  );

  return (
    <main className={`min-h-screen text-[#0F172A] ${isAdmin ? "bg-[#F1F5F9]" : "bg-[#F8FAFC]"}`}>
      <header className="sticky top-0 z-30 border-b border-[#E5E7EB] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#111827] text-white sm:h-11 sm:w-11">
              <Ticket aria-hidden="true" size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-bold leading-tight sm:text-lg">
                  {appTitle}
                </h1>
                {isAdmin ? (
                  <span className="rounded-full bg-[#111827] px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                    Admin
                  </span>
                ) : null}
              </div>
              <p className="truncate text-xs text-[#64748B] sm:text-sm">
                {isAdmin ? "Quản trị và đối soát hoạt động" : <span>Nhân viên: <span className="font-bold text-[#0F172A]">{staffName}</span></span>}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none sm:gap-4">
            <div className="hidden text-right text-xs font-semibold sm:block sm:text-sm">
              {clock ? (
                <>
                  <div>{clock.time}</div>
                  <div className="font-normal text-[#64748B]">{formatDate(clock.date)}</div>
                </>
              ) : (
                <div className="h-9 w-20 animate-pulse rounded bg-[#E2E8F0]" />
              )}
            </div>
            <div className="hidden h-10 w-px bg-[#E5E7EB] sm:block" />
            <AppLink
              aria-label="Hướng dẫn cài app"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7] sm:w-auto sm:px-4 sm:text-sm sm:font-semibold"
              href="/install"
              title="Hướng dẫn cài app"
            >
              <Download aria-hidden="true" size={17} />
              <span className="hidden sm:inline">Cài app</span>
            </AppLink>
            <button
              aria-label={isAdmin ? "Đăng xuất Admin" : "Đổi nhân viên"}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7]"
              onClick={isAdmin ? handleAdminLogout : switchStaff}
              title={isAdmin ? "Đăng xuất Admin" : "Đổi nhân viên"}
              type="button"
            >
              <LogOut aria-hidden="true" size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-0 lg:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-[#E5E7EB] bg-white px-4 py-8 lg:block">
          <nav className="space-y-2">
            <div className="flex items-center gap-3 rounded-md bg-[#F8FAFC] px-4 py-3 text-sm font-semibold">
              <LayoutDashboard aria-hidden="true" size={18} />
              Tổng quan
            </div>
            <div className="px-4 pt-6 text-xs font-bold uppercase text-[#64748B]">Quản lý</div>
            <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
              <Ticket aria-hidden="true" size={18} />
              Gửi giữ
            </div>
            <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
              <Coins aria-hidden="true" size={18} />
              Thẻ & Bi
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-3 rounded-md px-4 py-3 text-sm text-[#334155]">
                <Clock3 aria-hidden="true" size={18} />
                Lịch sử chi tiết
              </div>
            ) : null}
          </nav>
        </aside>

        <section className="space-y-4 px-3 py-4 pb-8 sm:px-4 lg:space-y-5 lg:px-6">
          {isAdmin ? (
            <section className="rounded-lg border border-[#CBD5E1] bg-white p-4 shadow-sm sm:p-5">
              <section className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-bold">Hiệu năng & toàn bộ dữ liệu</h2>
                    <p className="mt-1 text-xs text-[#64748B]">
                      Đo một lượt đọc tổng hợp từ MongoDB; không tạo tải đồng thời lên website production.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={`${secondaryButton} h-10 px-3 text-xs`}
                      disabled={recalculatingTotals || adminSystemLoading}
                      onClick={() => void handleRecalculateAllTotals()}
                      type="button"
                    >
                      <RefreshCw className={recalculatingTotals ? "animate-spin" : ""} aria-hidden="true" size={15} />
                      {recalculatingTotals ? "Đang đồng bộ..." : "Đồng bộ dữ liệu"}
                    </button>
                    <button
                      className={`${secondaryButton} h-10 px-3 text-xs`}
                      disabled={adminSystemLoading}
                      onClick={() => void loadAdminSystem()}
                      type="button"
                    >
                      <RefreshCw className={adminSystemLoading ? "animate-spin" : ""} aria-hidden="true" size={15} />
                      {adminSystemLoading ? "Đang kiểm tra" : "Kiểm tra hệ thống"}
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm lg:grid-cols-3">
                  <AdminMetricCard icon={LayoutDashboard} label="Tổng bản ghi" value={adminSystemOverview.totalRecords} />
                  <AdminMetricCard icon={Clock3} label="Lịch sử thao tác" value={adminSystemOverview.totalHistoryEntries} />
                  <AdminMetricCard icon={Ticket} label="Thẻ gửi toàn bộ" value={adminSystemOverview.cardsDeposited} />
                  <AdminMetricCard icon={Coins} label="Bi gửi toàn bộ" value={adminSystemOverview.ballsDeposited} />
                  <AdminMetricCard icon={RefreshCw} label="Thẻ lấy toàn bộ" value={adminSystemOverview.cardsWithdrawn} />
                  <AdminMetricCard icon={RefreshCw} label="Bi lấy toàn bộ" value={adminSystemOverview.ballsWithdrawn} />
                </div>

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#64748B]">
                  <span>Phản hồi MongoDB: {formatDuration(adminSystemOverview.databaseMs)}</span>
                  <span>Bản ghi tổng hợp ngày: {adminSystemOverview.dailySummaryRecords}</span>
                  {adminSystemOverview.checkedAt ? (
                    <span>Đo lúc: {formatDateTime(adminSystemOverview.checkedAt)}</span>
                  ) : null}
                </div>
              </section>

              <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-bold">Đối soát theo ngày</h2>
                  <p className="mt-1 text-sm text-[#64748B]">
                    {adminDashboardLoading ? "Đang tải dữ liệu..." : `Ngày ${formatDate(adminDashboardDate)}`}
                  </p>
                </div>
                <label className="w-full sm:max-w-[220px]">
                  <span className={labelClass}>Ngày đối soát</span>
                  <input
                    className={inputClass}
                    type="date"
                    value={adminDashboardDate}
                    onChange={(event) => applyAdminDateFilter(event.target.value)}
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4 2xl:grid-cols-7">
                <AdminMetricCard icon={LayoutDashboard} label="Bản ghi" value={adminDateSummary.totalRecords} />
                <AdminMetricCard icon={UserRound} label="Khách" value={adminDateSummary.uniqueCustomers} />
                <AdminMetricCard icon={Ticket} label="Thẻ gửi" value={adminDateSummary.cardsDeposited} />
                <AdminMetricCard icon={Coins} label="Bi gửi" value={adminDateSummary.ballsDeposited} />
                <AdminMetricCard icon={RefreshCw} label="Thẻ lấy" value={adminDateSummary.cardsWithdrawn} />
                <AdminMetricCard icon={RefreshCw} label="Bi lấy" value={adminDateSummary.ballsWithdrawn} />
                <AdminMetricCard icon={Clock3} label="Đã cập nhật" value={adminDateSummary.recordsUpdated} />
              </div>

              <div className="mt-4 overflow-hidden rounded-md border border-[#E5E7EB] bg-[#F8FAFC]">
                <div className="flex flex-col gap-1 border-b border-[#E5E7EB] bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A]">Khách gửi trong ngày</h3>
                    <p className="text-xs text-[#64748B]">Số thẻ/bi phát sinh theo từng khách</p>
                  </div>
                  <span className="text-xs font-semibold text-[#64748B]">
                    {customerDailyTotals.length} khách
                  </span>
                </div>

                {customerDailyTotals.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-[#64748B]">Chưa có khách gửi trong ngày này.</div>
                ) : (
                  <>
                    <div className="grid gap-2 p-3 sm:hidden">
                      {customerDailyTotals.map((total) => (
                        <article className="rounded-md border border-[#E5E7EB] bg-white p-3" key={total.id}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate font-bold text-[#0F172A]">{total.fullName}</div>
                              <a data-phone-number className="mt-1 block text-sm font-semibold text-[#2563EB]" href={`tel:${total.phone}`}>
                                {total.phone}
                              </a>
                            </div>
                            <span className="shrink-0 rounded-full bg-[#F1F5F9] px-2.5 py-1 text-xs font-semibold text-[#64748B]">
                              {total.records} bản ghi
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
                              <div className="text-xs font-semibold text-[#64748B]">Thẻ gửi</div>
                              <div className="mt-1 text-lg font-bold">{total.cardsDeposited}</div>
                            </div>
                            <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
                              <div className="text-xs font-semibold text-[#64748B]">Bi gửi</div>
                              <div className="mt-1 text-lg font-bold">{total.ballsDeposited}</div>
                            </div>
                            <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
                              <div className="text-xs font-semibold text-[#64748B]">Thẻ lấy</div>
                              <div className="mt-1 text-lg font-bold text-[#B91C1C]">{total.cardsWithdrawn}</div>
                            </div>
                            <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2.5">
                              <div className="text-xs font-semibold text-[#64748B]">Bi lấy</div>
                              <div className="mt-1 text-lg font-bold text-[#B45309]">{total.ballsWithdrawn}</div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto sm:block">
                      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <thead className="text-xs font-bold uppercase text-[#334155]">
                        <tr>
                          <th className="px-3 py-2">Khách</th>
                          <th className="px-3 py-2">SĐT</th>
                          <th className="px-3 py-2 text-right">Thẻ gửi</th>
                          <th className="px-3 py-2 text-right">Bi gửi</th>
                          <th className="px-3 py-2 text-right">Thẻ lấy</th>
                          <th className="px-3 py-2 text-right">Bi lấy</th>
                          <th className="px-3 py-2 text-right">Bản ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E7EB] bg-white">
                        {customerDailyTotals.map((total) => (
                          <tr key={total.id}>
                            <td className="px-3 py-2 font-semibold text-[#0F172A]">{total.fullName}</td>
                            <td data-phone-number className="px-3 py-2 text-[#2563EB]">{total.phone}</td>
                            <td className="px-3 py-2 text-right font-bold">{total.cardsDeposited}</td>
                            <td className="px-3 py-2 text-right font-semibold">{total.ballsDeposited}</td>
                            <td className="px-3 py-2 text-right text-[#B91C1C]">{total.cardsWithdrawn}</td>
                            <td className="px-3 py-2 text-right text-[#B45309]">{total.ballsWithdrawn}</td>
                            <td className="px-3 py-2 text-right text-[#64748B]">{total.records}</td>
                          </tr>
                        ))}
                      </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                <button
                  type="button"
                  onClick={() => setShowRecentStaffUpdates(!showRecentStaffUpdates)}
                  className="flex w-full items-center justify-between gap-2 text-left focus:outline-none"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F172A]">Cập nhật bởi nhân viên</h3>
                    <span className="rounded bg-[#E2E8F0] px-1.5 py-0.5 text-xs font-semibold text-[#64748B]">
                      {recentStaffUpdates.length} mục
                    </span>
                  </div>
                  {showRecentStaffUpdates ? (
                    <ChevronUp className="h-4 w-4 text-[#64748B]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#64748B]" />
                  )}
                </button>
                {showRecentStaffUpdates && (() => {
                  const updatesPerPage = 10;
                  const totalUpdates = recentStaffUpdates.length;
                  const totalPages = Math.ceil(totalUpdates / updatesPerPage) || 1;
                  const currentPage = Math.max(1, Math.min(recentStaffUpdatesPage, totalPages));
                  const startIndex = (currentPage - 1) * updatesPerPage;
                  const paginatedUpdates = recentStaffUpdates.slice(startIndex, startIndex + updatesPerPage);

                  return (
                    <div className="mt-3">
                      {totalUpdates === 0 ? (
                        <>
                          <div className="rounded-md border border-dashed border-[#CBD5E1] bg-white px-3 py-3 text-sm text-[#64748B]">
                            Chưa có cập nhật gần đây từ nhân viên.
                          </div>
                          <div className="mt-3 flex justify-center border-t border-[#E5E7EB] pt-2">
                            <button
                              type="button"
                              onClick={() => setShowRecentStaffUpdates(false)}
                              className="flex w-full cursor-pointer items-center justify-center gap-1 py-1 text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                            >
                              <ChevronUp className="h-3 w-3" /> Thu gọn danh sách
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="grid gap-2 lg:grid-cols-2">
                            {paginatedUpdates.map((update) => (
                              <article className="rounded-md border border-[#E5E7EB] bg-white px-3 py-2" key={update.id}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-bold text-[#0F172A]">{update.fullName}</div>
                                    <div data-phone-number className="text-xs font-semibold text-[#2563EB]">{update.phone}</div>
                                  </div>
                                  <div className="shrink-0 text-right text-xs text-[#64748B]">
                                    <div className="font-semibold text-[#334155]">{update.updatedByName}</div>
                                    <div>{formatShortDateTime(update.updatedAt)}</div>
                                  </div>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#334155]">{update.content}</p>
                              </article>
                            ))}
                          </div>

                          {totalPages > 1 && (
                            <div className="mt-3 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-xs">
                              <button
                                type="button"
                                disabled={currentPage === 1}
                                onClick={() => setRecentStaffUpdatesPage(currentPage - 1)}
                                className="cursor-pointer rounded border border-[#CBD5E1] bg-white px-2 py-1 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                              >
                                Trang trước
                              </button>
                              <span className="font-semibold text-[#64748B]">
                                Trang {currentPage} / {totalPages}
                              </span>
                              <button
                                type="button"
                                disabled={currentPage === totalPages}
                                onClick={() => setRecentStaffUpdatesPage(currentPage + 1)}
                                className="cursor-pointer rounded border border-[#CBD5E1] bg-white px-2 py-1 font-semibold text-[#334155] hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white"
                              >
                                Trang sau
                              </button>
                            </div>
                          )}

                          <div className="mt-3 flex justify-center border-t border-[#E5E7EB] pt-2">
                            <button
                              type="button"
                              onClick={() => setShowRecentStaffUpdates(false)}
                              className="flex w-full cursor-pointer items-center justify-center gap-1 py-1 text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
                            >
                              <ChevronUp className="h-3 w-3" /> Thu gọn danh sách
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>
          ) : null}

          {notice ? (
            <div
              className={`flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm font-semibold ${
                notice.type === "success"
                  ? "border-[#86EFAC] bg-[#DCFCE7] text-[#166534]"
                  : "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]"
              }`}
            >
              <span>{notice.text}</span>
              <button
                aria-label="Đóng thông báo"
                className="rounded p-1 hover:bg-black/5"
                onClick={() => setNotice(null)}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>
          ) : null}

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <button
              aria-expanded={showActiveCustomers}
              aria-haspopup="dialog"
              className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-left shadow-sm transition hover:border-[#CBD5E1] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#64748B]/30 sm:p-5"
              onClick={() => setShowActiveCustomers(true)}
              type="button"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-[#334155] sm:h-14 sm:w-14">
                  <Ticket aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Khách đang gửi</div>
                  <div className="text-2xl font-bold sm:text-3xl">{activeDeposits}</div>
                </div>
              </div>
            </button>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                  <CalendarDays aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Thẻ còn giữ</div>
                  <div className="text-2xl font-bold sm:text-3xl">{totalCards}</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] sm:h-14 sm:w-14">
                  <Coins aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#334155] sm:text-sm">Bi còn giữ</div>
                  <div className="text-2xl font-bold sm:text-3xl">{totalBalls}</div>
                </div>
              </div>
            </div>
            <button
              aria-expanded={showCardRanking}
              aria-haspopup="dialog"
              className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] p-4 text-left shadow-sm transition hover:border-[#FBBF24] hover:bg-[#FEF3C7] focus:outline-none focus:ring-2 focus:ring-[#F59E0B]/30 sm:p-5"
              onClick={() => setShowCardRanking(true)}
              type="button"
            >
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#92400E] sm:h-14 sm:w-14">
                  <Trophy aria-hidden="true" size={22} />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#92400E] sm:text-sm">Xếp hạng</div>
                  <div className="truncate text-2xl font-bold text-[#111827] sm:text-3xl">
                    {topCardRanking ? `#1: ${topCardRanking.fullName}` : "Chưa có"}
                  </div>
                </div>
              </div>
            </button>
          </section>

          <section className="rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5" ref={createFormRef}>
            <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-bold">{isAdmin ? "Tạo bản ghi mới" : "Bản ghi mới"}</h2>
                {isAdmin ? (
                  <p className="text-xs text-[#64748B]">Chọn ngày giờ gửi khi nhập lại dữ liệu cũ.</p>
                ) : null}
              </div>
              {isAdmin ? (
                <span className="inline-flex w-fit rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-semibold text-[#334155]">
                  Admin được tạo bản ghi theo ngày/giờ cũ
                </span>
              ) : null}
            </div>

            {/* Quick customer lookup */}
            <div className="mb-4">
              <label className={labelClass} htmlFor="quick-lookup">
                Tìm khách nhanh theo tên hoặc SĐT
              </label>
              <div className="relative">
                <input
                  id="quick-lookup"
                  className={inputClass}
                  placeholder="Nhập tên hoặc số điện thoại..."
                  value={quickQuery}
                  autoComplete="off"
                  onChange={(event) => setQuickQuery(event.target.value)}
                />
                {quickLookupLoading ? (
                  <span className="mt-1 block text-xs font-semibold text-[#64748B]">
                    Đang tìm khách...
                  </span>
                ) : null}
                {quickLookupResults.length > 0 ? (
                  <PhoneSuggestionBubble
                    suggestions={quickLookupResults}
                    onSelect={selectQuickLookupSuggestion}
                  />
                ) : null}
              </div>
            </div>

            <form
              aria-busy={isSubmitting}
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4"
              onKeyDown={(event) => {
                if (event.key === "Enter" && isSubmittingRef.current) {
                  event.preventDefault();
                }
              }}
              onSubmit={handleCreateDeposit}
            >
              {isAdmin ? (
                <div className="grid gap-3 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3 sm:col-span-2 sm:grid-cols-2 lg:col-span-12">
                  <label>
                    <span className={labelClass}>Ngày gửi</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={depositForm.depositDate}
                      onChange={(event) =>
                        setDepositForm((current) => ({
                          ...current,
                          depositDate: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Giờ gửi</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={depositForm.depositTime}
                      onChange={(event) =>
                        setDepositForm((current) => ({
                          ...current,
                          depositTime: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
              ) : null}

              <label className="sm:col-span-2 lg:col-span-3">
                <span className={labelClass}>Họ và tên khách</span>
                <input
                  className={inputClass}
                  placeholder="Nhập họ và tên"
                  value={depositForm.fullName}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  required
                />
              </label>

              <div className="sm:col-span-2 lg:col-span-3">
                <label className={labelClass} htmlFor="deposit-phone">
                  Số điện thoại
                </label>
                <input
                  id="deposit-phone"
                  className={inputClass}
                  inputMode="tel"
                  placeholder="Nhập số điện thoại"
                  value={depositForm.phone}
                  onChange={(event) =>
                    setDepositForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  required
                />
                <PhoneSuggestionBubble
                  suggestions={depositSuggestions}
                  onSelect={selectDepositSuggestion}
                />
                {lookupLoading && normalizedDepositPhone.length >= minPhoneSuggestionDigits ? (
                  <span className="mt-2 block text-xs font-semibold leading-5 text-[#64748B]">
                    Đang kiểm tra SĐT...
                  </span>
                ) : activeDepositLookup?.found && pendingDepositTotals ? (
                  <span
                    className={`mt-2 block text-xs font-semibold leading-5 ${
                      pendingDepositTotals.cards < 0 || pendingDepositTotals.balls < 0
                        ? "text-[#DC2626]"
                        : "text-[#2563EB]"
                    }`}
                  >
                    Hiện có: {activeDepositLookup.totalCards} thẻ, {activeDepositLookup.totalBalls} bi - Sau lưu:{" "}
                    {pendingDepositTotals.cards} thẻ, {pendingDepositTotals.balls} bi
                    {activeDepositLookup.activeDeposits > 1
                      ? ` - ${activeDepositLookup.activeDeposits} dòng cùng SĐT`
                      : ""}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:col-span-2 lg:contents">
                <label className="lg:col-span-2">
                  <span className={labelClass}>
                    {depositForm.cardAction === "Lấy thẻ" ? "Thẻ lấy" : "Thẻ gửi"}
                  </span>
                  <input
                    className={inputClass}
                    min="0"
                    type="number"
                    value={depositForm.cards}
                    onChange={(event) =>
                      setDepositForm((current) => ({
                        ...current,
                        cards: event.target.value,
                      }))
                    }
                    required
                  />
                </label>

                <label className="lg:col-span-2">
                  <span className={labelClass}>
                    {depositForm.ballAction === "Lấy bi" ? "Bi lấy" : "Bi gửi"}
                  </span>
                  <input
                    className={inputClass}
                    min="0"
                    type="number"
                    value={depositForm.balls}
                    onChange={(event) =>
                      setDepositForm((current) => ({
                        ...current,
                        balls: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:col-span-2 lg:col-span-2">
                <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2">
                  <div className="grid grid-cols-2 gap-1">
                    {cardActions.map((cardAction) => {
                      const isSelected = depositForm.cardAction === cardAction;

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-xs font-bold transition ${
                            isSelected
                              ? cardActionClass(cardAction)
                              : "bg-white text-[#334155] hover:bg-[#F8FAFC]"
                          }`}
                          key={cardAction}
                          onClick={() =>
                            setDepositForm((current) => ({
                              ...current,
                              cardAction,
                            }))
                          }
                          type="button"
                        >
                          {cardAction === "Gửi thẻ" ? (
                            <Ticket aria-hidden="true" size={15} />
                          ) : (
                            <RefreshCw aria-hidden="true" size={15} />
                          )}
                          {cardAction}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-2">
                  <div className="grid grid-cols-2 gap-1">
                    {ballActions.map((ballAction) => {
                      const isSelected = depositForm.ballAction === ballAction;

                      return (
                        <button
                          aria-pressed={isSelected}
                          className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-xs font-bold transition ${
                            isSelected
                              ? ballActionClass(ballAction)
                              : "bg-white text-[#334155] hover:bg-[#F8FAFC]"
                          }`}
                          key={ballAction}
                          onClick={() =>
                            setDepositForm((current) => ({
                              ...current,
                              ballAction,
                            }))
                          }
                          type="button"
                        >
                          {ballAction === "Gửi bi" ? (
                            <Coins aria-hidden="true" size={15} />
                          ) : (
                            <RefreshCw aria-hidden="true" size={15} />
                          )}
                          {ballAction}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button className={`${primaryButton} w-full px-3`} disabled={isSubmitting} type="submit">
                  {isSubmitting ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" size={18} />
                  ) : (
                    <Plus aria-hidden="true" size={18} />
                  )}
                  {isSubmitting ? "Đang lưu..." : "Lưu"}
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
            {/* Header: Tiêu đề bên trái, Xóa lọc bên phải */}
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0F172A]">Lịch sử bản ghi</h2>
                {isRefreshing ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-2 py-0.5 text-xs font-medium text-[#2563EB]">
                    <RefreshCw className="animate-spin text-[#2563EB]" size={11} />
                    <span className="hidden sm:inline">Đang cập nhật...</span>
                  </span>
                ) : null}
              </div>

              <div className="flex items-center gap-1.5">
                {isAdmin ? (
                  <button
                    className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold shadow-xs transition active:scale-95 ${
                      autoRefreshEnabled
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:border-emerald-400 hover:bg-emerald-100"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                    onClick={() => setAutoRefreshEnabled((prev) => !prev)}
                    title={
                      autoRefreshEnabled
                        ? "Tắt tự động làm mới (mỗi 8s)"
                        : "Bật tự động làm mới (mỗi 8s)"
                    }
                    type="button"
                  >
                    {autoRefreshEnabled ? (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                    ) : (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                    )}
                    <span>Tự động</span>
                  </button>
                ) : null}

                {/* Nút Xóa lọc - vị trí trên cùng bên phải theo thiết kế */}
                <button
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border px-3 text-xs font-semibold shadow-xs transition active:scale-95 ${
                    hasActiveFilters
                      ? "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100 cursor-pointer"
                      : "border-[#CBD5E1] bg-[#F8FAFC] text-[#94A3B8] opacity-60 cursor-not-allowed"
                  }`}
                  disabled={!hasActiveFilters || isRefreshing}
                  onClick={handleClearFilters}
                  title={hasActiveFilters ? "Xóa các bộ lọc đang chọn" : "Chưa có bộ lọc nào"}
                  type="button"
                >
                  <RotateCcw aria-hidden="true" size={12} />
                  <span>Xóa lọc</span>
                </button>
              </div>
            </div>

            {/* Hàng 2 ô: Đồng bộ dữ liệu | Lịch */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {/* Ô 1: Đồng bộ dữ liệu */}
              <button
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={recalculatingTotals}
                onClick={() => void handleRecalculateAllTotals()}
                title="Tính toán và đồng bộ lại dữ liệu cho toàn bộ khách hàng"
                type="button"
              >
                <RefreshCw
                  className={`shrink-0 ${recalculatingTotals ? "animate-spin" : ""}`}
                  aria-hidden="true"
                  size={14}
                />
                <span className="truncate">{recalculatingTotals ? "Đang xử lý..." : "Đồng bộ dữ liệu"}</span>
              </button>

              {/* Ô 2: Lịch (Date filter) */}
              <div
                className={`relative flex h-10 w-full items-center justify-center rounded-md border text-xs font-semibold shadow-xs transition ${
                  filters.date
                    ? "border-blue-400 bg-blue-50 text-blue-700"
                    : "border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-[#F8FAFC]"
                }`}
                title={filters.date ? `Đang lọc ngày: ${formatDate(filters.date)}` : "Lọc theo ngày gửi"}
              >
                {/* Lớp hiển thị trực quan: Icon + Chữ "Lịch" (hoặc Ngày đã chọn) */}
                <div className="pointer-events-none flex items-center justify-center gap-1.5 px-2">
                  <CalendarDays
                    className={`shrink-0 ${filters.date ? "text-blue-600" : "text-[#64748B]"}`}
                    size={14}
                  />
                  <span className="truncate">
                    {filters.date ? formatDate(filters.date) : "Lịch"}
                  </span>
                </div>

                {/* Input chọn ngày phủ toàn bộ ô, kích hoạt picker khi click */}
                <input
                  aria-label="Lọc theo ngày"
                  className="absolute inset-0 z-0 h-full w-full cursor-pointer opacity-0"
                  type="date"
                  value={filters.date}
                  onClick={(e) => {
                    try {
                      e.currentTarget.showPicker();
                    } catch {
                      // Fallback tự nhiên của trình duyệt
                    }
                  }}
                  onChange={(event) => {
                    const next = { ...filters, date: event.target.value };
                    setFilters(next);
                    setAppliedFilters(next);
                    if (event.target.value && isAdmin) {
                      setAdminDashboardDate(event.target.value);
                    }
                    void loadDeposits(next, 1);
                  }}
                />

                {/* Nút xóa ngày lọc [X] */}
                {filters.date ? (
                  <button
                    type="button"
                    className="absolute right-1 z-10 flex h-6 w-6 items-center justify-center rounded-full text-blue-600 hover:bg-blue-200/70 transition cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = { ...filters, date: "" };
                      setFilters(next);
                      setAppliedFilters(next);
                      if (isAdmin) setAdminDashboardDate("");
                      void loadDeposits(next, 1);
                    }}
                    title="Xóa ngày lọc"
                  >
                    <X aria-hidden="true" size={13} />
                  </button>
                ) : null}
              </div>
            </div>

            {/* Selected customer preview */}
            {selectedHistoryCustomer ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-[#0F172A]">{selectedHistoryCustomer.fullName}</div>
                  <div data-phone-number className="text-xs font-semibold text-[#2563EB]">{selectedHistoryCustomer.phone}</div>
                  <div className="mt-0.5 text-xs text-[#64748B]">
                    Thẻ: {selectedHistoryCustomer.totalCards} | Bi: {selectedHistoryCustomer.totalBalls}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {selectedHistoryCustomer.activeDeposits > 0 ? (
                    <span className="rounded-md bg-[#DBEAFE] px-2 py-0.5 text-xs font-semibold text-[#2563EB]">
                      {selectedHistoryCustomer.activeDeposits} đang gửi
                    </span>
                  ) : (
                    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass(selectedHistoryCustomer.latestStatus)}`}>
                      {selectedHistoryCustomer.latestStatus}
                    </span>
                  )}
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#E2E8F0] hover:text-[#0F172A]"
                    onClick={handleClearFilters}
                    title="Bỏ chọn khách hàng"
                    type="button"
                  >
                    <X aria-hidden="true" size={15} />
                  </button>
                </div>
              </div>
            ) : null}

            <form onSubmit={handleSearch}>
              {/* Unified customer search */}
              {!selectedHistoryCustomer ? (
                <div className="mb-3">
                  <label className={labelClass} htmlFor="history-search">
                    Tìm khách theo tên hoặc SĐT
                  </label>
                  <div className="relative">
                    <input
                      id="history-search"
                      className={inputClass}
                      placeholder="Nhập tên hoặc số điện thoại..."
                      value={historyQuery}
                      autoComplete="off"
                      onChange={(event) => setHistoryQuery(event.target.value)}
                    />
                    {historyQueryLoading ? (
                      <span className="mt-1 block text-xs text-[#64748B]">Đang tìm khách...</span>
                    ) : null}
                    {historyQueryResults.length > 0 ? (
                      <PhoneSuggestionBubble
                        suggestions={historyQueryResults}
                        onSelect={selectHistoryCustomer}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Compact status row */}
              <div className="flex">
                <select
                  aria-label="Trạng thái"
                  className="h-11 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A] outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10"
                  value={filters.status}
                  onChange={(event) => {
                    const next = { ...filters, status: event.target.value };
                    setFilters(next);
                    setAppliedFilters(next);
                    void loadDeposits(next, 1);
                  }}
                >
                  <option value="">Tất cả trạng thái</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-lg font-bold">
                  {isAdmin ? "Bảng kiểm tra chi tiết" : "Danh sách gửi giữ"}
                </h2>
                <p className="text-xs text-[#64748B]">
                  {isAdmin
                    ? "Admin xem ngày giờ, nhân viên, trạng thái và lịch sử từng bản ghi."
                    : "Chạm vào cập nhật để sửa thẻ, bi và trạng thái."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  disabled={exporting || pagination.total === 0}
                  onClick={() => void handleExportExcel()}
                  type="button"
                >
                  <FileDown aria-hidden="true" size={18} />
                  {exporting ? "Đang xuất" : "Xuất Excel"}
                </button>
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  disabled={loading || isRefreshing}
                  onClick={handleReloadDeposits}
                  type="button"
                >
                  <RefreshCw
                    className={loading || isRefreshing ? "animate-spin" : ""}
                    aria-hidden="true"
                    size={18}
                  />
                  {loading || isRefreshing ? "Đang tải" : "Tải lại"}
                </button>
              </div>
            </div>

            <div className="divide-y divide-[#E5E7EB] lg:hidden">
              {deposits.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#64748B]">Không có bản ghi.</div>
              ) : null}

              {deposits.map((deposit) => (
                <article className="p-4" key={deposit.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold">{deposit.fullName}</h3>
                      <a data-phone-number className="mt-1 block text-sm font-semibold text-[#2563EB]" href={`tel:${deposit.phone}`}>
                        {deposit.phone}
                      </a>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-md px-3 py-1 text-xs font-semibold ${statusClass(
                          deposit.status,
                        )}`}
                      >
                        {deposit.status}
                      </span>
                      {deposit.cards > 0 ? (
                        <span
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${cardActionClass(
                            deposit.cardAction,
                          )}`}
                        >
                          {deposit.cardAction}
                        </span>
                      ) : null}
                      {deposit.balls > 0 ? (
                        <span
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${ballActionClass(
                            deposit.ballAction,
                          )}`}
                        >
                          {deposit.ballAction}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    {isAdmin ? (
                      <>
                        <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <div className="text-xs font-semibold text-[#64748B]">Ngày gửi</div>
                          <div className="mt-1 font-bold">{formatDate(deposit.depositDate)}</div>
                        </div>
                        <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                          <div className="text-xs font-semibold text-[#64748B]">Giờ gửi</div>
                          <div className="mt-1 font-bold">{deposit.depositTime}</div>
                        </div>
                      </>
                    ) : null}
                    <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <div className="text-xs font-semibold text-[#64748B]">Thẻ</div>
                      <div className="mt-1 text-xl font-bold">{deposit.cards}</div>
                    </div>
                    <div className="rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      <div className="text-xs font-semibold text-[#64748B]">Bi</div>
                      <div className="mt-1 text-xl font-bold">{deposit.balls}</div>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-[#E5E7EB] bg-white p-3 text-sm">
                    <div className="text-xs font-semibold text-[#64748B]">Tổng</div>
                    <div className="mt-1 font-bold">{deposit.totalText}</div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-[#64748B]">
                    <div>
                      Tạo bởi: {creatorName(deposit)} lúc {formatShortDateTime(deposit.createdAt)}
                    </div>
                    <CompactUpdateInfo
                      changeClassName="line-clamp-1 text-xs text-[#475569]"
                      deposit={deposit}
                      lineClassName="text-xs text-[#64748B]"
                    />
                  </div>

                  <div
                    className={`mt-3 grid gap-2 ${
                      isAdmin ? "grid-cols-[1fr_48px_48px_48px]" : "grid-cols-[1fr_auto]"
                    }`}
                  >
                    <button
                      className={`${primaryButton} min-h-12 w-full`}
                      onClick={() => openEdit(deposit)}
                      type="button"
                    >
                      <Save aria-hidden="true" size={18} />
                      Cập nhật
                    </button>
                    <button
                      className={`${secondaryButton} min-h-12 whitespace-nowrap px-3`}
                      aria-label="Tạo tiếp cho khách này"
                      onClick={() => fillFromDeposit(deposit)}
                      title="Tạo tiếp"
                      type="button"
                    >
                      <Plus aria-hidden="true" size={16} />
                      Tạo tiếp
                    </button>
                    {isAdmin ? (
                      <button
                        className={`${secondaryButton} min-h-12 px-0`}
                        aria-label="Lịch sử"
                        onClick={() => void handleToggleHistory(deposit.id)}
                        type="button"
                      >
                        <Eye aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                    {isAdmin ? (
                      <button
                        className={`${secondaryButton} min-h-12 px-0 text-[#DC2626]`}
                        aria-label="Xóa"
                        onClick={() => void handleDeleteDeposit(deposit)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                  </div>

                  {isAdmin && expandedHistoryId === deposit.id ? (
                    <div className="mt-3 space-y-2 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3">
                      {historyLoadingId === deposit.id ? (
                        <div className="text-sm text-[#64748B]">Đang tải lịch sử...</div>
                      ) : null}
                      {historyLoadingId !== deposit.id && deposit.history.length === 0 ? (
                        <div className="text-sm text-[#64748B]">Chưa có lịch sử cập nhật.</div>
                      ) : null}
                      {historyLoadingId !== deposit.id && deposit.history.map((entry) => (
                        <div className="rounded-md bg-white px-3 py-2" key={entry.id || `${entry.at}-${entry.content}`}>
                          <div className="text-xs font-semibold text-[#64748B]">
                            {formatDateTime(entry.at)} · {entry.actorName} · {entry.action}
                          </div>
                          <div className="mt-1 text-sm">{entry.content}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead className="bg-[#F8FAFC] text-xs font-bold uppercase text-[#334155]">
                  <tr>
                    <th className="px-5 py-3">Họ và tên</th>
                    <th className="px-5 py-3">SĐT</th>
                    {isAdmin ? <th className="px-5 py-3">Ngày gửi</th> : null}
                    {isAdmin ? <th className="px-5 py-3">Giờ gửi</th> : null}
                    <th className="px-5 py-3 text-right">Thẻ</th>
                    <th className="px-5 py-3 text-right">Bi</th>
                    <th className="px-5 py-3">Tổng</th>
                    <th className="px-5 py-3">Gửi/Lấy thẻ</th>
                    <th className="px-5 py-3">Gửi/Lấy bi</th>
                    <th className="px-5 py-3">Trạng thái</th>
                    <th className="px-5 py-3">Nhân viên</th>
                    <th className="px-5 py-3">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E7EB]">
                  {deposits.length === 0 ? (
                    <tr>
                      <td
                        className="px-5 py-8 text-center text-[#64748B]"
                        colSpan={isAdmin ? 12 : 10}
                      >
                        Không có bản ghi.
                      </td>
                    </tr>
                  ) : null}

                  {deposits.map((deposit) => (
                    <Fragment key={deposit.id}>
                      <tr className="align-top hover:bg-[#F8FAFC]">
                        <td className="px-5 py-4 font-semibold">{deposit.fullName}</td>
                        <td className="px-5 py-4">{deposit.phone}</td>
                        {isAdmin ? <td className="px-5 py-4">{formatDate(deposit.depositDate)}</td> : null}
                        {isAdmin ? <td className="px-5 py-4">{deposit.depositTime}</td> : null}
                        <td className="px-5 py-4 text-right font-semibold">{deposit.cards}</td>
                        <td className="px-5 py-4 text-right font-semibold">{deposit.balls}</td>
                        <td className="px-5 py-4">{deposit.totalText}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${cardActionClass(
                              deposit.cardAction,
                            )}`}
                          >
                            {deposit.cardAction}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${ballActionClass(
                              deposit.ballAction,
                            )}`}
                          >
                            {deposit.ballAction}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-md px-3 py-1 text-xs font-semibold ${statusClass(
                              deposit.status,
                            )}`}
                          >
                            {deposit.status}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="text-xs text-[#64748B]">
                            Tạo bởi: {creatorName(deposit)} lúc {formatShortDateTime(deposit.createdAt)}
                          </div>
                          <CompactUpdateInfo
                            changeClassName="line-clamp-2 text-xs text-[#475569]"
                            deposit={deposit}
                            lineClassName="text-xs text-[#64748B]"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              className={iconButton}
                              aria-label="Sửa"
                              onClick={() => openEdit(deposit)}
                              type="button"
                            >
                              <Save aria-hidden="true" size={16} />
                            </button>
                            <button
                              className={`${iconButton} text-[#2563EB]`}
                              aria-label="Tạo tiếp cho khách này"
                              onClick={() => fillFromDeposit(deposit)}
                              title="Tạo tiếp"
                              type="button"
                            >
                              <Plus aria-hidden="true" size={16} />
                            </button>
                            {isAdmin ? (
                              <button
                                className={iconButton}
                                aria-label="Lịch sử"
                                onClick={() => void handleToggleHistory(deposit.id)}
                                type="button"
                              >
                                <Eye aria-hidden="true" size={16} />
                              </button>
                            ) : null}
                            {isAdmin ? (
                              <button
                                className={iconButton}
                                aria-label="Xóa"
                                onClick={() => void handleDeleteDeposit(deposit)}
                                type="button"
                              >
                                <Trash2 aria-hidden="true" size={16} />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isAdmin && expandedHistoryId === deposit.id ? (
                        <tr className="bg-[#F8FAFC]">
                          <td className="px-5 py-4" colSpan={10}>
                            <div className="space-y-2">
                              {historyLoadingId === deposit.id ? (
                                <div className="text-sm text-[#64748B]">Đang tải lịch sử...</div>
                              ) : null}
                              {historyLoadingId !== deposit.id && deposit.history.length === 0 ? (
                                <div className="text-sm text-[#64748B]">Chưa có lịch sử cập nhật.</div>
                              ) : null}
                              {historyLoadingId !== deposit.id && deposit.history.map((entry) => (
                                <div
                                  className="rounded-md border border-[#E5E7EB] bg-white px-3 py-2"
                                  key={entry.id || `${entry.at}-${entry.content}`}
                                >
                                  <div className="text-xs font-semibold text-[#64748B]">
                                    {formatDateTime(entry.at)} · {entry.actorName} · {entry.action}
                                  </div>
                                  <div className="mt-1 text-sm">{entry.content}</div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.hasMore ? (
              <div className="flex flex-col items-center gap-2 border-t border-[#E5E7EB] px-4 py-4 sm:px-5">
                <button
                  className={secondaryButton}
                  disabled={isLoadingMore || loading}
                  onClick={handleLoadMore}
                  type="button"
                >
                  <RefreshCw
                    className={isLoadingMore ? "animate-spin" : ""}
                    aria-hidden="true"
                    size={18}
                  />
                  {isLoadingMore ? "Đang tải thêm..." : "Tải thêm"}
                </button>
                <div className="text-xs text-[#64748B]">
                  Đã hiển thị {deposits.length}/{pagination.total}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </div>

      {showCardRanking ? (
        <div
          aria-labelledby="card-ranking-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/50 px-3 py-0 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
        >
          <section className="flex max-h-[92svh] w-full max-w-lg flex-col rounded-t-lg border border-[#E5E7EB] bg-white shadow-xl sm:rounded-lg">
            <div className="shrink-0 border-b border-[#E5E7EB] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#92400E]">
                    <Trophy aria-hidden="true" size={22} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold" id="card-ranking-title">
                      Xếp hạng thẻ
                    </h2>
                    <p className="text-sm text-[#64748B]">Top khách đang gửi nhiều thẻ nhất</p>
                  </div>
                </div>
                <button
                  aria-label="Đóng bảng xếp hạng"
                  className={iconButton}
                  onClick={() => setShowCardRanking(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              {cardRankings.length > 0 ? (
                <ol className="space-y-2">
                  {cardRankings.map((ranking, index) => (
                    <li
                      className="flex items-center gap-3 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3"
                      key={ranking.phone}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          index === 0 ? "bg-[#FEF3C7] text-[#92400E]" : "bg-white text-[#334155]"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold text-[#0F172A]">
                          {ranking.fullName || "Khách chưa tên"}
                        </div>
                        <div className="truncate text-sm text-[#64748B]">{ranking.phone || "Không có SĐT"}</div>
                      </div>
                      <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-[#111827] shadow-sm">
                        {ranking.totalCards} thẻ
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center text-sm font-semibold text-[#64748B]">
                  Chưa có khách đang gửi thẻ.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {showActiveCustomers ? (
        <div
          aria-labelledby="active-customers-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/50 px-3 py-0 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
        >
          <section className="flex max-h-[92svh] w-full max-w-lg flex-col rounded-t-lg border border-[#E5E7EB] bg-white shadow-xl sm:rounded-lg">
            <div className="shrink-0 border-b border-[#E5E7EB] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E0F2FE] text-[#0369A1]">
                    <Ticket aria-hidden="true" size={22} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold" id="active-customers-title">
                      Khách đang gửi
                    </h2>
                    <p className="text-sm text-[#64748B]">Danh sách khách đang gửi thẻ/bi</p>
                  </div>
                </div>
                <button
                  aria-label="Đóng danh sách khách đang gửi"
                  className={iconButton}
                  onClick={() => setShowActiveCustomers(false)}
                  type="button"
                >
                  <X aria-hidden="true" size={20} />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-4 sm:p-5">
              {(() => {
                const activeCustomers = summary.activeCustomers ?? [];
                if (activeCustomers.length === 0) {
                  return (
                    <div className="rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-6 text-center text-sm font-semibold text-[#64748B]">
                      Chưa có khách đang gửi.
                    </div>
                  );
                }

                return (
                  <ol className="space-y-2">
                    {activeCustomers.map((customer, index) => (
                      <li
                        className="flex items-center gap-3 rounded-md border border-[#E5E7EB] bg-[#F8FAFC] p-3"
                        key={customer.phone}
                      >
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold bg-white text-[#334155]"
                        >
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-base font-bold text-[#0F172A]">
                            {customer.fullName || "Khách chưa tên"}
                          </div>
                          <div className="truncate text-sm text-[#64748B]">{customer.phone || "Không có SĐT"}</div>
                        </div>
                        <div className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-bold text-[#111827] shadow-sm">
                          {customer.totalCards > 0 && `${customer.totalCards} thẻ`}
                          {customer.totalCards > 0 && customer.totalBalls > 0 && " · "}
                          {customer.totalBalls > 0 && `${customer.totalBalls} bi`}
                        </div>
                      </li>
                    ))}
                  </ol>
                );
              })()}
            </div>
          </section>
        </div>
      ) : null}

      {editingDeposit ? (
        <div
          aria-label="Update deposit"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/50 px-3 py-0 sm:items-center sm:px-4 sm:py-6"
          data-modal-kind="edit-deposit"
          role="dialog"
        >
          <section className="flex max-h-[92svh] w-full max-w-2xl flex-col overflow-hidden rounded-t-lg border border-[#E5E7EB] bg-white p-4 shadow-xl sm:rounded-lg sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">Cập nhật gửi giữ</h2>
              <button
                aria-label="Đóng"
                className={iconButton}
                onClick={() => setEditingDeposit(null)}
                type="button"
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>

            <form
              className="grid min-h-0 flex-1 gap-3 overflow-y-auto overscroll-contain sm:grid-cols-2 sm:gap-4"
              onSubmit={handleUpdateDeposit}
            >
              {/* fullName and phone: editable by everyone */}
              <label>
                <span className={labelClass}>Họ và tên</span>
                <input
                  className={inputClass}
                  value={editForm.fullName}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                <span className={labelClass}>Số điện thoại</span>
                <input
                  className={inputClass}
                  inputMode="tel"
                  value={editForm.phone}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      phone: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              {isAdmin ? (
                <>
                  <label>
                    <span className={labelClass}>Ngày gửi</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={editForm.depositDate}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          depositDate: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span className={labelClass}>Giờ gửi</span>
                    <input
                      className={inputClass}
                      type="time"
                      value={editForm.depositTime}
                      onChange={(event) =>
                        setEditForm((current) => ({
                          ...current,
                          depositTime: event.target.value,
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}

              <label>
                <span className={labelClass}>
                  {editingDeposit.cardAction === "Lấy thẻ" ? "Thẻ lấy trong bản ghi" : "Thẻ gửi trong bản ghi"}
                </span>
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={editForm.cards}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      cards: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span className={labelClass}>
                  {editingDeposit.ballAction === "Lấy bi" ? "Bi lấy trong bản ghi" : "Bi gửi trong bản ghi"}
                </span>
                <input
                  className={inputClass}
                  min="0"
                  type="number"
                  value={editForm.balls}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      balls: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClass}>Trạng thái</span>
                <select
                  className={selectClass}
                  value={editForm.status}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      status: event.target.value as Status,
                    }))
                  }
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:justify-end">
                <button
                  className={`${secondaryButton} w-full sm:w-auto`}
                  onClick={() => setEditingDeposit(null)}
                  type="button"
                >
                  Hủy
                </button>
                <button className={`${primaryButton} w-full sm:w-auto`} type="submit">
                  <Save aria-hidden="true" size={18} />
                  Lưu cập nhật
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
