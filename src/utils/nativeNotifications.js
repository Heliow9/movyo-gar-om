import { Platform } from 'react-native';
import { api } from '../api/api';

const CHANNEL_ID = 'movyo-operacional';
let modulePromise;
let handlerConfigured = false;

function normalizeNativePushError(error) {
  const raw = String(error?.message || error || '');
  const lower = raw.toLowerCase();
  if (
    lower.includes('firebaseapp')
    || lower.includes('firebase app')
    || lower.includes('fcm credentials')
    || lower.includes('default firebaseapp')
  ) {
    return {
      ok: false,
      code: 'FIREBASE_ANDROID_NOT_CONFIGURED',
      permission: 'undetermined',
      reason: 'O Firebase do Android ainda nao foi configurado neste build.',
      details: raw,
    };
  }
  return {
    ok: false,
    code: 'NATIVE_PUSH_FAILED',
    permission: 'undetermined',
    reason: raw || 'Nao foi possivel configurar as notificacoes nativas.',
  };
}

async function loadModules() {
  if (Platform.OS === 'web') return null;
  if (!modulePromise) {
    modulePromise = Promise.all([
      import('expo-notifications'),
      import('expo-device'),
      import('expo-constants'),
    ]).then(([Notifications, Device, ConstantsModule]) => ({
      Notifications,
      Device,
      Constants: ConstantsModule.default || ConstantsModule,
    }));
  }
  return modulePromise;
}

async function ensureChannel(Notifications) {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Operacao Movyo',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#ff3b8a',
    sound: 'default',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

function getProjectId(Constants) {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.easConfig?.projectId
    || Constants?.manifest2?.extra?.expoClient?.extra?.eas?.projectId
    || ''
  );
}

export async function getNativeNotificationStatus() {
  if (Platform.OS === 'web') return { ok: false, permission: 'unsupported', code: 'WEB_ONLY' };
  try {
    const modules = await loadModules();
    const permissions = await modules.Notifications.getPermissionsAsync();
    return {
      ok: permissions.status === 'granted',
      permission: permissions.status,
      canAskAgain: permissions.canAskAgain,
    };
  } catch (error) {
    return normalizeNativePushError(error);
  }
}

export async function syncNativePushSubscription({ requestPermission = false } = {}) {
  if (Platform.OS === 'web') return { ok: false, permission: 'unsupported', code: 'WEB_ONLY' };

  try {
    const { Notifications, Device, Constants } = await loadModules();
    if (!Device.isDevice) {
      return {
        ok: false,
        permission: 'unsupported',
        code: 'PHYSICAL_DEVICE_REQUIRED',
        reason: 'Push remoto precisa ser testado em um aparelho fisico.',
      };
    }

    await ensureChannel(Notifications);
    let permissions = await Notifications.getPermissionsAsync();
    if (permissions.status !== 'granted' && requestPermission && permissions.canAskAgain !== false) {
      permissions = await Notifications.requestPermissionsAsync();
    }
    if (permissions.status !== 'granted') {
      return {
        ok: false,
        permission: permissions.status,
        canAskAgain: permissions.canAskAgain,
        code: 'NOTIFICATION_PERMISSION_REQUIRED',
        reason: permissions.canAskAgain === false
          ? 'As notificacoes estao bloqueadas nos ajustes do Android.'
          : 'Autorize as notificacoes para receber alertas com o app fechado.',
      };
    }

    const projectId = getProjectId(Constants);
    if (!projectId) {
      return {
        ok: false,
        permission: permissions.status,
        code: 'EXPO_PROJECT_ID_MISSING',
        reason: 'O projectId do EAS nao foi encontrado no build.',
      };
    }

    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    const pushToken = String(tokenResult?.data || '').trim();
    if (!pushToken) throw new Error('O Expo nao retornou um token push.');

    const response = await api.post('/api/push/subscribe/native', {
      pushToken,
      plataforma: `${Platform.OS}-native`,
      deviceId: [
        Device.manufacturer,
        Device.modelName,
        Device.osName,
        Device.osVersion,
      ].filter(Boolean).join(' / '),
    });

    return {
      ok: true,
      permission: permissions.status,
      pushToken,
      syncedAt: response?.data?.syncedAt,
    };
  } catch (error) {
    return normalizeNativePushError(error);
  }
}

export async function configureNativeNotificationHandler({ onNotification, onResponse } = {}) {
  if (Platform.OS === 'web') return () => {};
  try {
    const { Notifications } = await loadModules();
    if (!handlerConfigured) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      handlerConfigured = true;
    }

    const received = Notifications.addNotificationReceivedListener((notification) => {
      onNotification?.(notification);
    });
    const response = Notifications.addNotificationResponseReceivedListener((event) => {
      onResponse?.(event);
    });
    return () => {
      received.remove();
      response.remove();
    };
  } catch (error) {
    console.warn('[Movyo Push] Handler nativo indisponivel:', error?.message || error);
    return () => {};
  }
}
