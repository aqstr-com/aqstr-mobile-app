/**
 * Login screen - nsec input for Nostr authentication
 * nsec is stored securely and NEVER leaves the device
 */
import React, { useState } from 'react';
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
import { isValidNsec } from '../../lib/nostr';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

export default function LoginScreen() {
    const [nsec, setNsec] = useState('');
    const [showNsec, setShowNsec] = useState(false);
    const { login, isLoading, error, clearError } = useAuth();

    // Mask the nsec input for security
    const getMaskedValue = (value: string): string => {
        if (showNsec || value.length <= 12) return value;
        return `${value.slice(0, 8)}${'•'.repeat(Math.min(value.length - 12, 40))}${value.slice(-4)}`;
    };

    const handleLogin = async () => {
        if (!nsec.trim()) {
            Alert.alert('Error', 'Please enter your nsec key');
            return;
        }

        const trimmedNsec = nsec.trim();

        if (!isValidNsec(trimmedNsec)) {
            Alert.alert(
                'Invalid Format',
                'Your nsec must start with "nsec1" and be a valid Nostr secret key.'
            );
            return;
        }

        const success = await login(trimmedNsec);

        if (success) {
            // Clear the nsec from memory immediately after login
            setNsec('');
        }
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
                    <Text style={styles.label}>Enter your Nostr nsec key</Text>

                    <View style={styles.inputContainer}>
                        <TextInput
                            style={styles.input}
                            placeholder="nsec1..."
                            placeholderTextColor="#666"
                            value={showNsec ? nsec : getMaskedValue(nsec)}
                            onChangeText={(text) => {
                                clearError();
                                // Only update if showing actual value or if it's a new character
                                if (showNsec || text.length > nsec.length || text.length < nsec.length) {
                                    setNsec(showNsec ? text : (text.length < nsec.length ? nsec.slice(0, text.length) : nsec + text.slice(-1)));
                                }
                            }}
                            onFocus={() => setShowNsec(true)} // Show full value when editing
                            onBlur={() => setShowNsec(false)} // Hide when done
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="off"
                            secureTextEntry={false} // We handle masking ourselves
                            editable={!isLoading}
                            textContentType="none"
                        />
                        <TouchableOpacity
                            style={styles.eyeButton}
                            onPress={() => setShowNsec(!showNsec)}
                        >
                            <Text style={styles.eyeText}>{showNsec ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>

                    {error && (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>⚠️ {error}</Text>
                        </View>
                    )}

                    <TouchableOpacity
                        onPress={handleLogin}
                        disabled={isLoading}
                        activeOpacity={0.8}
                    >
                        <LinearGradient
                            colors={['#3f3f46', '#18181b', '#09090b']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <View style={styles.buttonContent}>
                                    <Image
                                        source={require('../../assets/nostr-logo.png')}
                                        style={styles.nostrLogo}
                                    />
                                    <Text style={styles.loginButtonText}>Sign In with Nostr</Text>
                                </View>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Security Notice */}
                    <View style={styles.securityNotice}>
                        <Text style={styles.securityIcon}>🔐</Text>
                        <View style={styles.securityTextContainer}>
                            <Text style={styles.securityTitle}>Your key is secure</Text>
                            <Text style={styles.securityText}>
                                Your nsec is stored securely using{' '}
                                {Platform.OS === 'ios' ? 'iOS Keychain with Face ID/Touch ID' : 'Android Keystore with biometric'} protection.
                            </Text>
                            <Text style={styles.securityHighlight}>
                                ✓ Never leaves your device{'\n'}
                                ✓ Protected by {Platform.OS === 'ios' ? 'Face ID / Touch ID' : 'biometric / PIN'}{'\n'}
                                ✓ Used only to sign events locally
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Open Source Link */}
                <TouchableOpacity
                    style={styles.githubLink}
                    onPress={() => Linking.openURL('https://github.com/aqstr-com/aqstr-mobile-app')}
                >
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="#71717a">
                        <Path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </Svg>

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
        marginBottom: 48,
    },
    logoText: {
        fontSize: 42,
        fontWeight: '800',
        color: '#f97316',
        marginBottom: 8,
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
        marginBottom: 12,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#27272a',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#3f3f46',
        marginBottom: 16,
    },
    input: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: '#fff',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    eyeButton: {
        padding: 16,
    },
    eyeText: {
        fontSize: 18,
    },
    errorContainer: {
        backgroundColor: '#7f1d1d',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    errorText: {
        color: '#fca5a5',
        fontSize: 14,
    },
    loginButton: {
        backgroundColor: '#9333ea',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 20,
    },
    loginButtonDisabled: {
        opacity: 0.6,
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    nostrLogo: {
        width: 24,
        height: 24,
    },
    securityNotice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#052e16',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#166534',
    },
    securityIcon: {
        fontSize: 24,
        marginRight: 12,
        marginTop: 2,
    },
    securityTextContainer: {
        flex: 1,
    },
    securityTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#22c55e',
        marginBottom: 4,
    },
    securityText: {
        fontSize: 12,
        color: '#86efac',
        lineHeight: 18,
        marginBottom: 8,
    },
    securityHighlight: {
        fontSize: 12,
        color: '#4ade80',
        lineHeight: 18,
    },
    githubLink: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    githubText: {
        fontSize: 14,
        color: '#71717a',
    },
});
