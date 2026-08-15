import { API_URL } from "../api/config";

const isBrowser = typeof window !== "undefined";
const DEFAULT_SUBSCRIBE_URL = `${API_URL}/api/push/subscribe`;
const DEFAULT_PUBLIC_KEY_URL = `${API_URL}/api/push/public-key`;

const WEB_PUSH_SYNC_KEY = "movyo:webpush:lastSync";
const WEB_PUSH_ENDPOINT_KEY = "movyo:webpush:endpoint";
const WEB_PUSH_SYNC_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export async function subscribeNativePush({ requestPermission = true } = {}) {
  const nativeNotifications = await import("./nativeNotifications");
  return nativeNotifications.syncNativePushSubscription({ requestPermission });
}

export function getStoredWebPushState() {
  if (!isBrowser) return { connected: false, lastSync: null, endpoint: "" };
  try {
    const lastSync = window.localStorage.getItem(WEB_PUSH_SYNC_KEY);
    const endpoint = window.localStorage.getItem(WEB_PUSH_ENDPOINT_KEY) || "";
    const age = lastSync ? Date.now() - new Date(lastSync).getTime() : Infinity;
    return {
      connected: Notification?.permission === "granted" && !!endpoint && Number.isFinite(age) && age < WEB_PUSH_SYNC_MAX_AGE_MS,
      lastSync,
      endpoint,
    };
  } catch {
    return { connected: false, lastSync: null, endpoint: "" };
  }
}

function rememberWebPushSubscription(subscription) {
  if (!isBrowser || !subscription) return;
  try {
    window.localStorage.setItem(WEB_PUSH_SYNC_KEY, new Date().toISOString());
    window.localStorage.setItem(WEB_PUSH_ENDPOINT_KEY, subscription.endpoint || "");
  } catch {}
}

export const isIOS = () => {
  if (!isBrowser) return false;
  const ua = window.navigator.userAgent || "";
  const classicIOS = /iphone|ipad|ipod/i.test(ua);
  const ipadDesktopMode = /macintosh/i.test(ua) && Number(window.navigator.maxTouchPoints || 0) > 1;
  return classicIOS || ipadDesktopMode;
};

export const isStandalonePWA = () => {
  if (!isBrowser) return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
};

export const getNotificationPermission = () => {
  if (!isBrowser || !("Notification" in window)) return "unsupported";
  return Notification.permission;
};

export const supportsWebPush = () => {
  if (!isBrowser) return false;
  return (
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
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
      code: "IOS_INSTALL_REQUIRED",
    };
  }

  if (Notification.permission === "denied") {
    return {
      ok: false,
      permission: "denied",
      reason: "A permissão está bloqueada. Libere as notificações nas configurações do iPhone e tente novamente.",
      code: "PERMISSION_DENIED",
    };
  }

  // No iOS, o pedido de permissão precisa acontecer imediatamente dentro do
  // toque do usuário. Não coloque nenhum await antes desta chamada.
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      reason: "A permissão de notificação não foi concedida.",
    };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, permission, reason: "Service Worker não foi registrado." };
  }

  return { ok: true, permission, registration };
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function pickPublicKey(data = {}) {
  return (
    data?.publicKey ||
    data?.vapidPublicKey ||
    data?.chavePublica ||
    data?.key ||
    data?.data?.publicKey ||
    data?.data?.vapidPublicKey ||
    ""
  );
}

async function fetchPublicKey(publicKeyUrl, token) {
  const response = await fetch(publicKeyUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Servidor de push indisponível (${response.status}).`);
  }

  const data = await response.json().catch(() => ({}));
  const key = pickPublicKey(data);
  if (!key) throw new Error("A API não retornou a chave pública VAPID.");
  return key;
}

export async function subscribeWebPush({
  vapidPublicKey,
  publicKeyUrl = process.env.EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY_URL || DEFAULT_PUBLIC_KEY_URL,
  subscribeUrl = process.env.EXPO_PUBLIC_WEB_PUSH_SUBSCRIBE_URL || DEFAULT_SUBSCRIBE_URL,
  token,
  restauranteId,
  requestPermission = true,
} = {}) {
  if (!supportsWebPush()) {
    return { ok: false, permission: getNotificationPermission(), reason: "Este dispositivo não oferece suporte ao Web Push.", code: "UNSUPPORTED" };
  }

  if (isIOS() && !isStandalonePWA()) {
    return {
      ok: false,
      permission: getNotificationPermission(),
      reason: "No iPhone, adicione a Movyo Hub à Tela de Início e abra pelo ícone instalado.",
      code: "IOS_INSTALL_REQUIRED",
    };
  }

  let permissionResult;
  if (requestPermission) {
    permissionResult = await requestNotificationPermission();
    if (!permissionResult.ok) return permissionResult;
  } else {
    const permission = getNotificationPermission();
    if (permission !== "granted") {
      return {
        ok: false,
        permission,
        reason: permission === "denied" ? "A permissão de notificação está bloqueada." : "Toque em Ativar agora para permitir notificações.",
        code: permission === "denied" ? "PERMISSION_DENIED" : "USER_ACTION_REQUIRED",
      };
    }
  }

  const registration = permissionResult?.registration || await registerServiceWorker();
  if (!registration) {
    return { ok: false, permission: getNotificationPermission(), reason: "Service Worker não foi registrado.", code: "SERVICE_WORKER_FAILED" };
  }

  let resolvedPublicKey = String(vapidPublicKey || process.env.EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY || "").trim();
  if (!resolvedPublicKey) {
    try {
      resolvedPublicKey = await fetchPublicKey(publicKeyUrl, token);
    } catch (error) {
      return {
        ok: false,
        permission: "granted",
        reason: "A permissão foi concedida, mas a API ainda não está configurada para push em segundo plano.",
        detail: error?.message || String(error),
        code: "SERVER_NOT_CONFIGURED",
      };
    }
  }

  try {
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(resolvedPublicKey),
    });

    const response = await fetch(subscribeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        subscription: subscription.toJSON ? subscription.toJSON() : subscription,
        restauranteId,
        plataforma: isIOS() ? "ios-pwa" : "web-pwa",
        standalone: isStandalonePWA(),
        userAgent: window.navigator.userAgent || "",
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.message || payload?.mensagem || `Falha ao salvar inscrição push (${response.status}).`);
    }

    rememberWebPushSubscription(subscription);

    return { ok: true, permission: "granted", subscription, remote: true };
  } catch (error) {
    console.warn("[Movyo Push] Falha ao registrar push remoto:", error);
    try {
      const existing = await registration.pushManager.getSubscription();
      if (existing && getStoredWebPushState().connected) {
        rememberWebPushSubscription(existing);
        return { ok: true, permission: "granted", subscription: existing, remote: "cached" };
      }
    } catch {}
    return {
      ok: false,
      permission: "granted",
      reason: "Não foi possível conectar as notificações em segundo plano.",
      detail: error?.message || String(error),
      code: "SUBSCRIPTION_FAILED",
    };
  }
}

export async function syncWebPushSubscription(options = {}) {
  return subscribeWebPush({ ...options, requestPermission: false });
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
    data: { url: "/", screen: "Pedidos", ...(options.data || {}) },
    ...options,
  };

  if (registration?.showNotification) {
    await registration.showNotification(title, payload);
    return true;
  }

  new Notification(title, payload);
  return true;
}

export async function alertNovoPedido(pedido = {}, options = {}) {
  const codigo = pedido.codigo || pedido.numeroPedido || pedido.numero || pedido._id || "";
  const cliente = pedido.nomeCliente || pedido?.cliente?.nome || pedido.cliente || pedido.nome || "Cliente";
  const moneyCandidates = [pedido.total, pedido.valorTotal, pedido.valor, pedido.subtotal]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0);
  const itemTotal = (Array.isArray(pedido.itens) ? pedido.itens : []).reduce((sum, item) => {
    const explicit = Number(item?.precoTotal ?? item?.total ?? item?.valorTotal);
    if (Number.isFinite(explicit) && explicit > 0) return sum + explicit;
    const quantity = Number(item?.quantidade ?? item?.qtd ?? 1) || 1;
    const unit = Number(item?.precoUnitario ?? item?.preco ?? item?.valor ?? 0) || 0;
    return sum + (quantity * unit);
  }, 0);
  const total = moneyCandidates[0] || itemTotal || "";
  const totalFormatado = total ? Number(total).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
  const status = String(pedido.status || pedido.statusPedido || "").trim().toLowerCase().replace(/[ -]/g, "_");
  const emProducao = options.emProducao === true || ["em_producao", "producao", "preparando", "em_preparo"].includes(status);

  vibrate([220, 90, 220, 90, 300]);
  playNotificationSound();

  await showLocalNotification(emProducao ? "Pedido entrou em produção" : "Novo pedido recebido na Movyo", {
    body: `${codigo ? `#${codigo} • ` : ""}${cliente}${totalFormatado ? ` • R$ ${totalFormatado}` : ""}`,
    tag: codigo ? `pedido-${codigo}-${emProducao ? "producao" : "novo"}` : `pedido-movyo-${emProducao ? "producao" : "novo"}`,
    renotify: true,
    data: {
      url: "/",
      screen: "Pedidos",
      pedidoId: pedido._id || pedido.id,
      status: emProducao ? "em_producao" : status,
    },
  });
}

function getHoraCaixa(payload = {}, campo = "abertoEm") {
  const raw = payload?.[campo] || payload?.hora;
  if (typeof raw === "string") {
    const local = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw.trim());
    if (local && !hasTimezone) return `${local[4]}:${local[5]}`;
  }
  const date = raw ? new Date(raw) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

export async function alertCaixaAberto(payload = {}) {
  const operador = payload?.operador?.nome || payload?.operadorNome || payload?.nomeOperador || payload?.usuario?.nome || "Operador";
  const hora = getHoraCaixa(payload, "abertoEm");

  vibrate([180, 70, 180]);
  playNotificationSound();

  await showLocalNotification("Caixa aberto na Movyo", {
    body: `${operador} abriu o caixa às ${hora}.`,
    tag: `caixa-aberto-${payload?._id || payload?.id || Date.now()}`,
    renotify: true,
    data: { url: "/", screen: "Home", caixaId: payload?._id || payload?.id },
  });
}

export async function alertCaixaFechado(payload = {}) {
  const operador = payload?.operador?.nome || payload?.operadorNome || payload?.nomeOperador || payload?.usuario?.nome || "Operador";
  const hora = getHoraCaixa(payload, "fechadoEm");
  const valorFinal = Number(payload?.saldoFinalInformado ?? payload?.totalEsperadoDinheiro ?? payload?.totalVendas ?? 0);
  const totalVendas = Number(payload?.totalVendas ?? 0);
  const money = (value) => Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const complementoVendas = Math.abs(totalVendas - valorFinal) >= 0.01
    ? ` Vendas: R$ ${money(totalVendas)}.`
    : "";

  vibrate([160, 70, 160]);
  playNotificationSound();

  await showLocalNotification("Caixa fechado na Movyo", {
    body: `${operador} fechou o caixa às ${hora}. Valor final: R$ ${money(valorFinal)}.${complementoVendas}`,
    tag: `caixa-fechado-${payload?._id || payload?.id || Date.now()}`,
    renotify: true,
    data: {
      url: "/",
      screen: "Home",
      caixaId: payload?._id || payload?.id,
      saldoFinalInformado: valorFinal,
      totalVendas,
    },
  });
}
