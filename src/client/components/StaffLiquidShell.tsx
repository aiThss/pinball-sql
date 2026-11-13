import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Download,
  LogOut,
  Moon,
  Sun,
  Ticket,
} from "lucide-react";
import { useAppRouter } from "../lib/router";
import LiquidGlassTabBar, { type LiquidGlassTabItem } from "./LiquidGlassTabBar";
import styles from "./StaffLiquidShell.module.css";
import roundedStyles from "./StaffRoundedCards.module.css";
import quickStyles from "./StaffQuickActions.module.css";
import darkStyles from "./StaffDarkContrast.module.css";
import identityStyles from "./StaffIdentityBanner.module.css";
import paginationStyles from "./StaffRecordPagination.module.css";

type StaffTheme = "light" | "dark";
type ShellMode = "staff" | "admin";

const staffNameStorageKey = "pinball_staff_name";
const themeStorageKey = "pinball_staff_theme";

function capitalizeStaffName(value: string) {
  return value.replace(/(^|\s)(\p{L})/gu, (_, separator: string, letter: string) =>
    `${separator}${letter.toLocaleUpperCase("vi-VN")}`
  );
}

function handleStaffNameChange(event: FormEvent<HTMLDivElement>, mode: ShellMode) {
  if (mode !== "staff") return;

  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.placeholder !== "Ví dụ: Danh Thai") return;

  const capitalizedName = capitalizeStaffName(target.value);
  if (capitalizedName !== target.value) target.value = capitalizedName;
}

function getInitialTheme(): StaffTheme {
  if (typeof window === "undefined") return "light";

  try {
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Fall back to system preference when storage is unavailable.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncDocumentTheme(theme: StaffTheme) {
  const color = theme === "dark" ? "#111318" : "#eef0f4";
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", color);
  });
  document.documentElement.style.backgroundColor = color;
  document.documentElement.style.colorScheme = theme;
  document.body.style.backgroundColor = color;
}

export default function StaffLiquidShell({
  children,
  mode = "staff",
}: {
  children: ReactNode;
  mode?: ShellMode;
}) {
  const router = useAppRouter();
  const [theme, setTheme] = useState<StaffTheme>("light");
  const [quickActionsMount, setQuickActionsMount] = useState<HTMLElement | null>(null);
  const [showGateFooter, setShowGateFooter] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initialTheme = getInitialTheme();
    const timer = window.setTimeout(() => {
      setTheme(initialTheme);
      syncDocumentTheme(initialTheme);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.documentElement.style.removeProperty("background-color");
      document.documentElement.style.removeProperty("color-scheme");
      document.body.style.removeProperty("background-color");
    };
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    let mount: HTMLDivElement | null = null;
    const ensureMount = () => {
      if (!shell.isConnected) return;
      if (mount && shell.contains(mount)) return;
      const contentSection = shell.querySelector<HTMLElement>("main > div > section");
      if (!contentSection) return;
      mount = document.createElement("div");
      mount.className = quickStyles.quickActionsMount;
      contentSection.prepend(mount);
      setQuickActionsMount(mount);
    };

    ensureMount();
    const observer = new MutationObserver(ensureMount);
    observer.observe(shell, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mount?.remove();
    };
  }, [mode]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const updateGateState = () => {
      if (!shell.isConnected) return;
      const gate = shell.querySelector("main > section");
      const dashboardHeader = shell.querySelector("main > header");
      setShowGateFooter(Boolean(gate && !dashboardHeader));
    };

    updateGateState();
    const observer = new MutationObserver(updateGateState);
    observer.observe(shell, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(themeStorageKey, next);
      } catch {
        // Keep current session theme usable even if storage is blocked.
      }
      syncDocumentTheme(next);
      return next;
    });
  };

  const resetStaffName = () => {
    try {
      window.localStorage.removeItem(staffNameStorageKey);
    } catch {
      // Reload resets current session if storage is unavailable.
    }
    window.location.reload();
  };

  const handleAdminLogout = async () => {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) router.replace("/");
    } catch {
      // Keep current session intact if network fails.
    }
  };

  const tabItems = useMemo<LiquidGlassTabItem[]>(
    () => [
      mode === "admin"
        ? {
            id: "staff-home",
            label: "Nhân viên",
            icon: <Ticket aria-hidden="true" />,
            href: "/",
            tone: "blue",
          }
        : {
            id: "install-app",
            label: "Tải xuống",
            icon: <Download aria-hidden="true" />,
            href: "/install",
            tone: "blue",
          },
      {
        id: "theme-mode",
        label: theme === "light" ? "Light mode" : "Dark mode",
        icon: theme === "light" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />,
        onClick: toggleTheme,
        tone: "green",
      },
      mode === "admin"
        ? {
            id: "admin-logout",
            label: "Đăng xuất",
            icon: <LogOut aria-hidden="true" />,
            onClick: () => void handleAdminLogout(),
            tone: "orange",
          }
        : {
            id: "reset-staff",
            label: "Nhập lại tên",
            icon: <LogOut aria-hidden="true" />,
            onClick: resetStaffName,
            tone: "orange",
          },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, theme]
  );

  const quickActions = quickActionsMount
    ? createPortal(
        <LiquidGlassTabBar
          items={tabItems}
          defaultActiveId="theme-mode"
          ariaLabel={mode === "admin" ? "Thao tác nhanh quản trị" : "Cài đặt nhanh nhân viên"}
          theme={theme}
        />,
        quickActionsMount
      )
    : null;

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${roundedStyles.roundedShell} ${quickStyles.quickActionsShell} ${darkStyles.darkContrastShell} ${identityStyles.identityBannerShell} ${paginationStyles.paginationShell}`}
      data-shell-mode={mode}
      data-staff-theme={theme}
      onChangeCapture={(event) => handleStaffNameChange(event, mode)}
    >
      <div className={styles.backdrop} aria-hidden="true" />
      {quickActions}
      <div className={styles.content}>{children}</div>
      <footer
        className={`${paginationStyles.siteFooter} ${
          showGateFooter ? paginationStyles.gateFooter : paginationStyles.dashboardFooter
        }`}
      >
        <div className={paginationStyles.gateBrand}>
          <span>© 2026 • Made by</span>
          <span className={paginationStyles.copyrightSignature}>aiThs</span>
        </div>
        <div className={paginationStyles.gateContactLabel}>Mọi vấn đề cần hỗ trợ vui lòng liên hệ qua</div>
        <ChevronDown className={paginationStyles.gateArrow} aria-hidden="true" />
        <a className={paginationStyles.gateEmail} href="mailto:support@aiths.cloud">
          support@aiths.cloud
        </a>
      </footer>
    </div>
  );
}
