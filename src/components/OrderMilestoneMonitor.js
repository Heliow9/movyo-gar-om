import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Vibration } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "../api/api";
import { getSession } from "../api/storage/session";
import { connectSocket, getSocket } from "../socket/socket";
import { getOrderSequenceMilestone } from "../utils/orderMilestones";
import OrderMilestoneCelebration from "./OrderMilestoneCelebration";

const EVENTOS_PEDIDO = [
  "novoPedido",
  "pedidoCriado",
  "pedidoRecebido",
  "pedidoBalcaoCriado",
  "pedidoMesaCriado",
  "comandaCriada",
];

const restauranteIdFromSession = (session) =>
  session?.restaurante?._id || session?.restaurante?.id || session?.restaurante?.restauranteId || null;

const unwrapPedidos = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.pedidos)) return data.pedidos;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function OrderMilestoneMonitor({ enabled = true }) {
  const attemptedRef = useRef(new Set());
  const [milestone, setMilestone] = useState(null);

  const celebrate = useCallback(async (pedido = {}, restauranteId) => {
    const sequence = getOrderSequenceMilestone(pedido?.pedido || pedido);
    if (!sequence || !restauranteId) return;

    const attemptKey = `${restauranteId}:${sequence.prefix}:${sequence.number}`;
    if (attemptedRef.current.has(attemptKey)) return;
    attemptedRef.current.add(attemptKey);

    const storageKey = `@movyo:order-sequence-milestone:${attemptKey}`;
    try {
      if (await AsyncStorage.getItem(storageKey) === "shown") return;
      await AsyncStorage.setItem(storageKey, "shown");
    } catch {
      // A comemoração continua disponível quando o armazenamento do navegador falhar.
    }

    if (Platform.OS === "web") {
      try { globalThis?.navigator?.vibrate?.([120, 70, 180, 70, 260]); } catch {}
    } else {
      Vibration.vibrate([0, 120, 70, 180, 70, 260]);
    }
    setMilestone(sequence.number);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let restauranteId = null;
    let socket = null;
    let active = true;
    const onPedido = (payload = {}) => celebrate(payload, restauranteId);

    (async () => {
      const session = await getSession();
      restauranteId = restauranteIdFromSession(session);
      if (!active || !restauranteId) return;

      socket = connectSocket(restauranteId);
      EVENTOS_PEDIDO.forEach((event) => socket?.on?.(event, onPedido));

      // Recupera o marco caso o evento tenha acontecido durante a inicialização do PWA.
      try {
        const response = await api.get("/api/garcons/app/pedidos", {
          params: { limit: 1, fresh: 1, _t: Date.now() },
        });
        const latest = unwrapPedidos(response?.data)[0];
        if (latest) await celebrate(latest, restauranteId);
      } catch {}
    })();

    return () => {
      active = false;
      const current = getSocket() || socket;
      EVENTOS_PEDIDO.forEach((event) => current?.off?.(event, onPedido));
    };
  }, [celebrate, enabled]);

  return (
    <OrderMilestoneCelebration
      milestone={milestone}
      visible={!!milestone}
      onClose={() => setMilestone(null)}
    />
  );
}
