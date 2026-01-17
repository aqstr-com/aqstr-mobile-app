/**
 * Authentication context for managing user state across the app
 * Supports NIP-46 (Nostr Connect) remote signer authentication
 */
import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import {
    hasStoredNsec,
    forceClearAllCredentials,
    storeUserProfile,
    getUserProfile,
    storeSession,
    deleteSession,
    storeNip46Session,
    getNip46Session,
    deleteNip46Session,
    storeLoginType,
    getLoginType,
    hasNip46Session,
    type LoginType,
} from '../lib/storage';
import {
    hexToNpub,
} from '../lib/nostr';
import {
    generateNostrConnectSession,
    NostrConnectManager,
    serializeSession,
    deserializeSession,
    type NostrConnectSession,
} from '../lib/nip46';
import { getAuthChallenge, authenticateWithNip46 } from '../lib/api';
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

type ConnectionState = 'idle' | 'generating' | 'waiting' | 'connected' | 'signing' | 'success' | 'error';

interface AuthContextType {
    isLoading: boolean;
    isAuthenticated: boolean;
    user: User | null;
    error: string | null;
    loginType: LoginType | null;
    // NIP-46 state
    nostrConnectSession: NostrConnectSession | null;
    connectManager: NostrConnectManager | null;
    connectionState: ConnectionState;
    // NIP-46 login functions
    initNostrConnect: () => Promise<void>;
    connectWithBunker: (bunkerUrl: string) => Promise<boolean>;
    cancelConnection: () => void;
    // General functions
    logout: () => Promise<void>;
    clearError: () => void;
    refreshProfile: () => Promise<void>;
    signEvent: (event: any) => Promise<any>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isLoading, setIsLoading] = useState(true);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loginType, setLoginType] = useState<LoginType | null>(null);

    // NIP-46 state
    const [nostrConnectSession, setNostrConnectSession] = useState<NostrConnectSession | null>(null);
    const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
    const connectManagerRef = useRef<NostrConnectManager | null>(null);
    const connectionAbortRef = useRef<boolean>(false);

    // Check for existing credentials on app start
    useEffect(() => {
        checkExistingAuth();
    }, []);

    const checkExistingAuth = async () => {
        try {
            const storedLoginType = await getLoginType();

            if (storedLoginType === 'nip46') {
                // Check for NIP-46 session
                const hasSession = await hasNip46Session();
                if (hasSession) {
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
                        setLoginType('nip46');
                        setIsAuthenticated(true);

                        // Try to restore the NIP-46 session for future signing
                        try {
                            const sessionData = await getNip46Session();
                            if (sessionData) {
                                const session = deserializeSession(sessionData);
                                if (session) {
                                    setNostrConnectSession(session);
                                    // Create manager for future signing
                                    connectManagerRef.current = new NostrConnectManager(session);
                                    // Reconnect to the signer
                                    if (session.bunkerUri) {
                                        await connectManagerRef.current.connectWithBunker(session.bunkerUri, true);
                                    }
                                }
                            }
                        } catch (err) {
                            console.warn('Failed to restore NIP-46 session:', err);
                        }
                    }
                }
            } else if (storedLoginType === 'nsec') {
                // Legacy nsec login - check if they have stored credentials
                const hasNsec = await hasStoredNsec();
                if (hasNsec) {
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
                        setLoginType('nsec');
                        setIsAuthenticated(true);
                    }
                }
            }
        } catch (err) {
            console.error('Auth check error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Initialize NIP-46 Nostr Connect session
     * Generates QR code and starts listening for connection
     */
    const initNostrConnect = async (): Promise<void> => {
        setConnectionState('generating');
        setError(null);
        connectionAbortRef.current = false;

        try {
            // Generate new session
            const session = generateNostrConnectSession();
            setNostrConnectSession(session);

            // Create manager and start listening
            const manager = new NostrConnectManager(session);
            connectManagerRef.current = manager;

            setConnectionState('waiting');

            // Wait for connection with app state-aware retry
            const pubkey = await manager.waitForConnectionWithAppStateRetry(
                undefined,
                () => {
                    // onRetrying - page became visible again
                    setConnectionState('waiting');
                    setError(null);
                }
            );

            if (connectionAbortRef.current) return;

            // Complete the login
            await completeNip46Login(manager, pubkey, session);
        } catch (err) {
            if (connectionAbortRef.current) return;
            console.error('NIP-46 connection error:', err);
            setError(err instanceof Error ? err.message : 'Connection failed');
            setConnectionState('error');
        }
    };

    /**
     * Connect using a bunker:// URL
     */
    const connectWithBunker = async (bunkerUrl: string): Promise<boolean> => {
        setConnectionState('waiting');
        setError(null);
        connectionAbortRef.current = false;

        try {
            const session = nostrConnectSession || generateNostrConnectSession();
            if (!nostrConnectSession) {
                setNostrConnectSession(session);
            }

            const manager = new NostrConnectManager(session);
            connectManagerRef.current = manager;

            const pubkey = await manager.connectWithBunker(bunkerUrl.trim());
            await completeNip46Login(manager, pubkey, session);
            return true;
        } catch (err) {
            console.error('Bunker login error:', err);
            setError(err instanceof Error ? err.message : 'Bunker connection failed');
            setConnectionState('error');
            return false;
        }
    };

    /**
     * Complete the NIP-46 login process
     */
    const completeNip46Login = async (
        manager: NostrConnectManager,
        pubkey: string,
        session: NostrConnectSession
    ): Promise<void> => {
        setConnectionState('signing');

        // Step 1: Get challenge from server
        const challengeResult = await getAuthChallenge();
        if (!challengeResult) {
            throw new Error('Failed to get authentication challenge');
        }

        // Step 2: Sign the challenge using remote signer
        const domain = new URL(process.env.EXPO_PUBLIC_API_BASE_URL || 'https://aqstr.com').hostname;
        const signedEvent = await manager.signAuthChallenge(challengeResult.challenge, domain);

        // Step 3: Authenticate with server
        const authResult = await authenticateWithNip46(signedEvent, challengeResult.challenge);
        if (!authResult.success) {
            throw new Error(authResult.error || 'Login failed');
        }

        // Step 4: Save session for future signing
        const sessionToSave = {
            ...session,
            bunkerUri: manager.getBunkerUri() || undefined,
        };
        await storeNip46Session(serializeSession(sessionToSave));
        await storeLoginType('nip46');
        setNostrConnectSession(sessionToSave);
        console.log('[NIP-46] Session saved for future signing');

        // Store the backend session cookie
        if (authResult.sessionCookie) {
            await deleteSession();
            await storeSession(authResult.sessionCookie);
            console.log('✅ Backend session established and stored');
        }

        // Store database user ID
        const databaseUserId = authResult.user?.id;

        // Fetch profile
        const npub = hexToNpub(pubkey);
        console.log('🔄 Fetching profile for npub:', npub);
        const profileResult = await fetchProfileFromProfileStr(npub);

        let profile: ProfileStrResponse;
        if (profileResult.success && profileResult.profile) {
            profile = profileResult.profile;
            console.log('✅ Profile fetched:', getDisplayName(profile));
        } else {
            // Create minimal profile
            profile = {
                pubkey,
                npub,
                displayName: `${npub.slice(0, 8)}...${npub.slice(-4)}`,
            };
        }

        // Cache profile
        await storeUserProfile(profile);

        // Set user state
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

        setLoginType('nip46');
        setIsAuthenticated(true);
        setConnectionState('success');
        setIsLoading(false);
    };

    /**
     * Cancel the current connection attempt
     */
    const cancelConnection = () => {
        connectionAbortRef.current = true;
        if (connectManagerRef.current) {
            connectManagerRef.current.disconnect();
            connectManagerRef.current = null;
        }
        setNostrConnectSession(null);
        setError(null);
        setConnectionState('idle');
    };

    /**
     * Sign an event using the remote signer (NIP-46)
     * Reconnects on-demand if needed (like webapp's useNip46Signer)
     */
    const signEvent = async (event: any): Promise<any> => {
        // If manager doesn't exist or isn't connected, try to restore from stored session
        if (!connectManagerRef.current || !connectManagerRef.current.isConnected()) {
            console.log('[NIP-46] No active connection, attempting to restore from session...');

            const sessionData = await getNip46Session();
            if (!sessionData) {
                throw new Error('No NIP-46 session found. Please log out and log back in.');
            }

            const session = deserializeSession(sessionData);
            if (!session || !session.bunkerUri) {
                throw new Error('Invalid NIP-46 session. Please log out and log back in.');
            }

            // Create new manager if needed
            if (!connectManagerRef.current) {
                connectManagerRef.current = new NostrConnectManager(session);
            }

            // Reconnect using stored bunkerUri (strip secret as it's already been used)
            console.log('[NIP-46] Reconnecting to signer...');
            await connectManagerRef.current.connectWithBunker(session.bunkerUri, true);
            console.log('[NIP-46] Signer reconnected successfully');
        }

        return connectManagerRef.current.signEvent(event);
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
            // Disconnect NIP-46 manager
            if (connectManagerRef.current) {
                connectManagerRef.current.disconnect();
                connectManagerRef.current = null;
            }

            await forceClearAllCredentials();
            setUser(null);
            setNostrConnectSession(null);
            setLoginType(null);
            setIsAuthenticated(false);
            setConnectionState('idle');
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
                loginType,
                nostrConnectSession,
                connectManager: connectManagerRef.current,
                connectionState,
                initNostrConnect,
                connectWithBunker,
                cancelConnection,
                logout,
                clearError,
                refreshProfile,
                signEvent,
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
