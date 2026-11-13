"use client";

import { useState, FormEvent } from "react";
import { UserRound, X, Ticket } from "lucide-react";
import { AppLink } from "../lib/router";

const inputClass =
  "h-12 w-full rounded-md border border-[#CBD5E1] bg-white px-3 text-[15px] text-[#0F172A] outline-none transition placeholder:text-[#94A3B8] focus:border-[#111827] focus:ring-2 focus:ring-[#111827]/10";
const labelClass = "mb-2 block text-sm font-semibold text-[#0F172A]";
const primaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#111827] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1F2937] disabled:opacity-50";
const secondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] shadow-sm transition hover:bg-[#F8FAFC] disabled:opacity-50";

export default function AdminLoginGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = password.trim();

    if (!value) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: value }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message ?? "Mật khẩu không chính xác.");
      }

      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Có lỗi xảy ra.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F8FAFC] px-4 text-[#0F172A]">
      <section className="w-full max-w-md rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#111827] text-white">
            <UserRound aria-hidden="true" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Ký gửi PINBALL</h1>
            <p className="text-sm text-[#64748B]">Xác thực mật khẩu người quản trị</p>
          </div>
        </div>

        {error ? (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-sm font-semibold text-[#991B1B]">
            <span>{error}</span>
            <button
              aria-label="Đóng thông báo"
              className="rounded p-1 hover:bg-black/5"
              onClick={() => setError(null)}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label>
            <span className={labelClass}>Mật khẩu Admin</span>
            <input
              autoFocus
              className={inputClass}
              placeholder="Nhập mật khẩu Admin"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className={`${primaryButton} w-full`} type="submit" disabled={loading}>
            {loading ? "Đang xác thực..." : "Đăng nhập"}
          </button>
          <AppLink href="/" className={`${secondaryButton} w-full flex items-center justify-center`}>
            <Ticket size={18} />
            Quay lại trang nhân viên
          </AppLink>
        </form>
      </section>
    </main>
  );
}
