import { io } from "socket.io-client";
import { API_URL } from "../api/config";

let socket = null;
let activeRestaurantId = null;
const stateSubscribers = new Set();

function notifyState(extra = {}) {
  const state = {
    connected: !!socket?.connected,
    connecting: !!socket && !socket.connected,
    restaurantId: activeRestaurantId,
    socketId: socket?.id || null,
    ...extra,
  };
  stateSubscribers.forEach((fn) => {
    try { fn(state); } catch {}
  });
}

function joinActiveRestaurant() {
  if (!socket?.connected || !activeRestaurantId) return;
  socket.emit("joinRestaurante", { restauranteId: activeRestaurantId });
  // Compatibilidade com servidores que esperam apenas o ID.
  socket.emit("join-restaurante", activeRestaurantId);
}

export const onSocketState = (fn) => {
  stateSubscribers.add(fn);
  fn({ connected: !!socket?.connected, connecting: !!socket && !socket.connected, restaurantId: activeRestaurantId, socketId: socket?.id || null });
  return () => stateSubscribers.delete(fn);
};

export const connectSocket = (restauranteId) => {
  const nextId = restauranteId ? String(restauranteId) : null;

  if (socket && activeRestaurantId && nextId && activeRestaurantId !== nextId) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  activeRestaurantId = nextId || activeRestaurantId;

  if (!socket) {
    socket = io(API_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 900,
      reconnectionDelayMax: 8000,
      randomizationFactor: 0.35,
      timeout: 12000,
    });

    socket.on("connect", () => {
      joinActiveRestaurant();
      notifyState({ connected: true, connecting: false, reason: "connect" });
    });

    socket.io.on("reconnect_attempt", (attempt) => {
      notifyState({ connected: false, connecting: true, attempt, reason: "reconnect_attempt" });
    });

    socket.io.on("reconnect", () => {
      joinActiveRestaurant();
      notifyState({ connected: true, connecting: false, reason: "reconnect" });
    });

    socket.on("disconnect", (reason) => {
      notifyState({ connected: false, connecting: reason !== "io client disconnect", reason });
    });

    socket.on("connect_error", (error) => {
      notifyState({ connected: false, connecting: true, reason: "connect_error", error: error?.message || "Falha no Socket" });
    });
  } else {
    joinActiveRestaurant();
    if (!socket.connected) socket.connect();
  }

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    try { socket.removeAllListeners(); } catch {}
    try { socket.io?.removeAllListeners?.(); } catch {}
    try { socket.disconnect(); } catch {}
  }
  socket = null;
  activeRestaurantId = null;
  notifyState({ connected: false, connecting: false, reason: "manual_disconnect" });
};
