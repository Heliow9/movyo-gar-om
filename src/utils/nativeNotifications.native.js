import {
  configureNativeNotificationHandler as configureHandler,
  getNativeNotificationStatus as getStatus,
  syncNativePushSubscription as syncSubscription,
} from './nativeNotifications.js';

export const ANDROID_CHANNEL_ID = 'movyo-operacional';

export const getNativeNotificationStatus = getStatus;
export const configureNativeNotificationHandler = configureHandler;
export const syncNativePushSubscription = syncSubscription;

export function getStoredNativePushState() {
  return { connected: false, lastSync: null, expoPushToken: '' };
}

export async function configureNativeNotifications({ requestPermission = false } = {}) {
  if (requestPermission) return syncSubscription({ requestPermission: true });
  return getStatus();
}

export async function subscribeNativePush({ requestPermission = true } = {}) {
  return syncSubscription({ requestPermission });
}

export async function showNativeLocalNotification(title, options = {}) {
  try {
    const Notifications = await import('expo-notifications');
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body: options.body || '',
        data: options.data || {},
        sound: 'default',
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
