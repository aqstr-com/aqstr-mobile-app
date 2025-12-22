/**
 * MerchantCampaignCard - Displays a merchant's campaign/task with actions
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ActivityIndicator,
    Image,
} from 'react-native';
import { MerchantTask, toggleCampaign, deleteCampaign, stopCampaign } from '../lib/api';

interface MerchantCampaignCardProps {
    campaign: MerchantTask;
    onCampaignUpdated?: () => void;
    onPayClick?: (campaign: MerchantTask) => void;
}

export default function MerchantCampaignCard({ campaign, onCampaignUpdated, onPayClick }: MerchantCampaignCardProps) {
    const [isLoading, setIsLoading] = useState(false);
    const [localStatus, setLocalStatus] = useState(campaign.status);

    const getStatusColor = (status: string, paymentStatus: string) => {
        if (status === 'PENDING_PAYMENT' && paymentStatus === 'UNPAID') {
            return { bg: '#fef3c7', text: '#d97706' }; // Yellow/amber
        }
        switch (status) {
            case 'ACTIVE':
                return { bg: '#dcfce7', text: '#16a34a' }; // Green
            case 'PAUSED':
                return { bg: '#f3f4f6', text: '#6b7280' }; // Gray
            case 'COMPLETED':
                return { bg: '#dbeafe', text: '#2563eb' }; // Blue
            case 'STOPPED':
                return { bg: '#fef2f2', text: '#dc2626' }; // Red
            default:
                return { bg: '#f3f4f6', text: '#6b7280' }; // Gray default
        }
    };

    const getStatusLabel = (status: string, paymentStatus: string) => {
        if (status === 'PENDING_PAYMENT' && paymentStatus === 'UNPAID') {
            return 'Pending Payment';
        }
        switch (status) {
            case 'ACTIVE':
                return 'Active';
            case 'PAUSED':
                return 'Paused';
            case 'COMPLETED':
                return 'Completed';
            case 'STOPPED':
                return 'Stopped';
            default:
                return status;
        }
    };

    const getEnabledActions = () => {
        const actions = [];
        if ((campaign.likeReward || 0) > 0) actions.push(`Like: ${campaign.likeReward}`);
        if ((campaign.repostReward || 0) > 0) actions.push(`Repost: ${campaign.repostReward}`);
        if ((campaign.repostWithQuoteReward || 0) > 0) actions.push(`Quote: ${campaign.repostWithQuoteReward}`);
        if ((campaign.replyReward || 0) > 0) actions.push(`Reply: ${campaign.replyReward}`);
        if ((campaign.followReward || 0) > 0) actions.push(`Follow: ${campaign.followReward}`);
        return actions;
    };

    const handleToggle = async () => {
        const action = localStatus === 'ACTIVE' ? 'pause' : 'resume';
        setIsLoading(true);

        try {
            const result = await toggleCampaign(campaign.id, action);
            if (result.success && result.newStatus) {
                setLocalStatus(result.newStatus as any);
                onCampaignUpdated?.();
            } else {
                Alert.alert('Error', result.error || `Failed to ${action} campaign`);
            }
        } catch (error) {
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Campaign',
            `Are you sure you want to delete "${campaign.title}"? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true);
                        try {
                            const result = await deleteCampaign(campaign.id);
                            if (result.success) {
                                onCampaignUpdated?.();
                            } else {
                                Alert.alert('Error', result.error || 'Failed to delete campaign');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'Something went wrong');
                        } finally {
                            setIsLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const handleStop = () => {
        Alert.alert(
            'Stop Campaign',
            `Are you sure you want to stop "${campaign.title}"? Remaining budget will be refunded to your Lightning address.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Stop & Refund',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true);
                        try {
                            const result = await stopCampaign(campaign.id);
                            if (result.success) {
                                setLocalStatus('STOPPED');
                                Alert.alert(
                                    'Campaign Stopped',
                                    result.message || `Refunded ${result.refundAmount?.toLocaleString() || 0} sats`
                                );
                                onCampaignUpdated?.();
                            } else {
                                Alert.alert('Error', result.error || 'Failed to stop campaign');
                            }
                        } catch (error) {
                            Alert.alert('Error', 'Something went wrong');
                        } finally {
                            setIsLoading(false);
                        }
                    },
                },
            ]
        );
    };

    const statusColors = getStatusColor(localStatus, campaign.paymentStatus);
    const statusLabel = getStatusLabel(localStatus, campaign.paymentStatus);
    const enabledActions = getEnabledActions();
    const budgetPercentage = campaign.totalBudget > 0
        ? ((campaign.remainingBudget / campaign.totalBudget) * 100)
        : 0;

    // Determine which actions are available
    const canToggle = campaign.paymentStatus === 'PAID' &&
        (localStatus === 'ACTIVE' || localStatus === 'PAUSED');
    const canStop = campaign.paymentStatus === 'PAID' &&
        (localStatus === 'ACTIVE' || localStatus === 'PAUSED') &&
        campaign.remainingBudget > 0;
    const canPay = campaign.paymentStatus === 'UNPAID' && localStatus === 'PENDING_PAYMENT';
    const canDelete = campaign.paymentStatus === 'UNPAID' ||
        localStatus === 'PAUSED' ||
        localStatus === 'STOPPED';

    return (
        <View style={styles.card}>
            {/* Loading overlay */}
            {isLoading && (
                <View style={styles.loadingOverlay}>
                    <ActivityIndicator size="small" color="#f97316" />
                </View>
            )}

            {/* Header with Avatar, Title and Status */}
            <View style={styles.header}>
                {/* Merchant Avatar */}
                <View style={styles.avatarContainer}>
                    {campaign.merchant?.profilePic ? (
                        <Image
                            source={{ uri: campaign.merchant.profilePic }}
                            style={styles.avatar}
                        />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Text style={styles.avatarPlaceholderText}>
                                {(campaign.merchant?.displayName || campaign.title || 'C').charAt(0).toUpperCase()}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Title Section */}
                <View style={styles.titleSection}>
                    <View style={styles.labelRow}>
                        <Text style={styles.typeLabel}>Nostr Boost</Text>
                        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                            <Text style={[styles.statusText, { color: statusColors.text }]}>
                                {statusLabel.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                    <Text style={styles.title} numberOfLines={1}>
                        {campaign.title}
                    </Text>
                </View>
            </View>

            {/* Description */}
            {campaign.description && (
                <Text style={styles.description} numberOfLines={2}>
                    {campaign.description}
                </Text>
            )}

            {/* Content to Boost Section */}
            {campaign.eventContent && (
                <View style={styles.contentSection}>
                    <View style={styles.contentHeader}>
                        <View style={styles.contentHeaderLeft}>
                            <Text style={styles.contentIcon}>◯</Text>
                            <Text style={styles.contentLabel}>Content to Boost</Text>
                        </View>
                        {campaign.eventId && (
                            <TouchableOpacity
                                onPress={() => {
                                    // Can open in external browser
                                }}
                                style={styles.viewLink}
                            >
                                <Text style={styles.viewLinkIcon}>↗</Text>
                                <Text style={styles.viewLinkText}>View</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.contentText} numberOfLines={2}>
                        {campaign.eventContent.length > 50
                            ? campaign.eventContent.substring(0, 50) + '...'
                            : campaign.eventContent}
                    </Text>
                </View>
            )}

            {/* Rewards per Action */}
            {enabledActions.length > 0 && (
                <View style={styles.rewardsSection}>
                    <Text style={styles.sectionLabel}>Rewards per action</Text>
                    <View style={styles.rewardsGrid}>
                        {enabledActions.map((action, index) => (
                            <View key={index} style={styles.rewardItem}>
                                <Text style={styles.rewardText}>⚡ {action}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {/* Budget & Stats */}
            <View style={styles.statsSection}>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>
                        {campaign.remainingBudget.toLocaleString()}
                    </Text>
                    <Text style={styles.statLabel}>
                        / {campaign.totalBudget.toLocaleString()} sats
                    </Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statValue}>{campaign.completedCount}</Text>
                    <Text style={styles.statLabel}>completions</Text>
                </View>
            </View>

            {/* Budget Progress Bar */}
            <View style={styles.budgetBar}>
                <View style={[styles.budgetFill, { width: `${budgetPercentage}%` }]} />
            </View>

            {/* Footer with Date and Actions */}
            <View style={styles.footer}>
                <View style={styles.dateSection}>
                    <Text style={styles.dateIcon}>◷</Text>
                    <Text style={styles.dateText}>
                        Created {new Date(campaign.createdAt).toLocaleDateString()}
                    </Text>
                    {campaign.endDate && (
                        <>
                            <Text style={styles.dateText}> • </Text>
                            <Text style={styles.dateText}>
                                Ends {new Date(campaign.endDate).toLocaleDateString()}
                            </Text>
                        </>
                    )}
                </View>
                <View style={styles.actionButtons}>
                    {canPay && onPayClick && (
                        <TouchableOpacity
                            style={[styles.actionButton, styles.payButton]}
                            onPress={() => onPayClick(campaign)}
                            disabled={isLoading}
                        >
                            <Text style={styles.payButtonText}>⚡ Pay</Text>
                        </TouchableOpacity>
                    )}
                    {canToggle && (
                        <TouchableOpacity
                            style={[styles.actionButton, localStatus === 'ACTIVE' ? styles.pauseButton : styles.resumeButton]}
                            onPress={handleToggle}
                            disabled={isLoading}
                        >
                            <Text style={styles.actionButtonText}>
                                {localStatus === 'ACTIVE' ? '⏸ Pause' : '▶ Resume'}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {canStop && (
                        <TouchableOpacity
                            style={[styles.actionButton, styles.stopButton]}
                            onPress={handleStop}
                            disabled={isLoading}
                        >
                            <Text style={styles.stopButtonText}>⏹ Stop</Text>
                        </TouchableOpacity>
                    )}
                    {canDelete && (
                        <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={handleDelete}
                            disabled={isLoading}
                        >
                            <Text style={styles.deleteButtonText}>🗑</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#27272a',
        position: 'relative',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
        zIndex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    avatarPlaceholder: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarPlaceholderText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    titleSection: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        flex: 1,
        marginRight: 12,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    description: {
        fontSize: 13,
        color: '#a1a1aa',
        marginBottom: 12,
        lineHeight: 18,
    },
    rewardsSection: {
        marginBottom: 12,
    },
    sectionLabel: {
        fontSize: 12,
        color: '#71717a',
        marginBottom: 8,
    },
    rewardsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    rewardItem: {
        backgroundColor: '#27272a',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    rewardText: {
        fontSize: 12,
        color: '#fbbf24',
        fontWeight: '500',
    },
    statsSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#f97316',
        marginRight: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#71717a',
    },
    budgetBar: {
        height: 4,
        backgroundColor: '#27272a',
        borderRadius: 2,
        marginBottom: 12,
        overflow: 'hidden',
    },
    budgetFill: {
        height: '100%',
        backgroundColor: '#f97316',
        borderRadius: 2,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    dateText: {
        fontSize: 12,
        color: '#71717a',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    pauseButton: {
        backgroundColor: '#27272a',
    },
    resumeButton: {
        backgroundColor: '#166534',
    },
    deleteButton: {
        backgroundColor: '#7f1d1d',
    },
    actionButtonText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    deleteButtonText: {
        fontSize: 12,
        color: '#fca5a5',
        fontWeight: '600',
    },
    payButton: {
        backgroundColor: '#f97316',
    },
    payButtonText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    stopButton: {
        backgroundColor: '#b45309',
    },
    stopButtonText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },

    // New styles for enhanced design
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    typeLabel: {
        fontSize: 12,
        color: '#a1a1aa',
        fontWeight: '500',
    },

    // Content Section
    contentSection: {
        backgroundColor: '#27272a',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    contentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    contentHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    contentIcon: {
        fontSize: 14,
        color: '#a1a1aa',
    },
    contentLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: '#ffffff',
    },
    viewLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    viewLinkIcon: {
        fontSize: 12,
        color: '#22c55e',
    },
    viewLinkText: {
        fontSize: 12,
        color: '#22c55e',
        fontWeight: '500',
    },
    contentText: {
        fontSize: 13,
        color: '#a1a1aa',
        lineHeight: 18,
    },

    // Date Section
    dateSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    dateIcon: {
        fontSize: 12,
        color: '#71717a',
        marginRight: 4,
    },
});
