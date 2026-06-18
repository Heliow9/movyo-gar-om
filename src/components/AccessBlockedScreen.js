import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { ACCESS_CODES } from "../utils/licenseGuard";
import { api } from "../api/api";

const SUPPORT_URL = "https://movyo.delivery";

export default function AccessBlockedScreen({ access, onBackToLogin }) {
  const [billing, setBilling] = useState(access?.assinaturaCobranca || null);
  const [loadingPix, setLoadingPix] = useState(false);
  const expired = access?.code === ACCESS_CODES.LICENCA_VENCIDA || access?.reason === "expired";
  const disabledUser = access?.code === ACCESS_CODES.GARCOM_DESATIVADO || access?.reason === "user_disabled";

  const title = expired ? "Licença vencida" : disabledUser ? "Acesso desativado" : "Restaurante bloqueado";
  const subtitle = access?.message || (expired
    ? "Regularize o plano para voltar a usar todos os recursos da Movyo."
    : "O acesso foi encerrado por segurança. Entre em contato com o suporte Movyo.");
  const icon = expired ? "calendar-clear-outline" : disabledUser ? "person-remove-outline" : "shield-outline";
  const restauranteId = access?.restauranteId || billing?.restauranteId || null;
  const descontoPct = Number(billing?.descontoPercentual || 0);
  const cobranca = billing?.cobranca || null;

  useEffect(() => {
    if (!expired || !restauranteId || billing) return;
    api.get(`/api/restaurantes/cobranca/${restauranteId}/resumo`).then((res) => setBilling(res?.data || null)).catch(() => {});
  }, [billing, expired, restauranteId]);

  useEffect(() => {
    if (!expired || !restauranteId || !cobranca?.qrCode) return undefined;
    const timer = setInterval(async () => {
      try {
        const res = await api.get(`/api/restaurantes/cobranca/${restauranteId}/resumo`);
        const next = res?.data || null;
        setBilling(next);
        if (next?.diasParaVencer != null && Number(next.diasParaVencer) > 0 && !next?.mostrarPix) {
          onBackToLogin?.();
        }
      } catch {}
    }, 8000);
    return () => clearInterval(timer);
  }, [cobranca?.qrCode, expired, onBackToLogin, restauranteId]);

  const openSupport = async () => {
    try {
      await Linking.openURL(SUPPORT_URL);
    } catch {}
  };

  const gerarPix = async () => {
    if (!restauranteId) return openSupport();
    try {
      setLoadingPix(true);
      const res = await api.post(`/api/restaurantes/cobranca/${restauranteId}/pix`);
      setBilling(res?.data?.resumo || billing);
      Alert.alert("Pix gerado", "Depois da confirmacao do pagamento, o acesso sera liberado automaticamente.");
    } catch (err) {
      Alert.alert("Pix indisponivel", err?.response?.data?.mensagem || err?.message || "Nao foi possivel gerar o Pix agora.");
    } finally {
      setLoadingPix(false);
    }
  };

  return (
    <LinearGradient colors={["#111827", "#251329", "#ff3b8a"]} style={styles.page}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
          <View>
            <Text style={styles.brand}>Movyo Hub</Text>
            <Text style={styles.brandSub}>Proteção da sua operação</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={[styles.iconWrap, expired && styles.iconWrapWarning]}>
            <Ionicons name={icon} size={38} color={expired ? "#d97706" : "#e11d48"} />
          </View>
          <Text style={styles.kicker}>{expired ? "ASSINATURA" : "SEGURANÇA"}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={20} color="#475569" />
            <Text style={styles.infoText}>
              Sua sessão foi desconectada deste aparelho. Nenhum pedido ou dado local foi apagado do restaurante.
            </Text>
          </View>

          {expired && billing?.valorPlano > 0 ? (
            <View style={styles.billingBox}>
              <Text style={styles.billingPlan}>Plano {billing.planoNome || billing.planoCodigo}: {Number(billing.valorPlano || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/mes</Text>
              {descontoPct > 0 ? <Text style={styles.billingDiscount}>Desconto especial de {descontoPct}% aplicado. Economia de {Number(billing.descontoValor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.</Text> : null}
              <Text style={styles.billingTotal}>Total para liberar: {Number(billing.valorFinal || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Text>
              {!!cobranca?.qrCodeBase64 ? <Image source={{ uri: `data:image/png;base64,${cobranca.qrCodeBase64}` }} style={styles.qr} /> : null}
              {!!cobranca?.qrCode ? <Text selectable numberOfLines={3} style={styles.pixCode}>{cobranca.qrCode}</Text> : null}
            </View>
          ) : null}

          <Pressable onPress={expired ? gerarPix : openSupport} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} accessibilityRole="button">
            {loadingPix ? <ActivityIndicator color="#fff" /> : <Ionicons name={expired ? "qr-code-outline" : "headset-outline"} size={19} color="#fff" />}
            <Text style={styles.primaryText}>{expired ? (cobranca?.qrCode ? "Gerar novamente" : "Gerar Pix da mensalidade") : "Falar com o suporte"}</Text>
          </Pressable>

          <Pressable onPress={onBackToLogin} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} accessibilityRole="button">
            <Ionicons name="arrow-back-outline" size={18} color="#334155" />
            <Text style={styles.secondaryText}>Voltar ao login</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>{Platform.OS === "ios" ? "iOS" : Platform.OS === "android" ? "Android" : "Web"} • movyo.delivery</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 22, paddingVertical: 18, justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  brandMark: { width: 46, height: 46, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.16)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#fff", fontSize: 23, fontWeight: "900" },
  brand: { color: "#fff", fontSize: 19, fontWeight: "900" },
  brandSub: { color: "rgba(255,255,255,0.7)", marginTop: 2, fontSize: 12, fontWeight: "700" },
  card: { width: "100%", maxWidth: 520, alignSelf: "center", backgroundColor: "#fff", borderRadius: 32, padding: 24, shadowColor: "#000", shadowOpacity: 0.28, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 16 },
  iconWrap: { width: 74, height: 74, borderRadius: 24, backgroundColor: "#fff1f2", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  iconWrapWarning: { backgroundColor: "#fffbeb" },
  kicker: { fontSize: 11, letterSpacing: 1.8, fontWeight: "900", color: "#e11d48" },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "900", color: "#0f172a", marginTop: 7 },
  subtitle: { fontSize: 15, lineHeight: 23, color: "#475569", fontWeight: "700", marginTop: 10 },
  infoBox: { flexDirection: "row", gap: 10, backgroundColor: "#f8fafc", borderRadius: 18, borderWidth: 1, borderColor: "#e2e8f0", padding: 14, marginTop: 22 },
  infoText: { flex: 1, color: "#475569", fontSize: 12, lineHeight: 18, fontWeight: "700" },
  billingBox: { marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#bbf7d0" },
  billingPlan: { color: "#064e3b", fontWeight: "900", fontSize: 13 },
  billingDiscount: { color: "#16a34a", fontWeight: "900", fontSize: 15, marginTop: 6 },
  billingTotal: { color: "#0f172a", fontWeight: "900", fontSize: 14, marginTop: 6 },
  qr: { width: 150, height: 150, borderRadius: 14, marginTop: 12, alignSelf: "center" },
  pixCode: { marginTop: 10, color: "#334155", fontSize: 11, fontWeight: "700" },
  primaryButton: { minHeight: 52, borderRadius: 18, backgroundColor: "#ff3b8a", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 20, shadowColor: "#ff3b8a", shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  primaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  secondaryButton: { minHeight: 48, borderRadius: 18, backgroundColor: "#f1f5f9", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  secondaryText: { color: "#334155", fontWeight: "900", fontSize: 14 },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  footer: { textAlign: "center", color: "rgba(255,255,255,0.72)", fontSize: 11, fontWeight: "800" },
});
