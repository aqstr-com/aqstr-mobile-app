import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { fetchNostrEvent, fetchUserInfos } from '../lib/api';
import { formatTimeAgo, extractMediaUrls, stripMediaUrls } from '../lib/utils';
import { eventIdToHex, hexToNpub } from '../lib/nostr';
import MediaRenderer from './MediaRenderer';

interface QuotedEventProps {
    eventId: string; // can be hex, note1, or nevent1
    onViewUserFeed?: (npub: string) => void;
}

export default function QuotedEvent({ eventId, onViewUserFeed }: QuotedEventProps) {
    const [event, setEvent] = useState<any>(null);
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadEvent = async () => {
            const hexId = eventIdToHex(eventId);
            if (!hexId) {
                setError('Invalid event ID');
                setLoading(false);
                return;
            }

            try {
                const result = await fetchNostrEvent(hexId);
                if (result.success && result.event) {
                    setEvent(result.event);

                    // Fetch user info for the author of the quoted event
                    const userResult = await fetchUserInfos([result.event.pubkey]);
                    if (userResult.success && userResult.users.length > 0) {
                        setUser(userResult.users[0]);
                    }
                } else {
                    setError(result.error || 'Event not found');
                }
            } catch (err) {
                setError('Failed to fetch event');
            } finally {
                setLoading(false);
            }
        };

        loadEvent();
    }, [eventId]);

    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="small" color="#f97316" />
            </View>
        );
    }

    if (error || !event) {
        return null; // Don't show anything if it fails to load or is invalid
    }

    const content = stripMediaUrls(event.content);
    const mediaUrls = extractMediaUrls(event.content);
    const npub = hexToNpub(event.pubkey);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => onViewUserFeed?.(npub)} style={styles.authorInfo}>
                    {user?.picture ? (
                        <Image source={{ uri: user.picture }} style={styles.avatar} />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarText}>
                                {(user?.display_name || user?.name || 'U').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <Text style={styles.displayName} numberOfLines={1}>
                        {user?.display_name || user?.name || 'Nostr User'}
                    </Text>
                    <Text style={styles.dot}>•</Text>
                    <Text style={styles.timeAgo}>{formatTimeAgo(event.created_at)}</Text>
                </TouchableOpacity>
            </View>

            {content ? (
                <Text style={styles.content} numberOfLines={3}>
                    {content}
                </Text>
            ) : null}

            {mediaUrls.length > 0 && (
                <View style={styles.mediaContainer}>
                    <MediaRenderer urls={mediaUrls.slice(0, 1)} />
                    {mediaUrls.length > 1 && (
                        <Text style={styles.moreMediaText}>+{mediaUrls.length - 1} more media</Text>
                    )}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#27272a',
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    authorInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        marginRight: 8,
    },
    avatarPlaceholder: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#3f3f46',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    avatarText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    displayName: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
        flexShrink: 1,
    },
    dot: {
        color: '#71717a',
        marginHorizontal: 4,
    },
    timeAgo: {
        color: '#71717a',
        fontSize: 12,
    },
    content: {
        color: '#d4d4d8',
        fontSize: 14,
        lineHeight: 20,
    },
    mediaContainer: {
        marginTop: 8,
        borderRadius: 8,
        overflow: 'hidden',
    },
    moreMediaText: {
        color: '#71717a',
        fontSize: 11,
        marginTop: 4,
        textAlign: 'right',
    }
});
