/**
 * PaymentModal - Lightning invoice QR code modal with payment polling
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    Modal,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Dimensions,
    Linking,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { checkCampaignPayment } from '../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const QR_SIZE = Math.min(SCREEN_WIDTH * 0.7, 280);

interface PaymentModalProps {
    visible: boolean;
    onClose: () => void;
    onPaymentConfirmed: () => void;
    campaign: {
        id: string;
        title: string;
        totalCost: number;
        totalBudget: number;
        platformFee: number;
        paymentInvoice: string;
    } | null;
}

export default function PaymentModal({
    visible,
    onClose,
    onPaymentConfirmed,
    campaign,
}: PaymentModalProps) {
    const [isPaid, setIsPaid] = useState(false);
    const [isPolling, setIsPolling] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Poll for payment status
    const checkPayment = useCallback(async () => {
        if (!campaign?.id || isPaid) return;

        try {
            const result = await checkCampaignPayment(campaign.id);
            if (result.paid) {
                setIsPaid(true);
                setIsPolling(false);
                // Small delay before callback to show success state
                setTimeout(() => {
                    onPaymentConfirmed();
                }, 1500);
            }
        } catch (err) {
            console.error('Payment check error:', err);
        }
    }, [campaign?.id, isPaid, onPaymentConfirmed]);

    // Start polling when modal opens
    useEffect(() => {
        let intervalId: NodeJS.Timeout | null = null;

        if (visible && campaign?.paymentInvoice && !isPaid) {
            setIsPolling(true);
            // Check immediately, then every 3 seconds
            checkPayment();
            intervalId = setInterval(checkPayment, 3000);
        }

        return () => {
            if (intervalId) {
                clearInterval(intervalId);
            }
            setIsPolling(false);
        };
    }, [visible, campaign?.paymentInvoice, isPaid, checkPayment]);

    // Reset state when modal closes
    useEffect(() => {
        if (!visible) {
            setIsPaid(false);
            setCopied(false);
            setError(null);
        }
    }, [visible]);

    const handleCopy = async () => {
        if (!campaign?.paymentInvoice) return;

        try {
            await Clipboard.setStringAsync(campaign.paymentInvoice);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
        }
    };

    const handleOpenWallet = async () => {
        if (!campaign?.paymentInvoice) return;

        try {
            const url = `lightning:${campaign.paymentInvoice}`;
            const supported = await Linking.canOpenURL(url);

            if (supported) {
                await Linking.openURL(url);
            } else {
                setError('No lightning wallet found on this device');
            }
        } catch (err) {
            setError('Failed to open wallet');
        }
    };

    if (!campaign) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Fund Campaign</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Text style={styles.closeText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Campaign Info */}
                    <View style={styles.infoSection}>
                        <Text style={styles.campaignTitle} numberOfLines={1}>
                            {campaign.title}
                        </Text>
                        <View style={styles.costBreakdown}>
                            <View style={styles.costRow}>
                                <Text style={styles.costLabel}>Campaign Budget</Text>
                                <Text style={styles.costValue}>
                                    {campaign.totalBudget.toLocaleString()} sats
                                </Text>
                            </View>
                            <View style={styles.costRow}>
                                <Text style={styles.costLabel}>Platform Fee (20%)</Text>
                                <Text style={styles.costValue}>
                                    {campaign.platformFee.toLocaleString()} sats
                                </Text>
                            </View>
                            <View style={[styles.costRow, styles.totalRow]}>
                                <Text style={styles.totalLabel}>Total Cost</Text>
                                <Text style={styles.totalValue}>
                                    ⚡ {campaign.totalCost.toLocaleString()} sats
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* QR Code or Success State */}
                    {isPaid ? (
                        <View style={styles.successContainer}>
                            <Text style={styles.successIcon}>✓</Text>
                            <Text style={styles.successText}>Payment Confirmed!</Text>
                            <Text style={styles.successSubtext}>
                                Your campaign is now active
                            </Text>
                        </View>
                    ) : (
                        <>
                            <View style={styles.qrContainer}>
                                {campaign.paymentInvoice ? (
                                    <QRCode
                                        value={campaign.paymentInvoice}
                                        size={QR_SIZE}
                                        backgroundColor="#18181b"
                                        color="#ffffff"
                                    />
                                ) : (
                                    <ActivityIndicator size="large" color="#f97316" />
                                )}
                            </View>

                            {/* Polling indicator */}
                            {isPolling && (
                                <View style={styles.pollingContainer}>
                                    <ActivityIndicator size="small" color="#71717a" />
                                    <Text style={styles.pollingText}>
                                        Waiting for payment...
                                    </Text>
                                </View>
                            )}

                            {/* Copy Button */}
                            <TouchableOpacity
                                style={styles.copyButton}
                                onPress={handleCopy}
                                disabled={copied}
                            >
                                <Text style={styles.copyButtonText}>
                                    {copied ? '✓ Copied!' : '📋 Copy Invoice'}
                                </Text>
                            </TouchableOpacity>

                            {/* Pay in Wallet Button */}
                            <TouchableOpacity
                                style={styles.payButton}
                                onPress={handleOpenWallet}
                            >
                                <Text style={styles.payButtonText}>
                                    ➕ Pay in Wallet
                                </Text>
                            </TouchableOpacity>

                            <Text style={styles.hint}>
                                Scan with any Lightning wallet to pay
                            </Text>
                        </>
                    )}

                    {/* Error */}
                    {error && (
                        <Text style={styles.errorText}>{error}</Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    container: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#18181b',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: '#27272a',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#27272a',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeText: {
        fontSize: 16,
        color: '#a1a1aa',
    },
    infoSection: {
        marginBottom: 24,
    },
    campaignTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    costBreakdown: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 16,
    },
    costRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    costLabel: {
        fontSize: 14,
        color: '#71717a',
    },
    costValue: {
        fontSize: 14,
        color: '#a1a1aa',
    },
    totalRow: {
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#27272a',
        marginBottom: 0,
    },
    totalLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    totalValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#f97316',
    },
    qrContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        backgroundColor: '#18181b',
        borderRadius: 12,
        marginBottom: 16,
    },
    pollingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
    },
    pollingText: {
        fontSize: 13,
        color: '#71717a',
    },
    copyButton: {
        backgroundColor: '#27272a',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
    },
    copyButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    payButton: {
        backgroundColor: '#f97316',
        paddingVertical: 14,
        paddingHorizontal: 24,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#fb923c',
    },
    payButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    hint: {
        fontSize: 13,
        color: '#52525b',
        textAlign: 'center',
    },
    successContainer: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    successIcon: {
        fontSize: 48,
        color: '#22c55e',
        marginBottom: 16,
    },
    successText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#22c55e',
        marginBottom: 8,
    },
    successSubtext: {
        fontSize: 14,
        color: '#71717a',
    },
    errorText: {
        fontSize: 13,
        color: '#ef4444',
        textAlign: 'center',
        marginTop: 12,
    },
});
