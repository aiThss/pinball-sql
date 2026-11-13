"use client";

import { FormEvent, useEffect, useState } from "react";
import { Save, Trash2, X } from "lucide-react";

type Status = "Đang gửi" | "Đã nhận lại" | "Đã đổi quà" | "Đã hủy";
type RecordAction = "edit" | "delete";

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

const statuses: Status[] = ["Đang gửi", "Đã nhận lại", "Đã đổi quà", "Đã hủy"];
const inputClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const selectClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const labelClass = "mb-2 block text-sm font-semibold text-[#0F172A]";
const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#111827] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F2937] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50";
const dangerButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#DC2626] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#B91C1C] disabled:cursor-not-allowed disabled:opacity-50";

function clearActionUrl() {
  window.history.replaceState({}, "", "/admin");
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message ?? "Có lỗi xảy ra.");
  }

  return data as T;
}

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

export default function AdminRecordAction({ adminDisplayName }: { adminDisplayName: string }) {
  const [action, setAction] = useState<RecordAction | null>(null);
  const [deposit, setDeposit] = useState<Deposit | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const recordId = params.get("record")?.trim() ?? "";
    const requestedAction = params.get("action");

    if (!recordId || (requestedAction !== "edit" && requestedAction !== "delete")) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      setAction(requestedAction);
      setLoading(true);
      setError(null);

      void apiRequest<{ deposit: Deposit }>(`/api/admin/deposits/${encodeURIComponent(recordId)}`)
        .then((data) => {
          if (cancelled) return;
          setDeposit(data.deposit);
          setEditForm(toEditForm(data.deposit));
          clearActionUrl();
        })
        .catch((requestError) => {
          if (cancelled) return;
          setError(requestError instanceof Error ? requestError.message : "Không tải được bản ghi.");
          clearActionUrl();
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  function closeModal() {
    clearActionUrl();
    setAction(null);
    setDeposit(null);
    setEditForm(null);
    setError(null);
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!deposit || !editForm) return;

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/deposits/${deposit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          actorName: adminDisplayName,
          cards: Number(editForm.cards),
          balls: Number(editForm.balls),
        }),
      });
      window.location.replace("/admin");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không cập nhật được bản ghi.");
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deposit) return;

    setSubmitting(true);
    setError(null);

    try {
      await apiRequest(`/api/deposits/${deposit.id}`, { method: "DELETE" });
      window.location.replace("/admin");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không xoá được bản ghi.");
      setSubmitting(false);
    }
  }

  if (!action) return null;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#0F172A]/55 px-3 sm:items-center sm:px-4 sm:py-6"
      role="dialog"
    >
      <section className="max-h-[92svh] w-full max-w-2xl overflow-y-auto rounded-t-lg border border-[#E5E7EB] bg-white p-4 text-[#0F172A] shadow-xl sm:rounded-lg sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {action === "edit" ? "Cập nhật bản ghi" : "Xác nhận xoá bản ghi"}
            </h2>
            <p className="mt-1 text-sm text-[#64748B]">
              Mở từ nút thao tác trong thông báo Telegram.
            </p>
          </div>
          <button
            aria-label="Đóng"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-[#E5E7EB] bg-[#F8FAFC] text-[#334155] transition hover:bg-[#EEF2F7]"
            disabled={submitting}
            onClick={closeModal}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-sm font-semibold text-[#991B1B]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
            Đang tải bản ghi...
          </div>
        ) : !deposit || !editForm ? (
          <div className="space-y-4">
            <div className="rounded-md border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-8 text-center text-sm font-semibold text-[#64748B]">
              Không thể mở bản ghi này.
            </div>
            <div className="flex justify-end">
              <button className={secondaryButton} onClick={closeModal} type="button">
                Đóng
              </button>
            </div>
          </div>
        ) : action === "edit" ? (
          <form className="grid gap-3 sm:grid-cols-2 sm:gap-4" onSubmit={handleUpdate}>
            <label>
              <span className={labelClass}>Họ và tên</span>
              <input
                className={inputClass}
                value={editForm.fullName}
                onChange={(event) => setEditForm((current) => current ? { ...current, fullName: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span className={labelClass}>Số điện thoại</span>
              <input
                className={inputClass}
                inputMode="tel"
                value={editForm.phone}
                onChange={(event) => setEditForm((current) => current ? { ...current, phone: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span className={labelClass}>Ngày gửi</span>
              <input
                className={inputClass}
                type="date"
                value={editForm.depositDate}
                onChange={(event) => setEditForm((current) => current ? { ...current, depositDate: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span className={labelClass}>Giờ gửi</span>
              <input
                className={inputClass}
                type="time"
                value={editForm.depositTime}
                onChange={(event) => setEditForm((current) => current ? { ...current, depositTime: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span className={labelClass}>Thẻ còn lại</span>
              <input
                className={inputClass}
                min="0"
                type="number"
                value={editForm.cards}
                onChange={(event) => setEditForm((current) => current ? { ...current, cards: event.target.value } : current)}
                required
              />
            </label>
            <label>
              <span className={labelClass}>Bi còn lại</span>
              <input
                className={inputClass}
                min="0"
                type="number"
                value={editForm.balls}
                onChange={(event) => setEditForm((current) => current ? { ...current, balls: event.target.value } : current)}
                required
              />
            </label>
            <label className="sm:col-span-2">
              <span className={labelClass}>Trạng thái</span>
              <select
                className={selectClass}
                value={editForm.status}
                onChange={(event) => setEditForm((current) => current ? { ...current, status: event.target.value as Status } : current)}
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:flex sm:justify-end">
              <button className={`${secondaryButton} w-full sm:w-auto`} disabled={submitting} onClick={closeModal} type="button">
                Huỷ
              </button>
              <button className={`${primaryButton} w-full sm:w-auto`} disabled={submitting} type="submit">
                <Save aria-hidden="true" size={18} />
                {submitting ? "Đang lưu..." : "Lưu cập nhật"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-[#FCA5A5] bg-[#FEF2F2] p-4">
              <div className="font-bold text-[#991B1B]">Hành động này không thể hoàn tác.</div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-[#64748B]">Khách hàng</dt>
                  <dd className="font-bold">{deposit.fullName}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#64748B]">Số điện thoại</dt>
                  <dd className="font-bold">{deposit.phone}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#64748B]">Ngày giờ gửi</dt>
                  <dd className="font-bold">{deposit.depositDate} · {deposit.depositTime}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[#64748B]">Số lượng</dt>
                  <dd className="font-bold">{deposit.cards} thẻ · {deposit.balls} bi</dd>
                </div>
              </dl>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <button className={`${secondaryButton} w-full sm:w-auto`} disabled={submitting} onClick={closeModal} type="button">
                Huỷ
              </button>
              <button className={`${dangerButton} w-full sm:w-auto`} disabled={submitting} onClick={() => void handleDelete()} type="button">
                <Trash2 aria-hidden="true" size={18} />
                {submitting ? "Đang xoá..." : "Xác nhận xoá"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
