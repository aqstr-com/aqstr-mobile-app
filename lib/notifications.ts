/**
 * Notification Service
 * Handles Firebase Cloud Messaging (FCM) push notifications via expo-notifications
 */
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import Constants from "expo-constants";

// Conditionally import Firebase Messaging (only available in development/production builds, not Expo Go)
let messaging: any = null;
try {
  messaging = require("@react-native-firebase/messaging").default;
} catch (error) {
  // Firebase Messaging not available (e.g., in Expo Go)
  console.log("ℹ️ @react-native-firebase/messaging not available - topic subscription will be skipped");
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationToken {
  token: string;
  type: "expo" | "fcm";
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (!Device.isDevice) {
      console.warn("Must use physical device for Push Notifications");
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.warn("Failed to get push token for push notification!");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error requesting notification permissions:", error);
    return false;
  }
}

/**
 * Get the Expo push token
 */
export async function getExpoPushToken(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.warn("Must use physical device for Push Notifications");
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error("Project ID not found in app config");
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error) {
    console.error("Error getting Expo push token:", error);
    return null;
  }
}

/**
 * Get the FCM token (for Android)
 * This is automatically handled by expo-notifications when google-services.json is configured
 */
export async function getFCMToken(): Promise<string | null> {
  try {
    if (Platform.OS !== "android") {
      return null;
    }

    if (!Device.isDevice) {
      console.warn("Must use physical device for Push Notifications");
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    // For Android, the FCM token is automatically retrieved when using expo-notifications
    // with google-services.json configured. The token will be available in the notification
    // response or can be retrieved via the native module if needed.

    // Note: expo-notifications handles FCM token management automatically on Android
    // when google-services.json is properly configured in app.json

    return null; // FCM token is handled internally by expo-notifications
  } catch (error) {
    console.error("Error getting FCM token:", error);
    return null;
  }
}

/**
 * Register for push notifications and get token
 * Returns the Expo push token which can be used to send notifications via Firebase
 */
export async function registerForPushNotifications(): Promise<NotificationToken | null> {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const expoToken = await getExpoPushToken();
    if (!expoToken) {
      return null;
    }

    // Configure Android channel for notifications
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#f97316",
        sound: "default",
      });
    }

    return {
      token: expoToken,
      type: "expo",
    };
  } catch (error) {
    console.error("Error registering for push notifications:", error);
    return null;
  }
}

/**
 * Subscribe to FCM topic for broadcast notifications
 *
 * This function subscribes the device to an FCM topic (e.g., "all") so it can
 * receive broadcast notifications sent to that topic from the backend.
 *
 * NOTE: Requires a development or production build. Does not work in Expo Go.
 *
 * @param topic - The FCM topic to subscribe to (e.g., "all")
 */
export async function subscribeToTopic(topic: string): Promise<boolean> {
  try {
    if (!Device.isDevice) {
      console.warn("Must use physical device for FCM topic subscription");
      return false;
    }

    if (!messaging) {
      console.warn("⚠️ Firebase Messaging not available. Topic subscription requires a development build (not Expo Go). " + "Notifications will still work, but topic subscription is skipped.");
      return false;
    }

    // Subscribe to the topic using Firebase Messaging SDK
    await messaging().subscribeToTopic(topic);
    console.log(`✅ Successfully subscribed to FCM topic: ${topic}`);
    return true;
  } catch (error) {
    console.error(`Error subscribing to topic ${topic}:`, error);
    return false;
  }
}

/**
 * Unsubscribe from FCM topic
 *
 * NOTE: Requires a development or production build. Does not work in Expo Go.
 *
 * @param topic - The FCM topic to unsubscribe from
 */
export async function unsubscribeFromTopic(topic: string): Promise<boolean> {
  try {
    if (!Device.isDevice) {
      console.warn("Must use physical device for FCM topic unsubscription");
      return false;
    }

    if (!messaging) {
      console.warn("⚠️ Firebase Messaging not available. Topic unsubscription requires a development build.");
      return false;
    }

    // Unsubscribe from the topic using Firebase Messaging SDK
    await messaging().unsubscribeFromTopic(topic);
    console.log(`✅ Successfully unsubscribed from FCM topic: ${topic}`);
    return true;
  } catch (error) {
    console.error(`Error unsubscribing from topic ${topic}:`, error);
    return false;
  }
}

/**
 * Set up notification listeners
 * Returns cleanup function to remove listeners
 */
export function setupNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void
): () => void {
  // Listener for notifications received while app is foregrounded
  const receivedListener = Notifications.addNotificationReceivedListener((notification) => {
    console.log("Notification received:", notification);
    if (onNotificationReceived) {
      onNotificationReceived(notification);
    }
  });

  // Listener for when user taps on a notification
  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    console.log("Notification tapped:", response);
    if (onNotificationTapped) {
      onNotificationTapped(response);
    }
  });

  // Return cleanup function
  return () => {
    receivedListener.remove();
    responseListener.remove();
  };
}

/**
 * Schedule a local notification (for testing)
 */
export async function scheduleLocalNotification(title: string, body: string, data?: Record<string, any>): Promise<string> {
  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
      sound: true,
    },
    trigger: null, // Show immediately
  });
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get all notification permissions status
 */
export async function getNotificationPermissionsStatus(): Promise<{
  granted: boolean;
  status: Notifications.PermissionStatus;
}> {
  const { status } = await Notifications.getPermissionsAsync();
  return {
    granted: status === "granted",
    status,
  };
}
