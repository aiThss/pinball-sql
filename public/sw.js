const CACHE_VERSION = "pinball-pwa-v4";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_TIMEOUT_MS = 10000;

const SHELL_ASSETS = [
  "/",
  "/admin",
  "/install",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon-180.png",
  "/fonts/Allura-Regular.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch((error) => {
        console.warn("Không cache được app shell.", error);
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkOnlyApi(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(request, url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkOnlyApi(request) {
  try {
    return await fetchWithTimeout(request, API_TIMEOUT_MS);
  } catch {
    return new Response(JSON.stringify({ message: "Mất kết nối. Vui lòng thử lại khi có mạng." }), {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (await cache.match("/")) ||
      new Response("Bạn đang offline. Vui lòng kết nối mạng rồi thử lại.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

function fetchWithTimeout(request, timeoutMs) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timed out.")), timeoutMs);
    }),
  ]);
}

function isStaticAsset(request, url) {
  if (url.pathname.startsWith("/assets/")) {
    return false;
  }

  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/favicon.ico" ||
    ["font", "image"].includes(request.destination)
  );
}
