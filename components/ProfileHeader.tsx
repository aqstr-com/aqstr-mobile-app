import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
} from 'react-native';
import { formatNumber, truncateText } from '../lib/utils';

interface ProfileHeaderProps {
    profile: any;
    onBoostFollowing?: (pubkey: string, npub?: string) => void;
}

export function ProfileHeader({ profile, onBoostFollowing }: ProfileHeaderProps) {
    if (!profile) return null;

    const stats = profile.stats || {};

    return (
        <View style={styles.profileHeader}>
            {profile.banner ? (
                <Image source={{ uri: profile.banner }} style={styles.banner} />
            ) : (
                <View style={[styles.banner, { backgroundColor: '#18181b' }]} />
            )}

            <View style={styles.profileInfoContainer}>
                <View style={styles.avatarRow}>
                    {profile.picture ? (
                        <Image source={{ uri: profile.picture }} style={styles.profileAvatar} />
                    ) : (
                        <View style={[styles.profileAvatar, styles.avatarPlaceholder]}>
                            <Text style={styles.avatarText}>
                                {(profile.display_name || profile.name || 'U').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.profileMetaRow}>
                    <View style={styles.profileNameSection}>
                        <Text style={styles.profileDisplayName}>
                            {profile.display_name || profile.name}
                        </Text>

                        {profile.nip05 && (
                            <Text style={styles.profileHandle}>
                                {truncateText(profile.nip05, 15)}
                            </Text>
                        )}
                    </View>

                    {onBoostFollowing && (
                        <TouchableOpacity
                            style={styles.boostFollowingButton}
                            onPress={() => onBoostFollowing(profile.pubkey, profile.npub)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.boostFollowingText}>⚡ Boost Followers</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {profile.about && (
                    <Text style={styles.profileAbout}>{profile.about}</Text>
                )}

                <View style={styles.profileStatsGrid}>
                    <View style={styles.profileStatItem}>
                        <Text style={styles.profileStatValue}>
                            {formatNumber(profile.followers_count || stats.followers_count || profile.follower_count || 0)}
                        </Text>
                        <Text style={styles.profileStatLabel}>followers</Text>
                    </View>
                    <View style={styles.profileStatItem}>
                        <Text style={styles.profileStatValue}>
                            {formatNumber(profile.following_count || stats.follows_count || profile.follows_count || 0)}
                        </Text>
                        <Text style={styles.profileStatLabel}>following</Text>
                    </View>
                    <View style={styles.profileStatItem}>
                        <Text style={styles.profileStatValue}>
                            {profile.trustScore || profile.trustScores?.combined?.score || 0}
                        </Text>
                        <Text style={styles.profileStatLabel}>trust score</Text>
                    </View>
                    <View style={styles.profileStatItem}>
                        <Text style={styles.profileStatValue}>
                            {formatNumber(profile.notes_count || stats.note_count || 0)}
                        </Text>
                        <Text style={styles.profileStatLabel}>notes</Text>
                    </View>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    profileHeader: {
        marginBottom: 8,
        backgroundColor: '#0a0a0a',
    },
    banner: {
        width: '100%',
        height: 120,
    },
    profileInfoContainer: {
        paddingHorizontal: 16,
        marginTop: -40,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        marginBottom: 12,
    },
    profileAvatar: {
        width: 80,
        height: 80,
        borderRadius: 40,
        borderWidth: 4,
        borderColor: '#0a0a0a',
        backgroundColor: '#18181b',
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 32,
        fontWeight: 'bold',
    },
    profileMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    profileNameSection: {
        flex: 1,
        marginRight: 12,
    },
    profileDisplayName: {
        color: '#fff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    profileHandle: {
        color: '#71717a',
        fontSize: 14,
    },
    profileAbout: {
        color: '#e4e4e7',
        fontSize: 14,
        lineHeight: 20,
        marginBottom: 16,
    },
    profileStatsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderTopWidth: 1,
        borderTopColor: '#18181b',
    },
    profileStatItem: {
        alignItems: 'center',
        flex: 1,
    },
    profileStatValue: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    profileStatLabel: {
        color: '#71717a',
        fontSize: 12,
        marginTop: 2,
    },
    boostFollowingButton: {
        backgroundColor: '#f97316',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        alignSelf: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#f97316',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    boostFollowingText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },
});
