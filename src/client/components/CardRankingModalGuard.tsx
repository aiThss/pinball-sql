"use client";

import { useEffect } from "react";

const modalSelector =
  '[role="dialog"][aria-modal="true"][aria-labelledby="card-ranking-title"], [role="dialog"][aria-modal="true"][aria-labelledby="active-customers-title"], [role="dialog"][aria-modal="true"][data-modal-kind="edit-deposit"]';
const closeButtonSelector =
  'button[aria-label="Đóng bảng xếp hạng"], button[aria-label="Đóng danh sách khách đang gửi"]';
const historyStateKey = "__pinballCardRankingModal";

const htmlLockProperties = ["overflow", "overscroll-behavior"] as const;
const bodyLockProperties = [
  "position",
  "top",
  "left",
  "right",
  "width",
  "overflow",
  "overscroll-behavior",
  "padding-right",
] as const;

type StyleSnapshot = Map<string, { value: string; priority: string }>;

type ActiveGuard = {
  modal: HTMLElement;
  release: () => void;
};

function captureStyles(element: HTMLElement, properties: readonly string[]): StyleSnapshot {
  return new Map(
    properties.map((property) => [
      property,
      {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      },
    ]),
  );
}

function restoreStyles(element: HTMLElement, snapshot: StyleSnapshot) {
  snapshot.forEach(({ value, priority }, property) => {
    if (value) {
      element.style.setProperty(property, value, priority);
    } else {
      element.style.removeProperty(property);
    }
  });
}

function setImportant(element: HTMLElement | null, property: string, value: string) {
  element?.style.setProperty(property, value, "important");
}

function isDarkTheme(modal: HTMLElement) {
  return modal.closest<HTMLElement>("[data-staff-theme]")?.dataset.staffTheme === "dark";
}

function applyOpaqueModalTheme(modal: HTMLElement) {
  const dark = isDarkTheme(modal);
  const panel = modal.firstElementChild instanceof HTMLElement ? modal.firstElementChild : null;
  const header = panel?.firstElementChild instanceof HTMLElement ? panel.firstElementChild : null;
  const list = header?.nextElementSibling instanceof HTMLElement ? header.nextElementSibling : null;
  const closeButton = modal.querySelector<HTMLElement>(closeButtonSelector);

  setImportant(modal, "z-index", "10000");
  setImportant(
    modal,
    "background",
    dark
      ? "linear-gradient(180deg, #14161b 0%, #07080a 100%)"
      : "linear-gradient(180deg, #edf0f5 0%, #d4dae4 100%)",
  );
  setImportant(modal, "backdrop-filter", "none");
  setImportant(modal, "-webkit-backdrop-filter", "none");
  setImportant(modal, "overflow", "hidden");
  setImportant(modal, "overscroll-behavior", "none");
  setImportant(modal, "touch-action", "auto");
  setImportant(modal, "isolation", "isolate");
  setImportant(modal, "padding-top", "max(12px, env(safe-area-inset-top))");
  setImportant(modal, "padding-bottom", "max(0px, env(safe-area-inset-bottom))");
  setImportant(modal, "padding-left", "max(12px, env(safe-area-inset-left))");
  setImportant(modal, "padding-right", "max(12px, env(safe-area-inset-right))");

  setImportant(panel, "min-height", "0");
  setImportant(
    panel,
    "max-height",
    "calc(100dvh - max(24px, env(safe-area-inset-top)) - max(12px, env(safe-area-inset-bottom)))",
  );
  setImportant(panel, "overflow", "hidden");
  setImportant(panel, "border-radius", "28px");
  setImportant(panel, "background-clip", "padding-box");
  setImportant(panel, "color", dark ? "#f5f5f7" : "#111827");
  setImportant(panel, "background", dark ? "#202126" : "#ffffff");
  setImportant(panel, "border-color", dark ? "#505158" : "#c7ced8");
  setImportant(panel, "backdrop-filter", "none");
  setImportant(panel, "-webkit-backdrop-filter", "none");
  setImportant(panel, "box-shadow", dark ? "0 28px 80px #000000" : "0 28px 80px #66708566");
  setImportant(panel, "opacity", "1");
  setImportant(panel, "filter", "none");
  setImportant(panel, "touch-action", "auto");
  setImportant(panel, "isolation", "isolate");

  setImportant(header, "overflow", "hidden");
  setImportant(header, "border-top-left-radius", "inherit");
  setImportant(header, "border-top-right-radius", "inherit");
  setImportant(header, "background-clip", "padding-box");
  setImportant(header, "background", dark ? "#202126" : "#ffffff");
  setImportant(header, "border-color", dark ? "#45464c" : "#d6dbe3");
  setImportant(header, "backdrop-filter", "none");
  setImportant(header, "-webkit-backdrop-filter", "none");
  setImportant(header, "opacity", "1");

  setImportant(list, "min-height", "0");
  setImportant(list, "background", dark ? "#202126" : "#ffffff");
  setImportant(list, "overflow-y", "auto");
  setImportant(list, "overscroll-behavior", "contain");
  setImportant(list, "-webkit-overflow-scrolling", "touch");
  setImportant(list, "touch-action", "pan-y");
  setImportant(list, "scrollbar-gutter", "stable");
  setImportant(list, "opacity", "1");

  setImportant(closeButton, "background", dark ? "#303137" : "#f1f3f6");
  setImportant(closeButton, "border-color", dark ? "#56575f" : "#cbd1da");
  setImportant(closeButton, "backdrop-filter", "none");
  setImportant(closeButton, "-webkit-backdrop-filter", "none");
  setImportant(closeButton, "box-shadow", "none");
  setImportant(closeButton, "opacity", "1");

  const rows = list ? Array.from(list.querySelectorAll<HTMLElement>("ol > li")) : [];
  rows.forEach((row, index) => {
    const rank = row.firstElementChild instanceof HTMLElement ? row.firstElementChild : null;
    const total = row.lastElementChild instanceof HTMLElement ? row.lastElementChild : null;

    setImportant(row, "background", dark ? "#2b2c31" : "#f5f7fa");
    setImportant(row, "border-color", dark ? "#4b4c53" : "#cfd5de");
    setImportant(row, "backdrop-filter", "none");
    setImportant(row, "-webkit-backdrop-filter", "none");
    setImportant(row, "box-shadow", dark ? "0 8px 18px #00000033" : "0 8px 18px #47556914");
    setImportant(row, "opacity", "1");

    setImportant(rank, "background", index === 0 ? "#fef3c7" : dark ? "#3a3b41" : "#ffffff");
    setImportant(rank, "border", index === 0 ? "1px solid #fde68a" : dark ? "1px solid #55565e" : "1px solid #d7dce4");
    setImportant(rank, "backdrop-filter", "none");
    setImportant(rank, "-webkit-backdrop-filter", "none");
    setImportant(rank, "box-shadow", "none");
    setImportant(rank, "opacity", "1");

    setImportant(total, "background", dark ? "#3a3b41" : "#ffffff");
    setImportant(total, "border", dark ? "1px solid #55565e" : "1px solid #d7dce4");
    setImportant(total, "backdrop-filter", "none");
    setImportant(total, "-webkit-backdrop-filter", "none");
    setImportant(total, "box-shadow", "none");
    setImportant(total, "opacity", "1");
  });

  return { panel, rows };
}

function animateModal(modal: HTMLElement, panel: HTMLElement | null, rows: HTMLElement[]) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  modal.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: 170,
    easing: "ease-out",
    fill: "both",
  });

  panel?.animate(
    [
      { opacity: 0.72, transform: "translateY(24px) scale(0.985)" },
      { opacity: 1, transform: "translateY(0) scale(1)" },
    ],
    {
      duration: 230,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );

  rows.forEach((row, index) => {
    row.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 190,
        delay: Math.min(index, 8) * 24,
        easing: "ease-out",
        fill: "both",
      },
    );
  });
}

function activateGuard(modal: HTMLElement): ActiveGuard {
  const html = document.documentElement;
  const body = document.body;
  const scrollY = window.scrollY;
  const htmlStyles = captureStyles(html, htmlLockProperties);
  const bodyStyles = captureStyles(body, bodyLockProperties);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const historyToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const shell = modal.closest<HTMLElement>("[data-staff-theme]");
  let released = false;

  const scrollbarGap = Math.max(0, window.innerWidth - html.clientWidth);
  const currentPaddingRight = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;

  setImportant(html, "overflow", "hidden");
  setImportant(html, "overscroll-behavior", "none");
  setImportant(body, "position", "fixed");
  setImportant(body, "top", `-${scrollY}px`);
  setImportant(body, "left", "0");
  setImportant(body, "right", "0");
  setImportant(body, "width", "100%");
  setImportant(body, "overflow", "hidden");
  setImportant(body, "overscroll-behavior", "none");
  if (scrollbarGap > 0) {
    setImportant(body, "padding-right", `${currentPaddingRight + scrollbarGap}px`);
  }

  const themedElements = applyOpaqueModalTheme(modal);
  animateModal(modal, themedElements.panel, themedElements.rows);

  const currentHistoryState =
    history.state && typeof history.state === "object" ? history.state : {};
  history.pushState(
    { ...currentHistoryState, [historyStateKey]: historyToken },
    "",
    window.location.href,
  );

  const getCloseButton = () =>
    modal.querySelector<HTMLButtonElement>(closeButtonSelector) ??
    modal.querySelector<HTMLButtonElement>("button");
  const getFocusableElements = () =>
    Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (!modal.contains(event.target as Node)) {
      getCloseButton()?.focus({ preventScroll: true });
    }
  };

  const handlePopState = () => {
    if (modal.isConnected) {
      getCloseButton()?.click();
    }
  };

  const themeObserver = shell
    ? new MutationObserver(() => {
        applyOpaqueModalTheme(modal);
      })
    : null;

  themeObserver?.observe(shell as HTMLElement, {
    attributes: true,
    attributeFilter: ["data-staff-theme"],
  });

  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("focusin", handleFocusIn, true);
  window.addEventListener("popstate", handlePopState);

  window.requestAnimationFrame(() => {
    getCloseButton()?.focus({ preventScroll: true });
  });

  return {
    modal,
    release() {
      if (released) return;
      released = true;

      themeObserver?.disconnect();
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      window.removeEventListener("popstate", handlePopState);

      restoreStyles(html, htmlStyles);
      restoreStyles(body, bodyStyles);
      window.scrollTo(0, scrollY);

      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }

      if (history.state?.[historyStateKey] === historyToken) {
        window.setTimeout(() => {
          if (history.state?.[historyStateKey] === historyToken) {
            history.back();
          }
        }, 0);
      }
    },
  };
}

export default function CardRankingModalGuard() {
  useEffect(() => {
    let activeGuard: ActiveGuard | null = null;

    const syncGuard = () => {
      const modal = document.querySelector<HTMLElement>(modalSelector);
      if (modal === activeGuard?.modal) return;

      activeGuard?.release();
      activeGuard = modal ? activateGuard(modal) : null;
    };

    syncGuard();
    const observer = new MutationObserver(syncGuard);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      activeGuard?.release();
    };
  }, []);

  return null;
}
