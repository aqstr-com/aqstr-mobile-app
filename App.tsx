/**
 * AQSTR Mobile App - Main Entry Point
 * React Native app for completing Nostr tasks and earning sats
 */
import React, { useState, useRef, useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View, ActivityIndicator, Text, Animated, TouchableOpacity } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import LoginScreen from "./app/(auth)/login";
import DashboardScreen from "./app/(app)/dashboard";
import TaskDetailScreen from "./app/(app)/task/[id]";
import MerchantDashboard from "./app/(app)/merchant/dashboard";
import { FeedScreen } from "./components/FeedScreen";

import MerchantSettingsScreen from "./app/(app)/merchant/MerchantSettingsScreen";
import { Icon } from "./components/Icon";
import { PublicFeedScreen } from "./components/PublicFeedScreen";
import { registerForPushNotifications, setupNotificationListeners } from "./lib/notifications";

type TabType = "tasks" | "feed" | "publicFeed" | "merchant";


const BOTTOM_NAV_HEIGHT = 80;

/**
 * Main app navigator - switches between auth and app screens
 */
function AppNavigator() {
  const { isLoading, isAuthenticated, logout } = useAuth();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("tasks");
  const [showMerchantSettings, setShowMerchantSettings] = useState(false);
  const [merchantInitialEventId, setMerchantInitialEventId] = useState<string | null>(null);
  const [viewingNpub, setViewingNpub] = useState<string | null>(null);
  const [isBoostFollowingMode, setIsBoostFollowingMode] = useState(false);
  const [targetPubkey, setTargetPubkey] = useState<string | null>(null);
  const [isNavHidden, setIsNavHidden] = useState(false);
  const insets = useSafeAreaInsets();

  // Animation for hiding/showing bottom nav
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const navTranslation = useRef(new Animated.Value(0)).current;
  const isNavVisible = useRef(true);

  // Handle scroll events to hide/show navigation
  const handleScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
    listener: (event: any) => {
      const currentY = event.nativeEvent.contentOffset.y;
      const diff = currentY - lastScrollY.current;

      // Only trigger after initial scroll
      if (currentY <= 0) {
        if (!isNavVisible.current) {
          showNav();
        }
      } else if (diff > 10 && isNavVisible.current) {
        // Scrolling down - hide
        hideNav();
      } else if (diff < -10 && !isNavVisible.current) {
        // Scrolling up - show
        showNav();
      }

      lastScrollY.current = currentY;
    },
  });

  const hideNav = () => {
    isNavVisible.current = false;
    Animated.timing(navTranslation, {
      toValue: BOTTOM_NAV_HEIGHT + 20,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const showNav = () => {
    isNavVisible.current = true;
    Animated.timing(navTranslation, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  // Reset nav when switching tabs
  useEffect(() => {
    showNav();
  }, [activeTab, selectedTaskId]);

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  // User mode - show task detail if a task is selected
  if (selectedTaskId) {
    return <TaskDetailScreen taskId={selectedTaskId} onBack={() => setSelectedTaskId(null)} />;
  }

  // Show merchant settings
  if (showMerchantSettings) {
    return <MerchantSettingsScreen onBack={() => setShowMerchantSettings(false)} />;
  }

  const renderActiveScreen = () => {
    // Show specific user's feed
    if (viewingNpub) {
      return (
        <PublicFeedScreen
          npub={viewingNpub}
          onLogout={logout}
          onScroll={handleScroll}
          onViewMerchantSettings={() => setShowMerchantSettings(true)}
          onBack={() => setViewingNpub(null)}
          onBoostEvent={(eventId) => {
            setMerchantInitialEventId(eventId);
            setActiveTab("merchant");
            setViewingNpub(null);
          }}
          onViewUserFeed={(npub: string) => setViewingNpub(npub)}
          onBoostFollowing={(pubkey: string) => {
            setMerchantInitialEventId(pubkey); // We reuse this for the pubkey in following mode
            setTargetPubkey(pubkey);
            setIsBoostFollowingMode(true);
            setActiveTab("merchant");
            setViewingNpub(null);
          }}
          onNavigateToTasks={() => {
            setActiveTab("tasks");
            setViewingNpub(null);
          }}
        />
      );
    }

    switch (activeTab) {
      case "tasks":
        return (
          <DashboardScreen onTaskSelect={setSelectedTaskId} onScroll={handleScroll} onViewMerchantSettings={() => setShowMerchantSettings(true)} onNavigateToTasks={() => setActiveTab("tasks")} />
        );
      case "feed":
        return (
          <FeedScreen
            onLogout={logout}
            onScroll={handleScroll}
            onViewMerchantSettings={() => setShowMerchantSettings(true)}
            onBoostEvent={(eventId) => {
              setMerchantInitialEventId(eventId);
              setActiveTab("merchant");
            }}
            onViewUserFeed={(npub) => setViewingNpub(npub)}
            onBoostFollowing={(pubkey: string) => {
              setMerchantInitialEventId(pubkey);
              setTargetPubkey(pubkey);
              setIsBoostFollowingMode(true);
              setActiveTab("merchant");
            }}
            onNavigateToTasks={() => setActiveTab("tasks")}
          />
        );
      case "publicFeed":
        return (
          <PublicFeedScreen
            npub="6398e15e3416de093b963ca38783d2a66a9657cb08cbba4f02546cdd55b6f1a4" // Default public feed
            onLogout={logout}
            onScroll={handleScroll}
            onViewMerchantSettings={() => setShowMerchantSettings(true)}
            onBoostEvent={(eventId) => {
              setMerchantInitialEventId(eventId);
              setActiveTab("merchant");
            }}
            onViewUserFeed={(npub) => setViewingNpub(npub)}
            onBoostFollowing={(pubkey: string) => {
              setMerchantInitialEventId(pubkey);
              setTargetPubkey(pubkey);
              setIsBoostFollowingMode(true);
              setActiveTab("merchant");
            }}
            onNavigateToTasks={() => setActiveTab("tasks")}
          />
        );
      case "merchant":
        return (
          <MerchantDashboard
            onSwitchToUser={() => setActiveTab("tasks")}
            onScroll={handleScroll}
            onViewMerchantSettings={() => setShowMerchantSettings(true)}
            initialEventId={merchantInitialEventId || undefined}
            onClearInitialEventId={() => setMerchantInitialEventId(null)}
            isBoostFollowingMode={isBoostFollowingMode}
            onClearBoostFollowingMode={() => setIsBoostFollowingMode(false)}
            targetPubkey={targetPubkey || undefined}
            onClearTargetPubkey={() => setTargetPubkey(null)}
            onToggleNav={setIsNavHidden}
            onNavigateToTasks={() => setActiveTab("tasks")}
          />
        );
      default:
        return (
          <DashboardScreen onTaskSelect={setSelectedTaskId} onScroll={handleScroll} onViewMerchantSettings={() => setShowMerchantSettings(true)} onNavigateToTasks={() => setActiveTab("tasks")} />
        );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {renderActiveScreen()}

      {/* Bottom Navigation Bar */}
      {!isNavHidden && (
        <Animated.View style={[styles.bottomNav, { bottom: Math.max(insets.bottom, 20), transform: [{ translateY: navTranslation }] }]}>
          <View style={styles.navRow}>
            <TouchableOpacity
              style={[styles.navItem, activeTab === "tasks" && !viewingNpub && styles.navItemActive]}
              onPress={() => {
                setActiveTab("tasks");
                setViewingNpub(null);
                setIsBoostFollowingMode(false);
                setTargetPubkey(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="tasks" size={34} color={activeTab === "tasks" && !viewingNpub ? "#f97316" : "#71717a"} />
              {activeTab === "tasks" && !viewingNpub && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === "feed" && !viewingNpub && styles.navItemActive]}
              onPress={() => {
                setActiveTab("feed");
                setViewingNpub(null);
                setIsBoostFollowingMode(false);
                setTargetPubkey(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="userFeed" size={34} color={activeTab === "feed" && !viewingNpub ? "#f97316" : "#71717a"} />
              {activeTab === "feed" && !viewingNpub && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === "publicFeed" && !viewingNpub && styles.navItemActive]}
              onPress={() => {
                setActiveTab("publicFeed");
                setViewingNpub(null);
                setIsBoostFollowingMode(false);
                setTargetPubkey(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="publicFeed" size={34} color={activeTab === "publicFeed" && !viewingNpub ? "#f97316" : "#71717a"} />
              {activeTab === "publicFeed" && !viewingNpub && <View style={styles.activeDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.navItem, activeTab === "merchant" && !viewingNpub && styles.navItemActive]}
              onPress={() => {
                setActiveTab("merchant");
                setViewingNpub(null);
              }}
              activeOpacity={0.7}
            >
              <Icon name="merchant" size={34} color={activeTab === "merchant" && !viewingNpub ? "#f97316" : "#71717a"} />
              {activeTab === "merchant" && !viewingNpub && <View style={styles.activeDot} />}
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/**
 * Root App Component
 * Default tab is Tasks (as requested)
 */
/**
 * Component to handle push notification setup
 * Subscribes to FCM topic "all" for broadcast notifications
 */
function NotificationRegistration() {
  const [topicSubscribed, setTopicSubscribed] = React.useState(false);

  // Subscribe to "all" topic on app launch for broadcast notifications
  React.useEffect(() => {
    // First, register for push notifications to ensure permissions are granted
    registerForPushNotifications()
      .then((tokenData) => {
        if (tokenData) {
          console.log("Expo Push Token:", tokenData.token);

          // Subscribe to "all" topic for broadcast notifications
          // Note: This requires native FCM SDK implementation
          // See lib/notifications.ts for implementation details
          import("./lib/notifications").then(({ subscribeToTopic }) => {
            subscribeToTopic("all")
              .then((success) => {
                if (success) {
                  console.log("✅ Subscribed to 'all' topic for broadcast notifications");
                  setTopicSubscribed(true);
                } else {
                  console.warn("⚠️ Topic subscription not yet implemented - requires native FCM SDK");
                }
              })
              .catch((error) => {
                console.error("Error subscribing to topic:", error);
              });
          });
        }
      })
      .catch((error) => {
        console.error("Error registering for push notifications:", error);
      });
  }, []);

  return null; // This component doesn't render anything
}

export default function App() {
  // Set up notification listeners on app mount
  React.useEffect(() => {
    const cleanup = setupNotificationListeners(
      (notification) => {
        // Handle notification received while app is in foreground
        console.log("Notification received in foreground:", notification);
        // You can show a custom in-app notification here if needed
      },
      (response) => {
        // Handle notification tapped
        console.log("Notification tapped:", response);
        const data = response.notification.request.content.data;
        // Navigate to relevant screen based on notification data
        // Example: if (data.taskId) { navigateToTask(data.taskId); }
      }
    );

    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationRegistration />
        <View style={styles.container}>
          <StatusBar style="light" />
          <AppNavigator />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#71717a",
    marginTop: 16,
    fontSize: 14,
  },
  bottomNav: {
    position: "absolute",
    left: 20,
    right: 20,
    maxWidth: 500,
    alignSelf: "center",
    height: 64,
    backgroundColor: "rgba(24, 24, 27, 0.95)",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#3f3f46",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  navRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navItem: {
    alignItems: "center",
    justifyContent: "center",
    width: 60,
    height: 60,
  },
  navItemActive: {
    // Optional contrast for active icon
  },

  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#f97316",
    marginTop: 4,
  },
});
