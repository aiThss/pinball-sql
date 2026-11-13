"use client";

import { useEffect, useState } from "react";
import { AppLink, useAppRouter } from "../lib/router";
import {
  ArrowDown,
  Apple,
  CheckCircle2,
  ChevronLeft,
  CircleCheck,
  Ellipsis,
  MonitorSmartphone,
  Plus,
  Share2,
  Smartphone,
  Ticket,
} from "lucide-react";
import { APP_NAME, APP_SHORT_NAME } from "@/lib/app-info";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

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

const iosSteps = [
  {
    icon: Share2,
    text: "Bấm nút Share ở thanh dưới cùng Safari.",
  },
  {
    icon: Smartphone,
    text: 'Kéo xuống và chọn "Thêm vào Màn hình chính".',
  },
  {
    icon: CircleCheck,
    text: 'Bấm "Thêm" rồi mở app từ màn hình chính.',
  },
];

const androidSteps = [
  {
    icon: MonitorSmartphone,
    text: "Mở link bằng Chrome trên Android.",
  },
  {
    icon: Plus,
    text: 'Bấm menu ba chấm và chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".',
  },
  {
    icon: CircleCheck,
    text: 'Bấm "Cài đặt" hoặc "Thêm" để hoàn tất.',
  },
];

const zaloStepsIOS = [
  {
    icon: Ellipsis,
    text: 'Để cài app và hiện logo đúng, bấm vào dấu 3 chấm ở góc phải trên cùng rồi chọn "Mở bằng Safari".',
  },
];

const zaloStepsAndroid = [
  {
    icon: Ellipsis,
    text: 'Để cài app và hiện logo đúng, bấm vào dấu 3 chấm ở góc phải trên cùng rồi chọn "Mở bằng Chrome".',
  },
];

export default function InstallGuide() {
  const router = useAppRouter();
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [isZalo, setIsZalo] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsIOS(isIOSDevice());
      setIsAndroid(isAndroidDevice());
      setIsZalo(/Zalo/i.test(navigator.userAgent));

      if (isStandaloneMode()) {
        router.replace("/");
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setCanPrompt(true);
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setCanPrompt(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  async function promptInstall() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);

    setInstallPrompt(null);
    setCanPrompt(false);

    if (choice?.outcome === "accepted") {
      setInstalled(true);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-[#020617] text-white">
      <header className="border-b border-white/10 bg-[#020617]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <AppLink
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 text-sm font-semibold text-white transition hover:bg-white/10"
            href="/"
          >
            <ChevronLeft aria-hidden="true" size={18} />
            Quay lại
          </AppLink>
          <div className="flex items-center gap-2 text-sm font-bold">
            <Ticket aria-hidden="true" size={18} />
            {APP_SHORT_NAME}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="space-y-5">
          <section className="text-center">
            <div className="flex justify-center">
              <img
                alt={`${APP_NAME} icon`}
                className="h-24 w-24 rounded-[18px] border border-white/10 shadow-xl"
                height={96}
                src="/icons/icon-192.png"
                width={96}
              />
            </div>
            <p className="mt-5 text-sm font-bold uppercase text-[#22D3EE]">Cài app</p>
            <h1 className="mx-auto mt-2 max-w-xl text-3xl font-bold leading-tight tracking-normal sm:text-4xl">
              Thêm {APP_SHORT_NAME} vào màn hình chính
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-[#CBD5E1]">
              Để mở nhanh tại quầy và hiện logo đúng, hãy thêm app vào màn hình chính trên điện thoại.
            </p>

            {isZalo ? (
              <div className="mt-6 rounded-lg border border-[#FACC15]/50 bg-[#422006] px-4 py-3 text-sm font-semibold leading-6 text-[#FEF3C7]">
                Đang mở trong Zalo. Để cài app lên màn hình chính và hiện logo đúng, bấm vào dấu 3 chấm ở góc phải trên cùng rồi chọn{" "}
                {isAndroid ? "Mở bằng Chrome" : "Mở bằng Safari"}.
              </div>
            ) : isIOS ? (
              <div className="mt-6 rounded-lg border border-[#22D3EE]/40 bg-[#083344] px-4 py-3 text-sm font-semibold leading-6 text-[#CFFAFE]">
                iPhone/iPad cần cài bằng Safari để hiện đúng tùy chọn Thêm vào Màn hình chính.
              </div>
            ) : null}

            {installed ? (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-[#22C55E]/40 bg-[#052E16] px-4 py-3 text-sm font-semibold text-[#BBF7D0]">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
                App đã được cài. Bạn có thể mở từ màn hình chính hoặc danh sách ứng dụng.
              </div>
            ) : null}

            {!isIOS && !isZalo ? (
              <button
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#22D3EE] px-5 text-sm font-bold text-[#06202A] transition hover:bg-[#67E8F9] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                disabled={!canPrompt}
                onClick={() => void promptInstall()}
                type="button"
              >
                <Plus aria-hidden="true" size={18} />
                {canPrompt ? "Cài app ngay" : "Dùng hướng dẫn bên dưới để cài"}
              </button>
            ) : null}
          </section>

          {isZalo ? (
            <GuideSection
              icon={<Ellipsis aria-hidden="true" size={22} />}
              title="Cài app từ Zalo"
              steps={isAndroid ? zaloStepsAndroid : zaloStepsIOS}
              accent="bg-[#FACC15] text-[#422006]"
            />
          ) : (
            <>
              <GuideSection
                icon={<Apple aria-hidden="true" size={22} />}
                title="iPhone hoặc iPad"
                steps={iosSteps}
                accent="bg-[#111827] text-white"
              />

              <GuideSection
                icon={<MonitorSmartphone aria-hidden="true" size={22} />}
                title="Android Chrome"
                steps={androidSteps}
                accent="bg-[#DC2626] text-white"
                installButton={
                  canPrompt ? (
                    <button
                      className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#22D3EE] px-5 text-sm font-bold text-[#06202A] transition hover:bg-[#67E8F9]"
                      onClick={() => void promptInstall()}
                      type="button"
                    >
                      <Plus aria-hidden="true" size={18} />
                      Cài app ngay
                    </button>
                  ) : null
                }
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function GuideSection({
  accent,
  icon,
  installButton,
  steps,
  title,
}: {
  accent: string;
  icon: React.ReactNode;
  installButton?: React.ReactNode;
  steps: Array<{ icon: React.ComponentType<{ "aria-hidden": true; size: number }>; text: string }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-md ${accent}`}>
          {icon}
        </div>
        <h2 className="text-lg font-bold text-white">{title}</h2>
      </div>
      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={`${title}-${step.text}`}>
            <div className="grid min-h-[88px] grid-cols-[52px_1fr] items-center gap-4 rounded-lg border border-white/10 bg-[#111827] px-4 py-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-md bg-white text-[#0F172A]">
                <step.icon aria-hidden={true} size={24} />
              </span>
              <span className="text-base font-bold leading-7 text-white">{step.text}</span>
            </div>
            {index < steps.length - 1 ? (
              <div className="flex justify-center py-3 text-white/80">
                <ArrowDown aria-hidden="true" size={28} />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {title === "iPhone hoặc iPad" ? (
        <div className="mt-5 rounded-lg border border-[#22D3EE]/40 bg-[#083344] px-4 py-3 text-sm font-semibold leading-6 text-[#CFFAFE]">
          <span className="inline-flex items-center gap-2">
            <Share2 aria-hidden="true" size={14} />
            Nút Share trông như ô vuông có mũi tên lên, nằm ở thanh dưới cùng Safari.
          </span>
        </div>
      ) : null}
      {installButton ?? null}
    </section>
  );
}
