/**
 * Utility functions for the AQSTR mobile app
 */

/**
 * Format a timestamp as a relative time string (e.g., "5m ago")
 * @param timestamp - Seconds or milliseconds timestamp
 */
export function formatTimeAgo(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    // Handle both seconds and milliseconds
    const seconds = timestamp > 1e11 ? Math.floor(timestamp / 1000) : timestamp;
    const diff = now - seconds;

    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;

    // Fallback to date
    const date = new Date(seconds * 1000);
    return date.toLocaleDateString();
}

/**
 * Utility to format numbers (e.g., 1200 -> 1.2k)
 */
export function formatNumber(num: number): string {
    if (!num) return '0';
    if (num < 1000) return num.toString();
    if (num < 1000000) return `${(num / 1000).toFixed(1)}k`;
    return `${(num / 1000000).toFixed(1)}m`;
}

/**
 * Extracts media URLs (images and videos) from a string
 */
export function extractMediaUrls(content: string): string[] {
    if (!content) return [];

    // Regex for common media URLs
    const mediaRegex = /https?:\/\/[^\s$.?#].[^\s]*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|m4v)/gi;
    const matches = content.match(mediaRegex);

    return matches || [];
}

/**
 * Removes media URLs from a string
 */
export function stripMediaUrls(content: string): string {
    if (!content) return '';
    const mediaRegex = /https?:\/\/[^\s$.?#].[^\s]*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|m4v)/gi;
    return content.replace(mediaRegex, '').trim();
}

/**
 * Extracts nostr:npub or nostr:nprofile links from a string
 */
export function extractNostrLinks(content: string): string[] {
    if (!content) return [];
    const nostrRegex = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+|note1[a-z0-9]+|nevent1[a-z0-9]+)/gi;
    const matches = content.match(nostrRegex);
    return matches || [];
}

/**
 * Removes nostr: links from a string (useful for clean text display)
 */
export function stripNostrLinks(content: string): string {
    if (!content) return '';
    const nostrRegex = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+|note1[a-z0-9]+|nevent1[a-z0-9]+)/gi;
    return content.replace(nostrRegex, '').trim();
}

/**
 * Truncates text to a maximum length and adds an ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}
