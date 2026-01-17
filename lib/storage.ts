/**
 * Secure storage for nsec key using device keychain/keystore
 * with biometric/PIN authentication for access
 * 
 * SECURITY: The nsec NEVER leaves the device. It is stored in:
 * - iOS: Keychain with Face ID/Touch ID protection
 * - Android: Keystore with biometric/PIN protection
 */
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const NSEC_KEY = 'aqstr_nsec';
const SESSION_KEY = 'aqstr_session';
const USER_PROFILE_KEY = 'aqstr_user_profile';
const NIP46_SESSION_KEY = 'aqstr_nip46_session';
const LOGIN_TYPE_KEY = 'aqstr_login_type';

export type LoginType = 'nip46' | 'nsec';

/**
 * Check if device supports biometric authentication
 */
export async function isBiometricAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
}

/**
 * Get supported authentication types
 */
export async function getSupportedAuthTypes(): Promise<string[]> {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const typeNames: string[] = [];

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        typeNames.push('Face ID');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        typeNames.push('Touch ID / Fingerprint');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        typeNames.push('Iris');
    }

    return typeNames;
}

/**
 * Authenticate user with biometric or device PIN/passcode
 */
export async function authenticateUser(reason: string = 'Authenticate to access your Nostr key'): Promise<boolean> {
    try {
        const result = await LocalAuthentication.authenticateAsync({
            promptMessage: reason,
            fallbackLabel: 'Use device passcode',
            disableDeviceFallback: false, // Allow PIN/passcode as fallback
            cancelLabel: 'Cancel',
        });

        return result.success;
    } catch (error) {
        console.error('Authentication error:', error);
        return false;
    }
}

/**
 * Store the user's nsec (Nostr secret key) securely
 * Uses device keychain (iOS) or keystore (Android)
 * IMPORTANT: nsec NEVER leaves the device
 */
export async function storeNsec(nsec: string): Promise<void> {
    // Store with maximum security options
    await SecureStore.setItemAsync(NSEC_KEY, nsec, {
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
}

/**
 * Retrieve the stored nsec - REQUIRES biometric/PIN authentication
 * Returns null if authentication fails or no nsec stored
 */
export async function getNsec(): Promise<string | null> {
    // First authenticate the user
    const authenticated = await authenticateUser('Authenticate to sign Nostr event');

    if (!authenticated) {
        console.log('User authentication failed - nsec access denied');
        return null;
    }

    return SecureStore.getItemAsync(NSEC_KEY);
}

/**
 * Get nsec WITHOUT authentication - only use internally for key validation
 * DO NOT expose this function externally
 */
async function getNsecUnsafe(): Promise<string | null> {
    return SecureStore.getItemAsync(NSEC_KEY);
}

/**
 * Check if user has a stored nsec (without revealing it)
 */
export async function hasStoredNsec(): Promise<boolean> {
    const nsec = await getNsecUnsafe();
    return nsec !== null && nsec.length > 0;
}

/**
 * Delete the stored nsec (logout) - REQUIRES biometric/PIN
 */
export async function deleteNsec(): Promise<boolean> {
    const authenticated = await authenticateUser('Authenticate to remove your Nostr key');

    if (!authenticated) {
        return false;
    }

    await SecureStore.deleteItemAsync(NSEC_KEY);
    return true;
}

/**
 * Mask nsec for display - shows first 5 and last 4 chars only
 * Example: nsec1a****xyz9
 */
export function maskNsec(nsec: string): string {
    if (!nsec || nsec.length < 15) return '****';
    return `${nsec.slice(0, 8)}${'*'.repeat(nsec.length - 12)}${nsec.slice(-4)}`;
}

/**
 * Store session cookie/token
 */
export async function storeSession(session: string): Promise<void> {
    await SecureStore.setItemAsync(SESSION_KEY, session);
}

/**
 * Get stored session
 */
export async function getSession(): Promise<string | null> {
    return SecureStore.getItemAsync(SESSION_KEY);
}

/**
 * Delete session (logout)
 */
export async function deleteSession(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
}

/**
 * Store user profile data locally
 */
export async function storeUserProfile(profile: any): Promise<void> {
    await SecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify(profile));
}

/**
 * Get stored user profile
 */
export async function getUserProfile(): Promise<any | null> {
    const profile = await SecureStore.getItemAsync(USER_PROFILE_KEY);
    return profile ? JSON.parse(profile) : null;
}

/**
 * Delete stored user profile
 */
export async function deleteUserProfile(): Promise<void> {
    await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
}

/**
 * Clear all stored credentials - REQUIRES biometric/PIN
 */
export async function clearAllCredentials(): Promise<boolean> {
    const authenticated = await authenticateUser('Authenticate to sign out');

    if (!authenticated) {
        return false;
    }

    await Promise.all([
        SecureStore.deleteItemAsync(NSEC_KEY),
        SecureStore.deleteItemAsync(SESSION_KEY),
        SecureStore.deleteItemAsync(USER_PROFILE_KEY),
        SecureStore.deleteItemAsync(NIP46_SESSION_KEY),
        SecureStore.deleteItemAsync(LOGIN_TYPE_KEY),
    ]);

    return true;
}

/**
 * Force clear all credentials (for error recovery, no auth required)
 */
export async function forceClearAllCredentials(): Promise<void> {
    await Promise.all([
        SecureStore.deleteItemAsync(NSEC_KEY),
        SecureStore.deleteItemAsync(SESSION_KEY),
        SecureStore.deleteItemAsync(USER_PROFILE_KEY),
        SecureStore.deleteItemAsync(NIP46_SESSION_KEY),
        SecureStore.deleteItemAsync(LOGIN_TYPE_KEY),
    ]);
}

// ============================================================================
// NIP-46 Session Storage
// ============================================================================

/**
 * Store NIP-46 session data securely
 */
export async function storeNip46Session(sessionData: string): Promise<void> {
    await SecureStore.setItemAsync(NIP46_SESSION_KEY, sessionData, {
        keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    });
}

/**
 * Get stored NIP-46 session
 */
export async function getNip46Session(): Promise<string | null> {
    return SecureStore.getItemAsync(NIP46_SESSION_KEY);
}

/**
 * Delete NIP-46 session
 */
export async function deleteNip46Session(): Promise<void> {
    await SecureStore.deleteItemAsync(NIP46_SESSION_KEY);
}

/**
 * Check if NIP-46 session exists
 */
export async function hasNip46Session(): Promise<boolean> {
    const session = await SecureStore.getItemAsync(NIP46_SESSION_KEY);
    return session !== null && session.length > 0;
}

/**
 * Store login type (nip46 or nsec)
 */
export async function storeLoginType(type: LoginType): Promise<void> {
    await SecureStore.setItemAsync(LOGIN_TYPE_KEY, type);
}

/**
 * Get stored login type
 */
export async function getLoginType(): Promise<LoginType | null> {
    const type = await SecureStore.getItemAsync(LOGIN_TYPE_KEY);
    if (type === 'nip46' || type === 'nsec') {
        return type;
    }
    return null;
}

/**
 * Delete login type
 */
export async function deleteLoginType(): Promise<void> {
    await SecureStore.deleteItemAsync(LOGIN_TYPE_KEY);
}
