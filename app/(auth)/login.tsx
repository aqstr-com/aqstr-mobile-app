/**
 * Login screen - NIP-46 (Nostr Connect) authentication
 * Uses remote signer apps (Primal, Amber) for secure authentication
 * User's nsec key NEVER enters this app
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    Image,
    Linking,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import QRCode from 'react-native-qrcode-svg';
import { getPlatformSignerInfo } from '../../lib/nip46';

// Suppress known react-native-svg issue with React Native 0.81+
// This error is cosmetic and doesn't affect functionality
const originalHandler = (global as any).ErrorUtils?.getGlobalHandler?.();
if ((global as any).ErrorUtils?.setGlobalHandler) {
    (global as any).ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
        if (error?.message?.includes?.('topSvgLayout')) {
            return; // Suppress this specific error
        }
        if (originalHandler) {
            originalHandler(error, isFatal);
        }
    });
}

// Platform-specific signer logos
const primalLogo = require('../../assets/primal-logo.png');
const amberLogo = require('../../assets/amber-logo.png');

export default function LoginScreen() {
    const [copied, setCopied] = useState(false);

    const {
        initNostrConnect,
        cancelConnection,
        nostrConnectSession,
        connectionState,
        isLoading,
        error,
        clearError,
    } = useAuth();

    // Start NIP-46 connection when screen loads
    useEffect(() => {
        initNostrConnect();

        return () => {
            // Cleanup on unmount
            cancelConnection();
        };
    }, []);



    const handleRetry = () => {
        clearError();
        initNostrConnect();
    };

    const copyConnectionString = async () => {
        if (!nostrConnectSession?.connectionString) return;

        try {
            const Clipboard = await import('expo-clipboard');
            await Clipboard.setStringAsync(nostrConnectSession.connectionString);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.warn('Clipboard copy failed:', err);
            Alert.alert('Copy Failed', 'Could not copy to clipboard');
        }
    };

    const openSignerApp = () => {
        if (!nostrConnectSession?.connectionString) return;
        Linking.openURL(nostrConnectSession.connectionString);
    };

    const { name: signerName } = getPlatformSignerInfo();
    const signerLogo = Platform.OS === 'android' ? amberLogo : primalLogo;

    const renderContent = () => {
        // Success state
        if (connectionState === 'success') {
            return (
                <View style={styles.statusContainer}>
                    <View style={[styles.statusIcon, styles.successIcon]}>
                        <Text style={styles.statusEmoji}>✓</Text>
                    </View>
                    <Text style={styles.statusTitle}>Welcome!</Text>
                    <Text style={styles.statusText}>Login successful</Text>
                </View>
            );
        }

        // Error state
        if (connectionState === 'error') {
            return (
                <View style={styles.statusContainer}>
                    <View style={[styles.statusIcon, styles.errorIcon]}>
                        <Text style={styles.statusEmoji}>✕</Text>
                    </View>
                    <Text style={styles.statusTitle}>Connection Failed</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
                        <Text style={styles.retryButtonText}>Try Again</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        // Generating state
        if (connectionState === 'generating' || !nostrConnectSession) {
            return (
                <View style={styles.statusContainer}>
                    <ActivityIndicator size="large" color="#9333ea" />
                    <Text style={styles.statusText}>Generating connection...</Text>
                </View>
            );
        }

        // Signing state
        if (connectionState === 'signing') {
            return (
                <View style={styles.statusContainer}>
                    <ActivityIndicator size="large" color="#9333ea" />
                    <Text style={styles.statusTitle}>Signing in...</Text>
                    <Text style={styles.statusText}>Please approve in your signer app</Text>
                </View>
            );
        }

        // Waiting / Idle state - show QR code and options
        return (
            <>
                {/* QR Code */}
                <View style={styles.qrContainer}>
                    <View style={styles.qrWrapper}>
                        <QRCode
                            value={nostrConnectSession.connectionString}
                            size={200}
                            backgroundColor="white"
                        />
                    </View>
                </View>

                {/* Platform-specific Login Button */}
                <TouchableOpacity
                    onPress={openSignerApp}
                    style={styles.signerButton}
                    activeOpacity={0.8}
                >
                    <View style={styles.signerButtonContent}>
                        <Image source={signerLogo} style={styles.signerLogo} resizeMode="contain" />
                        <Text style={styles.signerButtonText}>Login with {signerName}</Text>
                    </View>
                </TouchableOpacity>

                {/* Connection Status */}
                {connectionState === 'waiting' && (
                    <View style={styles.waitingContainer}>
                        <ActivityIndicator size="small" color="#a1a1aa" />
                        <Text style={styles.waitingText}>Waiting for connection...</Text>
                    </View>
                )}

                {/* Copy Button */}
                <TouchableOpacity onPress={copyConnectionString} style={styles.copyButton}>
                    <Text style={styles.copyButtonText} numberOfLines={1}>
                        {nostrConnectSession.connectionString.substring(0, 40)}...
                    </Text>
                    <Text style={styles.copyIcon}>{copied ? '✓' : '📋'}</Text>
                </TouchableOpacity>

                <Text style={styles.helpText}>
                    Scan with Primal, Amber, or any NIP-46 signer
                </Text>
            </>
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header */}
                <View style={styles.header}>
                    <Image
                        source={require('../../assets/aqstr-logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                    <Text style={styles.subtitle}>
                        Earn Bitcoin by completing social tasks
                    </Text>
                </View>

                {/* Login Form */}
                <View style={styles.formContainer}>
                    <Text style={styles.label}>Connect with Nostr</Text>

                    {renderContent()}
                </View>

                {/* Open Source Link */}
                <TouchableOpacity
                    style={styles.githubLink}
                    onPress={() => Linking.openURL('https://github.com/AqstrOfficial/aqstr-mobile-app')}
                >
                    <Image
                        source={require('../../assets/GitHub_Invertocat_White_Clearspace.png')}
                        style={styles.githubLogo}
                        resizeMode="contain"
                    />
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    logo: {
        width: 180,
        height: 60,
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 16,
        color: '#a1a1aa',
        textAlign: 'center',
    },
    formContainer: {
        backgroundColor: '#18181b',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#e4e4e7',
        marginBottom: 20,
        textAlign: 'center',
    },
    // QR Code
    qrContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    qrWrapper: {
        padding: 12,
        backgroundColor: 'white',
        borderRadius: 12,
    },
    qrImage: {
        width: 200,
        height: 200,
    },
    // Signer button
    signerButton: {
        backgroundColor: '#F1A026',
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    signerButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    signerLogo: {
        width: 24,
        height: 24,
        borderRadius: 6,
    },
    signerButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    // Waiting status
    waitingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 12,
    },
    waitingText: {
        color: '#a1a1aa',
        fontSize: 14,
    },
    // Copy button
    copyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#27272a',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginBottom: 12,
    },
    copyButtonText: {
        color: '#71717a',
        fontSize: 12,
        flex: 1,
    },
    copyIcon: {
        fontSize: 14,
    },
    helpText: {
        color: '#71717a',
        fontSize: 12,
        textAlign: 'center',
        marginBottom: 16,
    },

    // Status displays
    statusContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    statusIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    successIcon: {
        backgroundColor: '#16a34a',
    },
    errorIcon: {
        backgroundColor: '#dc2626',
    },
    statusEmoji: {
        fontSize: 28,
        color: '#fff',
    },
    statusTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    statusText: {
        color: '#a1a1aa',
        fontSize: 14,
        textAlign: 'center',
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 16,
    },
    retryButton: {
        backgroundColor: '#27272a',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    // GitHub link
    githubLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
    },
    githubLogo: {
        width: 32,
        height: 32,
    },
});
