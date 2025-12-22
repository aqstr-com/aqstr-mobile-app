/**
 * Nostr utilities for signing events using private key directly
 * For React Native - no browser extension available
 */
import { nip19, finalizeEvent, getPublicKey, verifyEvent } from 'nostr-tools';
import type { UnsignedEvent, VerifiedEvent } from 'nostr-tools';

// Default relays to publish to
export const DEFAULT_RELAYS = [
    'wss://relay.primal.net',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band',
];

/**
 * Convert nsec (bech32) to hex private key
 */
export function nsecToHex(nsec: string): Uint8Array {
    try {
        const decoded = nip19.decode(nsec);
        if (decoded.type !== 'nsec') {
            throw new Error('Invalid nsec format');
        }
        return decoded.data;
    } catch (error) {
        throw new Error('Failed to decode nsec: ' + (error as Error).message);
    }
}

/**
 * Validate nsec format
 */
export function isValidNsec(nsec: string): boolean {
    try {
        if (!nsec.startsWith('nsec1')) {
            return false;
        }
        const decoded = nip19.decode(nsec);
        return decoded.type === 'nsec';
    } catch {
        return false;
    }
}

/**
 * Get public key (hex) from nsec
 */
export function getPublicKeyFromNsec(nsec: string): string {
    const privateKey = nsecToHex(nsec);
    return getPublicKey(privateKey);
}

/**
 * Convert hex pubkey to npub (bech32)
 */
export function hexToNpub(hex: string): string {
    return nip19.npubEncode(hex);
}

/**
 * Convert npub to hex
 */
export function npubToHex(npub: string): string {
    if (!npub.startsWith('npub')) {
        return npub; // Already hex
    }
    const decoded = nip19.decode(npub);
    if (decoded.type !== 'npub') {
        throw new Error('Invalid npub format');
    }
    return decoded.data;
}

/**
 * Check if a string is a valid 64-char hex event ID
 */
export function isValidHexEventId(eventId: string): boolean {
    const hexPattern = /^[a-fA-F0-9]{64}$/;
    return hexPattern.test(eventId);
}

/**
 * Convert various event ID formats (URL, nostr:, bech32, hex) to hex
 * Supports: primal.net/e/note1..., njump.me/nevent1..., note1..., nevent1..., hex
 */
export function eventIdToHex(eventId: string): string | null {
    try {
        if (!eventId || typeof eventId !== 'string') {
            return null;
        }

        // Trim whitespace
        let cleaned = eventId.trim();

        // Remove nostr: prefix if present
        if (cleaned.startsWith('nostr:')) {
            cleaned = cleaned.substring(6);
        }

        // If it's already a valid hex string, return it
        if (isValidHexEventId(cleaned)) {
            return cleaned.toLowerCase();
        }

        // Extract bech32 from URLs (e.g., https://primal.net/e/nevent1... or any-domain.com/e/note1...)
        const urlMatch = cleaned.match(/(?:[/]e[/]|[/]|^)(nevent1[a-z0-9]+|note1[a-z0-9]+)(?:[/?#]|$)/i);
        if (urlMatch) {
            cleaned = urlMatch[1];
        }

        // If it starts with note1, decode it
        if (cleaned.startsWith('note1')) {
            const decoded = nip19.decode(cleaned);
            if (decoded.type === 'note' && typeof decoded.data === 'string') {
                return decoded.data;
            }
            return null;
        }

        // If it starts with nevent1, decode it and extract the event ID
        if (cleaned.startsWith('nevent1')) {
            const decoded = nip19.decode(cleaned);
            if (decoded.type === 'nevent' && decoded.data && 'id' in decoded.data) {
                return decoded.data.id;
            }
            return null;
        }

        // Not a valid format
        return null;
    } catch (error) {
        console.error('Error converting event ID to hex:', error);
        return null;
    }
}

/**
 * Convert any pubkey format (npub, nprofile, hex) to hex
 */
export function pubkeyToHex(pubkey: string): string | null {
    try {
        if (!pubkey || typeof pubkey !== 'string') return null;
        let cleaned = pubkey.trim();
        if (cleaned.startsWith('nostr:')) cleaned = cleaned.substring(6);

        // If it's already a valid hex string, return it
        const hexPattern = /^[a-fA-F0-9]{64}$/;
        if (hexPattern.test(cleaned)) return cleaned.toLowerCase();

        if (cleaned.startsWith('npub1')) {
            const decoded = nip19.decode(cleaned);
            if (decoded.type === 'npub') return decoded.data;
        }

        if (cleaned.startsWith('nprofile1')) {
            const decoded = nip19.decode(cleaned);
            if (decoded.type === 'nprofile') return decoded.data.pubkey;
        }

        return null;
    } catch (error) {
        console.error('Error converting pubkey to hex:', error);
        return null;
    }
}

/**
 * Sign an event with the private key
 */
function signEvent(event: UnsignedEvent, nsec: string): VerifiedEvent {
    const privateKey = nsecToHex(nsec);
    return finalizeEvent(event, privateKey);
}

/**
 * Generate random string for auth content
 */
function generateRandomChallenge(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Sign authentication event (kind 27235)
 * Used for logging in via Nostr signature
 */
export function signAuthEvent(nsec: string): { signedEvent: VerifiedEvent; contentSign: string } {
    const contentSign = `Login request ${generateRandomChallenge()}`;
    const event: UnsignedEvent = {
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: contentSign,
        pubkey: getPublicKeyFromNsec(nsec),
    };
    const signedEvent = signEvent(event, nsec);
    return { signedEvent, contentSign };
}

/**
 * Sign text note event (kind 1)
 * Used for creating new posts
 */
export function signTextNote(nsec: string, content: string, tags: string[][] = []): VerifiedEvent {
    const event: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content,
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Sign like/reaction event (kind 7)
 */
export function signLikeEvent(nsec: string, eventId: string, eventAuthor: string): VerifiedEvent {
    const event: UnsignedEvent = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', eventId],
            ['p', eventAuthor],
        ],
        content: '+',
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Sign repost event (kind 6 - NIP-18)
 */
export function signRepostEvent(
    nsec: string,
    eventId: string,
    eventAuthor: string,
    originalEvent?: any,
    relay: string = DEFAULT_RELAYS[0]
): VerifiedEvent {
    const event: UnsignedEvent = {
        kind: 6,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', eventId, relay],
            ['p', eventAuthor],
        ],
        content: originalEvent ? JSON.stringify(originalEvent) : '',
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Sign reply event (kind 1)
 */
export function signReplyEvent(
    nsec: string,
    eventId: string,
    eventAuthor: string,
    replyContent: string
): VerifiedEvent {
    const event: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', eventId, '', 'reply'],
            ['p', eventAuthor],
        ],
        content: replyContent,
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Sign quote repost event (kind 1 with q tag)
 */
export function signQuoteEvent(
    nsec: string,
    eventId: string,
    eventAuthor: string,
    quoteContent: string
): VerifiedEvent {
    const noteId = nip19.noteEncode(eventId);
    const event: UnsignedEvent = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', eventId, '', 'mention'],
            ['p', eventAuthor],
            ['q', eventId],
        ],
        content: `${quoteContent} nostr:${noteId}`,
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Sign follow list event (kind 3 - NIP-02)
 */
export function signFollowEvent(
    nsec: string,
    followList: string[],
    relay: string = DEFAULT_RELAYS[0]
): VerifiedEvent {
    // Convert any npubs to hex
    const hexFollowList = followList.map(pubkey =>
        pubkey.startsWith('npub') ? npubToHex(pubkey) : pubkey
    );

    // Create p tags for each user
    const pTags = hexFollowList.map(pubkey => ['p', pubkey, relay, '']);

    const event: UnsignedEvent = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags: pTags,
        content: '',
        pubkey: getPublicKeyFromNsec(nsec),
    };
    return signEvent(event, nsec);
}

/**
 * Verify an event signature
 */
export function verifyEventSignature(event: any): boolean {
    return verifyEvent(event);
}
