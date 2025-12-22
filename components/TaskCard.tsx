/**
 * TaskCard - Reusable task card component for displaying campaign tasks
 * Matches the web app TaskCard design with mobile adaptations
 */
import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Linking,
} from 'react-native';
import type { Task } from '../lib/api';
import { Icon } from './Icon';

interface TaskCardProps {
    task: Task;
    onPress: () => void;
    isCompleted?: boolean;
    isEligible?: boolean;
    trustScore?: number;
    minTrustScore?: number;
}

export function TaskCard({
    task,
    onPress,
    isCompleted,
    isEligible,
    trustScore,
    minTrustScore,
}: TaskCardProps) {
    const getTaskTypeLabel = () => {
        switch (task.type) {
            case 'NOSTR_BOOST':
                return 'Nostr Boost';
            case 'SURVEY':
                return 'Survey';
            case 'CONTENT_CREATION':
                return 'Content Creation';
            default:
                return 'Task';
        }
    };

    const calculateMaxReward = () => {
        if (task.type === 'NOSTR_BOOST') {
            return (
                (task.likeReward || 0) +
                (task.repostReward || 0) +
                (task.replyReward || 0) +
                (task.followReward || 0)
            );
        }
        return task.reward;
    };

    const formatDate = (timestamp: number | Date | string) => {
        return new Date(timestamp).toLocaleDateString('en-AU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    };

    const truncateContent = (content: string, maxLength: number = 30) => {
        if (!content || content.length <= maxLength) return content;
        return content.substring(0, maxLength) + '...';
    };

    const handleViewEvent = () => {
        if (task.eventId) {
            Linking.openURL(`https://primal.net/e/${task.eventId}`);
        }
    };

    const getMerchantAvatar = () => {
        if (task.merchant?.profilePic) {
            return task.merchant.profilePic;
        }
        if (task.merchant?.pubkey) {
            return `https://robohash.org/${task.merchant.pubkey}.png?set=set4&size=128x128`;
        }
        return null;
    };

    return (
        <TouchableOpacity
            style={[styles.taskCard, isCompleted && styles.taskCardCompleted]}
            onPress={onPress}
            activeOpacity={0.8}
        >
            {/* Header with Avatar, Type, Status, Score */}
            <View style={styles.taskHeader}>
                {/* Merchant Avatar */}
                <View style={styles.avatarContainer}>
                    {getMerchantAvatar() ? (
                        <Image
                            source={{ uri: getMerchantAvatar()! }}
                            style={styles.avatar}
                        />
                    ) : (
                        <View style={styles.avatarPlaceholder}>
                            <Icon name="zap" size={24} color="#000" />
                        </View>
                    )}
                </View>

                {/* Task Info */}
                <View style={styles.taskInfo}>
                    {/* Labels Row */}
                    <View style={styles.labelsRow}>
                        <Text style={styles.taskTypeLabel}>{getTaskTypeLabel()}</Text>
                        <View style={styles.statusBadge}>
                            <Text style={styles.statusBadgeText}>ACTIVE</Text>
                        </View>
                        {!isCompleted && isEligible !== undefined && (
                            <View style={[
                                styles.scoreBadge,
                                isEligible ? styles.scoreBadgeEligible : styles.scoreBadgeNotEligible
                            ]}>
                                <Text style={styles.scoreBadgeIcon}>◐</Text>
                                <Text style={[
                                    styles.scoreBadgeText,
                                    isEligible ? styles.scoreBadgeTextEligible : styles.scoreBadgeTextNotEligible
                                ]}>
                                    Score {trustScore || 0}/{minTrustScore || 50}
                                </Text>
                            </View>
                        )}
                    </View>
                    {/* Merchant Name */}
                    <Text style={styles.merchantName} numberOfLines={1}>
                        {task.merchant?.displayName || 'Anonymous'}
                    </Text>
                </View>
            </View>



            {/* Content to Boost Section */}
            {task.type === 'NOSTR_BOOST' && task.eventContent && (
                <View style={styles.contentSection}>
                    <View style={styles.contentHeader}>
                        <View style={styles.contentHeaderLeft}>
                            <Text style={styles.contentIcon}>◯</Text>
                            <Text style={styles.contentLabel}>Content to Boost</Text>
                        </View>
                        <TouchableOpacity onPress={handleViewEvent} style={styles.viewLink}>
                            <Text style={styles.viewLinkIcon}>↗</Text>
                            <Text style={styles.viewLinkText}>View</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.contentText} numberOfLines={2}>
                        {truncateContent(task.eventContent, 50)}
                    </Text>
                    {/* Content Author */}
                    {task.merchant && (
                        <View style={styles.contentAuthor}>
                            {getMerchantAvatar() && (
                                <Image
                                    source={{ uri: getMerchantAvatar()! }}
                                    style={styles.contentAuthorAvatar}
                                />
                            )}
                            <Text style={styles.contentAuthorLabel}>By: </Text>
                            <Text style={styles.contentAuthorName}>
                                {task.merchant.displayName || 'Anonymous'}
                            </Text>
                        </View>
                    )}
                </View>
            )}

            {/* Completed Badge */}
            {isCompleted && (
                <View style={styles.completedBadgeContainer}>
                    <View style={styles.completedBadge}>
                        <Text style={styles.completedBadgeText}>✓ Completed</Text>
                    </View>
                </View>
            )}

            {/* Potential Earnings Section */}
            <View style={styles.earningsSection}>
                <View style={styles.earningsLeft}>
                    <Icon name="zap" size={18} color="#f97316" style={{ marginRight: 8 }} />
                    <Text style={styles.earningsLabel}>
                        {isCompleted ? 'Total Earned' : 'Potential Earnings'}
                    </Text>
                </View>
                <Text style={[styles.earningsValue, isCompleted && styles.earningsValueCompleted]}>
                    {calculateMaxReward().toLocaleString()} sats
                </Text>
            </View>

            {/* Footer with Dates */}
            <View style={styles.taskFooter}>
                <View style={styles.dateInfo}>
                    <Text style={styles.dateIcon}>◷</Text>
                    <Text style={styles.dateText}>Created {formatDate(task.createdAt)}</Text>
                </View>
                {task.endDate && (
                    <View style={styles.dateInfo}>
                        <Text style={styles.dateIcon}>◷</Text>
                        <Text style={styles.dateText}>Ends {formatDate(task.endDate)}</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    taskCard: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    taskCardCompleted: {
        borderColor: '#3f3f46',
        backgroundColor: '#18181b',
    },

    // Header
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#27272a',
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 12,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarPlaceholderText: {
        fontSize: 20,
    },
    taskInfo: {
        flex: 1,
    },
    labelsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 4,
    },
    taskTypeLabel: {
        fontSize: 12,
        color: '#a1a1aa',
        fontWeight: '500',
    },
    statusBadge: {
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(34, 197, 94, 0.3)',
    },
    statusBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#22c55e',
    },
    scoreBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        borderWidth: 1,
        gap: 4,
    },
    scoreBadgeEligible: {
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        borderColor: 'rgba(59, 130, 246, 0.3)',
    },
    scoreBadgeNotEligible: {
        backgroundColor: 'rgba(234, 179, 8, 0.15)',
        borderColor: 'rgba(234, 179, 8, 0.3)',
    },
    scoreBadgeIcon: {
        fontSize: 10,
        color: '#3b82f6',
    },
    scoreBadgeText: {
        fontSize: 10,
        fontWeight: '600',
    },
    scoreBadgeTextEligible: {
        color: '#3b82f6',
    },
    scoreBadgeTextNotEligible: {
        color: '#eab308',
    },
    merchantName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },

    // Description
    taskDescription: {
        fontSize: 14,
        color: '#a1a1aa',
        lineHeight: 20,
        marginBottom: 12,
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
        marginBottom: 8,
    },
    contentAuthor: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
    },
    contentAuthorAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
        marginRight: 6,
    },
    contentAuthorLabel: {
        fontSize: 12,
        color: '#71717a',
    },
    contentAuthorName: {
        fontSize: 12,
        color: '#f97316',
        fontWeight: '500',
    },

    // Completed Badge
    completedBadgeContainer: {
        marginBottom: 12,
    },
    completedBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        alignSelf: 'flex-start',
    },
    completedBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#10b981',
    },

    // Earnings Section
    earningsSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(249, 115, 22, 0.08)',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.2)',
    },
    earningsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    earningsIcon: {
        // fontSize: 18,
        // color: '#f97316',
    },
    earningsLabel: {
        fontSize: 13,
        fontWeight: '500',
        color: '#ffffff',
    },
    earningsValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#f97316',
    },
    earningsValueCompleted: {
        color: '#22c55e',
    },

    // Footer
    taskFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    dateInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    dateIcon: {
        fontSize: 12,
        color: '#71717a',
    },
    dateText: {
        fontSize: 11,
        color: '#71717a',
    },
});

export default TaskCard;
