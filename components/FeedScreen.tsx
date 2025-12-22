import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    Animated,
    FlatList,
    StyleSheet,
    Image,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { fetchUserFeed, fetchPublicFeed, fetchUserInfos } from '../lib/api';
import { formatTimeAgo, formatNumber, extractMediaUrls, stripMediaUrls, extractNostrLinks, truncateText } from '../lib/utils';
import MediaRenderer from './MediaRenderer';
import { HeaderBar } from './HeaderBar';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from './Icon';
import { pubkeyToHex, hexToNpub } from '../lib/nostr';
import { ProfileHeader } from './ProfileHeader';
import { fetchProfileFromProfileStr } from '../lib/profilestr';
import QuotedEvent from './QuotedEvent';

interface FeedScreenProps {
    onLogout: () => void;
    onScroll?: (event: any) => void;
    onViewMerchantSettings?: () => void;
    onBoostEvent?: (eventId: string) => void;
    onViewUserFeed?: (npub: string) => void;
    onBoostFollowing?: (pubkey: string, npub?: string) => void;
    onBack?: () => void;
    onNavigateToTasks?: () => void;
}

function FeedItem({
    item,
    onBoostEvent,
    onViewUserFeed,
    userNames
}: {
    item: any;
    onBoostEvent?: (id: string) => void;
    onViewUserFeed?: (npub: string) => void;
    userNames: Record<string, string>;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const profile = item.user;
    const stats = item.stats;
    const content = stripMediaUrls(item.content);
    const quoteIds: string[] = [];

    const renderContent = () => {
        const parts = content.split(/(nostr:(?:npub1|nprofile1|note1|nevent1)[a-z0-9]+)/gi);
        const shouldTruncate = content.length > 240 && !isExpanded;

        let totalLength = 0;
        const elements = parts.map((part, index) => {
            if (shouldTruncate && totalLength > 240) return null;

            if (part.toLowerCase().startsWith('nostr:')) {
                const identifier = part.substring(6);
                if (identifier.startsWith('npub1') || identifier.startsWith('nprofile1')) {
                    const pubkey = pubkeyToHex(part);
                    const displayName = pubkey ? (userNames[pubkey] || identifier.substring(0, 8) + '...') : identifier.substring(0, 8) + '...';

                    totalLength += displayName.length + 1;
                    return (
                        <Text
                            key={index}
                            style={styles.link}
                            onPress={() => onViewUserFeed?.(identifier)}
                        >
                            @{displayName}
                        </Text>
                    );
                } else if (identifier.startsWith('note1') || identifier.startsWith('nevent1')) {
                    if (!quoteIds.includes(identifier)) {
                        quoteIds.push(identifier);
                    }
                    return null;
                }
            }

            let textToShow = part;
            if (shouldTruncate && totalLength + part.length > 240) {
                textToShow = part.substring(0, 240 - totalLength) + '...';
            }
            totalLength += textToShow.length;

            return <Text key={index}>{textToShow}</Text>;
        });

        return <Text style={styles.content}>{elements}</Text>;
    };

    return (
        <View style={styles.eventCard}>
            <View style={styles.eventHeader}>
                <TouchableOpacity onPress={() => onViewUserFeed?.(hexToNpub(item.pubkey))}>
                    {profile?.picture ? (
                        <Image source={{ uri: profile.picture }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            <Text style={styles.avatarText}>
                                {(profile?.display_name || profile?.name || 'U').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <View style={styles.nameRow}>
                        <TouchableOpacity onPress={() => onViewUserFeed?.(hexToNpub(item.pubkey))}>
                            <Text style={styles.displayName} numberOfLines={1}>
                                {truncateText(profile?.display_name || profile?.name || 'Nostr User', 25)}
                            </Text>
                        </TouchableOpacity>
                        <Text style={styles.dot}>•</Text>
                        <Text style={styles.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
                    </View>
                    {profile?.nip05 && (
                        <View style={styles.nip05Row}>
                            <Text style={styles.nip05}>
                                {truncateText(profile.nip05.startsWith('_@')
                                    ? profile.nip05.substring(2)
                                    : profile.nip05.split('@')[0], 25)}
                            </Text>
                            <Icon name="tick" size={12} color="#71717a" style={{ marginLeft: 4 }} />
                        </View>
                    )}
                </View>
                <TouchableOpacity
                    style={styles.boostButton}
                    onPress={() => onBoostEvent?.(item.id)}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="boost" size={14} color="#fff" style={{ marginRight: 4 }} />
                        <Text style={styles.boostButtonText}>Boost</Text>
                    </View>
                </TouchableOpacity>
            </View>

            {content ? (
                <View>
                    {renderContent()}
                    {content.length > 240 && (
                        <TouchableOpacity
                            onPress={() => setIsExpanded(!isExpanded)}
                            style={styles.showMoreButton}
                        >
                            <Text style={styles.showMoreText}>
                                {isExpanded ? 'Show less' : 'Show all'}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
            ) : null}
            <MediaRenderer urls={extractMediaUrls(item.content)} />

            {quoteIds.map((id, index) => (
                <QuotedEvent key={index} eventId={id} onViewUserFeed={onViewUserFeed} />
            ))}

            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Icon name="reply" size={16} color="#71717a" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatNumber(stats?.replies || 0)}</Text>
                </View>
                <View style={styles.statItem}>
                    <Icon name="repost" size={16} color="#71717a" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatNumber(stats?.reposts || 0)}</Text>
                </View>
                <View style={styles.statItem}>
                    <Icon name="like" size={16} color="#71717a" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatNumber(stats?.likes || 0)}</Text>
                </View>
                <View style={styles.statItem}>
                    <Icon name="zap" size={16} color="#71717a" style={styles.statIcon} />
                    <Text style={styles.statValue}>{formatNumber(stats?.zaps || 0)}</Text>
                </View>
            </View>
        </View>
    );
}

export function FeedScreen({
    onLogout,
    onScroll,
    onViewMerchantSettings,
    onBoostEvent,
    onViewUserFeed,
    onBoostFollowing,
    onNavigateToTasks
}: FeedScreenProps) {
    const { user } = useAuth();
    const [events, setEvents] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [userNames, setUserNames] = useState<Record<string, string>>({});
    const [userProfile, setUserProfile] = useState<any>(null);

    const resolveUserNames = async (evs: any[]) => {
        const pubkeysToFetchSet = new Set<string>();
        evs.forEach(event => {
            const links = extractNostrLinks(event.content);
            links.forEach(link => {
                const pubkey = pubkeyToHex(link);
                if (pubkey && !userNames[pubkey]) {
                    pubkeysToFetchSet.add(pubkey);
                }
            });
        });

        const pubkeysToFetch = Array.from(pubkeysToFetchSet);
        if (pubkeysToFetch.length === 0) return;

        console.log('📡 Resolving user names for:', pubkeysToFetch.length, 'users');
        const result = await fetchUserInfos(pubkeysToFetch);

        if (result.success) {
            const newNames = { ...userNames };
            result.users.forEach(u => {
                if (u.pubkey) {
                    newNames[u.pubkey] = u.display_name || u.name || u.pubkey.substring(0, 8);
                }
            });
            setUserNames(newNames);
        }
    };

    const loadFeed = useCallback(async (until?: number) => {
        if (!user?.pubkey) return;
        if (until === undefined) {
            setIsLoading(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            setError(null);
            // Use fetchPublicFeed even for personal feed to get stats and profile
            const result = await fetchPublicFeed(user.pubkey, until, 20, user.pubkey, 'authored');

            if (result.success) {
                if (result.profile) {
                    setUserProfile(result.profile);

                    // Fetch high-fidelity stats from ProfileStr in parallel
                    if (until === undefined && user.pubkey) {
                        fetchProfileFromProfileStr(user.pubkey).then(psResult => {
                            if (psResult.success && psResult.profile) {
                                const psProfile = psResult.profile;
                                setUserProfile((prev: any) => {
                                    if (!prev) return psProfile;
                                    return {
                                        ...prev,
                                        banner: psProfile.banner || prev.banner,
                                        picture: psProfile.picture || prev.picture,
                                        about: psProfile.about || prev.about,
                                        display_name: psProfile.display_name || prev.display_name,
                                        followers_count: psProfile.followers_count || prev.followers_count,
                                        following_count: psProfile.following_count || prev.following_count,
                                        notes_count: psProfile.notes_count || prev.notes_count,
                                        trustScores: psProfile.trustScores || prev.trustScores,
                                        stats: {
                                            ...(prev.stats || {}),
                                            follower_count: psProfile.followers_count || prev.stats?.follower_count,
                                            follows_count: psProfile.following_count || prev.stats?.follows_count,
                                            note_count: psProfile.notes_count || prev.stats?.note_count,
                                        }
                                    };
                                });
                            }
                        }).catch(err => console.error('ProfileStr fetch error:', err));
                    }
                }
                if (until === undefined) {
                    setEvents(result.events);
                    setHasMore(result.events.length >= 10);
                } else {
                    setEvents(prev => {
                        const newEvents = result.events.filter(
                            (newEvent: any) => !prev.some((e: any) => e.id === newEvent.id)
                        );
                        if (newEvents.length === 0 && result.events.length > 0) {
                            setHasMore(false);
                        } else if (result.events.length < 10) {
                            setHasMore(false);
                        } else {
                            setHasMore(true);
                        }
                        return [...prev, ...newEvents];
                    });
                }
                resolveUserNames(result.events);
            } else {
                setError(result.error || 'Failed to fetch feed');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
            setIsLoadingMore(false);
        }
    }, [user?.pubkey]);

    useEffect(() => {
        loadFeed();
    }, [loadFeed]);

    const handleRefresh = () => {
        setIsRefreshing(true);
        setHasMore(true);
        loadFeed();
    };

    const handleLoadMore = () => {
        if (isLoadingMore || !hasMore || events.length === 0) return;

        const lastEvent = events[events.length - 1];
        if (lastEvent?.created_at) {
            loadFeed(lastEvent.created_at - 1);
        }
    };

    const renderFooter = () => {
        if (!isLoadingMore) return <View style={{ height: 20 }} />;
        return (
            <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color="#f97316" />
            </View>
        );
    };

    if (isLoading && !isRefreshing) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#f97316" />
                <Text style={styles.loadingText}>Loading feed...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <HeaderBar
                user={user}
                onLogout={onLogout}
                onViewMerchantSettings={onViewMerchantSettings}
                onNavigateToTasks={onNavigateToTasks}
            />

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                    <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Animated.FlatList
                data={events}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <FeedItem
                        item={item}
                        onBoostEvent={onBoostEvent}
                        onViewUserFeed={onViewUserFeed}
                        userNames={userNames}
                    />
                )}
                contentContainerStyle={styles.listContent}
                onScroll={onScroll}
                scrollEventThrottle={16}
                onEndReached={handleLoadMore}
                onEndReachedThreshold={2.5}
                ListFooterComponent={renderFooter}
                ListHeaderComponent={
                    userProfile ? (
                        <ProfileHeader
                            profile={userProfile}
                            onBoostFollowing={onBoostFollowing}
                        />
                    ) : null
                }
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor="#f97316"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📭</Text>
                        <Text style={styles.emptyText}>No feed items found</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
    },
    listContent: {
        paddingBottom: 120, // Extra space for bottom nav
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    sectionSubtitle: {
        fontSize: 13,
        color: '#71717a',
        marginTop: 2,
    },
    eventCard: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    eventHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        marginRight: 12,
    },
    avatarPlaceholder: {
        backgroundColor: '#27272a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    headerInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    displayName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },

    dot: {
        color: '#52525b',
        marginHorizontal: 6,
    },
    timeAgo: {
        color: '#71717a',
        fontSize: 13,
    },
    nip05Row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    nip05: {
        color: '#71717a',
        fontSize: 12,
    },
    nip05Tick: {
        color: '#71717a',
        fontSize: 12,
        marginLeft: 4,
    },
    nip05TickIcon: {
        width: 12,
        height: 12,
        marginLeft: 4,
        tintColor: '#71717a',
    },

    content: {
        color: '#e4e4e7',
        fontSize: 15,
        lineHeight: 22,
    },
    link: {
        color: '#60a5fa', // Blue link
        fontWeight: '600',
    },
    showMoreButton: {
        marginTop: 4,
        marginBottom: 16,
    },
    showMoreText: {
        color: '#f97316',
        fontSize: 14,
        fontWeight: '600',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
        justifyContent: 'space-between',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        // removed marginRight since we use gap now
    },
    statIcon: {
        marginRight: 6, // Slightly increased spacing
    },
    statValue: {
        color: '#71717a',
        fontSize: 13,
    },
    boostButton: {
        backgroundColor: '#f97316',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    boostButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    loadingText: {
        color: '#71717a',
        marginTop: 12,
    },
    errorContainer: {
        margin: 16,
        padding: 12,
        backgroundColor: '#450a0a',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    errorText: {
        color: '#f87171',
        flex: 1,
    },
    retryButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#991b1b',
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        color: '#71717a',
        fontSize: 16,
    },
    footerLoader: {
        paddingVertical: 20,
        alignItems: 'center',
    },
});
