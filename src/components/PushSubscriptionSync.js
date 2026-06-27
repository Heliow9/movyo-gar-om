import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { getSession } from "../api/storage/session";
import { getNotificationPermission, syncWebPushSubscription } from "../utils/pwaNotifications";
import {
  configureNativeNotificationHandler,
  syncNativePushSubscription,
} from "../utils/nativeNotifications";

const pickToken = (session = {}) => session?.token || session?.accessToken || session?.authToken || "";
const pickRestauranteId = (session = {}) => session?.restaurante?._id || session?.restaurante?.id || session?.restauranteId || "";

export default function PushSubscriptionSync({ enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    let lastAttempt = 0;
    let removeNativeListeners = () => {};

    const sync = async () => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastAttempt < 15000) return;
      lastAttempt = now;

      try {
        if (Platform.OS !== "web") {
          await syncNativePushSubscription({ requestPermission: false });
          return;
        }
        if (getNotificationPermission() !== "granted") return;
        const session = await getSession();
        const restauranteId = pickRestauranteId(session);
        if (!session?.token || !restauranteId || cancelled) return;
        await syncWebPushSubscription({
          token: pickToken(session),
          restauranteId,
        });
      } catch (error) {
        console.warn("[Movyo Push] Sincronização automática não concluída:", error);
      }
    };

    if (Platform.OS !== "web") {
      configureNativeNotificationHandler().then((remove) => {
        if (cancelled) remove?.();
        else removeNativeListeners = remove || (() => {});
      });
    }

    sync();
    const interval = setInterval(sync, 5 * 60 * 1000);
    const appSub = AppState.addEventListener?.("change", (state) => {
      if (state === "active") sync();
    });
    const onFocus = () => sync();
    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") sync();
    };

    if (Platform.OS === "web") {
      window.addEventListener?.("focus", onFocus);
      document.addEventListener?.("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      appSub?.remove?.();
      removeNativeListeners();
      if (Platform.OS === "web") {
        window.removeEventListener?.("focus", onFocus);
        document.removeEventListener?.("visibilitychange", onVisibility);
      }
    };
  }, [enabled]);

  return null;
}
