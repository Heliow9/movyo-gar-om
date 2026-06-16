import React, { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  getNotificationPermission,
  isIOS,
  isStandalonePWA,
  subscribeWebPush,
  supportsWebPush,
  syncWebPushSubscription,
} from "../utils/pwaNotifications";
import { getSession } from "../api/storage/session";

const pickToken = (session = {}) =>
  session?.token || session?.accessToken || session?.authToken || session?.usuario?.token || "";

const pickRestauranteId = (session = {}) =>
  session?.restaurante?._id || session?.restaurante?.id || session?.restauranteId || "";

export default function NotificationPermissionBanner() {
  const [permission, setPermission] = useState(() =>
    Platform.OS === "web" ? getNotificationPermission() : "unsupported"
  );
  const [remoteState, setRemoteState] = useState("idle");
  const [remoteMessage, setRemoteMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);

  const runSubscription = useCallback(async ({ requestPermission }) => {
    const session = await getSession();
    const args = {
      token: pickToken(session),
      restauranteId: pickRestauranteId(session),
    };
    return requestPermission ? subscribeWebPush(args) : syncWebPushSubscription(args);
  }, []);

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

  useEffect(() => {
    if (Platform.OS !== "web" || permission !== "granted" || remoteState !== "idle") return;
    let active = true;
    setRemoteState("checking");
    runSubscription({ requestPermission: false })
      .then((result) => {
        if (!active) return;
        if (result?.ok) {
          setRemoteState("connected");
          setRemoteMessage("");
        } else {
          setRemoteState("error");
          setRemoteMessage(result?.reason || "Push em segundo plano ainda não conectado.");
        }
      })
      .catch((error) => {
        if (!active) return;
        setRemoteState("error");
        setRemoteMessage(error?.message || "Push em segundo plano ainda não conectado.");
      });
    return () => { active = false; };
  }, [permission, remoteState, runSubscription]);

  const activate = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setRemoteState("checking");
    try {
      const result = await runSubscription({ requestPermission: permission !== "granted" });
      setPermission(result?.permission || getNotificationPermission());

      if (!result?.ok) {
        setRemoteState("error");
        setRemoteMessage(result?.reason || "Não foi possível ativar as notificações.");
        Alert.alert("Notificações", result?.reason || "Não foi possível ativar as notificações.");
        return;
      }

      setRemoteState("connected");
      setRemoteMessage("");
      Alert.alert("Notificações ativadas", "A Movyo poderá avisar sobre pedidos mesmo com o PWA fechado.");
    } finally {
      setBusy(false);
    }
  }, [busy, permission, runSubscription]);

  const needsInstall = isIOS() && !isStandalonePWA();
  if (Platform.OS !== "web" || hidden || (!needsInstall && !supportsWebPush())) return null;

  const denied = permission === "denied";
  const connected = permission === "granted" && remoteState === "connected";
  if (connected) return null;

  const title = needsInstall
    ? "Instale para receber avisos"
    : denied
      ? "Notificações bloqueadas"
      : permission === "granted"
        ? "Conecte o push em segundo plano"
        : "Ative as notificações";

  const text = needsInstall
    ? "No iPhone, toque em Compartilhar → Adicionar à Tela de Início. Depois abra a Movyo pelo ícone instalado."
    : denied
      ? "Libere as notificações da Movyo Hub em Ajustes → Notificações e abra novamente pelo ícone da Tela de Início."
      : permission === "granted"
        ? remoteMessage || "A permissão local está ativa, mas falta concluir a conexão com o servidor para receber com o app fechado."
        : "Receba alertas quando um pedido entrar em produção, inclusive com a Movyo Hub fechada.";

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications" size={22} color="#fff" />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.text}>{text}</Text>
        {!needsInstall && !denied ? (
          <Pressable style={styles.button} onPress={activate} disabled={busy || remoteState === "checking"}>
            <Text style={styles.buttonText}>
              {busy || remoteState === "checking" ? "Conectando..." : permission === "granted" ? "Tentar conectar" : "Ativar agora"}
            </Text>
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
