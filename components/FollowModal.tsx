import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Modal,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { nip19 } from 'nostr-tools';
import { fetchFollowList, publishToNostr, type FollowListData, type FollowListResponse } from '../lib/api';
import { signFollowEvent, DEFAULT_RELAYS } from '../lib/nostr';
import { getNsec } from '../lib/storage';
import { Alert } from 'react-native';

interface FollowModalProps {
    isOpen: boolean;
    onClose: () => void;
    userPubkey: string;
    targetPubkey: string;
    targetDisplayName?: string;
    onSuccess: (result: { signedEvent: any; alreadyFollowing: boolean }) => void;
}

export default function FollowModal({
    isOpen,
    onClose,
    userPubkey,
    targetPubkey,
    targetDisplayName,
    onSuccess,
}: FollowModalProps) {
    const [followListData, setFollowListData] = useState<FollowListData | null>(null);
    const [dbFollowingCount, setDbFollowingCount] = useState<number>(0);
    const [userExists, setUserExists] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [alreadyFollowing, setAlreadyFollowing] = useState(false);

    useEffect(() => {
        if (isOpen && userPubkey) {
            loadFollowList();
        }
    }, [isOpen, userPubkey]);

    const loadFollowList = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result: FollowListResponse = await fetchFollowList(userPubkey);

            if (!result.success) {
                throw new Error(result.error || "Failed to fetch follow list");
            }

            setFollowListData(result.followList);
            setDbFollowingCount(result.dbFollowingCount);
            setUserExists(result.userExists);
            setAlreadyFollowing(result.followList.follows.includes(targetPubkey));
        } catch (err) {
            console.error("Error fetching follow list:", err);
            setError(err instanceof Error ? err.message : "Failed to load follow list");
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!followListData || isSubmitting) return;

        setIsSubmitting(true);
        setError(null);

        try {
            if (alreadyFollowing) {
                onSuccess({ signedEvent: null, alreadyFollowing: true });
                return;
            }

            // Not following yet, need to update follow list
            const nsec = await getNsec();
            if (!nsec) {
                Alert.alert('Error', 'Please log in again');
                setIsSubmitting(false);
                return;
            }

            // Append new follow
            const newFollowList = [...followListData.follows, targetPubkey];

            // Sign the new follow list (kind 3)
            const signedEvent = signFollowEvent(nsec, newFollowList);

            // Publish to relays
            const publishResult = await publishToNostr(signedEvent, DEFAULT_RELAYS);

            if (!publishResult.success) {
                // We still call onSuccess because backend might validate follow status via other means
                // but we warn the user or log it
                console.warn("Follow list publish failed:", publishResult.error);
            }

            onSuccess({ signedEvent, alreadyFollowing: false });
        } catch (err) {
            console.error("Follow confirmation error:", err);
            setError(err instanceof Error ? err.message : "Failed to process follow action");
            setIsSubmitting(false);
        }
    };

    const formatDate = (timestamp: number | null) => {
        if (!timestamp) return "Never";
        return new Date(timestamp * 1000).toLocaleDateString();
    };

    const formatTargetName = () => {
        if (targetDisplayName) return targetDisplayName;
        try {
            return nip19.npubEncode(targetPubkey).slice(0, 16) + "...";
        } catch {
            return targetPubkey.slice(0, 16) + "...";
        }
    };

    if (!isOpen) return null;

    return (
        <Modal
            visible={isOpen}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.content}>
                    <View style={styles.header}>
                        <View style={styles.headerTitleContainer}>
                            <Text style={styles.headerIcon}>👤+</Text>
                            <Text style={styles.title}>Follow User</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
                        {/* Target User Info */}
                        <View style={styles.infoBox}>
                            <Text style={styles.infoLabel}>Following: {formatTargetName()}</Text>
                        </View>

                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="small" color="#f97316" />
                                <Text style={styles.loadingText}>Loading your follow list...</Text>
                            </View>
                        ) : error ? (
                            <View style={styles.errorBox}>
                                <Text style={styles.errorTitle}>Error Loading Follow List</Text>
                                <Text style={styles.errorText}>{error}</Text>
                                <TouchableOpacity onPress={loadFollowList} style={styles.retryButton}>
                                    <Text style={styles.retryButtonText}>Retry</Text>
                                </TouchableOpacity>
                            </View>
                        ) : followListData ? (
                            <View style={styles.statsContainer}>
                                {/* Current Follow Stats */}
                                <View style={styles.statBox}>
                                    <View style={styles.statLeft}>
                                        <Text style={styles.statIcon}>👥</Text>
                                        <Text style={styles.statLabel}>Your Current Follows</Text>
                                    </View>
                                    <Text style={styles.statValue}>{followListData.follows.length}</Text>
                                </View>

                                {/* Follow Status */}
                                <View style={[styles.statusBox, alreadyFollowing ? styles.statusBoxSuccess : styles.statusBoxInfo]}>
                                    <Text style={[styles.statusText, alreadyFollowing ? styles.statusTextSuccess : styles.statusTextInfo]}>
                                        {alreadyFollowing ? "✓ You are already following this user" : "→ This will be added to your follow list"}
                                    </Text>
                                    {!alreadyFollowing && (
                                        <Text style={styles.statusSubtext}>New total: {followListData.follows.length + 1} follows</Text>
                                    )}
                                </View>

                                {/* Mismatch Warning */}
                                {(() => {
                                    const nostrCount = followListData.follows.length;
                                    const dbCount = dbFollowingCount;
                                    const difference = Math.abs(nostrCount - dbCount);
                                    const isLargeDifference = difference > 10;
                                    if (userExists && dbCount > 0 && isLargeDifference) {
                                        return (
                                            <View style={styles.warningBox}>
                                                <Text style={styles.warningTitle}>⚠️ Follow List Mismatch</Text>
                                                <Text style={styles.warningText}>
                                                    Nostr follow list: {nostrCount} follows{"\n"}
                                                    Database record: {dbCount} follows{"\n"}
                                                    Difference: {difference} follows
                                                </Text>
                                                <Text style={[styles.warningText, { marginTop: 8 }]}>
                                                    Your Nostr follow list may be out of sync. Please double check the follow list size before proceeding.
                                                </Text>
                                            </View>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Last Updated */}
                                <Text style={styles.lastUpdated}>
                                    Follow list last updated: {formatDate(followListData.lastUpdated)}
                                </Text>

                                {/* Safety Notices */}
                                <View style={styles.safetyBox}>
                                    <Text style={styles.safetyText}>✓ Your existing follows will be preserved</Text>
                                    <Text style={styles.safetyText}>✓ You'll earn sats regardless of follow status</Text>
                                </View>

                                {/* 24-Hour Notice */}
                                <View style={styles.noticeBox}>
                                    <Text style={styles.noticeText}>
                                        ⚠️ Please keep following for at least 24 hours. Following and unfollowing is not allowed and may result in disqualification.
                                    </Text>
                                </View>
                            </View>
                        ) : null}
                    </ScrollView>

                    <View style={styles.footer}>
                        <TouchableOpacity
                            onPress={onClose}
                            style={styles.cancelButton}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleConfirm}
                            disabled={isLoading || isSubmitting || !!error}
                            style={[
                                styles.confirmButton,
                                (isLoading || isSubmitting || !!error) && styles.confirmButtonDisabled,
                            ]}
                        >
                            {isSubmitting ? (
                                <ActivityIndicator size="small" color="#18181b" />
                            ) : (
                                <Text style={styles.confirmButtonText}>
                                    {alreadyFollowing ? "Claim" : "Follow"}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    content: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        width: '100%',
        maxWidth: 400,
        maxHeight: '90%',
        borderWidth: 1,
        borderColor: '#27272a',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#27272a',
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerIcon: {
        fontSize: 18,
        marginRight: 10,
        color: '#71717a',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
    },
    closeButton: {
        padding: 5,
    },
    closeButtonText: {
        fontSize: 18,
        color: '#71717a',
    },
    body: {
        padding: 20,
    },
    infoBox: {
        backgroundColor: '#27272a',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3f3f46',
        marginBottom: 16,
    },
    infoLabel: {
        fontSize: 14,
        color: '#a1a1aa',
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    loadingText: {
        marginTop: 10,
        color: '#a1a1aa',
        fontSize: 14,
    },
    errorBox: {
        padding: 15,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.2)',
        marginBottom: 16,
    },
    errorTitle: {
        color: '#ef4444',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 5,
    },
    errorText: {
        color: '#f87171',
        fontSize: 13,
        marginBottom: 10,
    },
    retryButton: {
        alignSelf: 'flex-start',
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderRadius: 4,
    },
    retryButtonText: {
        color: '#ef4444',
        fontSize: 12,
        fontWeight: '500',
    },
    statsContainer: {
        gap: 12,
    },
    statBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#27272a',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    statLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statIcon: {
        fontSize: 14,
        color: '#71717a',
    },
    statLabel: {
        fontSize: 14,
        color: '#d4d4d8',
    },
    statValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    statusBox: {
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    statusBoxInfo: {
        backgroundColor: '#27272a',
        borderColor: '#3f3f46',
    },
    statusBoxSuccess: {
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    statusText: {
        fontSize: 14,
        fontWeight: '500',
    },
    statusTextInfo: {
        color: '#d4d4d8',
    },
    statusTextSuccess: {
        color: '#10b981',
    },
    statusSubtext: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 4,
    },
    warningBox: {
        padding: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)',
    },
    warningTitle: {
        color: '#f59e0b',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    warningText: {
        color: '#fbbf24',
        fontSize: 12,
        lineHeight: 18,
    },
    lastUpdated: {
        fontSize: 12,
        color: '#71717a',
        textAlign: 'center',
        marginVertical: 4,
    },
    safetyBox: {
        padding: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.2)',
    },
    safetyText: {
        color: '#10b981',
        fontSize: 12,
        marginBottom: 2,
    },
    noticeBox: {
        padding: 12,
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.2)',
        marginBottom: 10,
    },
    noticeText: {
        color: '#f59e0b',
        fontSize: 12,
        lineHeight: 18,
    },
    footer: {
        flexDirection: 'row',
        padding: 20,
        gap: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#27272a',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#d4d4d8',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmButton: {
        flex: 1,
        backgroundColor: '#ffffff',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
    },
    confirmButtonDisabled: {
        opacity: 0.5,
    },
    confirmButtonText: {
        color: '#18181b',
        fontSize: 16,
        fontWeight: '600',
    },
});
