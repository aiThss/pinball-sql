"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Save, Ticket, XCircle } from "lucide-react";

type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";

type Deposit = {
  id: string;
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cards: number;
  balls: number;
  status: Status;
};

type EditForm = {
  fullName: string;
  phone: string;
  depositDate: string;
  depositTime: string;
  cards: string;
  balls: string;
  status: Status;
};

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  HapticFeedback?: {
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];
const fieldClass =
  "h-12 w-full rounded-xl border border-black/10 px-3 text-[15px] outline-none transition focus:border-black/30 focus:ring-2 focus:ring-black/10";
const labelClass = "mb-2 block text-sm font-semibold";

function toEditForm(deposit: Deposit): EditForm {
  return {
    fullName: deposit.fullName,
    phone: deposit.phone,
    depositDate: deposit.depositDate,
    depositTime: deposit.depositTime,
    cards: String(deposit.cards),
    balls: String(deposit.balls),
    status: deposit.status,
  };
}

async function apiRequest<T>(url: string, initData: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("x-telegram-init-data", initData);

  const response = await fetch(url, {
    ...init,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
}

function loadTelegramWebApp() {
  return new Promise<TelegramWebApp>((resolve, reject) => {
    if (window.Telegram?.WebApp) {
      resolve(window.Telegram.WebApp);
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>("script[data-telegram-web-app]");
    const script = existingScript ?? document.createElement("script");

    const finish = () => {
      if (window.Telegram?.WebApp) {
        resolve(window.Telegram.WebApp);
      } else {
        reject(new Error("Không khởi tạo được Telegram Mini App."));
      }
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Không tải được thư viện Telegram Mini App.")),
      { once: true },
    );

    if (!existingScript) {
      script.src = "https://telegram.org/js/telegram-web-app.js?62";
      script.async = true;
      script.dataset.telegramWebApp = "true";
      document.head.appendChild(script);
    }
  });
}

export default function TelegramRecordEditor({ recordId }: { recordId: string }) {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [initData, setInitData] = useState("");
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const originalForm = useMemo(() => (deposit ? toEditForm(deposit) : null), [deposit]);
  const isDirty = Boolean(form && originalForm && JSON.stringify(form) !== JSON.stringify(originalForm));

  useEffect(() => {
    let cancelled = false;

    void loadTelegramWebApp()
      .then(async (telegramWebApp) => {
        if (cancelled) return;

        telegramWebApp.ready();
        telegramWebApp.expand();
        telegramWebApp.setHeaderColor?.("secondary_bg_color");
        telegramWebApp.setBackgroundColor?.("bg_color");
        setWebApp(telegramWebApp);

        const telegramInitData = telegramWebApp.initData || "";
        setInitData(telegramInitData);

        if (!recordId) {
          throw new Error("ID bản ghi không hợp lệ.");
        }

        if (!telegramInitData) {
          throw new Error("Hãy mở chức năng này từ nút Cập nhật trong Telegram.");
        }

        const data = await apiRequest<{ deposit: Deposit }>(
          `/api/telegram/deposits/${encodeURIComponent(recordId)}`,
          telegramInitData,
        );

        if (cancelled) return;
        setDeposit(data.deposit);
        setForm(toEditForm(data.deposit));
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Không tải được bản ghi.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  useEffect(() => {
    if (!webApp) return;

    if (isDirty) {
      webApp.enableClosingConfirmation?.();
    } else {
      webApp.disableClosingConfirmation?.();
    }
  }, [isDirty, webApp]);

  useEffect(() => {
    if (!error) return;

    const timer = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !initData || !deposit) return;

    setSaving(true);
    setError(null);

    try {
      const data = await apiRequest<{ deposit: Deposit }>(
        `/api/telegram/deposits/${encodeURIComponent(deposit.id)}`,
        initData,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            cards: Number(form.cards),
            balls: Number(form.balls),
          }),
        },
      );

      setDeposit(data.deposit);
      setForm(toEditForm(data.deposit));
      setSuccess(true);
      webApp?.disableClosingConfirmation?.();
      webApp?.HapticFeedback?.notificationOccurred("success");
      window.setTimeout(() => webApp?.close(), 850);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được bản ghi.");
      webApp?.HapticFeedback?.notificationOccurred("error");
      setSaving(false);
    }
  }

  const surfaceStyle = {
    backgroundColor: "var(--tg-theme-secondary-bg-color, #ffffff)",
    color: "var(--tg-theme-text-color, #0f172a)",
  };
  const fieldStyle = {
    backgroundColor: "var(--tg-theme-bg-color, #ffffff)",
    color: "var(--tg-theme-text-color, #0f172a)",
  };

  return (
    <main
      className="min-h-screen px-3 py-4 sm:px-5"
      style={{
        backgroundColor: "var(--tg-theme-bg-color, #f8fafc)",
        color: "var(--tg-theme-text-color, #0f172a)",
      }}
    >
      <section className="mx-auto w-full max-w-xl rounded-2xl p-4 shadow-sm sm:p-5" style={surfaceStyle}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#111827] text-white">
            <Ticket aria-hidden="true" size={24} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">Cập nhật bản ghi Pinball</h1>
            <p className="text-sm opacity-65">Chỉnh sửa trực tiếp bên trong Telegram</p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-800">
            <XCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
            <span>{error}</span>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-6 text-center font-bold text-emerald-800">
            Đã cập nhật bản ghi. Đang đóng Mini App...
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm font-semibold opacity-65">
            Đang tải bản ghi...
          </div>
        ) : !form ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-black/15 px-4 py-10 text-center text-sm font-semibold opacity-65">
              Không thể mở bản ghi này.
            </div>
            <button
              className="h-12 w-full rounded-xl border border-black/10 font-semibold"
              onClick={() => webApp?.close()}
              type="button"
            >
              Đóng
            </button>
          </div>
        ) : (
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
            <label className="sm:col-span-2">
              <span className={labelClass}>Họ và tên</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                value={form.fullName}
                onChange={(event) => setForm((current) => current ? { ...current, fullName: event.target.value } : current)}
                required
              />
            </label>

            <label className="sm:col-span-2">
              <span className={labelClass}>Số điện thoại</span>
              <input
                className={fieldClass}
                inputMode="tel"
                style={fieldStyle}
                value={form.phone}
                onChange={(event) => setForm((current) => current ? { ...current, phone: event.target.value } : current)}
                required
              />
            </label>

            <label>
              <span className={labelClass}>Ngày gửi</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="date"
                value={form.depositDate}
                onChange={(event) => setForm((current) => current ? { ...current, depositDate: event.target.value } : current)}
                required
              />
            </label>

            <label>
              <span className={labelClass}>Giờ gửi</span>
              <input
                className={fieldClass}
                style={fieldStyle}
                type="time"
                value={form.depositTime}
                onChange={(event) => setForm((current) => current ? { ...current, depositTime: event.target.value } : current)}
                required
              />
            </label>

            <label>
              <span className={labelClass}>Thẻ còn lại</span>
              <input
                className={fieldClass}
                min="0"
                style={fieldStyle}
                type="number"
                value={form.cards}
                onChange={(event) => setForm((current) => current ? { ...current, cards: event.target.value } : current)}
                required
              />
            </label>

            <label>
              <span className={labelClass}>Bi còn lại</span>
              <input
                className={fieldClass}
                min="0"
                style={fieldStyle}
                type="number"
                value={form.balls}
                onChange={(event) => setForm((current) => current ? { ...current, balls: event.target.value } : current)}
                required
              />
            </label>

            <label className="sm:col-span-2">
              <span className={labelClass}>Trạng thái</span>
              <select
                className={fieldClass}
                style={fieldStyle}
                value={form.status}
                onChange={(event) => setForm((current) => current ? { ...current, status: event.target.value as Status } : current)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 pt-1 sm:col-span-2">
              <button
                className="h-12 rounded-xl border border-black/10 font-semibold disabled:opacity-50"
                disabled={saving}
                onClick={() => webApp?.close()}
                type="button"
              >
                Huỷ
              </button>
              <button
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 font-semibold text-white disabled:opacity-50"
                disabled={saving || !isDirty}
                type="submit"
              >
                <Save aria-hidden="true" size={18} />
                {saving ? "Đang lưu..." : "Lưu cập nhật"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
