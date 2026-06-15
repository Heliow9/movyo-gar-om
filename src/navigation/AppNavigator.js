// src/navigation/AppNavigator.js
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import MesasScreen from "../screens/MesasScreen";
import PedidosScreen from "../screens/PedidosScreen";
import BalcaoScreen from "../screens/BalcaoScreen";
import ComandaScreen from "../screens/ComandaScreen";
import MeuPerfilScreen from "../screens/MeuPerfilScreen";
import HubRestauranteScreen from "../screens/HubRestauranteScreen";
import AccessBlockedScreen from "../components/AccessBlockedScreen";

import { clearSession, getSession, updateSessionRestaurantePatch, updateSessionGarcomPatch } from "../api/storage/session";
import { api, authEvents } from "../api/api";
import {
  getAuthBlockInfoFromError,
  getRestauranteAccessBlockInfo,
  pickRestauranteFromPayload,
} from "../utils/licenseGuard";
import { disconnectSocket } from "../socket/socket";

const Stack = createNativeStackNavigator();

function isSessionUsable(session) {
  const token = String(session?.token || "").trim();
  const restId = session?.restaurante?._id || session?.restaurante?.id;
  if (!token || !restId) return false;
  if (session?.tipo === "restaurante") return true;
  const garcomId = session?.garcom?._id || session?.garcom?.id;
  return !!garcomId;
}

function restauranteFromMeResponse(data, session) {
  return pickRestauranteFromPayload(data) || data?.restaurante || data || session?.restaurante || null;
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff7fb" }}>
      <ActivityIndicator size="large" color="#ff3b8a" />
    </View>
  );
}

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [isAuth, setIsAuth] = useState(false);
  const [sessionType, setSessionType] = useState("garcom");
  const [accessBlocked, setAccessBlocked] = useState(null);

  const refreshAuth = useCallback(async () => {
    try {
      const session = await getSession();
      setSessionType(session?.tipo === "restaurante" ? "restaurante" : "garcom");
      setIsAuth(isSessionUsable(session));
    } catch {
      setIsAuth(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const forceLogout = useCallback(async (access) => {
    const normalized = typeof access === "string" ? { message: access } : (access || { message: "Sua sessão foi encerrada." });
    disconnectSocket();
    await clearSession();
    setIsAuth(false);
    setSessionType("garcom");
    setAccessBlocked(normalized);
  }, []);

  const manualLogout = useCallback(async () => {
    disconnectSocket();
    await clearSession();
    setAccessBlocked(null);
    setIsAuth(false);
    setSessionType("garcom");
  }, []);

  const validateCurrentSession = useCallback(async () => {
    const current = await getSession();
    if (!isSessionUsable(current)) return;

    const localBlock = getRestauranteAccessBlockInfo(current?.restaurante);
    if (localBlock) {
      await forceLogout(localBlock);
      return;
    }

    try {
      // Rotas protegidas oficiais: ambas passam pela validação global de licença/bloqueio.
      const endpoint = current?.tipo === "restaurante"
        ? "/api/restaurantes/me"
        : `/api/garcons/app/me?_t=${Date.now()}`;
      const res = await api.get(endpoint);

      const restaurante = restauranteFromMeResponse(res?.data, current);
      const remoteBlock = getRestauranteAccessBlockInfo(restaurante);
      if (remoteBlock) {
        await forceLogout(remoteBlock);
        return;
      }
      if (restaurante && typeof restaurante === "object") {
        await updateSessionRestaurantePatch(restaurante);
      }
      if (current?.tipo !== "restaurante" && res?.data?.garcom && typeof res.data.garcom === "object") {
        await updateSessionGarcomPatch(res.data.garcom);
      }
    } catch (err) {
      const block = getAuthBlockInfoFromError(err);
      if (block) await forceLogout(block);
    }
  }, [forceLogout]);

  useEffect(() => {
    const off = authEvents.on(async (ev) => {
      if (ev?.type === "AUTH_LOGIN") {
        setAccessBlocked(null);
        setIsAuth(true);
        setTimeout(() => validateCurrentSession(), 500);
        return;
      }

      if (ev?.type === "AUTH_LOGOUT") {
        await manualLogout();
        return;
      }

      if (ev?.type === "AUTH_LOGOUT_REQUIRED") {
        await forceLogout({ code: ev?.code, reason: ev?.reason, message: ev?.message || "Sua sessão foi encerrada." });
      }
    });
    return off;
  }, [forceLogout, manualLogout, validateCurrentSession]);

  useEffect(() => {
    if (!isAuth) return undefined;
    validateCurrentSession();

    const interval = setInterval(validateCurrentSession, 45000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") validateCurrentSession();
    });

    return () => {
      clearInterval(interval);
      sub?.remove?.();
    };
  }, [isAuth, validateCurrentSession]);

  if (loading) return <Splash />;

  if (accessBlocked) {
    return <AccessBlockedScreen access={accessBlocked} onBackToLogin={() => setAccessBlocked(null)} />;
  }

  if (!isAuth) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="Login">
          {(props) => (
            <LoginScreen
              {...props}
              onBlocked={(access) => setAccessBlocked(access)}
              onLogged={() => {
                refreshAuth();
                authEvents.emit({ type: "AUTH_LOGIN" });
              }}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  if (sessionType === "restaurante") {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "fade" }}>
        <Stack.Screen name="HubRestaurante">
          {(props) => <HubRestauranteScreen {...props} onLogout={manualLogout} />}
        </Stack.Screen>
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
      <Stack.Screen name="Home">{(props) => <HomeScreen {...props} onLogout={manualLogout} />}</Stack.Screen>
      <Stack.Screen name="Mesas" component={MesasScreen} />
      <Stack.Screen name="Pedidos" component={PedidosScreen} />
      <Stack.Screen name="Balcao" component={BalcaoScreen} />
      <Stack.Screen name="Comanda" component={ComandaScreen} />
      <Stack.Screen name="MeuPerfil">{(props) => <MeuPerfilScreen {...props} onLogout={manualLogout} />}</Stack.Screen>
    </Stack.Navigator>
  );
}
