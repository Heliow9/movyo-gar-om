const isBrowser = typeof window !== "undefined";

export const isIOS = () => {
  if (!isBrowser) return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
};

export const isStandalonePWA = () => {
  if (!isBrowser) return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
};

export const getNotificationPermission = () => {
  if (!isBrowser || !("Notification" in window)) return "unsupported";
  return Notification.permission;
};

export async function registerServiceWorker() {
  if (!isBrowser || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn("[Movyo PWA] Falha ao registrar service worker:", error);
    return null;
  }
}

export async function requestNotificationPermission() {
  if (!isBrowser || !("Notification" in window)) {
    return { ok: false, permission: "unsupported", reason: "Este navegador não suporta notificações web." };
  }

  if (isIOS() && !isStandalonePWA()) {
    return {
      ok: false,
      permission: Notification.permission,
      reason: "No iPhone, instale a Movyo Hub na Tela de Início e abra pelo ícone para ativar notificações.",
    };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, permission: Notification.permission, reason: "Service Worker não foi registrado." };
  }

  const permission = await Notification.requestPermission();
  return { ok: permission === "granted", permission };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function subscribeWebPush({ vapidPublicKey, subscribeUrl, token, restauranteId } = {}) {
  if (!vapidPublicKey || !subscribeUrl) {
    return { ok: false, reason: "Configure VITE_WEB_PUSH_PUBLIC_KEY e VITE_WEB_PUSH_SUBSCRIBE_URL para push remoto." };
  }

  const permission = await requestNotificationPermission();
  if (!permission.ok) return permission;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const response = await fetch(subscribeUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ subscription, restauranteId, plataforma: isIOS() ? "ios-pwa" : "web-pwa" }),
  });

  if (!response.ok) throw new Error("Falha ao salvar inscrição push no servidor.");
  return { ok: true, subscription };
}

export function vibrate(pattern = [180, 80, 180]) {
  if (!isBrowser || !("vibrate" in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function playNotificationSound(src = "/sounds/item_in.mp3") {
  if (!isBrowser) return;
  try {
    const audio = new Audio(src);
    audio.volume = 0.9;
    audio.play().catch(() => {});
  } catch {}
}

export async function showLocalNotification(title, options = {}) {
  if (!isBrowser || !("Notification" in window) || Notification.permission !== "granted") return false;

  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  const payload = {
    icon: "/logo192.png",
    badge: "/logo192.png",
    vibrate: [180, 80, 180],
    data: { url: "/pedidos", ...(options.data || {}) },
    ...options,
  };

  if (registration?.showNotification) {
    await registration.showNotification(title, payload);
    return true;
  }

  new Notification(title, payload);
  return true;
}

export async function alertNovoPedido(pedido = {}) {
  const codigo = pedido.codigo || pedido.numero || pedido._id || "";
  const cliente = pedido.nomeCliente || pedido.cliente || pedido.nome || "Cliente";
  const total = pedido.total || pedido.valorTotal || pedido.valor || "";

  vibrate([220, 90, 220, 90, 300]);
  playNotificationSound();

  await showLocalNotification("Novo pedido recebido na Movyo", {
    body: `${codigo ? `#${codigo} • ` : ""}${cliente}${total ? ` • R$ ${total}` : ""}`,
    tag: codigo ? `pedido-${codigo}` : "novo-pedido-movyo",
    renotify: true,
    data: { url: "/pedidos", pedidoId: pedido._id || pedido.id },
  });
}
