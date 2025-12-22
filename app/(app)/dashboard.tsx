/**
 * Dashboard screen - displays active tasks with filtering
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    Animated,
    FlatList,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    ActivityIndicator,
    Image,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import {
    fetchAvailableTasks,
    type Task,
    type CompletedActions,
} from '../../lib/api';
import { HeaderBar } from '../../components/HeaderBar';
import { TaskCard } from '../../components/TaskCard';

type FilterTab = 'eligible' | 'notEligible' | 'completed';

interface DashboardScreenProps {
    onTaskSelect: (taskId: string) => void;
    onSwitchToMerchant?: () => void;
    onScroll?: (event: any) => void;
    onViewProfileStats?: () => void;
    onViewMerchantSettings?: () => void;
    onNavigateToTasks?: () => void;
}

export default function DashboardScreen({
    onTaskSelect,
    onSwitchToMerchant,
    onScroll,
    onViewProfileStats,
    onViewMerchantSettings,
    onNavigateToTasks
}: DashboardScreenProps) {
    const { user, logout, refreshProfile } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [taskEligibility, setTaskEligibility] = useState<Record<string, { isEligible: boolean; reason?: string; failedRequirements: string[] }>>({});
    const [taskCompletions, setTaskCompletions] = useState<Record<string, CompletedActions>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterTab>('eligible');

    const fetchTasks = useCallback(async () => {
        try {
            // Pass user's pubkey to get eligibility and completion status
            const result = await fetchAvailableTasks(user?.pubkey);
            if (result.success) {
                setTasks(result.tasks);
                setTaskEligibility(result.taskEligibility || {});
                setTaskCompletions(result.taskCompletions || {});
            } else {
                console.error('Failed to fetch tasks:', result.error);
                setTasks([]);
            }
        } catch (error) {
            console.error('Error fetching tasks:', error);
            setTasks([]);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, [user?.pubkey]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshProfile();
        await fetchTasks();
    };

    // Helper to check if all actions for a task are completed
    const isTaskFullyCompleted = useCallback((taskId: string, task: Task) => {
        const completions = taskCompletions[taskId];
        if (!completions) return false;

        if (task.type === 'NOSTR_BOOST') {
            const availableActions = [
                { available: (task.likeReward || 0) > 0, completed: completions.like },
                { available: (task.repostReward || 0) > 0, completed: completions.repost },
                { available: (task.repostWithQuoteReward || 0) > 0, completed: completions.repost_with_quote },
                { available: (task.replyReward || 0) > 0, completed: completions.reply },
                { available: (task.followReward || 0) > 0, completed: completions.follow },
            ];
            const availableCount = availableActions.filter(a => a.available).length;
            const completedCount = availableActions.filter(a => a.available && a.completed).length;
            return availableCount > 0 && completedCount === availableCount;
        }
        return completions.submitted;
    }, [taskCompletions]);

    // Filter tasks by eligibility and completion
    const filteredTasks = useMemo(() => {
        return tasks.filter((task) => {
            const isCompleted = isTaskFullyCompleted(task.id, task);
            const eligibility = taskEligibility[task.id];
            const isEligible = eligibility?.isEligible !== false;

            switch (activeFilter) {
                case 'eligible':
                    return isEligible && !isCompleted;
                case 'notEligible':
                    return !isEligible && !isCompleted;
                case 'completed':
                    return isCompleted;
                default:
                    return true;
            }
        });
    }, [tasks, activeFilter, taskEligibility, isTaskFullyCompleted]);

    // Count tasks in each category
    const counts = useMemo(() => {
        let eligible = 0;
        let notEligible = 0;
        let completed = 0;

        tasks.forEach((task) => {
            const isCompleted = isTaskFullyCompleted(task.id, task);
            const eligibility = taskEligibility[task.id];
            const isEligible = eligibility?.isEligible !== false;

            if (isCompleted) {
                completed++;
            } else if (isEligible) {
                eligible++;
            } else {
                notEligible++;
            }
        });

        return { eligible, notEligible, completed };
    }, [tasks, taskEligibility, isTaskFullyCompleted]);

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#f97316" />
                <Text style={styles.loadingText}>Loading tasks...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header with Logo and Profile */}
            <HeaderBar
                user={user}
                onLogout={logout}
                onViewMerchantSettings={onViewMerchantSettings}
                onNavigateToTasks={onNavigateToTasks}
            />


            {/* Section Header */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Available Tasks</Text>
                <Text style={styles.sectionSubtitle}>Complete tasks to earn bitcoin</Text>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterTabs}>
                <TouchableOpacity
                    style={[styles.filterTab, activeFilter === 'eligible' && styles.filterTabActive]}
                    onPress={() => setActiveFilter('eligible')}
                >
                    <Text style={[styles.filterTabText, activeFilter === 'eligible' && styles.filterTabTextActive]}>
                        Eligible ({counts.eligible})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterTab, activeFilter === 'notEligible' && styles.filterTabActive]}
                    onPress={() => setActiveFilter('notEligible')}
                >
                    <Text style={[styles.filterTabText, activeFilter === 'notEligible' && styles.filterTabTextActive]}>
                        Not Eligible ({counts.notEligible})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.filterTab, activeFilter === 'completed' && styles.filterTabActive]}
                    onPress={() => setActiveFilter('completed')}
                >
                    <Text style={[styles.filterTabText, activeFilter === 'completed' && styles.filterTabTextActive]}>
                        Completed ({counts.completed})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Task List */}
            <Animated.FlatList
                data={filteredTasks}
                keyExtractor={(item) => item.id}
                onScroll={onScroll}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                    <TaskCard
                        task={item}
                        onPress={() => onTaskSelect(item.id)}
                        isCompleted={isTaskFullyCompleted(item.id, item)}
                        isEligible={taskEligibility[item.id]?.isEligible !== false}
                        trustScore={user?.trustScore}
                        minTrustScore={50}
                    />
                )}
                contentContainerStyle={styles.taskList}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor="#f97316"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>
                            {activeFilter === 'completed' ? '🎉' : activeFilter === 'notEligible' ? '🚫' : '📭'}
                        </Text>
                        <Text style={styles.emptyText}>
                            {activeFilter === 'completed'
                                ? 'No completed tasks yet'
                                : activeFilter === 'notEligible'
                                    ? 'No tasks you\'re ineligible for'
                                    : 'No eligible tasks available'}
                        </Text>
                        <Text style={styles.emptySubtext}>Pull down to refresh</Text>
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 60,
        backgroundColor: '#18181b',
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatarContainer: {
        marginRight: 12,
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    avatarImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    profileInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    nip05: {
        fontSize: 12,
        color: '#22c55e',
        marginTop: 2,
    },
    npubSmall: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 2,
    },
    logoutButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    logoutText: {
        fontSize: 18,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    merchantButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    merchantButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#2563eb',
    },
    statsContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: '#18181b',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#f97316',
    },
    statLabel: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 4,
    },
    trustScoreCard: {
        borderWidth: 1,
        borderColor: '#22c55e',
    },
    trustScoreValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#22c55e',
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
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
    filterTabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingBottom: 12,
        gap: 8,
    },
    filterTab: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#27272a',
    },
    filterTabActive: {
        backgroundColor: '#f97316',
    },
    filterTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#a1a1aa',
    },
    filterTabTextActive: {
        color: '#fff',
    },
    taskList: {
        padding: 16,
        paddingTop: 0,
    },
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
    taskHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#27272a',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    taskIconText: {
        fontSize: 20,
    },
    taskInfo: {
        flex: 1,
    },
    taskTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    taskMerchant: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 2,
    },
    rewardBadge: {
        alignItems: 'flex-end',
    },
    rewardText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fbbf24',
    },
    rewardTextCompleted: {
        color: '#22c55e',
    },
    satsText: {
        fontSize: 11,
        color: '#71717a',
    },
    badgesRow: {
        flexDirection: 'row',
        marginTop: 12,
        gap: 8,
    },
    completedBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
    },
    completedBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#10b981',
    },
    eligibilityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    eligibleBadge: {
        backgroundColor: '#365314',
    },
    notEligibleBadge: {
        backgroundColor: '#451a03',
    },
    eligibilityBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    eligibleText: {
        color: '#84cc16',
    },
    notEligibleText: {
        color: '#fbbf24',
    },
    taskDescription: {
        fontSize: 13,
        color: '#a1a1aa',
        marginTop: 12,
        lineHeight: 18,
    },
    taskFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#22c55e',
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        color: '#22c55e',
        fontWeight: '500',
    },
    budgetText: {
        fontSize: 12,
        color: '#71717a',
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
        fontSize: 16,
        color: '#71717a',
        fontWeight: '500',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#52525b',
        marginTop: 4,
    },

});
