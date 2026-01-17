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
    Linking,
} from 'react-native';
import { nip19 } from 'nostr-tools';
import { useAuth } from '../../../contexts/AuthContext';
import { DEFAULT_RELAYS } from '../../../lib/nostr';
import {
    fetchTaskById,
    publishToNostr,
    completeTask,
    type Task,
    type EligibilityStatus,
    type CompletedActions,
} from '../../../lib/api';
import ConfettiExplosion from '../../../components/ConfettiExplosion';
import FollowModal from '../../../components/FollowModal';

const MIN_CONTENT_LENGTH = 10;

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
    const { user, signEvent } = useAuth();

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
    const [isContentExpanded, setIsContentExpanded] = useState(false);
    const [followModalVisible, setFollowModalVisible] = useState(false);


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

    // Helper function to extract image URLs from content
    const extractImages = (content: string): string[] => {
        const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s]*)?)/gi;
        const imgurRegex = /(https?:\/\/i\.imgur\.com\/[^\s]+)/gi;
        const matches = [...(content.match(imageRegex) || []), ...(content.match(imgurRegex) || [])];
        return [...new Set(matches)]; // Remove duplicates
    };

    // Helper function to clean content by removing media URLs
    const cleanContent = (content: string): string => {
        const imageRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|bmp|svg)(?:\?[^\s]*)?)/gi;
        const videoRegex = /(https?:\/\/[^\s]+\.(?:mp4|webm|ogg|mov)(?:\?[^\s]*)?)/gi;
        const imgurRegex = /(https?:\/\/i\.imgur\.com\/[^\s]+)/gi;
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=[^\s]+|youtu\.be\/[^\s]+)/gi;
        const nostrRegex = /nostr:[a-zA-Z0-9_\-]+/gi;

        return content
            .replace(imageRegex, '')
            .replace(videoRegex, '')
            .replace(imgurRegex, '')
            .replace(youtubeRegex, '')
            .replace(nostrRegex, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const handleViewEvent = () => {
        if (task?.eventId) {
            Linking.openURL(`https://primal.net/e/${task.eventId}`);
        }
    };

    const handleAction = useCallback(
        async (actionType: 'like' | 'repost' | 'repost_with_quote' | 'reply' | 'follow', content?: string) => {
            if (!task) return;

            setLoadingActions((prev) => ({ ...prev, [actionType]: true }));

            try {
                if (!task.eventId || !task.merchant?.pubkey) {
                    Alert.alert('Error', 'Task data is incomplete');
                    return;
                }

                // Build unsigned event based on action type (NIP-46 remote signer will add pubkey and sign)
                let unsignedEvent: { kind: number; created_at: number; tags: string[][]; content: string };

                switch (actionType) {
                    case 'like':
                        // Kind 7 - reaction event
                        unsignedEvent = {
                            kind: 7,
                            created_at: Math.floor(Date.now() / 1000),
                            tags: [
                                ['e', task.eventId],
                                ['p', task.merchant.pubkey],
                            ],
                            content: '+',
                        };
                        break;
                    case 'repost':
                        // Kind 6 - repost event (NIP-18)
                        unsignedEvent = {
                            kind: 6,
                            created_at: Math.floor(Date.now() / 1000),
                            tags: [
                                ['e', task.eventId, DEFAULT_RELAYS[0]],
                                ['p', task.merchant.pubkey],
                            ],
                            content: '',
                        };
                        break;
                    case 'repost_with_quote':
                        if (!content) {
                            Alert.alert('Error', 'Quote content is required');
                            return;
                        }
                        // Kind 1 with q tag - quote repost
                        const noteId = nip19.noteEncode(task.eventId);
                        unsignedEvent = {
                            kind: 1,
                            created_at: Math.floor(Date.now() / 1000),
                            tags: [
                                ['e', task.eventId, '', 'mention'],
                                ['p', task.merchant.pubkey],
                                ['q', task.eventId],
                            ],
                            content: `${content} nostr:${noteId}`,
                        };
                        break;
                    case 'reply':
                        if (!content) {
                            Alert.alert('Error', 'Reply content is required');
                            return;
                        }
                        // Kind 1 with e tag - reply event
                        unsignedEvent = {
                            kind: 1,
                            created_at: Math.floor(Date.now() / 1000),
                            tags: [
                                ['e', task.eventId, '', 'reply'],
                                ['p', task.merchant.pubkey],
                            ],
                            content: content,
                        };
                        break;
                    default:
                        throw new Error('Unknown action type');
                }

                // Sign via NIP-46 remote signer (Primal/Amber)
                const signedEvent = await signEvent(unsignedEvent);

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

                // Check if it's a NIP-46 session issue
                if (errorMessage.includes('session') || errorMessage.includes('log out') || errorMessage.includes('NIP-46')) {
                    Alert.alert(
                        'Signing Session Expired',
                        'Unable to sign with remote signer. Please log out and log back in to restore your signing session.',
                        [{ text: 'OK', style: 'cancel' }]
                    );
                } else {
                    Alert.alert(
                        'Action Failed',
                        errorMessage,
                        [{ text: 'OK', style: 'cancel' }]
                    );
                }
            } finally {
                setLoadingActions((prev) => ({ ...prev, [actionType]: false }));
                setReplyModalVisible(false);
                setQuoteModalVisible(false);
                setReplyContent('');
                setQuoteContent('');
            }
        },
        [task, signEvent]
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
    // Disable actions if NIP-05 is required but user doesn't have one
    const hasNip05Issue = task.nip05Verified === true && !user?.nip05;
    const canCompleteActions = isEligible && !isOwnTask && !hasNip05Issue;

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
                </View>

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Your Earnings</Text>
                        <View style={styles.statValueContainer}>
                            <Text style={styles.statValue}>⚡ {totalEarnings.toLocaleString()}</Text>
                            <Text style={styles.statSubValue}>/ {maxEarnings.toLocaleString()}</Text>
                        </View>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statLabel}>Remaining</Text>
                        <View style={styles.statValueContainer}>
                            <Text style={styles.statValue}>{task.remainingBudget?.toLocaleString()}</Text>
                            <Text style={styles.statSubValue}> sats</Text>
                        </View>
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

                {/* NIP-05 Required Warning */}
                {!isOwnTask && !isFullyCompleted && task.nip05Verified === true && !user?.nip05 && (
                    <View style={styles.nip05WarningCard}>
                        <Text style={styles.nip05WarningIcon}>⚠️</Text>
                        <View style={styles.nip05WarningContent}>
                            <Text style={styles.nip05WarningTitle}>Nostr Address Required</Text>
                            <Text style={styles.nip05WarningText}>
                                This task requires a verified Nostr address (NIP-05) to help reduce spam. Set up your Nostr address to participate.
                            </Text>
                            <TouchableOpacity
                                style={styles.nip05LinkButton}
                                onPress={() => {
                                    const npub = user?.npub || '';
                                    const url = `https://nip-05.com?npub=${npub}`;
                                    Linking.openURL(url);
                                }}
                            >
                                <Text style={styles.nip05LinkButtonText}>Get a Nostr Address →</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}


                {/* Original Post Content */}
                {task.type === 'NOSTR_BOOST' && task.eventContent && (
                    <View style={styles.contentSection}>
                        <View style={styles.contentHeader}>
                            <View style={styles.contentHeaderLeft}>
                                {task.merchant?.profilePic ? (
                                    <Image
                                        source={{ uri: task.merchant.profilePic }}
                                        style={styles.contentAuthorAvatar}
                                    />
                                ) : (
                                    <View style={styles.contentAuthorAvatarFallback}>
                                        <Text style={styles.contentAuthorAvatarText}>
                                            {task.merchant?.displayName?.charAt(0) || '?'}
                                        </Text>
                                    </View>
                                )}
                                <Text style={styles.contentAuthorName}>
                                    {task.merchant?.displayName || 'Anonymous'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={handleViewEvent} style={styles.viewLink}>
                                <Text style={styles.viewLinkIcon}>↗</Text>
                                <Text style={styles.viewLinkText}>View</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Post Text Content */}
                        {cleanContent(task.eventContent) ? (
                            <View>
                                <Text style={styles.originalPostText}>
                                    {isContentExpanded
                                        ? cleanContent(task.eventContent)
                                        : cleanContent(task.eventContent).slice(0, 240) + (cleanContent(task.eventContent).length > 240 ? '...' : '')
                                    }
                                </Text>
                                {cleanContent(task.eventContent).length > 240 && (
                                    <TouchableOpacity
                                        onPress={() => setIsContentExpanded(!isContentExpanded)}
                                        style={styles.readMoreButton}
                                    >
                                        <Text style={styles.readMoreText}>
                                            {isContentExpanded ? 'Show less' : 'Read more'}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ) : null}

                        {/* Post Images */}
                        {extractImages(task.eventContent).length > 0 && (
                            <View style={styles.originalPostImages}>
                                {extractImages(task.eventContent).map((imageUrl, idx) => (
                                    <Image
                                        key={idx}
                                        source={{ uri: imageUrl }}
                                        style={styles.originalPostImage}
                                        resizeMode="cover"
                                    />
                                ))}
                            </View>
                        )}
                    </View>
                )}

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
                            onPress={() => {
                                if (!canCompleteActions || completedActions.repost_with_quote) return;
                                setQuoteModalVisible(true);
                            }}
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
                            onPress={() => {
                                if (!canCompleteActions || completedActions.reply) return;
                                setReplyModalVisible(true);
                            }}
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
                            onPress={() => setFollowModalVisible(true)}
                            disabled={!canCompleteActions}
                        />
                    ) : null}
                </View>

                {/* Follow Confirmation Modal */}
                {task && user?.pubkey && (
                    <FollowModal
                        isOpen={followModalVisible}
                        onClose={() => setFollowModalVisible(false)}
                        userPubkey={user.pubkey}
                        targetPubkey={task.merchant?.pubkey || ''}
                        targetDisplayName={task.merchant?.displayName}
                        onSuccess={async (result) => {
                            setFollowModalVisible(false);
                            setLoadingActions((prev) => ({ ...prev, follow: true }));

                            try {
                                // Complete task in backend
                                const completeResult = await completeTask(
                                    task.id,
                                    'follow',
                                    result.signedEvent?.id || 'already_following'
                                );

                                if (completeResult.success) {
                                    setCompletedActions((prev) => ({ ...prev, follow: true }));
                                    setShowConfetti(true);
                                    setTimeout(() => {
                                        const reward = completeResult.reward || 0;
                                        const message = result.alreadyFollowing
                                            ? `Already following! You earned ${reward} sats!`
                                            : `Success! 🎉 You earned ${reward} sats!`;
                                        Alert.alert('Done!', message);
                                    }, 300);
                                } else {
                                    throw new Error(completeResult.error || 'Failed to complete task');
                                }
                            } catch (error) {
                                console.error('Follow success handler error:', error);
                                Alert.alert('Action Failed', (error as Error).message);
                            } finally {
                                setLoadingActions((prev) => ({ ...prev, follow: false }));
                            }
                        }}
                    />
                )}

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
                                maxLength={280}
                            />
                            <View style={styles.charCountRow}>
                                <Text style={[
                                    styles.charCountText,
                                    replyContent.trim().length > 0 && replyContent.trim().length < MIN_CONTENT_LENGTH && styles.charCountWarning
                                ]}>
                                    {replyContent.length}/280 characters{replyContent.trim().length > 0 && replyContent.trim().length < MIN_CONTENT_LENGTH ? ` (min ${MIN_CONTENT_LENGTH})` : ''}
                                </Text>
                            </View>
                            <View style={styles.noticeBox}>
                                <Text style={styles.noticeIcon}>ℹ️</Text>
                                <Text style={styles.noticeText}>
                                    Please add a genuine, thoughtful response that contributes to the conversation.
                                </Text>
                            </View>
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
                                    style={[styles.modalSubmitButton, replyContent.trim().length < MIN_CONTENT_LENGTH && styles.modalSubmitDisabled]}
                                    onPress={() => handleAction('reply', replyContent)}
                                    disabled={replyContent.trim().length < MIN_CONTENT_LENGTH || loadingActions.reply}
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
                                maxLength={280}
                            />
                            <View style={styles.charCountRow}>
                                <Text style={[
                                    styles.charCountText,
                                    quoteContent.trim().length > 0 && quoteContent.trim().length < MIN_CONTENT_LENGTH && styles.charCountWarning
                                ]}>
                                    {quoteContent.length}/280 characters{quoteContent.trim().length > 0 && quoteContent.trim().length < MIN_CONTENT_LENGTH ? ` (min ${MIN_CONTENT_LENGTH})` : ''}
                                </Text>
                            </View>
                            <View style={styles.noticeBox}>
                                <Text style={styles.noticeIcon}>ℹ️</Text>
                                <Text style={styles.noticeText}>
                                    Please add a genuine, thoughtful response that contributes to the conversation.
                                </Text>
                            </View>
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
                                    style={[styles.modalSubmitButton, quoteContent.trim().length < MIN_CONTENT_LENGTH && styles.modalSubmitDisabled]}
                                    onPress={() => handleAction('repost_with_quote', quoteContent)}
                                    disabled={quoteContent.trim().length < MIN_CONTENT_LENGTH || loadingActions.repost_with_quote}
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
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#18181b',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#71717a',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    statValueContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#f97316',
    },
    statSubValue: {
        fontSize: 12,
        color: '#71717a',
        marginLeft: 2,
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
    nip05WarningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#451a03',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#92400e',
    },
    nip05WarningIcon: {
        fontSize: 24,
        marginRight: 12,
    },
    nip05WarningContent: {
        flex: 1,
    },
    nip05WarningTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fbbf24',
        marginBottom: 4,
    },
    nip05WarningText: {
        fontSize: 13,
        color: '#fcd34d',
        marginBottom: 12,
    },
    nip05LinkButton: {
        backgroundColor: '#f59e0b',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    nip05LinkButtonText: {
        color: '#18181b',
        fontWeight: '600',
        fontSize: 14,
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
    // Content Section (Matches TaskCard.tsx)
    contentSection: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    contentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
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
    originalPostText: {
        fontSize: 14,
        color: '#a1a1aa',
        lineHeight: 20,
        marginBottom: 12,
    },
    originalPostImages: {
        marginTop: 4,
        marginBottom: 12,
    },
    originalPostImage: {
        width: '100%',
        height: 200,
        borderRadius: 12,
        marginBottom: 8,
        backgroundColor: '#27272a',
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
    contentAuthorAvatarFallback: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 6,
    },
    contentAuthorAvatarText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
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
    readMoreButton: {
        marginTop: 4,
        marginBottom: 8,
    },
    readMoreText: {
        color: '#f97316',
        fontSize: 13,
        fontWeight: '600',
    },
    charCountRow: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginTop: 8,
        marginBottom: 12,
    },
    charCountText: {
        fontSize: 12,
        color: '#71717a',
    },
    charCountWarning: {
        color: '#f59e0b',
    },
    noticeBox: {
        flexDirection: 'row',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(59, 130, 246, 0.3)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
        alignItems: 'flex-start',
        gap: 8,
    },
    noticeIcon: {
        fontSize: 14,
    },
    noticeText: {
        flex: 1,
        fontSize: 13,
        color: '#60a5fa',
        lineHeight: 18,
    },
});
