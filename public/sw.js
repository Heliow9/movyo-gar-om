const CACHE_NAME = "movyo-hub-pwa-v2";
const APP_SHELL = ["/", "/manifest.json", "/logo192.png", "/logo512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        if (new URL(request.url).origin === self.location.origin) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone)).catch(() => null);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text?.() || "Você tem uma nova atualização na Movyo." };
  }

  const pedido = payload.pedido || payload.data?.pedido || {};
  const pedidoId = pedido._id || pedido.id || payload.pedidoId || payload.data?.pedidoId || "";
  const codigo = pedido.numeroPedido || pedido.numero || pedido.codigo || payload.codigo || "";
  const status = String(pedido.status || payload.status || payload.data?.status || "").toLowerCase().replace(/[ -]/g, "_");
  const emProducao = ["em_producao", "producao", "preparando", "em_preparo"].includes(status);
  const cliente = pedido.nomeCliente || pedido.cliente?.nome || payload.cliente || "Cliente";
  const total = pedido.total || pedido.valorTotal || payload.total || "";

  const title = payload.title || (emProducao ? "Pedido entrou em produção" : "Movyo Hub");
  const body = payload.body || `${codigo ? `#${codigo} • ` : ""}${cliente}${total ? ` • R$ ${total}` : ""}`;
  const options = {
    body,
    icon: payload.icon || "/logo192.png",
    badge: payload.badge || "/logo192.png",
    tag: payload.tag || (pedidoId ? `pedido-${pedidoId}-${emProducao ? "producao" : "atualizacao"}` : "movyo-hub"),
    renotify: payload.renotify !== false,
    vibrate: payload.vibrate || [220, 90, 220, 90, 300],
    data: {
      url: "/",
      screen: "Pedidos",
      pedidoId,
      status,
      ...(payload.data || {}),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const notificationData = event.notification?.data || {};
  const targetUrl = notificationData.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          try { client.postMessage({ type: "MOVYO_NOTIFICATION_CLICK", data: notificationData }); } catch {}
          try { await client.navigate(targetUrl); } catch {}
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
