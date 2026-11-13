import { useEffect, useState } from "react";
import { navigateTo, useAppPathname } from "./lib/router";
import Dashboard from "./components/Dashboard";
import AdminLoginGate from "./components/AdminLoginGate";
import AdminRecordAction from "./components/AdminRecordAction";
import CardRankingModalGuard from "./components/CardRankingModalGuard";
import InstallGuide from "./components/InstallGuide";
import InstallNudge from "./components/InstallNudge";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import StaffLiquidShell from "./components/StaffLiquidShell";
import TelegramRecordEditor from "./components/TelegramRecordEditor";

type AdminAuthState =
  | { status: "loading" }
  | { status: "unauthorized" }
  | { status: "authorized"; adminDisplayName: string };

function AdminPage() {
  const [auth, setAuth] = useState<AdminAuthState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json() as Promise<{ authorized?: boolean; adminDisplayName?: string }>)
      .then((data) => {
        if (cancelled) return;
        if (data.authorized) {
          setAuth({
            status: "authorized",
            adminDisplayName: data.adminDisplayName || "Danh Thai",
          });
        } else {
          setAuth({ status: "unauthorized" });
        }
      })
      .catch(() => {
        if (!cancelled) setAuth({ status: "unauthorized" });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (auth.status === "loading") {
    return (
      <StaffLiquidShell mode="admin">
        <main className="flex min-h-screen items-center justify-center px-4">
          <p className="text-sm font-semibold text-[#64748B]">Đang kiểm tra quyền quản trị...</p>
        </main>
      </StaffLiquidShell>
    );
  }

  if (auth.status === "unauthorized") {
    return (
      <StaffLiquidShell mode="admin">
        <AdminLoginGate />
      </StaffLiquidShell>
    );
  }

  return (
    <StaffLiquidShell mode="admin">
      <Dashboard adminDisplayName={auth.adminDisplayName} mode="admin" />
      <AdminRecordAction adminDisplayName={auth.adminDisplayName} />
      <CardRankingModalGuard />
    </StaffLiquidShell>
  );
}

function TelegramRecordPage() {
  const [recordId] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return (params.get("record") || params.get("id") || "").trim();
  });

  return <TelegramRecordEditor recordId={recordId} />;
}

function LoginRedirect() {
  useEffect(() => {
    navigateTo("/", { replace: true });
  }, []);
  return null;
}

export default function App() {
  const pathname = useAppPathname();

  let page;
  if (pathname === "/admin") {
    page = <AdminPage />;
  } else if (pathname === "/install") {
    page = <InstallGuide />;
  } else if (pathname === "/telegram/record") {
    page = <TelegramRecordPage />;
  } else if (pathname === "/login") {
    page = <LoginRedirect />;
  } else {
    page = (
      <StaffLiquidShell mode="staff">
        <Dashboard mode="staff" />
        <CardRankingModalGuard />
      </StaffLiquidShell>
    );
  }

  return (
    <>
      <ServiceWorkerRegistration />
      <InstallNudge />
      {page}
    </>
  );
}
