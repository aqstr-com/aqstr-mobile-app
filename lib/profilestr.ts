/**
 * ProfileStr API client for fetching Nostr user profiles
 * Endpoint: https://profilestr.com/api/profile/{npub}
 */

const PROFILESTR_BASE_URL = 'https://profilestr.com/api/profile';

export interface ProfileStrResponse {
    pubkey: string;
    npub: string;
    name?: string;
    display_name?: string;
    displayName?: string;
    picture?: string;
    banner?: string;
    about?: string;
    website?: string;
    nip05?: string;
    lud16?: string;
    // Stats
    followers_count?: number;
    following_count?: number;
    notes_count?: number;
    relays?: string[];
    // Computed
    formattedFollowers?: string;
    formattedFollowing?: string;
    // Trust scores from ProfileStr
    trustScores?: {
        combined?: {
            score: number;
            level: string;
            description: string;
        };
        profilestr?: {
            score: number;
            level: string;
        };
    };
}

/**
 * Format large numbers with K/M suffix
 */
function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

/**
 * Fetch user profile from ProfileStr API
 * Accepts both hex pubkey and npub format
 * API returns: { user: {...}, meta: {...} }
 */
export async function fetchProfileFromProfileStr(
    pubkeyOrNpub: string
): Promise<{ success: boolean; profile?: ProfileStrResponse; error?: string }> {
    try {
        const url = `${PROFILESTR_BASE_URL}/${pubkeyOrNpub}`;
        console.log('🔄 Fetching profile from:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        console.log('📡 Response status:', response.status);

        if (!response.ok) {
            console.error('❌ ProfileStr API HTTP error:', response.status);
            if (response.status === 404) {
                return { success: false, error: 'Profile not found' };
            }
            return { success: false, error: `HTTP ${response.status}` };
        }

        const responseText = await response.text();
        console.log('📦 Response length:', responseText.length);

        let apiResponse;
        try {
            apiResponse = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Failed to parse JSON:', parseError);
            console.log('📦 Raw response (first 500 chars):', responseText.substring(0, 500));
            return { success: false, error: 'Failed to parse API response' };
        }

        console.log('✅ API Response keys:', Object.keys(apiResponse));

        // API returns nested structure: { user: {...}, meta: {...} }
        const data = apiResponse.user || apiResponse;

        if (!data) {
            console.error('❌ No user data in response');
            return { success: false, error: 'No user data in response' };
        }

        console.log('👤 User data keys:', Object.keys(data));

        // Normalize the response - handle both camelCase (API) and snake_case field names
        const followersCount = data.followersCount ?? data.followers_count ?? data.followers ?? 0;
        const followingCount = data.followsCount ?? data.following_count ?? data.following ?? 0;
        const notesCount = data.noteCount ?? data.notes_count ?? data.posts_count ?? 0;

        const profile: ProfileStrResponse = {
            pubkey: data.pubkey || pubkeyOrNpub,
            npub: data.npub || pubkeyOrNpub,
            name: data.name,
            display_name: data.displayName || data.display_name,
            displayName: data.displayName || data.display_name || data.name,
            picture: data.picture || data.image || data.avatar,
            banner: data.banner,
            about: data.about || data.bio,
            website: data.website,
            nip05: data.nip05,
            lud16: data.lud16 || data.lightning_address,
            followers_count: followersCount,
            following_count: followingCount,
            notes_count: notesCount,
            relays: data.relays || [],
            formattedFollowers: formatNumber(followersCount),
            formattedFollowing: formatNumber(followingCount),
            trustScores: data.trustScores,
        };

        console.log('✅ Profile fetched successfully:', profile.displayName || profile.npub);
        console.log('📊 Stats:', { followers: followersCount, following: followingCount, notes: notesCount });

        return { success: true, profile };
    } catch (error) {
        console.error('❌ ProfileStr fetch error:', error);
        console.error('❌ Error type:', typeof error);
        console.error('❌ Error message:', (error as Error).message);
        console.error('❌ Error stack:', (error as Error).stack);
        return {
            success: false,
            error: (error as Error).message
        };
    }
}

/**
 * Get display name with fallback to shortened npub
 */
export function getDisplayName(profile: ProfileStrResponse): string {
    if (profile.displayName) return profile.displayName;
    if (profile.display_name) return profile.display_name;
    if (profile.name) return profile.name;
    if (profile.npub) return `${profile.npub.slice(0, 8)}...${profile.npub.slice(-4)}`;
    return 'Anonymous';
}
