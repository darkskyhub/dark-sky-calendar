const CACHE = "dark-sky-calendar-v20260926";

const MONTHS = [
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
  "2027-03",
  "2027-04",
  "2027-05",
  "2027-06",
  "2027-07",
  "2027-08",
  "2027-09",
  "2027-10",
  "2027-11",
  "2027-12",
];

const SEASONS = ["summer", "autumn", "winter", "spring"];

function pagePaths(path) {
  const bare = path.replace(/\/$/, "");
  return [bare, `${bare}/`, `${bare}/index.html`];
}

const FILES = [
  "./",
  "./index.html",
  "index.html",
  "404.html",
  ...MONTHS.flatMap((slug) => pagePaths(`month/${slug}`)),
  ...SEASONS.flatMap((id) => pagePaths(`season/${id}`)),
  "fonts/fonts.css",
  "fonts/figtree-latin.woff2",
  "fonts/figtree-latin-italic.woff2",
  "fonts/fraunces-latin.woff2",
  "manifest.webmanifest",
  "favicon-32.png",
  "favicon.svg",
  "favicon-48.png",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "images/nick-rourke-milky-way-arch.jpg",
  "images/dsh-coin.jpg",
  "offline.html",
  "og.jpg",
];

function underScope(url) {
  const scope = new URL(self.registration.scope);
  return url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
}

function resolveAgainst(from, raw) {
  const clean = String(raw)
    .trim()
    .replace(/^['"]|['"]$/g, "");
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:") || clean.startsWith("#")) {
    return null;
  }
  try {
    return new URL(clean, from);
  } catch {
    return null;
  }
}

function linkedUrls(text, from) {
  const found = [];
  for (const match of text.matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
    const url = resolveAgainst(from, match[1]);
    if (url) found.push(url);
  }
  for (const match of text.matchAll(/url\(\s*([^)]+?)\s*\)/g)) {
    const url = resolveAgainst(from, match[1]);
    if (url) found.push(url);
  }
  for (const match of text.matchAll(/(?:from|import)\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const url = resolveAgainst(from, match[1]);
    if (url) found.push(url);
  }
  for (const match of text.matchAll(/from\s*["']([^"']+)["']/g)) {
    const url = resolveAgainst(from, match[1]);
    if (url) found.push(url);
  }
  for (const match of text.matchAll(/import\s+["']([^"']+)["']/g)) {
    const url = resolveAgainst(from, match[1]);
    if (url) found.push(url);
  }
  return found;
}

async function storeResponse(cache, key, response) {
  const body = await response.clone().blob();
  const clean = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
  await cache.put(key, clean.clone());
  if (response.redirected && response.url && response.url !== key) {
    await cache.put(response.url, clean.clone());
  }
}

async function storeAll(cache) {
  const seen = new Set();
  const queue = FILES.map((path) => new URL(path, self.registration.scope));
  while (queue.length) {
    const url = queue.shift();
    const key = url.href.split("#")[0];
    if (seen.has(key) || !underScope(url)) continue;
    seen.add(key);
    try {
      const response = await fetch(url, { cache: "reload" });
      if (!response.ok) {
        console.warn("[calendar] cache miss", response.status, key);
        continue;
      }
      await storeResponse(cache, key, response);
      const type = response.headers.get("content-type") || "";
      const path = url.pathname;
      const readable =
        type.includes("text/html") ||
        type.includes("text/css") ||
        type.includes("javascript") ||
        path.endsWith(".css") ||
        path.endsWith(".js") ||
        path.endsWith(".mjs");
      if (!readable) continue;
      const text = await response.text();
      for (const next of linkedUrls(text, new URL(response.url || url.href))) queue.push(next);
    } catch (error) {
      console.warn("[calendar] cache miss", key, error);
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => storeAll(cache))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function matchRequest(cache, request) {
  const hit = await cache.match(request);
  if (hit) return hit;
  if (request.mode !== "navigate") return undefined;
  const loose = await cache.match(request, { ignoreSearch: true });
  if (loose) return loose;
  const alt = new URL(request.url);
  if (alt.pathname.endsWith("/")) alt.pathname = alt.pathname.replace(/\/+$/, "") || "/";
  else alt.pathname += "/";
  const altHit = await cache.match(alt.href);
  if (altHit) return altHit;
  const index = new URL("index.html", alt.pathname.endsWith("/") ? alt.href : `${alt.href}/`);
  return cache.match(index.href);
}

async function shellOrOffline(cache) {
  const scope = self.registration.scope;
  return (
    (await cache.match(scope, { ignoreSearch: true })) ||
    (await cache.match(new URL("./", scope), { ignoreSearch: true })) ||
    (await cache.match(new URL("index.html", scope))) ||
    (await cache.match(new URL("offline.html", scope)))
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!underScope(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        const hit = await matchRequest(cache, request);
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) await storeResponse(cache, request.url, response);
            return response;
          })
          .catch(() => null);
        if (hit) {
          event.waitUntil(network.then(() => undefined));
          return hit;
        }
        const response = await network;
        if (response) return response;
        if (request.mode === "navigate") {
          const fallback = await shellOrOffline(cache);
          if (fallback) return fallback;
        }
      } catch (error) {
        console.warn("[calendar] cache miss", request.url, error);
        if (request.mode === "navigate") {
          const fallback = await shellOrOffline(cache);
          if (fallback) return fallback;
        }
      }
      return new Response(
        "No service just now. This calendar is on your phone. Try again when you next have signal.",
        {
          status: 503,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    })(),
  );
});
