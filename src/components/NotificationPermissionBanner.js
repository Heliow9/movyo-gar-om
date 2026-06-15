import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getNotificationPermission,
  isIOS,
  isStandalonePWA,
  requestNotificationPermission,
  subscribeWebPush,
} from "../utils/pwaNotifications";
import { getSession } from "../api/storage/session";

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_WEB_PUSH_PUBLIC_KEY || "";
const PUSH_SUBSCRIBE_URL = process.env.EXPO_PUBLIC_WEB_PUSH_SUBSCRIBE_URL || "";

const pickToken = (session = {}) =>
  session?.token || session?.accessToken || session?.authToken || session?.usuario?.token || "";

const pickRestauranteId = (session = {}) =>
  session?.restaurante?._id || session?.restaurante?.id || session?.restauranteId || "";

export default function NotificationPermissionBanner() {
  const [permission, setPermission] = useState(() =>
    Platform.OS === "web" ? getNotificationPermission() : "unsupported"
  );
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "web") return undefined;
    const update = () => setPermission(getNotificationPermission());
    update();
    window.addEventListener?.("focus", update);
    document.addEventListener?.("visibilitychange", update);
    return () => {
      window.removeEventListener?.("focus", update);
      document.removeEventListener?.("visibilitychange", update);
    };
  }, []);

  const activate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await requestNotificationPermission();
      setPermission(result.permission || getNotificationPermission());

      if (!result.ok) {
        Alert.alert("Notificações", result.reason || "A permissão não foi concedida.");
        return;
      }

      // Quando as variáveis de Web Push estiverem configuradas, registra também
      // a assinatura remota, necessária para receber com o PWA fechado.
      if (VAPID_PUBLIC_KEY && PUSH_SUBSCRIBE_URL) {
        try {
          const session = await getSession();
          await subscribeWebPush({
            vapidPublicKey: VAPID_PUBLIC_KEY,
            subscribeUrl: PUSH_SUBSCRIBE_URL,
            token: pickToken(session),
            restauranteId: pickRestauranteId(session),
          });
        } catch (error) {
          console.warn("[Movyo Push] Permissão concedida, mas a inscrição remota falhou:", error);
        }
      }

      Alert.alert("Notificações ativadas", "A Movyo poderá avisar sobre abertura de caixa e novos pedidos.");
    } finally {
      setBusy(false);
    }
  }, [busy]);

  if (Platform.OS !== "web" || hidden || permission === "granted" || permission === "unsupported") {
    return null;
  }

  const needsInstall = isIOS() && !isStandalonePWA();

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications" size={22} color="#fff" />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{needsInstall ? "Instale para receber avisos" : "Ative as notificações"}</Text>
        <Text style={styles.text}>
          {needsInstall
            ? "No iPhone, toque em Compartilhar → Adicionar à Tela de Início. Depois abra a Movyo pelo ícone instalado."
            : permission === "denied"
              ? "A permissão está bloqueada. Libere Notificações nas configurações do Safari/iPhone e tente novamente."
              : "Receba alertas de caixa aberto e de todo novo pedido, inclusive pedidos da vitrine."}
        </Text>
        {!needsInstall && permission !== "denied" ? (
          <Pressable style={styles.button} onPress={activate} disabled={busy}>
            <Text style={styles.buttonText}>{busy ? "Ativando..." : "Ativar agora"}</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable style={styles.close} onPress={() => setHidden(true)} hitSlop={10}>
        <Ionicons name="close" size={20} color="#64748b" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#f97316",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800", color: "#7c2d12", marginBottom: 3 },
  text: { fontSize: 12.5, lineHeight: 18, color: "#9a3412" },
  button: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#ea580c",
  },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  close: { padding: 2 },
});
