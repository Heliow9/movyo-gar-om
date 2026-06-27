export const ANDROID_CHANNEL_ID = 'movyo-operacional';

const unsupported = {
  ok: false,
  permission: 'unsupported',
  code: 'WEB_PLATFORM',
  reason: 'Use Web Push no navegador.',
};

export function getStoredNativePushState() {
  return { connected: false, lastSync: null, expoPushToken: '' };
}

export async function getNativeNotificationStatus() {
  return unsupported;
}

export async function configureNativeNotifications() {
  return unsupported;
}

export async function subscribeNativePush() {
  return unsupported;
}

export async function syncNativePushSubscription() {
  return unsupported;
}

export async function configureNativeNotificationHandler() {
  return () => {};
}

export async function showNativeLocalNotification() {
  return false;
}
