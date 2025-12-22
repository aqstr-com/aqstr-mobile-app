/**
 * MerchantSettingsScreen - Configure default eligibility requirements
 * Similar to web app's dashboard.settings.tsx
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useAuth } from '../../../contexts/AuthContext';
import {
    fetchMerchantSettings,
    saveMerchantSettings,
    type MerchantSettings,
} from '../../../lib/api';

interface MerchantSettingsScreenProps {
    onBack: () => void;
}

const DEFAULT_SETTINGS: MerchantSettings = {
    defaultMinFollowers: 25,
    defaultMinFollowing: 10,
    defaultMaxFollowing: 500,
    defaultMinPosts: 50,
    defaultMinZapsReceived: 1000,
    defaultMinZapsSent: 500,
    defaultMinAccountAge: 30,
    notifyOnTaskComplete: true,
    notifyOnBudgetLow: true,
    notifyOnBlacklist: false,
    enableBlacklist: true,
    maxDailyBudget: 100000,
};

export default function MerchantSettingsScreen({
    onBack,
}: MerchantSettingsScreenProps) {
    const { user } = useAuth();

    const handleBack = () => {
        onBack();
    };

    const [settings, setSettings] = useState<MerchantSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            // Use database ID if available, fallback to pubkey for backwards compatibility
            const userId = user?.id || user?.pubkey;
            if (!userId) return;

            setIsLoading(true);
            try {
                const result = await fetchMerchantSettings(userId);
                if (result.success && result.settings) {
                    setSettings({
                        ...DEFAULT_SETTINGS,
                        ...result.settings,
                    });
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            } finally {
                setIsLoading(false);
            }
        };

        loadSettings();
    }, [user?.id, user?.pubkey]);

    const handleSave = async () => {
        // Use database ID if available, fallback to pubkey for backwards compatibility
        const userId = user?.id || user?.pubkey;
        if (!userId) {
            Alert.alert('Error', 'User not authenticated');
            return;
        }

        setIsSaving(true);
        try {
            const result = await saveMerchantSettings(userId, settings);
            if (result.success) {
                Alert.alert('✓ Saved', 'Your settings have been updated.', [
                    { text: 'OK', onPress: handleBack }
                ]);
            } else {
                Alert.alert('Error', result.error || 'Failed to save settings');
            }
        } catch (error) {
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setIsSaving(false);
        }
    };

    const updateSetting = (key: keyof MerchantSettings, value: number | boolean) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const parseNumber = (value: string): number => {
        const num = parseInt(value, 10);
        return isNaN(num) ? 0 : num;
    };

    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#f97316" />
                    <Text style={styles.loadingText}>Loading settings...</Text>
                </View>
            </View>
        );
    }

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
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Settings</Text>
                    <View style={styles.headerSpacer} />
                </View>

                {/* Description */}
                <View style={styles.descriptionBox}>
                    <Text style={styles.descriptionText}>
                        Set default eligibility requirements for your campaigns. These will be used when using Custom Requirements mode.
                    </Text>
                </View>

                {/* Social Requirements Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>👥 Social Requirements</Text>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Minimum Followers</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.defaultMinFollowers.toString()}
                            onChangeText={(v) => updateSetting('defaultMinFollowers', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="25"
                            placeholderTextColor="#52525b"
                        />
                    </View>

                    <View style={styles.inputRowDouble}>
                        <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>Min Following</Text>
                            <TextInput
                                style={styles.input}
                                value={settings.defaultMinFollowing.toString()}
                                onChangeText={(v) => updateSetting('defaultMinFollowing', parseNumber(v))}
                                keyboardType="numeric"
                                placeholder="10"
                                placeholderTextColor="#52525b"
                            />
                        </View>
                        <View style={styles.inputHalf}>
                            <Text style={styles.inputLabel}>Max Following</Text>
                            <TextInput
                                style={styles.input}
                                value={settings.defaultMaxFollowing.toString()}
                                onChangeText={(v) => updateSetting('defaultMaxFollowing', parseNumber(v))}
                                keyboardType="numeric"
                                placeholder="500"
                                placeholderTextColor="#52525b"
                            />
                        </View>
                    </View>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Minimum Posts</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.defaultMinPosts.toString()}
                            onChangeText={(v) => updateSetting('defaultMinPosts', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="50"
                            placeholderTextColor="#52525b"
                        />
                    </View>
                </View>

                {/* Lightning Activity Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>⚡ Lightning Activity</Text>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Min Zaps Received (sats)</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.defaultMinZapsReceived.toString()}
                            onChangeText={(v) => updateSetting('defaultMinZapsReceived', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="1000"
                            placeholderTextColor="#52525b"
                        />
                    </View>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Min Zaps Sent (sats)</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.defaultMinZapsSent.toString()}
                            onChangeText={(v) => updateSetting('defaultMinZapsSent', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="500"
                            placeholderTextColor="#52525b"
                        />
                    </View>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Account Age (days)</Text>
                        <TextInput
                            style={styles.input}
                            value={settings.defaultMinAccountAge.toString()}
                            onChangeText={(v) => updateSetting('defaultMinAccountAge', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="30"
                            placeholderTextColor="#52525b"
                        />
                    </View>

                    <View style={styles.inputRow}>
                        <Text style={styles.inputLabel}>Max Daily Budget (sats)</Text>
                        <TextInput
                            style={styles.input}
                            value={(settings.maxDailyBudget || 100000).toString()}
                            onChangeText={(v) => updateSetting('maxDailyBudget', parseNumber(v))}
                            keyboardType="numeric"
                            placeholder="100000"
                            placeholderTextColor="#52525b"
                        />
                    </View>
                </View>

                {/* Blacklist Toggle */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🚫 Blacklist</Text>

                    <TouchableOpacity
                        style={styles.toggleRow}
                        onPress={() => updateSetting('enableBlacklist', !settings.enableBlacklist)}
                    >
                        <View style={styles.toggleInfo}>
                            <Text style={styles.toggleLabel}>Enable Blacklist</Text>
                            <Text style={styles.toggleHint}>Block users from participating in your campaigns</Text>
                        </View>
                        <View style={[styles.toggle, settings.enableBlacklist && styles.toggleActive]}>
                            <View style={[styles.toggleThumb, settings.enableBlacklist && styles.toggleThumbActive]} />
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Actions */}
                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={handleBack}
                    >
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.saveButton, isSaving && styles.buttonDisabled]}
                        onPress={handleSave}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.saveButtonText}>💾 Save Settings</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.bottomPadding} />
            </ScrollView>
        </KeyboardAvoidingView>
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
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#71717a',
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
    descriptionBox: {
        backgroundColor: '#27272a',
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
    },
    descriptionText: {
        fontSize: 13,
        color: '#a1a1aa',
        lineHeight: 20,
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
        marginBottom: 16,
    },
    inputRow: {
        marginBottom: 14,
    },
    inputRowDouble: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
    },
    inputHalf: {
        flex: 1,
    },
    inputLabel: {
        fontSize: 12,
        color: '#71717a',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#0a0a0a',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#27272a',
    },
    toggleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    toggleInfo: {
        flex: 1,
        marginRight: 16,
    },
    toggleLabel: {
        fontSize: 14,
        fontWeight: '500',
        color: '#fff',
    },
    toggleHint: {
        fontSize: 12,
        color: '#71717a',
        marginTop: 4,
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
    actionsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#27272a',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#a1a1aa',
    },
    saveButton: {
        flex: 1,
        backgroundColor: '#f97316',
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    saveButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    buttonDisabled: {
        backgroundColor: '#52525b',
    },
    bottomPadding: {
        height: 40,
    },
});
