/**
 * Authentication context for managing user state across the app
 * Uses secure storage with biometric/PIN authentication
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
    storeNsec,
    hasStoredNsec,
    forceClearAllCredentials,
    storeUserProfile,
    getUserProfile,
    maskNsec,
    authenticateUser,
    getNsec,
} from '../lib/storage';
import {
    isValidNsec,
    getPublicKeyFromNsec,
    hexToNpub,
} from '../lib/nostr';
import { fetchProfileFromProfileStr, getDisplayName, type ProfileStrResponse } from '../lib/profilestr';

interface User {
    id?: string; // Database user ID (cuid) - used for API calls
    pubkey: string;
    npub: string;
    displayName?: string;
    picture?: string;
    followers_count?: number;
    following_count?: number;
    nip05?: string;
    lud16?: string;
    about?: string;
    trustScore?: number;
    trustLevel?: string;
}

interface AuthContextType {
    isLoading: boolean;
    isAuthenticated: boolean;
    user: User | null;
    error: string | null;
    maskedNsec: string | null;
    login: (nsec: string) => Promise<boolean>;
    logout: () => Promise<void>;
    clearError: () => void;
    refreshProfile: () => Promise<void>;
    getNsec: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [maskedNsec, setMaskedNsec] = useState<string | null>(null);

    // Check for existing credentials on app start
    useEffect(() => {
        checkExistingAuth();
    }, []);

    const checkExistingAuth = async () => {
        try {
            const hasNsec = await hasStoredNsec();

            if (hasNsec) {
                // Load cached profile without requiring auth
                const cachedProfile = await getUserProfile();

                if (cachedProfile) {
                    setUser({
                        pubkey: cachedProfile.pubkey,
                        npub: cachedProfile.npub,
                        displayName: getDisplayName(cachedProfile),
                        picture: cachedProfile.picture,
                        followers_count: cachedProfile.followers_count,
                        following_count: cachedProfile.following_count,
                        nip05: cachedProfile.nip05,
                        lud16: cachedProfile.lud16,
                        about: cachedProfile.about,
                        trustScore: cachedProfile.trustScores?.combined?.score,
                        trustLevel: cachedProfile.trustScores?.combined?.level,
                    });
                    setMaskedNsec(maskNsec(cachedProfile.npub)); // Show masked npub for now
                    setIsAuthenticated(true);
                } else {
                    // Has nsec but no cached profile - need to re-validate on next login
                    setIsAuthenticated(false);
                }
            }
        } catch (err) {
            console.error('Auth check error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const login = async (nsec: string): Promise<boolean> => {
        setIsLoading(true);
        setError(null);

        try {
            // Validate nsec format
            if (!isValidNsec(nsec)) {
                setError('Invalid nsec format. Must start with nsec1');
                setIsLoading(false);
                return false;
            }

            // Get public key from nsec (this validates the key is valid)
            let pubkey: string;
            try {
                pubkey = getPublicKeyFromNsec(nsec);
            } catch (e) {
                setError('Invalid nsec key');
                setIsLoading(false);
                return false;
            }

            const npub = hexToNpub(pubkey);

            // Store nsec securely FIRST (before any network calls)
            // The nsec NEVER leaves the device from this point
            await storeNsec(nsec);
            console.log('✅ nsec stored securely in device keychain');

            // Set masked nsec for display
            setMaskedNsec(maskNsec(nsec));

            // Authenticate with backend to get session cookie
            console.log('🔐 Authenticating with backend...');
            const { signAuthEvent } = await import('../lib/nostr');
            const { authenticateWithNostr } = await import('../lib/api');
            const { storeSession, deleteSession } = await import('../lib/storage');

            const { signedEvent, contentSign } = signAuthEvent(nsec);
            const authResult = await authenticateWithNostr(signedEvent, contentSign);

            // Store database user ID from auth response
            let databaseUserId: string | undefined;

            if (authResult.success && authResult.sessionCookie) {
                // Clear any existing session first to prevent duplicates
                await deleteSession();
                await storeSession(authResult.sessionCookie);
                console.log('✅ Backend session established and stored');
                console.log('🍪 Cookie stored:', authResult.sessionCookie.substring(0, 50) + '...');

                // Store the database user ID for API calls
                databaseUserId = authResult.user?.id;
                console.log('🆔 Database user ID:', databaseUserId);
            } else {
                console.warn('⚠️ Backend auth failed:', authResult.error);
                // Continue anyway - local auth is valid, backend features may be limited
            }

            // Fetch profile from ProfileStr API
            console.log('🔄 Attempting to fetch profile for npub:', npub);
            const profileResult = await fetchProfileFromProfileStr(npub);
            console.log('📡 ProfileStr result:', JSON.stringify(profileResult, null, 2));

            let profile: ProfileStrResponse;

            if (profileResult.success && profileResult.profile) {
                profile = profileResult.profile;
                console.log('✅ Profile fetched from ProfileStr:', getDisplayName(profile));
                console.log('📊 Profile data:', {
                    displayName: profile.displayName,
                    picture: profile.picture?.substring(0, 50),
                    followers: profile.followers_count,
                    following: profile.following_count,
                    nip05: profile.nip05,
                });
            } else {
                // Create minimal profile if API fails
                console.log('⚠️ ProfileStr API failed:', profileResult.error);
                console.log('⚠️ Using minimal profile for:', npub);
                profile = {
                    pubkey,
                    npub,
                    displayName: `${npub.slice(0, 8)}...${npub.slice(-4)}`,
                };
            }

            // Cache profile locally
            await storeUserProfile(profile);
            console.log('💾 Profile cached locally');

            // Set user state (include database ID for API calls)
            setUser({
                id: databaseUserId,
                pubkey,
                npub,
                displayName: getDisplayName(profile),
                picture: profile.picture,
                followers_count: profile.followers_count,
                following_count: profile.following_count,
                nip05: profile.nip05,
                lud16: profile.lud16,
                about: profile.about,
                trustScore: profile.trustScores?.combined?.score,
                trustLevel: profile.trustScores?.combined?.level,
            });

            setIsAuthenticated(true);
            setIsLoading(false);
            return true;
        } catch (err) {
            console.error('Login error:', err);
            setError((err as Error).message);
            setIsLoading(false);
            return false;
        }
    };

    const refreshProfile = async () => {
        if (!user?.npub) return;

        try {
            const profileResult = await fetchProfileFromProfileStr(user.npub);

            if (profileResult.success && profileResult.profile) {
                const profile = profileResult.profile;
                await storeUserProfile(profile);

                setUser(prev => prev ? {
                    ...prev,
                    displayName: getDisplayName(profile),
                    picture: profile.picture,
                    followers_count: profile.followers_count,
                    following_count: profile.following_count,
                    nip05: profile.nip05,
                    lud16: profile.lud16,
                    about: profile.about,
                    trustScore: profile.trustScores?.combined?.score,
                    trustLevel: profile.trustScores?.combined?.level,
                } : null);
            }
        } catch (err) {
            console.error('Profile refresh error:', err);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            // Require biometric/PIN to logout (protects against unauthorized logout)
            const authenticated = await authenticateUser('Authenticate to sign out');

            if (authenticated) {
                await forceClearAllCredentials();
                setUser(null);
                setMaskedNsec(null);
                setIsAuthenticated(false);
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const clearError = () => {
        setError(null);
    };

    return (
        <AuthContext.Provider
            value={{
                isLoading,
                isAuthenticated,
                user,
                error,
                maskedNsec,
                login,
                logout,
                clearError,
                refreshProfile,
                getNsec,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
