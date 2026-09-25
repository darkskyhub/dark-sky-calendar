const CACHE = "dsh-calendar-door-v20260925";
const PRECACHE = ["./", "./index.html", "./offline.html", "./manifest.webmanifest"];
self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(PRECACHE).catch(function () {}); }));
  self.skipWaiting();
});
self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); })); }));
  self.clients.claim();
});
self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(req).then(function (res) {
    if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (cache) { cache.put(req, copy); }); }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (cached) {
      return cached || caches.match("./offline.html") || caches.match("./index.html") || new Response("No service just now.", { status: 503, headers: { "Content-Type": "text/plain" } });
    });
  }));
});
