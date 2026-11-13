import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

const NAVIGATE_EVENT = "pinball:navigate";

export function navigateTo(to: string, options?: { replace?: boolean }) {
  if (typeof window === "undefined") return;
  const targetUrl = new URL(to, window.location.origin);
  const nextPath = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

  if (options?.replace) {
    window.history.replaceState({}, "", nextPath);
  } else {
    window.history.pushState({}, "", nextPath);
  }
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useAppPathname(): string {
  const [pathname, setPathname] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/"
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener(NAVIGATE_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(NAVIGATE_EVENT, sync);
    };
  }, []);

  return pathname;
}

export function useAppRouter() {
  const push = useCallback((to: string) => navigateTo(to), []);
  const replace = useCallback((to: string) => navigateTo(to, { replace: true }), []);
  return { push, replace };
}

export interface AppLinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
}

export function AppLink({ href, replace, onClick, ...rest }: AppLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      rest.target === "_blank"
    ) {
      return;
    }

    if (href.startsWith("/") && !href.startsWith("//")) {
      event.preventDefault();
      navigateTo(href, { replace });
    }
  }

  return <a href={href} onClick={handleClick} {...rest} />;
}
