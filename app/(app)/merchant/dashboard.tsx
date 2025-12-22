/**
 * MerchantDashboard - Displays merchant's campaigns with filtering
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
import { useAuth } from '../../../contexts/AuthContext';
import {
    fetchMerchantTasks,
    type MerchantTask,
} from '../../../lib/api';
import MerchantCampaignCard from '../../../components/MerchantCampaignCard';
import { HeaderBar } from '../../../components/HeaderBar';
import CreateCampaignScreen from './CreateCampaignScreen';
import MerchantSettingsScreen from './MerchantSettingsScreen';

type FilterTab = 'all' | 'active' | 'pending' | 'paused' | 'stopped' | 'completed';

interface MerchantDashboardProps {
    onSwitchToUser: () => void;
    onScroll?: (event: any) => void;
    onViewProfileStats?: () => void;
    onViewMerchantSettings?: () => void;
    initialEventId?: string;
    onClearInitialEventId?: () => void;
    isBoostFollowingMode?: boolean;
    onClearBoostFollowingMode?: () => void;
    targetPubkey?: string;
    onClearTargetPubkey?: () => void;
    onToggleNav?: (hidden: boolean) => void;
    onNavigateToTasks?: () => void;
}

export default function MerchantDashboard({
    onSwitchToUser,
    onScroll,
    onViewProfileStats,
    onViewMerchantSettings,
    initialEventId,
    onClearInitialEventId,
    isBoostFollowingMode,
    onClearBoostFollowingMode,
    targetPubkey,
    onClearTargetPubkey,
    onToggleNav,
    onNavigateToTasks
}: MerchantDashboardProps) {
    const { user, logout, refreshProfile } = useAuth();
    const [campaigns, setCampaigns] = useState<MerchantTask[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
    const [error, setError] = useState<string | null>(null);
    const [showCreateScreen, setShowCreateScreen] = useState(false);
    const [showSettingsScreen, setShowSettingsScreen] = useState(false);

    const fetchCampaigns = useCallback(async () => {
        try {
            setError(null);
            const result = await fetchMerchantTasks();
            if (result.success) {
                setCampaigns(result.tasks);
            } else {
                console.error('Failed to fetch campaigns:', result.error);
                setError(result.error || 'Failed to fetch campaigns');
                setCampaigns([]);
            }
        } catch (err) {
            console.error('Error fetching campaigns:', err);
            setError('Network error. Please check your connection.');
            setCampaigns([]);
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // Auto-open create screen if initialEventId is provided
    useEffect(() => {
        if (initialEventId || isBoostFollowingMode) {
            setShowCreateScreen(true);
        }
    }, [initialEventId, isBoostFollowingMode]);

    // Handle navigation hiding
    useEffect(() => {
        onToggleNav?.(showCreateScreen);
    }, [showCreateScreen, onToggleNav]);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        await refreshProfile();
        await fetchCampaigns();
    };

    // Filter campaigns based on active tab
    const filteredCampaigns = useMemo(() => {
        return campaigns.filter((campaign) => {
            switch (activeFilter) {
                case 'active':
                    return campaign.status === 'ACTIVE' && campaign.paymentStatus === 'PAID';
                case 'pending':
                    return campaign.status === 'PENDING_PAYMENT' && campaign.paymentStatus === 'UNPAID';
                case 'paused':
                    return campaign.status === 'PAUSED';
                case 'stopped':
                    return campaign.status === 'STOPPED';
                case 'completed':
                    return campaign.status === 'COMPLETED';
                default:
                    return true;
            }
        });
    }, [campaigns, activeFilter]);

    // Calculate counts for tabs
    const counts = useMemo(() => {
        return {
            all: campaigns.length,
            active: campaigns.filter(c => c.status === 'ACTIVE' && c.paymentStatus === 'PAID').length,
            pending: campaigns.filter(c => c.status === 'PENDING_PAYMENT' && c.paymentStatus === 'UNPAID').length,
            paused: campaigns.filter(c => c.status === 'PAUSED').length,
            stopped: campaigns.filter(c => c.status === 'STOPPED').length,
            completed: campaigns.filter(c => c.status === 'COMPLETED').length,
        };
    }, [campaigns]);

    const handleCreateCampaign = () => {
        setShowCreateScreen(true);
    };

    const handleCampaignCreated = () => {
        setShowCreateScreen(false);
        fetchCampaigns();
    };

    // Show settings screen
    if (showSettingsScreen) {
        return (
            <MerchantSettingsScreen
                onBack={() => setShowSettingsScreen(false)}
            />
        );
    }

    // Show create campaign screen when in create mode
    if (showCreateScreen) {
        return (
            <CreateCampaignScreen
                onBack={() => {
                    setShowCreateScreen(false);
                    onClearInitialEventId?.();
                    onClearBoostFollowingMode?.();
                    onClearTargetPubkey?.();
                }}
                onCampaignCreated={handleCampaignCreated}
                initialEventId={initialEventId}
                onOpenSettings={() => {
                    setShowCreateScreen(false);
                    setShowSettingsScreen(true);
                }}
                isBoostFollowingMode={isBoostFollowingMode}
                onClearBoostFollowingMode={onClearBoostFollowingMode}
                targetPubkey={targetPubkey}
                onClearTargetPubkey={onClearTargetPubkey}
            />
        );
    }

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#f97316" />
                <Text style={styles.loadingText}>Loading campaigns...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <HeaderBar
                user={user}
                onLogout={logout}
                onViewMerchantSettings={onViewMerchantSettings}
                onNavigateToTasks={onNavigateToTasks}
            />

            {/* Section Header */}
            <View style={styles.sectionHeader}>
                <View>
                    <Text style={styles.sectionTitle}>Your Campaigns</Text>
                    <Text style={styles.sectionSubtitle}>Manage and track your campaigns</Text>
                </View>
                <View style={styles.headerButtons}>
                    <TouchableOpacity
                        style={styles.settingsButton}
                        onPress={() => setShowSettingsScreen(true)}
                    >
                        <Text style={styles.settingsButtonText}>⚙️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.createButton}
                        onPress={handleCreateCampaign}
                    >
                        <Text style={styles.createButtonText}>+ Create</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Filter Tabs - Scrollable */}
            <View style={styles.filterTabsContainer}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={[
                        { key: 'all' as FilterTab, label: 'All', count: counts.all },
                        { key: 'active' as FilterTab, label: 'Active', count: counts.active },
                        { key: 'pending' as FilterTab, label: 'Pending', count: counts.pending },
                        { key: 'paused' as FilterTab, label: 'Paused', count: counts.paused },
                        { key: 'completed' as FilterTab, label: 'Completed', count: counts.completed },
                        { key: 'stopped' as FilterTab, label: 'Stopped', count: counts.stopped },
                    ]}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={[
                                styles.filterTab,
                                activeFilter === item.key && styles.filterTabActive
                            ]}
                            onPress={() => setActiveFilter(item.key)}
                        >
                            <Text style={[
                                styles.filterTabText,
                                activeFilter === item.key && styles.filterTabTextActive
                            ]}>
                                {item.label} ({item.count})
                            </Text>
                        </TouchableOpacity>
                    )}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={styles.filterTabs}
                />
            </View>

            {/* Error State */}
            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>⚠️ {error}</Text>
                    <TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Campaign List */}
            <Animated.FlatList
                data={filteredCampaigns}
                keyExtractor={(item) => item.id}
                onScroll={onScroll}
                scrollEventThrottle={16}
                renderItem={({ item }) => (
                    <MerchantCampaignCard
                        campaign={item}
                        onCampaignUpdated={fetchCampaigns}
                    />
                )}
                contentContainerStyle={styles.campaignList}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={handleRefresh}
                        tintColor="#f97316"
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        {campaigns.length === 0 ? (
                            <>
                                <Text style={styles.emptyIcon}>📢</Text>
                                <Text style={styles.emptyText}>No campaigns yet</Text>
                                <Text style={styles.emptySubtext}>
                                    Create your first campaign to start boosting content
                                </Text>
                                <TouchableOpacity
                                    style={styles.emptyCreateButton}
                                    onPress={handleCreateCampaign}
                                >
                                    <Text style={styles.emptyCreateButtonText}>
                                        Create Campaign
                                    </Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.emptyIcon}>
                                    {activeFilter === 'active' ? '🟢' :
                                        activeFilter === 'pending' ? '🟡' :
                                            activeFilter === 'paused' ? '⏸️' :
                                                activeFilter === 'stopped' ? '🔴' :
                                                    activeFilter === 'completed' ? '✅' : '📭'}
                                </Text>
                                <Text style={styles.emptyText}>
                                    No {activeFilter} campaigns
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setActiveFilter('all')}
                                    style={styles.showAllButton}
                                >
                                    <Text style={styles.showAllButtonText}>Show All</Text>
                                </TouchableOpacity>
                            </>
                        )}
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
        backgroundColor: '#2563eb',
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
    merchantBadgeRow: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    merchantBadge: {
        fontSize: 11,
        fontWeight: '600',
        color: '#2563eb',
        backgroundColor: '#1e3a5f',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    userName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    switchButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    switchButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#f97316',
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
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 16,
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
    createButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#f97316',
        borderRadius: 8,
    },
    createButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
    },
    settingsButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    settingsButtonText: {
        fontSize: 16,
    },
    filterTabsContainer: {
        paddingBottom: 8,
    },
    filterTabs: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterTab: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#27272a',
        marginRight: 8,
    },
    filterTabActive: {
        backgroundColor: '#f97316',
    },
    filterTabText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#a1a1aa',
    },
    filterTabTextActive: {
        color: '#fff',
    },
    errorContainer: {
        marginHorizontal: 16,
        padding: 16,
        backgroundColor: '#7f1d1d',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 13,
        flex: 1,
    },
    retryButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#dc2626',
        borderRadius: 8,
        marginLeft: 12,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    campaignList: {
        padding: 16,
        paddingTop: 8,
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
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    emptyCreateButton: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#f97316',
        borderRadius: 10,
    },
    emptyCreateButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    showAllButton: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#27272a',
        borderRadius: 8,
    },
    showAllButtonText: {
        color: '#f97316',
        fontSize: 13,
        fontWeight: '600',
    },

    // Enhanced User Profile Section Styles
    userProfileSection: {
        backgroundColor: '#18181b',
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#2563eb',
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    largeAvatar: {
        width: 64,
        height: 64,
        borderRadius: 32,
        marginRight: 16,
    },
    largeAvatarPlaceholder: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#2563eb',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    largeAvatarText: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
    },
    profileNameContainer: {
        flex: 1,
    },
    merchantBadgeInline: {
        alignSelf: 'flex-start',
        backgroundColor: '#1e3a5f',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 4,
    },
    merchantBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#2563eb',
    },
    profileName: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 4,
    },
    profileNip05: {
        fontSize: 14,
        color: '#22c55e',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#f97316',
    },
    statValueTotal: {
        fontSize: 24,
        fontWeight: '700',
        color: '#2563eb',
    },
    statLabel: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: '#27272a',
    },
});
