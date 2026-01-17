/**
 * NIP-46 (Nostr Connect) client utilities for React Native
 * Enables authentication via remote signers like Amber, Primal, nsec.app, etc.
 * 
 * Key implementation notes:
 * 1. Uses wss://relay.primal.net for best Primal iOS compatibility
 * 2. Stores signer.bp.pubkey (NIP-46 service pubkey) in bunkerUri, not userPubkey
 * 3. Does NOT call connect() on reconnection (Primal web approach)
 * 4. Adapted for React Native (uses SecureStore instead of localStorage)
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { createNostrConnectURI, BunkerSigner, parseBunkerInput, type NostrConnectParams } from 'nostr-tools/nip46';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import type { UnsignedEvent, VerifiedEvent } from 'nostr-tools';

// App configuration for NIP-46
export const APP_NAME = 'AQSTR';
export const APP_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://aqstr.com';
export const APP_LOGO_URL = `${APP_URL}/aqstr-logo.png`;

// NIP-46 specific relays for remote signer communication
export const nip46RelaysArray = [
    'wss://relay.primal.net',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
];

export interface NostrConnectSession {
    clientPrivKey: Uint8Array;
    clientPubKey: string;
    connectionString: string;
    secret: string;
    image?: string;
    bunkerUri?: string;
}

export interface NostrUnsignedEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
}

export interface NostrSignedEvent extends NostrUnsignedEvent {
    id: string;
    pubkey: string;
    sig: string;
}

/**
 * Generate a new Nostr Connect session with connection URI
 * @param appName Your application name (shown in signer)
 * @param appUrl Your application URL
 * @param appImage Your application logo URL
 * @param relays Relay URLs for NIP-46 communication
 */
export function generateNostrConnectSession(
    appName: string = APP_NAME,
    appUrl: string = APP_URL,
    appImage: string = APP_LOGO_URL,
    relays: string[] = nip46RelaysArray
): NostrConnectSession {
    const clientPrivKey = generateSecretKey();
    const clientPubKey = getPublicKey(clientPrivKey);

    // Generate a random secret (format: sec-<random-hex>)
    const randomBytes = new Uint8Array(16);
    // Use crypto.getRandomValues if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(randomBytes);
    } else {
        // Fallback for environments without crypto.getRandomValues
        for (let i = 0; i < randomBytes.length; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
    }
    const randomPart = Array.from(randomBytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    const secret = `sec-${randomPart}`;

    // Create the nostrconnect:// URI
    const params: NostrConnectParams = {
        clientPubkey: clientPubKey,
        relays: relays,
        secret: secret,
        name: appName,
        url: appUrl,
        image: appImage,
    };

    const connectionString = createNostrConnectURI(params);

    return {
        clientPrivKey,
        clientPubKey,
        connectionString,
        secret,
        image: appImage,
    };
}

/**
 * Manager class for NIP-46 remote signer connection
 */
export class NostrConnectManager {
    private session: NostrConnectSession;
    private signer: BunkerSigner | null = null;
    private userPubkey: string | null = null;
    private bunkerString: string | null = null;
    private isAborted: boolean = false;
    private appStateSubscription: any = null;
    private onAuthHandler: ((url: string) => void) | null = null;

    constructor(session: NostrConnectSession) {
        this.session = session;
    }

    getConnectionString(): string {
        return this.session.connectionString;
    }

    public setOnAuth(handler: (url: string) => void): void {
        this.onAuthHandler = handler;
    }

    /**
     * Attempt a single connection to the remote signer
     */
    private async attemptConnection(onAuth?: (url: string) => void): Promise<string> {
        this.signer = await BunkerSigner.fromURI(
            this.session.clientPrivKey,
            this.session.connectionString,
            {
                onauth: (url) => {
                    if (onAuth) {
                        onAuth(url);
                    } else if (this.onAuthHandler) {
                        this.onAuthHandler(url);
                    } else {
                        // React Native: Use Linking to open URL
                        import('react-native').then(({ Linking }) => {
                            Linking.openURL(url);
                        });
                    }
                },
            }
        );

        this.userPubkey = await this.signer.getPublicKey();

        // IMPORTANT: Use signer.bp.pubkey (NIP-46 service pubkey), NOT userPubkey
        const signerPubkey = this.signer.bp.pubkey;
        const relays = nip46RelaysArray.map(r => `relay=${encodeURIComponent(r)}`).join('&');
        this.bunkerString = `bunker://${signerPubkey}?${relays}&secret=${this.session.secret}`;

        console.log('[NIP-46] Connection established');
        return this.userPubkey;
    }

    /**
     * Wait for a connection with retry support
     */
    async waitForConnection(onAuth?: (url: string) => void): Promise<string> {
        const maxRetries = 5;
        const retryDelayMs = 1500;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < maxRetries && !this.isAborted; attempt++) {
            try {
                if (attempt > 0) {
                    this.signer = null;
                    await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                }
                if (this.isAborted) throw new Error('Connection aborted');
                return await this.attemptConnection(onAuth);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                const isRecoverable =
                    lastError.message.toLowerCase().includes('subscription closed') ||
                    lastError.message.toLowerCase().includes('connection') ||
                    lastError.message.toLowerCase().includes('websocket') ||
                    lastError.message.toLowerCase().includes('timeout');
                if (!isRecoverable || this.isAborted) throw lastError;
            }
        }
        throw lastError || new Error('Connection failed after maximum retries');
    }

    /**
     * Wait for connection with app state-aware retry (for mobile app switching)
     * When user switches to signer app and back, this will retry the connection
     */
    async waitForConnectionWithAppStateRetry(
        onAuth?: (url: string) => void,
        onRetrying?: () => void
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            let isResolved = false;

            const attemptConnect = async () => {
                if (isResolved || this.isAborted) return;
                try {
                    const pubkey = await this.waitForConnection(onAuth);
                    if (!isResolved && !this.isAborted) {
                        isResolved = true;
                        this.cleanupAppStateListener();
                        resolve(pubkey);
                    }
                } catch (err) {
                    if (isResolved || this.isAborted) return;
                    const error = err instanceof Error ? err : new Error(String(err));
                    // Don't reject if app is in background - wait for foreground
                    if (AppState.currentState !== 'active') return;
                    isResolved = true;
                    this.cleanupAppStateListener();
                    reject(error);
                }
            };

            // Listen for app state changes (background -> active)
            const handleAppStateChange = (nextAppState: AppStateStatus) => {
                if (nextAppState === 'active' && !isResolved && !this.isAborted) {
                    onRetrying?.();
                    setTimeout(() => {
                        if (!isResolved && !this.isAborted) attemptConnect();
                    }, 500);
                }
            };

            this.appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
            attemptConnect();
        });
    }

    private cleanupAppStateListener(): void {
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }

    abort(): void {
        this.isAborted = true;
        this.cleanupAppStateListener();
    }

    /**
     * Connect using a bunker:// URL
     */
    async connectWithBunker(bunkerUrl: string, stripSecret: boolean = false): Promise<string> {
        let processedUrl = bunkerUrl;

        if (stripSecret) {
            try {
                const url = new URL(bunkerUrl);
                url.searchParams.delete('secret');
                processedUrl = url.toString();
            } catch {
                // Use as-is if parsing fails
            }
        }

        const bunkerPointer = await parseBunkerInput(processedUrl);
        if (!bunkerPointer) throw new Error('Invalid bunker URL');

        if (!bunkerPointer.relays || bunkerPointer.relays.length === 0) {
            bunkerPointer.relays = nip46RelaysArray;
        }

        this.signer = BunkerSigner.fromBunker(
            this.session.clientPrivKey,
            bunkerPointer,
            {
                onauth: (url: string) => {
                    if (this.onAuthHandler) {
                        this.onAuthHandler(url);
                    } else {
                        import('react-native').then(({ Linking }) => {
                            Linking.openURL(url);
                        });
                    }
                },
            }
        );

        // Note: We do NOT call connect() - fromBunker() sets up subscriptions
        this.userPubkey = bunkerPointer.pubkey;

        const relays = (bunkerPointer.relays || nip46RelaysArray).map(r => `relay=${encodeURIComponent(r)}`).join('&');
        let uri = `bunker://${this.userPubkey}?${relays}`;
        if (bunkerPointer.secret) uri += `&secret=${bunkerPointer.secret}`;
        this.bunkerString = uri;

        console.log('[NIP-46] Signer ready');
        return this.userPubkey;
    }

    /**
     * Reconnect using stored session
     */
    async reconnectFromSession(): Promise<string> {
        const bunkerUri = this.session.bunkerUri;
        if (!bunkerUri) throw new Error('No bunkerUri stored in session');
        return await this.connectWithBunker(bunkerUri, true);
    }

    getBunkerUri(): string | null {
        return this.bunkerString;
    }

    getPublicKey(): string | null {
        return this.userPubkey;
    }

    async signEvent(event: NostrUnsignedEvent): Promise<NostrSignedEvent> {
        if (!this.signer) throw new Error('Not connected to remote signer');

        const signWithTimeout = (timeoutMs: number): Promise<NostrSignedEvent> => {
            return Promise.race([
                this.signer!.signEvent(event as UnsignedEvent) as Promise<NostrSignedEvent>,
                new Promise<NostrSignedEvent>((_, reject) =>
                    setTimeout(() => reject(new Error(`Signing timed out after ${timeoutMs / 1000}s. Please open your signer app. If this persists, try logging out and logging back in.`)), timeoutMs)
                ),
            ]);
        };

        return await signWithTimeout(20000);
    }

    async signAuthChallenge(challenge: string, domain: string): Promise<NostrSignedEvent> {
        return this.signEvent({
            kind: 22242,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['challenge', challenge], ['domain', domain]],
            content: '',
        });
    }

    isConnected(): boolean {
        return this.signer !== null && this.userPubkey !== null;
    }

    disconnect(): void {
        this.abort();
        this.signer = null;
        this.userPubkey = null;
        this.bunkerString = null;
    }
}

/**
 * Parse and validate a bunker:// URL
 */
export async function validateBunkerUrl(url: string): Promise<boolean> {
    if (!url.startsWith('bunker://')) return false;
    try {
        return (await parseBunkerInput(url)) !== null;
    } catch {
        return false;
    }
}

// ============================================================================
// Session Persistence Helpers (for SecureStore)
// ============================================================================

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error('Invalid hex string');
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Serialize a NostrConnectSession for storage
 */
export function serializeSession(session: NostrConnectSession): string {
    return JSON.stringify({
        ...session,
        clientPrivKey: bytesToHex(session.clientPrivKey),
    });
}

/**
 * Deserialize a NostrConnectSession from storage
 */
export function deserializeSession(data: string): NostrConnectSession | null {
    try {
        const parsed = JSON.parse(data);
        if (!parsed.clientPrivKey || !parsed.clientPubKey || !parsed.connectionString || !parsed.secret) {
            return null;
        }
        return {
            ...parsed,
            clientPrivKey: hexToBytes(parsed.clientPrivKey),
        };
    } catch {
        return null;
    }
}

/**
 * Get platform-specific signer info
 */
export function getPlatformSignerInfo(): { name: string; logo: string } {
    if (Platform.OS === 'android') {
        return { name: 'Amber', logo: 'amber-logo' };
    }
    // iOS and other platforms default to Primal
    return { name: 'Primal', logo: 'primal-logo' };
}
