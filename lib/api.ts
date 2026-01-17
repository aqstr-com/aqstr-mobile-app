/**
 * API client for communicating with the remixrun backend
 */
import { getSession } from "./storage";
import { nip19 } from "nostr-tools";

// API base URL - configure for your environment
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
console.log("EXPO_PUBLIC_API_BASE_URL", API_BASE_URL);

export interface Task {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  paymentStatus: string;
  reward: number;
  remainingBudget: number;
  eventId?: string;
  eventContent?: string;
  likeReward?: number;
  repostReward?: number;
  repostWithQuoteReward?: number;
  replyReward?: number;
  followReward?: number;
  nip05Verified?: boolean;
  merchant?: {
    id: string;
    pubkey: string;
    displayName?: string;
    profilePic?: string;
  };
  createdAt: string;
  expiresAt?: string;
  endDate?: string;
}

export interface EligibilityStatus {
  isEligible: boolean;
  reason?: string;
  failedRequirements: string[];
}

export interface CompletedActions {
  like: boolean;
  repost: boolean;
  repost_with_quote: boolean;
  reply: boolean;
  follow: boolean;
  submitted: boolean;
}

interface TaskCompleteResponse {
  success: boolean;
  error?: string;
  reward?: number;
}

interface PublishResponse {
  success: boolean;
  error?: string;
}

export interface TaskDetailResponse {
  success: boolean;
  task: Task;
  eligibilityStatus: EligibilityStatus | null;
  completedActions: CompletedActions;
  totalEarnings: number;
  isOwnTask: boolean;
  taskEarnings: {
    totalPotentialEarnings: number;
    earningsBreakdown: string[];
  };
  user: {
    id: string;
    pubkey: string;
    npub: string;
    lightningAddress?: string;
  } | null;
  error?: string;
}

/**
 * Authenticate with Nostr signed event
 * Sends mobile=true flag to get JSON response with session cookie
 */
export async function authenticateWithNostr(signedEvent: any, contentSign: string): Promise<{ success: boolean; error?: string; sessionCookie?: string; user?: any }> {
  try {
    const formData = new FormData();
    formData.append("pubkey", signedEvent.pubkey);
    formData.append("signature", signedEvent.sig);
    formData.append("event", JSON.stringify(signedEvent));
    formData.append("contentSign", contentSign);
    formData.append("mobile", "true"); // Flag to get JSON response instead of redirect

    console.log("🔐 Authenticating with backend via /nostr-auth (mobile mode)...");
    console.log("API_BASE_URL", API_BASE_URL);
    const response = await fetch(`${API_BASE_URL}/nostr-auth`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success && data.sessionCookie) {
      console.log("✅ Auth successful, session cookie received");
      return {
        success: true,
        sessionCookie: data.sessionCookie,
        user: data.user,
      };
    } else {
      console.log("❌ Auth failed:", data.error);
      return {
        success: false,
        error: data.error || "Authentication failed",
      };
    }
  } catch (error) {
    console.error("Auth error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Get authentication challenge from server
 * Used for NIP-46 challenge-response authentication
 */
export async function getAuthChallenge(): Promise<{ challenge: string; expiresAt: number } | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/challenge`);

    if (!response.ok) {
      console.error("Failed to get auth challenge:", response.status);
      return null;
    }

    const data = await response.json();
    return {
      challenge: data.challenge,
      expiresAt: data.expiresAt || Date.now() + 5 * 60 * 1000,
    };
  } catch (error) {
    console.error("Get auth challenge error:", error);
    return null;
  }
}

/**
 * Authenticate with NIP-46 signed event (kind 22242)
 * Uses challenge-response flow for enhanced security
 */
export async function authenticateWithNip46(
  signedEvent: any,
  challenge: string
): Promise<{ success: boolean; error?: string; sessionCookie?: string; user?: any }> {
  try {
    const formData = new FormData();
    formData.append("event", JSON.stringify(signedEvent));
    formData.append("challenge", challenge);
    formData.append("authMethod", "nip46");
    formData.append("mobile", "true"); // Flag to get JSON response instead of redirect

    console.log("🔐 Authenticating with NIP-46 via /nostr-auth...");
    const response = await fetch(`${API_BASE_URL}/nostr-auth`, {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.success && data.sessionCookie) {
      console.log("✅ NIP-46 auth successful, session cookie received");
      return {
        success: true,
        sessionCookie: data.sessionCookie,
        user: data.user,
      };
    } else {
      console.log("❌ NIP-46 auth failed:", data.error);
      return {
        success: false,
        error: data.error || "Authentication failed",
      };
    }
  } catch (error) {
    console.error("NIP-46 auth error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Fetch task details by ID from API endpoint
 */
export async function fetchTaskById(taskId: string, sessionCookie?: string): Promise<TaskDetailResponse> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (sessionCookie) {
      headers["Cookie"] = sessionCookie;
    }

    const response = await fetch(`${API_BASE_URL}/api/task/${taskId}`, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch task error:", error);
    return {
      success: false,
      error: (error as Error).message,
    } as TaskDetailResponse;
  }
}

/**
 * Parse a Set-Cookie header value to extract just the cookie name=value pairs
 * Set-Cookie: __session=xxx; Path=/; HttpOnly; SameSite=Lax
 * Returns: __session=xxx
 *
 * Also handles edge cases like:
 * - Duplicate cookies separated by commas
 * - Quoted values
 */
function parseCookieForRequest(setCookieHeader: string): string {
  if (!setCookieHeader) return "";

  // Remove any wrapping quotes
  let cleaned = setCookieHeader.replace(/^['"]|['"]$/g, "");

  // If there are commas (multiple cookies), take only the first one
  if (cleaned.includes(",")) {
    console.log("⚠️ Found comma in cookie, extracting first value");
    const firstCookie = cleaned.split(",")[0].trim();
    cleaned = firstCookie;
  }

  // The cookie value is everything before the first semicolon
  const parts = cleaned.split(";");
  if (parts.length > 0) {
    const cookieValue = parts[0].trim();
    // Ensure it starts with __session=
    if (cookieValue.startsWith("__session=")) {
      return cookieValue;
    }
  }

  // Fallback: try to extract __session= value using regex
  const match = cleaned.match(/__session=[^;,\s]+/);
  if (match) {
    return match[0];
  }

  console.warn("⚠️ Could not parse session cookie from:", cleaned.substring(0, 50));
  return cleaned.split(";")[0].trim();
}

/**
 * Complete a task action (like, repost, reply, etc.)
 */
export async function completeTask(taskId: string, taskType: "like" | "repost" | "repost_with_quote" | "reply" | "follow", nostrEventId: string, replyContent?: string): Promise<TaskCompleteResponse> {
  try {
    // Get stored session cookie for authentication
    console.log("🔍 Retrieving session from storage...");
    const storedCookie = await getSession();
    console.log("🔍 Retrieved session:", storedCookie ? `${storedCookie.substring(0, 50)}...` : "NULL");

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (storedCookie) {
      // Parse the cookie to extract just the session value (without Path, HttpOnly, etc.)
      const cookieValue = parseCookieForRequest(storedCookie);
      // Use Authorization header instead of Cookie to avoid RN's automatic cookie handling causing duplicates
      headers["Authorization"] = `Bearer ${cookieValue}`;
      console.log("🔐 Setting Authorization header with session");
    } else {
      console.warn("⚠️ No session available - request may fail authentication");
      console.warn("⚠️ Did you log out and log back in after the latest update?");
    }

    console.log("📡 Completing task:", { taskId, taskType, hasSession: !!storedCookie });
    console.log("📡 Request headers:", JSON.stringify(headers, null, 2));

    const response = await fetch(`${API_BASE_URL}/api/task/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        taskId,
        taskType,
        nostrEventId,
        replyContent,
      }),
    });

    // Try to parse the response
    let data: any;
    try {
      data = await response.json();
    } catch {
      // If JSON parsing fails, use status text
      if (!response.ok) {
        return {
          success: false,
          error: `Server error (${response.status}): ${response.statusText}`,
        };
      }
      return {
        success: false,
        error: "Invalid server response",
      };
    }

    // Check for HTTP errors
    if (!response.ok) {
      // If we get a redirect to login, session expired
      if (response.status === 302 || data?.error?.includes("login")) {
        return {
          success: false,
          error: "Session expired. Please log out and log in again.",
        };
      }
      return {
        success: false,
        error: data?.error || data?.message || `Server error (${response.status})`,
      };
    }

    return data;
  } catch (error) {
    console.error("Complete task error:", error);
    return {
      success: false,
      error: (error as Error).message || "Network error - please check your connection",
    };
  }
}

/**
 * Publish signed event to Nostr relays via server
 */
export async function publishToNostr(signedEvent: any, relays: string[] = ["wss://relay.primal.net"]): Promise<PublishResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/nostr/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event: signedEvent,
        relays,
      }),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Publish error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}



/**
 * Response from available tasks API with eligibility and completions
 */
export interface AvailableTasksResponse {
  success: boolean;
  tasks: Task[];
  taskEligibility?: Record<string, { isEligible: boolean; reason?: string; failedRequirements: string[] }>;
  taskCompletions?: Record<string, CompletedActions>;
  user?: {
    id: string;
    pubkey: string;
    npub: string;
    lightningAddress?: string;
    trustScore?: number;
  };
  error?: string;
}

/**
 * Fetch available tasks from the backend
 * @param pubkey - Optional hex pubkey to get eligibility and completion status
 */
export async function fetchAvailableTasks(pubkey?: string, sessionCookie?: string): Promise<AvailableTasksResponse> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (sessionCookie) {
      headers["Cookie"] = sessionCookie;
    }

    // Build URL with pubkey query param if provided
    let url = `${API_BASE_URL}/api/tasks/available`;
    console.log("url", url);
    if (pubkey) {
      url += `?pubkey=${encodeURIComponent(pubkey)}`;
    }

    const response = await fetch(url, {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data.success ?? true,
      tasks: data.tasks || [],
      taskEligibility: data.taskEligibility,
      taskCompletions: data.taskCompletions,
      user: data.user,
      error: data.error,
    };
  } catch (error) {
    console.error("Fetch available tasks error:", error);
    return {
      success: false,
      tasks: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Get the configured API base URL
 */
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Merchant task from the API (campaign created by the merchant)
 */
export interface MerchantTask {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: "PENDING_PAYMENT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "STOPPED";
  paymentStatus: "UNPAID" | "PAID";
  reward: number;
  totalBudget: number;
  remainingBudget: number;
  maxCompletions?: number;
  completedCount: number;
  eventId?: string;
  eventContent?: string;
  likeReward?: number;
  repostReward?: number;
  repostWithQuoteReward?: number;
  replyReward?: number;
  followReward?: number;
  merchant?: {
    id: string;
    pubkey: string;
    displayName?: string;
    profilePic?: string;
  };
  createdAt: string;
  updatedAt?: string;
  endDate?: string;
}

/**
 * Response from merchant tasks API
 */
export interface MerchantTasksResponse {
  success: boolean;
  tasks: MerchantTask[];
  user?: {
    id: string;
    pubkey: string;
    npub: string;
  };
  error?: string;
}

/**
 * Fetch merchant's own campaigns (tasks they created)
 * Requires authentication
 */
export async function fetchMerchantTasks(): Promise<MerchantTasksResponse> {
  try {
    // Get stored session cookie for authentication
    const storedCookie = await getSession();

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (storedCookie) {
      // Parse the cookie to extract just the session value
      const cookieValue = parseCookieForRequest(storedCookie);
      headers["Authorization"] = `Bearer ${cookieValue}`;
    } else {
      console.warn("⚠️ No session available for merchant tasks request");
      return {
        success: false,
        tasks: [],
        error: "Not authenticated",
      };
    }

    const response = await fetch(`${API_BASE_URL}/api/tasks/merchant`, {
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          success: false,
          tasks: [],
          error: "Session expired. Please log out and log in again.",
        };
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: data.success ?? true,
      tasks: data.tasks || [],
      user: data.user,
      error: data.error,
    };
  } catch (error) {
    console.error("Fetch merchant tasks error:", error);
    return {
      success: false,
      tasks: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Toggle campaign status (pause/resume)
 */
export async function toggleCampaign(campaignId: string, action: "pause" | "resume"): Promise<{ success: boolean; error?: string; newStatus?: string }> {
  try {
    const storedCookie = await getSession();

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (storedCookie) {
      const cookieValue = parseCookieForRequest(storedCookie);
      headers["Authorization"] = `Bearer ${cookieValue}`;
    } else {
      return { success: false, error: "Not authenticated" };
    }

    const body = new URLSearchParams();
    body.append("campaignId", campaignId);
    body.append("action", action);

    const response = await fetch(`${API_BASE_URL}/api/campaign/toggle`, {
      method: "POST",
      headers,
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Failed to ${action} campaign`,
      };
    }

    return {
      success: true,
      newStatus: data.newStatus,
    };
  } catch (error) {
    console.error(`Toggle campaign error:`, error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Delete a campaign (only unpaid or paused campaigns)
 */
export async function deleteCampaign(campaignId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const storedCookie = await getSession();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (storedCookie) {
      const cookieValue = parseCookieForRequest(storedCookie);
      headers["Authorization"] = `Bearer ${cookieValue}`;
    } else {
      return { success: false, error: "Not authenticated" };
    }

    const response = await fetch(`${API_BASE_URL}/api/campaigns/delete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ campaignId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to delete campaign",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Delete campaign error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Campaign creation parameters
 */
export interface CreateCampaignParams {
  merchantId: string; // User's pubkey (hex)
  title: string;
  description?: string;
  budgetSats: number;
  eventId: string;
  eventContent?: string;
  likeReward?: number;
  repostReward?: number;
  repostWithQuoteReward?: number;
  replyReward?: number;
  followReward?: number;
  endDate?: string;
  useTrustScoreMode?: boolean;
  minTrustScore?: number;
}

/**
 * Campaign creation response
 */
export interface CreateCampaignResponse {
  success: boolean;
  error?: string;
  campaign?: {
    id: string;
    title: string;
    totalCost: number;
    totalBudget: number;
    platformFee: number;
    status: string;
    paymentStatus: string;
    paymentInvoice?: string;
    paymentHash?: string;
  };
}

/**
 * Create a new campaign
 */
export async function createCampaign(params: CreateCampaignParams): Promise<CreateCampaignResponse> {
  try {
    const storedCookie = await getSession();

    if (!storedCookie) {
      return { success: false, error: "Not authenticated" };
    }

    const cookieValue = parseCookieForRequest(storedCookie);

    // Build form data matching the web API
    const formData = new FormData();
    formData.append("taskType", "NOSTR_BOOST");
    formData.append("title", params.title || "Boost Nostr Event");
    formData.append("description", params.description || "Like, repost, and reply to Nostr events");
    formData.append("merchantId", params.merchantId); // User's pubkey
    formData.append("budgetSats", params.budgetSats.toString());
    formData.append("reward", "100"); // Default, actual rewards are per-action
    formData.append("requiresApproval", "false");
    formData.append("autoApprove", "false");

    if (params.endDate) {
      formData.append("endDate", new Date(params.endDate).toISOString());
    }

    // Reward values
    formData.append("likeReward", (params.likeReward || 0).toString());
    formData.append("repostReward", (params.repostReward || 0).toString());
    formData.append("repostWithQuoteReward", (params.repostWithQuoteReward || 0).toString());
    formData.append("replyReward", (params.replyReward || 0).toString());
    formData.append("followReward", (params.followReward || 0).toString());

    // Event details
    formData.append("eventId", params.eventId);
    formData.append("eventContent", params.eventContent || "Boost this Nostr event!");

    // Eligibility settings
    formData.append("useTrustScoreMode", (params.useTrustScoreMode ?? true).toString());
    if (params.useTrustScoreMode !== false) {
      formData.append("minTrustScore", (params.minTrustScore || 50).toString());
    }

    const response = await fetch(`${API_BASE_URL}/api/campaigns/create`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cookieValue}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to create campaign",
      };
    }

    return {
      success: true,
      campaign: data.campaign,
    };
  } catch (error) {
    console.error("Create campaign error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Check campaign payment status
 */
export interface CheckPaymentResponse {
  success: boolean;
  paid: boolean;
  campaign?: {
    id: string;
    status: string;
    paymentStatus: string;
  };
  error?: string;
  message?: string;
}

export async function checkCampaignPayment(campaignId: string): Promise<CheckPaymentResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/campaigns/check-payment?campaignId=${encodeURIComponent(campaignId)}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        paid: false,
        error: data.error || "Failed to check payment",
      };
    }

    return {
      success: data.success ?? true,
      paid: data.paid ?? false,
      campaign: data.campaign,
      message: data.message,
    };
  } catch (error) {
    console.error("Check payment error:", error);
    return {
      success: false,
      paid: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Stop a campaign and request refund
 */
export interface StopCampaignResponse {
  success: boolean;
  error?: string;
  message?: string;
  refundAmount?: number;
  platformFeeKept?: number;
}

export async function stopCampaign(campaignId: string): Promise<StopCampaignResponse> {
  try {
    const storedCookie = await getSession();

    if (!storedCookie) {
      return { success: false, error: "Not authenticated" };
    }

    const cookieValue = parseCookieForRequest(storedCookie);

    const body = new URLSearchParams();
    body.append("campaignId", campaignId);

    const response = await fetch(`${API_BASE_URL}/api/campaign/stop`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${cookieValue}`,
      },
      body: body.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to stop campaign",
      };
    }

    return {
      success: true,
      message: data.message,
      refundAmount: data.refundAmount,
      platformFeeKept: data.platformFeeKept,
    };
  } catch (error) {
    console.error("Stop campaign error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Fetch a Nostr event by ID
 */
export interface NostrEvent {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  kind: number;
  tags: string[][];
  sig: string;
}

export interface FetchNostrEventResponse {
  success: boolean;
  event?: NostrEvent;
  error?: string;
}

export async function fetchNostrEvent(eventId: string): Promise<FetchNostrEventResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/nostr/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventId }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch event",
      };
    }

    return {
      success: true,
      event: data.event,
    };
  } catch (error) {
    console.error("Fetch Nostr event error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Merchant settings for eligibility defaults
 */
export interface MerchantSettings {
  defaultMinFollowers: number;
  defaultMinFollowing: number;
  defaultMaxFollowing: number;
  defaultMinPosts: number;
  defaultMinZapsReceived: number;
  defaultMinZapsSent: number;
  defaultMinAccountAge: number;
  notifyOnTaskComplete?: boolean;
  notifyOnBudgetLow?: boolean;
  notifyOnBlacklist?: boolean;
  enableBlacklist?: boolean;
  maxDailyBudget?: number;
}

export interface FetchMerchantSettingsResponse {
  success: boolean;
  settings?: MerchantSettings;
  error?: string;
}

/**
 * Fetch merchant settings for eligibility defaults
 */
export async function fetchMerchantSettings(userId: string): Promise<FetchMerchantSettingsResponse> {
  try {
    const storedCookie = await getSession();

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (storedCookie) {
      const cookieValue = parseCookieForRequest(storedCookie);
      headers["Authorization"] = `Bearer ${cookieValue}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/merchant-settings?userId=${encodeURIComponent(userId)}`, { headers });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to fetch settings",
      };
    }

    return {
      success: true,
      settings: data.settings,
    };
  } catch (error) {
    console.error("Fetch merchant settings error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

export interface SaveMerchantSettingsResponse {
  success: boolean;
  error?: string;
}

/**
 * Save merchant settings for eligibility defaults
 */
export async function saveMerchantSettings(userId: string, settings: Partial<MerchantSettings>): Promise<SaveMerchantSettingsResponse> {
  try {
    const storedCookie = await getSession();

    if (!storedCookie) {
      return { success: false, error: "Not authenticated" };
    }

    const cookieValue = parseCookieForRequest(storedCookie);

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("settings", JSON.stringify(settings));

    const response = await fetch(`${API_BASE_URL}/api/merchant-settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cookieValue}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || "Failed to save settings",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Save merchant settings error:", error);
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

/**
 * Fetch user's feed from the backend
 * @param npub - User's npub or hex pubkey
 */
export async function fetchUserFeed(npub: string, until?: number, limit?: number): Promise<{ success: boolean; events: any[]; error?: string }> {
  try {
    console.log("📡 Fetching feed for:", npub, until ? `until: ${until}` : "");
    let url = `${API_BASE_URL}/api/feed/${npub}?`;
    if (until) url += `until=${until}&`;
    if (limit) url += `limit=${limit}&`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const events = await response.json();
    return {
      success: true,
      events: Array.isArray(events) ? events : [],
    };
  } catch (error) {
    console.error("Fetch feed error:", error);
    return {
      success: false,
      events: [],
      error: (error as Error).message,
    };
  }
}
/**
 * Fetch public feed from the backend
 * @param npub - Targeted user npub or hex
 * @param until - Optional unix timestamp for pagination
 * @param limit - Optional limit of items
 * @param userPubkey - Optional user pubkey for enrichment
 */
/**
 * Convert npub or nprofile to hex pubkey
 */
function toHexPubkey(bech32: string): string {
  try {
    if (!bech32.startsWith("npub") && !bech32.startsWith("nprofile")) return bech32;
    const decoded = nip19.decode(bech32);
    if (decoded.type === "npub") return decoded.data as string;
    if (decoded.type === "nprofile") return (decoded.data as { pubkey: string }).pubkey;
    return bech32;
  } catch {
    return bech32;
  }
}

/**
 * Fetch public feed for a specific user
 * @param npub - npub or nprofile or hex pubkey
 * @param until - Optional timestamp for pagination
 * @param limit - Optional limit of items
 * @param userPubkey - Optional user pubkey for enrichment
 */
export async function fetchPublicFeed(npub: string, until?: number, limit?: number, userPubkey?: string, notes?: string): Promise<{ success: boolean; events: any[]; profile?: any; error?: string }> {
  try {
    const hexPubkey = toHexPubkey(npub);
    console.log("📡 Fetching public feed for:", npub, "->", hexPubkey, until ? `until: ${until}` : "", notes ? `notes: ${notes}` : "");
    let url = `${API_BASE_URL}/api/feed/public/${hexPubkey}?`;
    if (until) url += `until=${until}&`;
    if (limit) url += `limit=${limit}&`;
    if (userPubkey) url += `user_pubkey=${userPubkey}&`;
    if (notes) url += `notes=${notes}&`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      events: data.events || [],
      profile: data.profile || null,
    };
  } catch (error) {
    console.error("Fetch public feed error:", error);
    return {
      success: false,
      events: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Fetch multiple user profiles by pubkeys
 */
export async function fetchUserInfos(pubkeys: string[]): Promise<{ success: boolean; users: any[]; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/user-infos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pubkeys }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const users: any[] = [];

    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (Array.isArray(item) && item[0] === "EVENT" && item[2]?.kind === 0) {
          try {
            const content = JSON.parse(item[2].content);
            users.push({
              pubkey: item[2].pubkey,
              ...content,
            });
          } catch (e) {
            console.error("Failed to parse user info content", e);
          }
        }
      });
    }

    return {
      success: true,
      users,
    };
  } catch (error) {
    console.error("Fetch user infos error:", error);
    return {
      success: false,
      users: [],
      error: (error as Error).message,
    };
  }
}

/**
 * Follow list data structure
 */
export interface FollowListData {
  follows: string[];
  content: string;
  lastUpdated: number | null;
}

/**
 * Response from follow list API
 */
export interface FollowListResponse {
  success: boolean;
  followList: FollowListData;
  dbFollowingCount: number;
  userExists: boolean;
  error?: string;
}

/**
 * Fetch user's follow list from the backend
 * @param pubkey - User's hex pubkey
 */
export async function fetchFollowList(pubkey: string): Promise<FollowListResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/follow-list?pubkey=${encodeURIComponent(pubkey)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Fetch follow list error:", error);
    return {
      success: false,
      followList: {
        follows: [],
        content: "",
        lastUpdated: null,
      },
      dbFollowingCount: 0,
      userExists: false,
      error: (error as Error).message,
    };
  }
}
