/**
 * CreateCampaignScreen - Form for creating new campaigns in the mobile app
 * Two tabs: Create New Post (sign once) and Boost Existing (paste any format)
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useAuth } from '../../../contexts/AuthContext';
import {
    createCampaign,
    fetchNostrEvent,
    publishToNostr,
    fetchMerchantSettings,
    type CreateCampaignParams,
    type NostrEvent,
    type MerchantSettings,
} from '../../../lib/api';
import { eventIdToHex, signTextNote } from '../../../lib/nostr';
import { nip19 } from 'nostr-tools';
import PaymentModal from '../../../components/PaymentModal';

interface CreateCampaignScreenProps {
    onBack: () => void;
    onCampaignCreated: () => void;
    onOpenSettings?: () => void;
    initialEventId?: string;
    isBoostFollowingMode?: boolean;
    onClearBoostFollowingMode?: () => void;
    targetPubkey?: string;
    onClearTargetPubkey?: () => void;
}

export default function CreateCampaignScreen({
    onBack,
    onCampaignCreated,
    onOpenSettings,
    initialEventId,
    isBoostFollowingMode,
    onClearBoostFollowingMode,
    targetPubkey,
    onClearTargetPubkey,
}: CreateCampaignScreenProps) {
    const { user, getNsec } = useAuth();

    // Tab state
    const [activeTab, setActiveTab] = useState<'create' | 'existing'>('create');

    // Create New Post state
    const [newPostContent, setNewPostContent] = useState('');
    const [isCreatingPost, setIsCreatingPost] = useState(false);
    const [createdEventId, setCreatedEventId] = useState('');
    const [isPostPublished, setIsPostPublished] = useState(false);

    // Existing Post state
    const [pastedEventInput, setPastedEventInput] = useState('');
    const [parsedEventId, setParsedEventId] = useState('');
    const [eventError, setEventError] = useState('');

    // Common form state
    const [budgetSats, setBudgetSats] = useState('10000');

    // Reward toggles and values
    const [enableLike, setEnableLike] = useState(true);
    const [likeReward, setLikeReward] = useState('21');
    const [enableRepost, setEnableRepost] = useState(true);
    const [repostReward, setRepostReward] = useState('21');
    const [enableQuote, setEnableQuote] = useState(false);
    const [quoteReward, setQuoteReward] = useState('50');
    const [enableReply, setEnableReply] = useState(false);
    const [replyReward, setReplyReward] = useState('50');
    const [enableFollow, setEnableFollow] = useState(false);
    const [followReward, setFollowReward] = useState('100');

    // Eligibility settings
    const [eligibilityMode, setEligibilityMode] = useState<'trustScore' | 'custom'>('trustScore');
    const [minTrustScore, setMinTrustScore] = useState(50);

    // Merchant settings (fetched from API)
    const [merchantSettings, setMerchantSettings] = useState<MerchantSettings | null>(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);

    // Fetched event
    const [fetchedEvent, setFetchedEvent] = useState<NostrEvent | null>(null);
    const [isFetchingEvent, setIsFetchingEvent] = useState(false);

    // UI state
    const [isLoading, setIsLoading] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentCampaign, setPaymentCampaign] = useState<{
        id: string;
        title: string;
        totalCost: number;
        totalBudget: number;
        platformFee: number;
        paymentInvoice: string;
    } | null>(null);

    // Load merchant settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            // Use database ID if available, fallback to pubkey for backwards compatibility
            const userId = user?.id || user?.pubkey;
            if (!userId) return;

            setIsLoadingSettings(true);
            try {
                const result = await fetchMerchantSettings(userId);
                if (result.success && result.settings) {
                    setMerchantSettings(result.settings);
                }
            } catch (error) {
                console.error('Failed to load merchant settings:', error);
            } finally {
                setIsLoadingSettings(false);
            }
        };

        loadSettings();
    }, [user?.id, user?.pubkey]);

    // Handle initial event ID or boost following mode from props
    useEffect(() => {
        if (isBoostFollowingMode) {
            setActiveTab('create');
            setEnableLike(false);
            setEnableRepost(false);
            setEnableQuote(false);
            setEnableReply(false);
            setEnableFollow(true);

            if (targetPubkey) {
                try {
                    const npub = nip19.npubEncode(targetPubkey);
                    setNewPostContent(`Follow nostr:${npub}`);
                } catch (e) {
                    console.error("Failed to encode pubkey to npub:", e);
                }
            }
        } else if (initialEventId) {
            setActiveTab('existing');
            setPastedEventInput(initialEventId);
            handleEventInputChange(initialEventId);
        }
    }, [initialEventId, isBoostFollowingMode, targetPubkey]);

    // Calculate the effective event ID based on tab
    const effectiveEventId = activeTab === 'create' ? createdEventId : parsedEventId;

    // Calculate costs
    const budget = parseInt(budgetSats) || 0;
    const platformFee = Math.round(budget * 0.2);
    const totalCost = budget + platformFee;

    // Calculate max completions
    const maxCompletions = useMemo(() => {
        const rewards = [
            enableLike ? parseInt(likeReward) || 0 : 0,
            enableRepost ? parseInt(repostReward) || 0 : 0,
            enableQuote ? parseInt(quoteReward) || 0 : 0,
            enableReply ? parseInt(replyReward) || 0 : 0,
            enableFollow ? parseInt(followReward) || 0 : 0,
        ].filter(r => r > 0);

        if (rewards.length === 0) return 0;
        const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
        return avgReward > 0 ? Math.floor(budget / avgReward) : 0;
    }, [budget, enableLike, likeReward, enableRepost, repostReward, enableQuote,
        quoteReward, enableReply, replyReward, enableFollow, followReward]);

    // Check if form is valid
    const isFormValid = useMemo(() => {
        if (!effectiveEventId) return false;
        if (budget < 5000) return false;
        const hasReward = enableLike || enableRepost || enableQuote || enableReply || enableFollow;
        return hasReward;
    }, [effectiveEventId, budget, enableLike, enableRepost, enableQuote, enableReply, enableFollow]);

    // Handle pasted event input - auto-parse and convert to hex
    const handleEventInputChange = (value: string) => {
        setPastedEventInput(value);
        setParsedEventId('');
        setEventError('');
        setFetchedEvent(null);

        if (!value.trim()) return;

        // Try to convert to hex
        const hexId = eventIdToHex(value.trim());
        if (hexId) {
            setParsedEventId(hexId);
            fetchEventDetails(hexId);
        } else {
            setEventError('Could not parse event ID. Paste a URL, nostr:, note1..., nevent1..., or hex ID');
        }
    };

    // Fetch event details
    const fetchEventDetails = async (eventId: string) => {
        setIsFetchingEvent(true);
        try {
            const result = await fetchNostrEvent(eventId);
            if (result.success && result.event) {
                setFetchedEvent(result.event);
            } else {
                setEventError(result.error || 'Could not fetch event details');
            }
        } catch (err) {
            setEventError('Failed to fetch event');
        } finally {
            setIsFetchingEvent(false);
        }
    };

    // Create new post and sign it
    const handleCreatePost = async () => {
        if (!newPostContent.trim()) {
            Alert.alert('Error', 'Please enter post content');
            return;
        }

        // Get nsec from secure storage
        const nsec = await getNsec();
        if (!nsec) {
            Alert.alert('Error', 'Private key not available. Please re-login.');
            return;
        }

        setIsCreatingPost(true);
        try {
            // Sign the event locally
            const signedEvent = signTextNote(nsec, newPostContent.trim());

            // Publish to relays
            const publishResult = await publishToNostr(signedEvent);

            if (publishResult.success) {
                setCreatedEventId(signedEvent.id);
                setIsPostPublished(true);
                setFetchedEvent({
                    id: signedEvent.id,
                    pubkey: signedEvent.pubkey,
                    content: signedEvent.content,
                    created_at: signedEvent.created_at,
                    kind: signedEvent.kind,
                    tags: signedEvent.tags,
                    sig: signedEvent.sig,
                });
                Alert.alert('✓ Post Created!', 'Your post has been published to Nostr. Now complete the campaign setup below.');
            } else {
                Alert.alert('Warning', `Post signed but publishing failed: ${publishResult.error}. You can still create the campaign.`);
                // Still set the event ID so they can proceed
                setCreatedEventId(signedEvent.id);
                setFetchedEvent({
                    id: signedEvent.id,
                    pubkey: signedEvent.pubkey,
                    content: signedEvent.content,
                    created_at: signedEvent.created_at,
                    kind: signedEvent.kind,
                    tags: signedEvent.tags,
                    sig: signedEvent.sig,
                });
            }
        } catch (error) {
            console.error('Create post error:', error);
            Alert.alert('Error', `Failed to create post: ${(error as Error).message}`);
        } finally {
            setIsCreatingPost(false);
        }
    };

    // Submit campaign
    const handleSubmit = async () => {
        if (!isFormValid) {
            Alert.alert('Invalid Form', 'Please fill in all required fields');
            return;
        }

        if (!user?.pubkey) {
            Alert.alert('Error', 'User not authenticated');
            return;
        }

        setIsLoading(true);

        try {
            // Generate title from event content
            const contentForTitle = activeTab === 'create' ? newPostContent : (fetchedEvent?.content || '');
            const autoTitle = contentForTitle.substring(0, 50) + (contentForTitle.length > 50 ? '...' : '') || 'Boost Nostr Event';

            const params: CreateCampaignParams = {
                merchantId: user.pubkey,
                title: autoTitle,
                description: 'Boost this Nostr event',
                budgetSats: budget,
                eventId: effectiveEventId,
                eventContent: contentForTitle,
                likeReward: enableLike ? parseInt(likeReward) || 0 : 0,
                repostReward: enableRepost ? parseInt(repostReward) || 0 : 0,
                repostWithQuoteReward: enableQuote ? parseInt(quoteReward) || 0 : 0,
                replyReward: enableReply ? parseInt(replyReward) || 0 : 0,
                followReward: enableFollow ? parseInt(followReward) || 0 : 0,
                useTrustScoreMode: eligibilityMode === 'trustScore',
                minTrustScore: eligibilityMode === 'trustScore' ? minTrustScore : undefined,
            };

            const result = await createCampaign(params);

            if (result.success && result.campaign) {
                if (result.campaign.paymentInvoice) {
                    setPaymentCampaign({
                        id: result.campaign.id,
                        title: result.campaign.title,
                        totalCost: result.campaign.totalCost || totalCost,
                        totalBudget: result.campaign.totalBudget || budget,
                        platformFee: result.campaign.platformFee || platformFee,
                        paymentInvoice: result.campaign.paymentInvoice,
                    });
                    setShowPaymentModal(true);
                } else {
                    Alert.alert('Success', 'Campaign created successfully');
                    onCampaignCreated();
                }
            } else {
                Alert.alert('Error', result.error || 'Failed to create campaign');
            }
        } catch (err) {
            console.error('Create campaign error:', err);
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePaymentConfirmed = () => {
        setShowPaymentModal(false);
        setPaymentCampaign(null);
        Alert.alert('🎉 Campaign Funded!', 'Your campaign is now active and users can start earning.', [
            { text: 'OK', onPress: onCampaignCreated }
        ]);
    };

    const RewardToggle = ({
        label,
        emoji,
        enabled,
        onToggle,
        value,
        onValueChange,
        disabled = false,
        isHighlight = false,
    }: {
        label: string;
        emoji: string;
        enabled: boolean;
        onToggle: () => void;
        value: string;
        onValueChange: (v: string) => void;
        disabled?: boolean;
        isHighlight?: boolean;
    }) => (
        <View style={styles.rewardRow}>
            <TouchableOpacity
                style={[
                    styles.rewardToggle,
                    enabled && styles.rewardToggleActive,
                    disabled && styles.rewardToggleDisabled,
                    isHighlight && styles.rewardToggleHighlight
                ]}
                onPress={disabled ? undefined : onToggle}
                disabled={disabled}
            >
                <Text style={styles.rewardEmoji}>{emoji}</Text>
                <Text style={[
                    styles.rewardLabel,
                    enabled && styles.rewardLabelActive,
                    disabled && styles.rewardLabelDisabled
                ]}>
                    {label}
                </Text>
            </TouchableOpacity>
            {enabled && (
                <View style={styles.rewardInputContainer}>
                    <TextInput
                        style={[
                            styles.rewardInput,
                            disabled && styles.rewardInputDisabled,
                            isHighlight && styles.rewardInputHighlight
                        ]}
                        value={value}
                        onChangeText={onValueChange}
                        keyboardType="numeric"
                        placeholder="21"
                        placeholderTextColor="#52525b"
                        editable={!disabled}
                    />
                    <Text style={styles.rewardUnit}>sats</Text>
                </View>
            )}
        </View>
    );

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onBack} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Create Campaign</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Tab Selector */}
                <View style={styles.tabContainer}>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'create' && styles.tabActive]}
                        onPress={() => setActiveTab('create')}
                    >
                        <Text style={[styles.tabText, activeTab === 'create' && styles.tabTextActive]}>
                            ✏️ Create New Post
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'existing' && styles.tabActive]}
                        onPress={() => setActiveTab('existing')}
                    >
                        <Text style={[styles.tabText, activeTab === 'existing' && styles.tabTextActive]}>
                            🔗 Boost Existing
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Create New Post Tab */}
                {activeTab === 'create' && (
                    <View style={styles.section}>
                        {!isPostPublished ? (
                            <>
                                <Text style={styles.sectionTitle}>📝 Write Your Post</Text>
                                <Text style={styles.sectionHint}>
                                    Create a new Nostr post and boost it with your campaign
                                </Text>
                                <TextInput
                                    style={[styles.input, styles.textArea]}
                                    value={newPostContent}
                                    onChangeText={setNewPostContent}
                                    placeholder="What's on your mind?"
                                    placeholderTextColor="#52525b"
                                    multiline
                                    numberOfLines={4}
                                />
                                <TouchableOpacity
                                    style={[styles.createPostButton, (!newPostContent.trim() || isCreatingPost) && styles.buttonDisabled]}
                                    onPress={handleCreatePost}
                                    disabled={!newPostContent.trim() || isCreatingPost}
                                >
                                    {isCreatingPost ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.createPostButtonText}>
                                            ✍️ Sign & Publish Post
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={styles.sectionTitle}>✅ Post Published</Text>
                                <View style={styles.eventPreview}>
                                    <Text style={styles.eventContent} numberOfLines={4}>
                                        {newPostContent}
                                    </Text>
                                    <Text style={styles.eventIdPreview}>
                                        Event ID: {createdEventId.substring(0, 24)}...
                                    </Text>
                                </View>
                            </>
                        )}
                    </View>
                )}

                {/* Boost Existing Tab */}
                {activeTab === 'existing' && (
                    <View style={styles.section}>
                        {/* Hide input container if we have a fetched event to reduce clutter */}
                        {!fetchedEvent ? (
                            <>
                                <Text style={styles.sectionTitle}>🔗 Paste Event Link or ID</Text>
                                <Text style={styles.sectionHint}>
                                    Supports URLs, nostr:, note1..., nevent1..., or hex
                                </Text>
                                <TextInput
                                    style={[styles.input, eventError && styles.inputError]}
                                    value={pastedEventInput}
                                    onChangeText={handleEventInputChange}
                                    placeholder="Paste event URL or ID here..."
                                    placeholderTextColor="#52525b"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    multiline
                                />
                                {eventError ? (
                                    <Text style={styles.errorText}>{eventError}</Text>
                                ) : parsedEventId ? (
                                    <View style={styles.parsedIdContainer}>
                                        <Text style={styles.parsedIdLabel}>Parsed hex ID:</Text>
                                        <Text style={styles.parsedIdValue} numberOfLines={1}>
                                            {parsedEventId.substring(0, 32)}...
                                        </Text>
                                    </View>
                                ) : null}

                                {isFetchingEvent && (
                                    <ActivityIndicator style={styles.loadingIndicator} color="#f97316" />
                                )}
                            </>
                        ) : (
                            <View style={styles.selectedEventHeader}>
                                <Text style={styles.sectionTitle}>✅ Event Selected</Text>
                                <TouchableOpacity
                                    onPress={() => {
                                        setFetchedEvent(null);
                                        setPastedEventInput('');
                                        setParsedEventId('');
                                    }}
                                    style={styles.changeEventButton}
                                >
                                    <Text style={styles.changeEventText}>Change</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}

                {/* Event Preview - only for Boost Existing tab */}
                {activeTab === 'existing' && fetchedEvent && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>👁️ Event Preview</Text>
                        <View style={styles.eventPreview}>
                            <Text style={styles.eventContent} numberOfLines={4}>
                                {fetchedEvent.content}
                            </Text>
                            <Text style={styles.eventMeta}>
                                {new Date(fetchedEvent.created_at * 1000).toLocaleString()}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Rewards */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💰 Rewards per Action</Text>
                    <View style={styles.rewardsContainer}>
                        <RewardToggle
                            label="Like"
                            emoji="❤️"
                            enabled={enableLike}
                            onToggle={() => setEnableLike(!enableLike)}
                            value={likeReward}
                            onValueChange={setLikeReward}
                        />
                        <RewardToggle
                            label="Repost"
                            emoji="🔁"
                            enabled={enableRepost}
                            onToggle={() => setEnableRepost(!enableRepost)}
                            value={repostReward}
                            onValueChange={setRepostReward}
                        />
                        <RewardToggle
                            label="Quote"
                            emoji="💬"
                            enabled={enableQuote}
                            onToggle={() => setEnableQuote(!enableQuote)}
                            value={quoteReward}
                            onValueChange={setQuoteReward}
                        />
                        <RewardToggle
                            label="Reply"
                            emoji="↩️"
                            enabled={enableReply}
                            onToggle={() => setEnableReply(!enableReply)}
                            value={replyReward}
                            onValueChange={setReplyReward}
                        />
                        <RewardToggle
                            label="Follow"
                            emoji="➕"
                            enabled={enableFollow}
                            onToggle={() => setEnableFollow(!enableFollow)}
                            value={followReward}
                            onValueChange={setFollowReward}
                            isHighlight={isBoostFollowingMode}
                        />
                    </View>
                </View>

                {/* Budget */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>💵 Campaign Budget</Text>
                    <View style={styles.budgetInputRow}>
                        <TextInput
                            style={[styles.input, styles.budgetInput]}
                            value={budgetSats}
                            onChangeText={setBudgetSats}
                            keyboardType="numeric"
                            placeholder="10000"
                            placeholderTextColor="#52525b"
                        />
                        <Text style={styles.budgetUnit}>sats</Text>
                    </View>
                    {budget < 5000 && budget > 0 && (
                        <Text style={styles.errorText}>Minimum budget is 5,000 sats</Text>
                    )}

                    <View style={styles.costBreakdown}>
                        <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Campaign Budget</Text>
                            <Text style={styles.costValue}>{budget.toLocaleString()} sats</Text>
                        </View>
                        <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Platform Fee (20%)</Text>
                            <Text style={styles.costValue}>{platformFee.toLocaleString()} sats</Text>
                        </View>
                        <View style={[styles.costRow, styles.costRowTotal]}>
                            <Text style={styles.costLabelTotal}>Total Cost</Text>
                            <Text style={styles.costValueTotal}>⚡ {totalCost.toLocaleString()} sats</Text>
                        </View>
                        <View style={styles.costRow}>
                            <Text style={styles.costLabel}>Est. Completions</Text>
                            <Text style={styles.costValue}>~{maxCompletions}</Text>
                        </View>
                    </View>
                </View>

                {/* Eligibility Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🛡️ Eligibility</Text>
                    <Text style={styles.sectionHint}>Who can participate in your campaign</Text>

                    {/* Eligibility Mode Toggle */}
                    <View style={styles.eligibilityTabContainer}>
                        <TouchableOpacity
                            style={[
                                styles.eligibilityTab,
                                eligibilityMode === 'trustScore' && styles.eligibilityTabActive
                            ]}
                            onPress={() => setEligibilityMode('trustScore')}
                        >
                            <Text style={[
                                styles.eligibilityTabText,
                                eligibilityMode === 'trustScore' && styles.eligibilityTabTextActive
                            ]}>🛡️ Trust Score</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.eligibilityTab,
                                eligibilityMode === 'custom' && styles.eligibilityTabActive
                            ]}
                            onPress={() => setEligibilityMode('custom')}
                        >
                            <Text style={[
                                styles.eligibilityTabText,
                                eligibilityMode === 'custom' && styles.eligibilityTabTextActive
                            ]}>⚙️ Custom</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Trust Score Mode */}
                    {eligibilityMode === 'trustScore' && (
                        <View style={styles.trustScoreContainer}>
                            <View style={styles.trustScoreInfo}>
                                <Text style={styles.infoText}>
                                    Trust score is calculated from followers, posts, account age, and zap activity.
                                </Text>
                            </View>

                            <View style={styles.sliderContainer}>
                                <View style={styles.sliderHeader}>
                                    <Text style={styles.sliderLabel}>Minimum Trust Score</Text>
                                    <Text style={styles.sliderValue}>{minTrustScore}</Text>
                                </View>
                                <Slider
                                    style={styles.slider}
                                    minimumValue={0}
                                    maximumValue={100}
                                    step={5}
                                    value={minTrustScore}
                                    onValueChange={setMinTrustScore}
                                    minimumTrackTintColor="#f97316"
                                    maximumTrackTintColor="#27272a"
                                    thumbTintColor="#f97316"
                                />
                                <View style={styles.sliderLabels}>
                                    <Text style={styles.sliderLabelSmall}>0 (Open)</Text>
                                    <Text style={styles.sliderLabelSmall}>50</Text>
                                    <Text style={styles.sliderLabelSmall}>100 (Strict)</Text>
                                </View>
                            </View>

                            <View style={styles.trustScorePreview}>
                                <Text style={styles.trustScorePreviewValue}>{minTrustScore}</Text>
                                <Text style={styles.trustScorePreviewText}>
                                    {minTrustScore <= 20 && 'Very lenient - almost anyone can participate'}
                                    {minTrustScore > 20 && minTrustScore <= 40 && 'Lenient - new but active users welcome'}
                                    {minTrustScore > 40 && minTrustScore <= 60 && 'Balanced - established users preferred'}
                                    {minTrustScore > 60 && minTrustScore <= 80 && 'Strict - well-established users only'}
                                    {minTrustScore > 80 && 'Very strict - highly trusted users only'}
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Custom Requirements Mode */}
                    {eligibilityMode === 'custom' && (
                        <View style={styles.customRequirementsContainer}>
                            {isLoadingSettings ? (
                                <ActivityIndicator color="#f97316" style={{ marginVertical: 20 }} />
                            ) : (
                                <View style={styles.requirementsGrid}>
                                    <View style={styles.requirementItem}>
                                        <Text style={styles.requirementValue}>
                                            {merchantSettings?.defaultMinFollowers ?? 25}+
                                        </Text>
                                        <Text style={styles.requirementLabel}>followers</Text>
                                    </View>
                                    <View style={styles.requirementItem}>
                                        <Text style={styles.requirementValue}>
                                            {merchantSettings?.defaultMinPosts ?? 50}+
                                        </Text>
                                        <Text style={styles.requirementLabel}>posts</Text>
                                    </View>
                                    <View style={styles.requirementItem}>
                                        <Text style={styles.requirementValue}>
                                            {merchantSettings?.defaultMinAccountAge ?? 30}+
                                        </Text>
                                        <Text style={styles.requirementLabel}>days old</Text>
                                    </View>
                                </View>
                            )}

                            <TouchableOpacity
                                style={styles.configureButton}
                                onPress={onOpenSettings}
                            >
                                <Text style={styles.configureButtonText}>
                                    Configure in Settings →
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Submit Button */}
                <TouchableOpacity
                    style={[styles.submitButton, (!isFormValid || isLoading) && styles.buttonDisabled]}
                    onPress={handleSubmit}
                    disabled={!isFormValid || isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text style={styles.submitButtonText}>
                            Create & Fund Campaign ⚡
                        </Text>
                    )}
                </TouchableOpacity>

                <View style={styles.bottomPadding} />
            </ScrollView>

            {/* Payment Modal */}
            <PaymentModal
                visible={showPaymentModal}
                onClose={() => {
                    setShowPaymentModal(false);
                    setPaymentCampaign(null);
                }}
                onPaymentConfirmed={handlePaymentConfirmed}
                campaign={paymentCampaign}
            />
        </KeyboardAvoidingView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingBottom: 16,
    },
    backButton: {
        padding: 8,
    },
    backText: {
        fontSize: 16,
        color: '#f97316',
        fontWeight: '600',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    headerSpacer: {
        width: 60,
    },
    tabContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: '#27272a',
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#f97316',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#a1a1aa',
    },
    tabTextActive: {
        color: '#fff',
    },
    section: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 6,
    },
    selectedEventHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    changeEventButton: {
        backgroundColor: '#27272a',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    changeEventText: {
        color: '#f97316',
        fontSize: 12,
        fontWeight: '600',
    },
    sectionHint: {
        fontSize: 13,
        color: '#71717a',
        marginBottom: 12,
    },
    input: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#27272a',
        marginBottom: 12,
    },
    inputError: {
        borderColor: '#ef4444',
    },
    inputDisabled: {
        backgroundColor: '#1a1a1a',
        borderColor: '#22c55e',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    smallTextArea: {
        minHeight: 60,
        textAlignVertical: 'top',
    },
    createPostButton: {
        backgroundColor: '#22c55e',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    createPostButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    buttonDisabled: {
        backgroundColor: '#52525b',
    },
    successBadge: {
        backgroundColor: '#14532d',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#22c55e',
    },
    successBadgeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#22c55e',
    },
    eventIdPreview: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 4,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    parsedIdContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: -6,
        marginBottom: 8,
    },
    parsedIdLabel: {
        fontSize: 12,
        color: '#22c55e',
        fontWeight: '500',
    },
    parsedIdValue: {
        fontSize: 12,
        color: '#71717a',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        flex: 1,
    },
    errorText: {
        fontSize: 13,
        color: '#ef4444',
        marginTop: -6,
        marginBottom: 8,
    },
    loadingIndicator: {
        marginVertical: 8,
    },
    eventPreview: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    eventContent: {
        fontSize: 14,
        color: '#d4d4d8',
        lineHeight: 20,
    },
    eventMeta: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 10,
    },
    rewardsContainer: {
        gap: 10,
    },
    rewardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    rewardToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#27272a',
        borderWidth: 1,
        borderColor: '#3f3f46',
        flex: 1,
    },
    rewardToggleActive: {
        backgroundColor: '#14532d',
        borderColor: '#22c55e',
    },
    rewardEmoji: {
        fontSize: 16,
    },
    rewardLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#a1a1aa',
    },
    rewardLabelActive: {
        color: '#fff',
        fontWeight: '700',
    },
    rewardToggleDisabled: {
        opacity: 0.5,
        backgroundColor: '#18181b',
        borderColor: '#27272a',
    },
    rewardLabelDisabled: {
        color: '#52525b',
    },
    rewardInputDisabled: {
        color: '#52525b',
        backgroundColor: '#09090b',
    },
    rewardToggleHighlight: {
        backgroundColor: '#064e3b',
        borderColor: '#059669',
        opacity: 1, // Ensure it's not dimmed
    },
    rewardInputHighlight: {
        backgroundColor: '#064e3b',
        borderColor: '#059669',
        color: '#fff',
    },
    rewardInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rewardInput: {
        backgroundColor: '#0a0a0a',
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontSize: 14,
        color: '#fbbf24',
        width: 65,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: '#27272a',
    },
    rewardUnit: {
        fontSize: 12,
        color: '#71717a',
    },
    budgetInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    budgetInput: {
        flex: 1,
        marginBottom: 0,
    },
    budgetUnit: {
        fontSize: 16,
        color: '#71717a',
        fontWeight: '500',
    },
    costBreakdown: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 14,
        marginTop: 14,
    },
    costRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    costRowTotal: {
        borderTopWidth: 1,
        borderTopColor: '#27272a',
        paddingTop: 10,
        marginTop: 6,
        marginBottom: 10,
    },
    costLabel: {
        fontSize: 13,
        color: '#71717a',
    },
    costValue: {
        fontSize: 13,
        color: '#a1a1aa',
    },
    costLabelTotal: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    costValueTotal: {
        fontSize: 15,
        fontWeight: '700',
        color: '#f97316',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    settingInfo: {
        flex: 1,
    },
    toggle: {
        width: 50,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#27272a',
        padding: 2,
        justifyContent: 'center',
    },
    toggleActive: {
        backgroundColor: '#22c55e',
    },
    toggleThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#71717a',
    },
    toggleThumbActive: {
        backgroundColor: '#fff',
        alignSelf: 'flex-end',
    },
    trustScoreInput: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 14,
        gap: 8,
    },
    trustLabel: {
        fontSize: 14,
        color: '#a1a1aa',
    },
    trustInput: {
        backgroundColor: '#0a0a0a',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
        fontSize: 15,
        color: '#22c55e',
        width: 65,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: '#27272a',
    },
    trustHint: {
        fontSize: 14,
        color: '#71717a',
    },
    submitButton: {
        backgroundColor: '#f97316',
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 4,
    },
    submitButtonText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fff',
    },
    bottomPadding: {
        height: 40,
    },
    // Eligibility styles
    eligibilityTabContainer: {
        flexDirection: 'row',
        backgroundColor: '#27272a',
        borderRadius: 10,
        padding: 4,
        marginTop: 12,
        marginBottom: 16,
    },
    eligibilityTab: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    eligibilityTabActive: {
        backgroundColor: '#f97316',
    },
    eligibilityTabText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#71717a',
    },
    eligibilityTabTextActive: {
        color: '#fff',
    },
    trustScoreContainer: {
        gap: 16,
    },
    trustScoreInfo: {
        backgroundColor: '#1e3a5f',
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#2563eb',
    },
    infoText: {
        fontSize: 13,
        color: '#93c5fd',
        lineHeight: 19,
    },
    sliderContainer: {
        gap: 8,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sliderLabel: {
        fontSize: 14,
        color: '#a1a1aa',
        fontWeight: '500',
    },
    sliderValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#f97316',
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    sliderLabelSmall: {
        fontSize: 11,
        color: '#52525b',
    },
    trustScorePreview: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    trustScorePreviewValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#f97316',
        marginBottom: 4,
    },
    trustScorePreviewText: {
        fontSize: 13,
        color: '#71717a',
        textAlign: 'center',
    },
    customRequirementsContainer: {
        gap: 16,
    },
    requirementsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 16,
    },
    requirementItem: {
        alignItems: 'center',
    },
    requirementValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    requirementLabel: {
        fontSize: 11,
        color: '#71717a',
        marginTop: 4,
    },
    configureButton: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    configureButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#f97316',
    },
});
