/**
 * ActionPulse Service Worker —— 让「添加到主屏幕」之后可以离线打开（PRD §2.2）。
 *
 * 缓存策略：
 *  - 请求路径以 /api/ 开头的一律不拦截，直接放行到网络。状态同步、SSE 事件流、AI 代理
 *    必须每次打到服务端；如果把它们也缓存了，第二台设备会永远回放一个过期快照，
 *    表现为"同步不上"——这是只有在「Service Worker + 多端」同时存在时才会暴露的坑。
 *  - 导航请求（HTML）：网络优先，失败时回退到缓存的 index.html，保证离线可用且能拿到新版本。
 *  - 其它同源静态资源：缓存优先（Vite 产物带内容哈希，可以安全长期缓存）。
 *
 * 注意：public/ 不经过打包器，这里的语法错误 vite build 是发现不了的，
 * 因此 scripts/check-public.mjs 会在构建前做一次真实解析检查。
 */
const CACHE = "actionpulse-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
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

function cachePut(request, response) {
  if (!response || response.status !== 200 || response.type !== "basic") return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 数据接口与 SSE 事件流绝不走缓存
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((cached) => cached ?? new Response("离线且没有缓存", { status: 503 })),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          cachePut(request, response);
          return response;
        }),
    ),
  );
});
