/**
 * HeaderBar - Professional header with logo, profile dropdown
 */
import React, { useState } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Image,
    Modal,
    Pressable,
} from 'react-native';
import { Icon } from './Icon';

interface HeaderBarProps {
    user: {
        displayName?: string;
        picture?: string;
        npub?: string;
        nip05?: string;
    } | null;
    onLogout: () => void;
    onViewMerchantSettings?: () => void;
    onNavigateToTasks?: () => void;
}

/**
 * Top header with logo and profile dropdown
 */
export function HeaderBar({
    user,
    onLogout,
    onViewMerchantSettings,
    onNavigateToTasks
}: HeaderBarProps) {
    const [showProfileMenu, setShowProfileMenu] = useState(false);

    const truncateNpub = (npub: string) => {
        if (!npub) return '';
        return `${npub.slice(0, 10)}...${npub.slice(-4)}`;
    };

    return (
        <View style={styles.header}>
            {/* Left: Logo - tappable to navigate to tasks */}
            <TouchableOpacity
                style={styles.logoContainer}
                onPress={onNavigateToTasks}
                activeOpacity={0.7}
            >
                <Image
                    source={require('../assets/aqstr-logo.png')}
                    style={styles.logoImage}
                />
                <Text style={styles.logoText}>AQSTR</Text>
            </TouchableOpacity>

            {/* Right: Profile */}
            <TouchableOpacity
                style={styles.profileButton}
                onPress={() => setShowProfileMenu(true)}
                activeOpacity={0.7}
            >
                {user?.picture ? (
                    <Image source={{ uri: user.picture }} style={styles.avatarImage} />
                ) : (
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                            {user?.displayName?.charAt(0).toUpperCase() || '?'}
                        </Text>
                    </View>
                )}
                <View style={styles.onlineIndicator} />
            </TouchableOpacity>

            {/* Profile Dropdown Menu */}
            <Modal
                visible={showProfileMenu}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowProfileMenu(false)}
            >
                <Pressable
                    style={styles.modalOverlay}
                    onPress={() => setShowProfileMenu(false)}
                >
                    <View style={styles.dropdownMenu}>
                        {/* Profile Header */}
                        <View style={styles.dropdownHeader}>
                            {user?.picture ? (
                                <Image source={{ uri: user.picture }} style={styles.dropdownAvatar} />
                            ) : (
                                <View style={[styles.avatar, styles.dropdownAvatar]}>
                                    <Text style={styles.avatarText}>
                                        {user?.displayName?.charAt(0).toUpperCase() || '?'}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.dropdownProfileInfo}>
                                <Text style={styles.dropdownName}>
                                    {user?.displayName || 'Anonymous'}
                                </Text>
                                {user?.nip05 ? (
                                    <Text style={styles.dropdownNip05}>✓ {user.nip05}</Text>
                                ) : user?.npub ? (
                                    <Text style={styles.dropdownNpub}>{truncateNpub(user.npub)}</Text>
                                ) : null}
                            </View>
                        </View>

                        <View style={styles.dropdownDivider} />

                        {/* Menu Items */}


                        <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={() => {
                                setShowProfileMenu(false);
                                onViewMerchantSettings?.();
                            }}
                        >
                            <View style={styles.dropdownIconContainer}>
                                <Icon name="settings" size={20} color="#e4e4e7" />
                            </View>
                            <Text style={styles.dropdownItemText}>Merchant Settings</Text>
                        </TouchableOpacity>

                        <View style={styles.dropdownDivider} />

                        <TouchableOpacity
                            style={[styles.dropdownItem, styles.dropdownItemDanger]}
                            onPress={() => {
                                setShowProfileMenu(false);
                                onLogout();
                            }}
                        >
                            <View style={styles.dropdownIconContainer}>
                                <Icon name="logout" size={20} color="#ef4444" />
                            </View>
                            <Text style={[styles.dropdownItemText, styles.dropdownItemTextDanger]}>
                                Sign Out
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Pressable >
            </Modal >
        </View >
    );
}

// Default export for backward compatibility
export default HeaderBar;

const styles = StyleSheet.create({
    // Header styles
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 56,
        paddingBottom: 12,
        backgroundColor: '#0a0a0a',
    },
    logoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logoImage: {
        width: 32,
        height: 32,
        borderRadius: 8,
    },
    logoText: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        marginLeft: 10,
        letterSpacing: 1,
    },
    profileButton: {
        position: 'relative',
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f97316',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    avatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#27272a',
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: '#0a0a0a',
    },

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 100,
        paddingRight: 16,
    },
    dropdownMenu: {
        backgroundColor: '#1c1c1e',
        borderRadius: 16,
        padding: 8,
        width: 260,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
        borderWidth: 1,
        borderColor: '#2c2c2e',
    },
    dropdownHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    dropdownAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        marginRight: 12,
    },
    dropdownProfileInfo: {
        flex: 1,
    },
    dropdownName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    dropdownNip05: {
        fontSize: 12,
        color: '#22c55e',
        marginTop: 2,
    },
    dropdownNpub: {
        fontSize: 11,
        color: '#71717a',
        marginTop: 2,
    },
    dropdownDivider: {
        height: 1,
        backgroundColor: '#2c2c2e',
        marginVertical: 8,
        marginHorizontal: 8,
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    dropdownItemDanger: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },
    dropdownIconContainer: {
        width: 24,
        alignItems: 'center',
        marginRight: 10,
    },
    dropdownItemIcon: {
        // fontSize: 18, 
        // marginRight: 12,
    },
    dropdownItemText: {
        fontSize: 15,
        fontWeight: '500',
        color: '#e4e4e7',
    },
    dropdownItemTextDanger: {
        color: '#ef4444',
    },
});
