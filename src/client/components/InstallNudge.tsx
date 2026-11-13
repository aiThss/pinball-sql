"use client";

import { useEffect, useState } from "react";
import { AppLink, useAppPathname } from "../lib/router";
import { Download, Ellipsis, Share2, X } from "lucide-react";
import { APP_SHORT_NAME } from "@/lib/app-info";

type NudgeKind = "ios-safari" | "zalo" | "android-chrome";

const dismissSessionKey = "pinball_install_nudge_dismissed";

// Extend Window to hold the deferred prompt
declare global {
  interface Window {
    __pwaInstallPrompt?: BeforeInstallPromptEvent;
  }
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isIOSDevice() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  return /Android/i.test(navigator.userAgent);
}

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean(navigatorWithStandalone.standalone)
  );
}

function getNudgeKind() {
  const userAgent = navigator.userAgent;
  const isZalo = /Zalo/i.test(userAgent);
  const isIOS = isIOSDevice();
  const isAndroid = isAndroidDevice();
  const isSafari =
    isIOS &&
    /Safari/i.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|Zalo|FBAN|FBAV/i.test(userAgent);
  const isAndroidChrome =
    isAndroid &&
    /Chrome/i.test(userAgent) &&
    !/Zalo|FBAN|FBAV/i.test(userAgent);

  if (isZalo) {
    return "zalo";
  }

  if (isSafari) {
    return "ios-safari";
  }

  if (isAndroidChrome) {
    return "android-chrome";
  }

  return null;
}

function wasDismissedThisSession() {
  try {
    return window.sessionStorage.getItem(dismissSessionKey) === "true";
  } catch {
    return false;
  }
}

export default function InstallNudge() {
  const pathname = useAppPathname();
  const [kind, setKind] = useState<NudgeKind | null>(null);
  const [canNativePrompt, setCanNativePrompt] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  // Listen for the browser's native install prompt (Android Chrome PWA)
  useEffect(() => {
    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      window.__pwaInstallPrompt = e as BeforeInstallPromptEvent;
      setCanNativePrompt(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsAndroid(isAndroidDevice());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const nextKind = getNudgeKind();

      if (pathname === "/install" || isStandaloneMode()) {
        setKind(null);
        return;
      }

      if (
        (nextKind === "ios-safari" || nextKind === "android-chrome") &&
        wasDismissedThisSession()
      ) {
        setKind(null);
        return;
      }

      setKind(nextKind);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(dismissSessionKey, "true");
    } catch {
      // Some in-app browsers block storage; closing for this render is still useful.
    }

    setKind(null);
  }

  async function triggerNativeInstall() {
    const prompt = window.__pwaInstallPrompt;
    if (!prompt) {
      dismiss();
      return;
    }

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      window.__pwaInstallPrompt = undefined;
    }
    dismiss();
  }

  if (!kind) {
    return null;
  }

  const isZalo = kind === "zalo";
  const isAndroidChrome = kind === "android-chrome";

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:px-4">
      <section
        aria-label="Hướng dẫn cài app"
        className="mx-auto max-w-md rounded-lg border border-[#CBD5E1] bg-white p-4 text-[#0F172A] shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[#111827] text-white">
            {isZalo ? (
              <Ellipsis aria-hidden="true" size={20} />
            ) : (
              <Share2 aria-hidden="true" size={20} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Cài {APP_SHORT_NAME} lên màn hình chính</h2>
            <p className="mt-1 text-sm leading-6 text-[#475569]">
              {isZalo
                ? `Đang mở trong Zalo. Để cài app và hiện logo đúng, bấm vào dấu 3 chấm ở góc phải trên cùng rồi chọn Mở bằng ${isAndroid ? "Chrome" : "Safari"}.`
                : isAndroidChrome
                  ? canNativePrompt
                    ? "Bấm nút bên dưới để cài app lên màn hình chính của bạn, không cần qua cửa hàng ứng dụng."
                    : "Bấm vào biểu tượng menu (⋮) ở góc phải trên cùng rồi chọn \"Thêm vào màn hình chính\"."
                  : "Trên Safari, bấm Chia sẻ rồi chọn Thêm vào Màn hình chính."}
            </p>
          </div>
          <button
            aria-label="Đóng hướng dẫn cài app"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[#64748B] transition hover:bg-[#F1F5F9]"
            onClick={dismiss}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {isZalo ? (
          <div className="mt-4 grid gap-2">
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937]"
              onClick={dismiss}
              type="button"
            >
              Đã hiểu
            </button>
          </div>
        ) : isAndroidChrome ? (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            {canNativePrompt ? (
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937]"
                onClick={triggerNativeInstall}
                type="button"
              >
                <Download aria-hidden="true" size={17} />
                Cài đặt ngay
              </button>
            ) : (
              <AppLink
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937]"
                href="/install"
                onClick={dismiss}
              >
                <Download aria-hidden="true" size={17} />
                Xem hướng dẫn
              </AppLink>
            )}
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC]"
              onClick={dismiss}
              type="button"
            >
              Để sau
            </button>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            <AppLink
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#1F2937]"
              href="/install"
              onClick={dismiss}
            >
              <Download aria-hidden="true" size={17} />
              Xem hướng dẫn
            </AppLink>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition hover:bg-[#F8FAFC]"
              onClick={dismiss}
              type="button"
            >
              Để sau
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
