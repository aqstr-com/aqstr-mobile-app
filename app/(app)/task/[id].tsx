/**
 * Task Detail screen - view task and complete sub-tasks
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    TextInput,
    Modal,
    Image,
} from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { getNsec } from '../../../lib/storage';
import {
    signLikeEvent,
    signRepostEvent,
    signReplyEvent,
    signQuoteEvent,
    signFollowEvent,
    DEFAULT_RELAYS,
} from '../../../lib/nostr';
import {
    fetchTaskById,
    publishToNostr,
    completeTask,
    type Task,
    type EligibilityStatus,
    type CompletedActions,
} from '../../../lib/api';
import ConfettiExplosion from '../../../components/ConfettiExplosion';

interface TaskDetailScreenProps {
    taskId: string;
    onBack: () => void;
}

interface SubTaskButtonProps {
    icon: string;
    label: string;
    reward: number;
    completed: boolean;
    loading: boolean;
    onPress: () => void;
    disabled?: boolean;
}

function SubTaskButton({
    icon,
    label,
    reward,
    completed,
    loading,
    onPress,
    disabled,
}: SubTaskButtonProps) {
    return (
        <TouchableOpacity
            style={[
                styles.subTaskButton,
                completed && styles.subTaskCompleted,
                disabled && styles.subTaskDisabled,
            ]}
            onPress={onPress}
            disabled={completed || loading || disabled}
        >
            <View style={styles.subTaskLeft}>
                <Text style={styles.subTaskIcon}>{icon}</Text>
                <View>
                    <Text style={[styles.subTaskLabel, completed && styles.subTaskLabelCompleted]}>
                        {label}
                    </Text>
                    {completed && <Text style={styles.completedText}>✓ Completed</Text>}
                </View>
            </View>
            <View style={styles.subTaskRight}>
                {loading ? (
                    <ActivityIndicator size="small" color="#f97316" />
                ) : (
                    <View>
                        <Text style={[styles.subTaskReward, completed && styles.subTaskRewardCompleted]}>
                            +{reward}
                        </Text>
                        <Text style={styles.satsText}>sats</Text>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
}

export default function TaskDetailScreen({ taskId, onBack }: TaskDetailScreenProps) {
    const { user } = useAuth();

    const [task, setTask] = useState<Task | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [eligibilityStatus, setEligibilityStatus] = useState<EligibilityStatus | null>(null);
    const [isOwnTask, setIsOwnTask] = useState(false);
    const [completedActions, setCompletedActions] = useState<CompletedActions>({
        like: false,
        repost: false,
        repost_with_quote: false,
        reply: false,
        follow: false,
        submitted: false,
    });

    const [loadingActions, setLoadingActions] = useState({
        like: false,
        repost: false,
        repost_with_quote: false,
        reply: false,
        follow: false,
    });

    const [replyModalVisible, setReplyModalVisible] = useState(false);
    const [quoteModalVisible, setQuoteModalVisible] = useState(false);
    const [replyContent, setReplyContent] = useState('');
    const [quoteContent, setQuoteContent] = useState('');
    const [showConfetti, setShowConfetti] = useState(false);

    useEffect(() => {
        if (taskId) {
            fetchTaskDetails();
        }
    }, [taskId]);

    const fetchTaskDetails = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const result = await fetchTaskById(taskId);

            if (result.success && result.task) {
                setTask(result.task);
                setEligibilityStatus(result.eligibilityStatus);
                setCompletedActions(result.completedActions);
                // Check if current user is the task owner
                const userIsOwner = !!(result.isOwnTask || (user?.pubkey && result.task.merchant?.pubkey === user.pubkey));
                setIsOwnTask(userIsOwner);
            } else {
                setError(result.error || 'Failed to load task');
            }
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = useCallback(
        async (actionType: 'like' | 'repost' | 'repost_with_quote' | 'reply' | 'follow', content?: string) => {
            if (!task) return;

            setLoadingActions((prev) => ({ ...prev, [actionType]: true }));

            try {
                const nsec = await getNsec();
                if (!nsec) {
                    Alert.alert('Error', 'Please log in again');
                    return;
                }

                if (!task.eventId || !task.merchant?.pubkey) {
                    Alert.alert('Error', 'Task data is incomplete');
                    return;
                }

                let signedEvent;

                switch (actionType) {
                    case 'like':
                        signedEvent = signLikeEvent(nsec, task.eventId, task.merchant.pubkey);
                        break;
                    case 'repost':
                        signedEvent = signRepostEvent(nsec, task.eventId, task.merchant.pubkey);
                        break;
                    case 'repost_with_quote':
                        if (!content) {
                            Alert.alert('Error', 'Quote content is required');
                            return;
                        }
                        signedEvent = signQuoteEvent(nsec, task.eventId, task.merchant.pubkey, content);
                        break;
                    case 'reply':
                        if (!content) {
                            Alert.alert('Error', 'Reply content is required');
                            return;
                        }
                        signedEvent = signReplyEvent(nsec, task.eventId, task.merchant.pubkey, content);
                        break;
                    case 'follow':
                        // Follow the merchant - creates a kind 3 event with the merchant in follow list
                        signedEvent = signFollowEvent(nsec, [task.merchant.pubkey]);
                        break;
                    default:
                        throw new Error('Unknown action type');
                }

                // Publish to relays
                const publishResult = await publishToNostr(signedEvent, DEFAULT_RELAYS);

                if (!publishResult.success) {
                    throw new Error(publishResult.error || 'Failed to publish');
                }

                // Complete task in backend
                // Pass replyContent for reply/quote actions - backend validates this is required
                const completeResult = await completeTask(task.id, actionType, signedEvent.id, content);

                if (completeResult.success) {
                    setCompletedActions((prev) => ({ ...prev, [actionType]: true }));
                    // Trigger confetti explosion!
                    setShowConfetti(true);
                    // Show success alert after a brief delay for visual effect
                    setTimeout(() => {
                        Alert.alert(
                            'Success! 🎉',
                            `You earned ${completeResult.reward || 0} sats!`
                        );
                    }, 300);
                } else {
                    throw new Error(completeResult.error || 'Failed to complete task');
                }
            } catch (error) {
                console.error('Action error:', error);
                const errorMessage = (error as Error).message || 'Something went wrong';
                Alert.alert(
                    'Action Failed',
                    errorMessage,
                    [{ text: 'OK', style: 'cancel' }]
                );
            } finally {
                setLoadingActions((prev) => ({ ...prev, [actionType]: false }));
                setReplyModalVisible(false);
                setQuoteModalVisible(false);
                setReplyContent('');
                setQuoteContent('');
            }
        },
        [task]
    );

    // Loading state
    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#f97316" />
                <Text style={styles.loadingText}>Loading task...</Text>
            </View>
        );
    }

    // Error state
    if (error || !task) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorText}>{error || 'Task not found'}</Text>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backButtonText}>← Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const totalEarnings =
        (completedActions.like ? task.likeReward || 0 : 0) +
        (completedActions.repost ? task.repostReward || 0 : 0) +
        (completedActions.repost_with_quote ? task.repostWithQuoteReward || 0 : 0) +
        (completedActions.reply ? task.replyReward || 0 : 0) +
        (completedActions.follow ? task.followReward || 0 : 0);

    const maxEarnings =
        (task.likeReward || 0) +
        (task.repostReward || 0) +
        (task.repostWithQuoteReward || 0) +
        (task.replyReward || 0) +
        (task.followReward || 0);

    const isEligible = eligibilityStatus?.isEligible !== false;
    const canCompleteActions = isEligible && !isOwnTask;

    // Check if all available actions are completed
    const availableActions = [
        { available: (task.likeReward || 0) > 0, completed: completedActions.like },
        { available: (task.repostReward || 0) > 0, completed: completedActions.repost },
        { available: (task.repostWithQuoteReward || 0) > 0, completed: completedActions.repost_with_quote },
        { available: (task.replyReward || 0) > 0, completed: completedActions.reply },
        { available: (task.followReward || 0) > 0, completed: completedActions.follow },
    ];
    const availableCount = availableActions.filter(a => a.available).length;
    const completedCount = availableActions.filter(a => a.available && a.completed).length;
    const isFullyCompleted = availableCount > 0 && completedCount === availableCount;

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
                {/* Back button */}
                <TouchableOpacity style={styles.headerBack} onPress={onBack}>
                    <Text style={styles.headerBackText}>← Back</Text>
                </TouchableOpacity>

                {/* Task Header */}
                <View style={styles.header}>
                    <View style={styles.merchantInfo}>
                        {task.merchant?.profilePic ? (
                            <Image
                                source={{ uri: task.merchant.profilePic }}
                                style={styles.merchantAvatar}
                            />
                        ) : (
                            <View style={styles.merchantAvatarFallback}>
                                <Text style={styles.merchantAvatarText}>
                                    {task.merchant?.displayName?.charAt(0) || '?'}
                                </Text>
                            </View>
                        )}
                        <View>
                            <Text style={styles.merchantName}>
                                {task.merchant?.displayName || 'Anonymous'}
                            </Text>
                            <View style={styles.statusRow}>
                                <View style={styles.statusBadge}>
                                    <View style={styles.statusDot} />
                                    <Text style={styles.statusText}>{task.status}</Text>
                                </View>
                                <Text style={styles.taskType}>
                                    {task.type.replace('_', ' ').toLowerCase()}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.earningsCard}>
                        <Text style={styles.earningsLabel}>Your Earnings</Text>
                        <Text style={styles.earningsValue}>
                            ⚡ {totalEarnings.toLocaleString()} / {maxEarnings.toLocaleString()}
                        </Text>
                    </View>
                </View>

                {/* Own Task Warning */}
                {isOwnTask && (
                    <View style={styles.ownTaskCard}>
                        <Text style={styles.ownTaskIcon}>👤</Text>
                        <View style={styles.eligibilityContent}>
                            <Text style={styles.ownTaskTitle}>Your Task</Text>
                            <Text style={styles.ownTaskSubtext}>You cannot complete your own task</Text>
                        </View>
                    </View>
                )}

                {/* Completed Status - shown when all actions are done */}
                {!isOwnTask && isFullyCompleted && (
                    <View style={styles.completedCard}>
                        <Text style={styles.completedIcon}>🎉</Text>
                        <View style={styles.eligibilityContent}>
                            <Text style={styles.completedTitle}>All Actions Completed!</Text>
                            <Text style={styles.completedSubtext}>You earned {totalEarnings.toLocaleString()} sats from this task</Text>
                        </View>
                    </View>
                )}

                {/* Eligibility Status - only show when not fully completed */}
                {!isOwnTask && !isFullyCompleted && !isEligible && eligibilityStatus && (
                    <View style={styles.eligibilityCard}>
                        <Text style={styles.eligibilityIcon}>🚫</Text>
                        <View style={styles.eligibilityContent}>
                            <Text style={styles.eligibilityTitle}>Not Eligible</Text>
                            <Text style={styles.eligibilityReason}>
                                {eligibilityStatus.reason || 'You do not meet the requirements for this task'}
                            </Text>
                        </View>
                    </View>
                )}

                {!isOwnTask && !isFullyCompleted && isEligible && (
                    <View style={styles.eligibleCard}>
                        <Text style={styles.eligibleIcon}>✅</Text>
                        <View style={styles.eligibilityContent}>
                            <Text style={styles.eligibleTitle}>Eligible</Text>
                            <Text style={styles.eligibleSubtext}>You can complete this task</Text>
                        </View>
                    </View>
                )}

                {/* Task Content */}
                <View style={styles.taskContent}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    {task.description ? (
                        <Text style={styles.taskDescription}>{task.description}</Text>
                    ) : null}
                    <View style={styles.budgetRow}>
                        <Text style={styles.budgetLabel}>Budget Remaining:</Text>
                        <Text style={styles.budgetValue}>
                            {task.remainingBudget?.toLocaleString()} sats
                        </Text>
                    </View>
                </View>

                {/* Sub-Tasks */}
                <View style={styles.subTasksSection}>
                    <Text style={styles.sectionTitle}>Complete Actions to Earn</Text>

                    {task.likeReward && task.likeReward > 0 ? (
                        <SubTaskButton
                            icon="❤️"
                            label="Like"
                            reward={task.likeReward}
                            completed={completedActions.like}
                            loading={loadingActions.like}
                            onPress={() => handleAction('like')}
                            disabled={!canCompleteActions}
                        />
                    ) : null}

                    {task.repostReward && task.repostReward > 0 ? (
                        <SubTaskButton
                            icon="🔄"
                            label="Repost"
                            reward={task.repostReward}
                            completed={completedActions.repost}
                            loading={loadingActions.repost}
                            onPress={() => handleAction('repost')}
                            disabled={!canCompleteActions}
                        />
                    ) : null}

                    {task.repostWithQuoteReward && task.repostWithQuoteReward > 0 ? (
                        <SubTaskButton
                            icon="💬"
                            label="Quote Repost"
                            reward={task.repostWithQuoteReward}
                            completed={completedActions.repost_with_quote}
                            loading={loadingActions.repost_with_quote}
                            onPress={() => setQuoteModalVisible(true)}
                            disabled={!canCompleteActions}
                        />
                    ) : null}

                    {task.replyReward && task.replyReward > 0 ? (
                        <SubTaskButton
                            icon="↩️"
                            label="Reply"
                            reward={task.replyReward}
                            completed={completedActions.reply}
                            loading={loadingActions.reply}
                            onPress={() => setReplyModalVisible(true)}
                            disabled={!canCompleteActions}
                        />
                    ) : null}

                    {task.followReward && task.followReward > 0 ? (
                        <SubTaskButton
                            icon="👤"
                            label="Follow"
                            reward={task.followReward}
                            completed={completedActions.follow}
                            loading={loadingActions.follow}
                            onPress={() => handleAction('follow')}
                            disabled={!canCompleteActions}
                        />
                    ) : null}
                </View>

                {/* Reply Modal */}
                <Modal visible={replyModalVisible} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Write your reply</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Enter your reply..."
                                placeholderTextColor="#666"
                                value={replyContent}
                                onChangeText={setReplyContent}
                                multiline
                                numberOfLines={4}
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={styles.modalCancelButton}
                                    onPress={() => {
                                        setReplyModalVisible(false);
                                        setReplyContent('');
                                    }}
                                >
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalSubmitButton, !replyContent && styles.modalSubmitDisabled]}
                                    onPress={() => handleAction('reply', replyContent)}
                                    disabled={!replyContent || loadingActions.reply}
                                >
                                    {loadingActions.reply ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.modalSubmitText}>Submit Reply</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Quote Modal */}
                <Modal visible={quoteModalVisible} animationType="slide" transparent>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Add your comment</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Add your thoughts..."
                                placeholderTextColor="#666"
                                value={quoteContent}
                                onChangeText={setQuoteContent}
                                multiline
                                numberOfLines={4}
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={styles.modalCancelButton}
                                    onPress={() => {
                                        setQuoteModalVisible(false);
                                        setQuoteContent('');
                                    }}
                                >
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalSubmitButton, !quoteContent && styles.modalSubmitDisabled]}
                                    onPress={() => handleAction('repost_with_quote', quoteContent)}
                                    disabled={!quoteContent || loadingActions.repost_with_quote}
                                >
                                    {loadingActions.repost_with_quote ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.modalSubmitText}>Submit Quote</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </ScrollView>

            {/* Confetti celebration effect */}
            <ConfettiExplosion
                isActive={showConfetti}
                onComplete={() => setShowConfetti(false)}
                particleCount={60}
                duration={2500}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    content: {
        padding: 20,
        paddingTop: 60,
    },
    scrollView: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
    },
    loadingText: {
        color: '#71717a',
        marginTop: 12,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a0a0a',
        padding: 20,
    },
    errorIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    errorText: {
        color: '#ef4444',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
    },
    backButton: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    backButtonText: {
        color: '#fff',
        fontWeight: '600',
    },
    headerBack: {
        marginBottom: 16,
    },
    headerBackText: {
        color: '#71717a',
        fontSize: 16,
    },
    header: {
        marginBottom: 24,
    },
    merchantInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    merchantAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 12,
    },
    merchantAvatarFallback: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    merchantAvatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    merchantName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 8,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#052e16',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#22c55e',
        marginRight: 4,
    },
    statusText: {
        fontSize: 11,
        color: '#22c55e',
        fontWeight: '500',
    },
    taskType: {
        fontSize: 13,
        color: '#71717a',
        textTransform: 'capitalize',
    },
    earningsCard: {
        backgroundColor: '#18181b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    earningsLabel: {
        fontSize: 12,
        color: '#71717a',
        marginBottom: 4,
    },
    earningsValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fbbf24',
    },
    eligibilityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#451a03',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#78350f',
    },
    eligibilityIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    eligibilityContent: {
        flex: 1,
    },
    eligibilityTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fbbf24',
        marginBottom: 4,
    },
    eligibilityReason: {
        fontSize: 13,
        color: '#fcd34d',
    },
    eligibleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#052e16',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#166534',
    },
    eligibleIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    eligibleTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#22c55e',
        marginBottom: 4,
    },
    eligibleSubtext: {
        fontSize: 13,
        color: '#86efac',
    },
    completedCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    completedIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    completedTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#10b981',
        marginBottom: 4,
    },
    completedSubtext: {
        fontSize: 13,
        color: '#6ee7b7',
    },
    taskContent: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    taskTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 12,
    },
    taskDescription: {
        fontSize: 15,
        color: '#a1a1aa',
        lineHeight: 22,
        marginBottom: 16,
    },
    budgetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    budgetLabel: {
        fontSize: 13,
        color: '#71717a',
    },
    budgetValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#f97316',
    },
    subTasksSection: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 16,
    },
    subTaskButton: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#18181b',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    subTaskCompleted: {
        backgroundColor: '#052e16',
        borderColor: '#166534',
    },
    subTaskDisabled: {
        opacity: 0.5,
    },
    subTaskLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    subTaskIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    subTaskLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    subTaskLabelCompleted: {
        color: '#22c55e',
    },
    completedText: {
        fontSize: 12,
        color: '#22c55e',
        marginTop: 2,
    },
    subTaskRight: {
        alignItems: 'flex-end',
    },
    subTaskReward: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fbbf24',
    },
    subTaskRewardCompleted: {
        color: '#22c55e',
    },
    satsText: {
        fontSize: 11,
        color: '#71717a',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
    },
    modalInput: {
        backgroundColor: '#27272a',
        borderRadius: 12,
        padding: 16,
        color: '#fff',
        fontSize: 16,
        minHeight: 100,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalCancelButton: {
        flex: 1,
        padding: 14,
        backgroundColor: '#27272a',
        borderRadius: 10,
        alignItems: 'center',
    },
    modalCancelText: {
        color: '#a1a1aa',
        fontWeight: '600',
    },
    modalSubmitButton: {
        flex: 1,
        padding: 14,
        backgroundColor: '#f97316',
        borderRadius: 10,
        alignItems: 'center',
    },
    modalSubmitDisabled: {
        opacity: 0.5,
    },
    modalSubmitText: {
        color: '#fff',
        fontWeight: '600',
    },
    ownTaskCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#27272a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#3f3f46',
    },
    ownTaskIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    ownTaskTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#a1a1aa',
        marginBottom: 4,
    },
    ownTaskSubtext: {
        fontSize: 13,
        color: '#71717a',
    },
});
