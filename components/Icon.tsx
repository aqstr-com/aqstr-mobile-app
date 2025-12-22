import React from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet } from 'react-native';

export type IconName =
    | 'boost'
    | 'like'
    | 'logout'
    | 'reply'
    | 'repost'
    | 'settings'
    | 'stats'
    | 'zap'
    | 'merchant'
    | 'tasks'
    | 'userFeed'
    | 'publicFeed'
    | 'tick';

interface IconProps {
    name: IconName;
    size?: number;
    color?: string;
    style?: StyleProp<ImageStyle>;
}

export const Icon = ({ name, size = 20, color, style }: IconProps) => {
    // Map of icon names to require paths
    const iconMap: Record<IconName, any> = {
        boost: require('../assets/icons/boost.png'),
        like: require('../assets/icons/like.png'),
        logout: require('../assets/icons/logout.png'),
        reply: require('../assets/icons/reply.png'),
        repost: require('../assets/icons/repost.png'),
        settings: require('../assets/icons/settings.png'),
        stats: require('../assets/icons/stats.png'),
        zap: require('../assets/icons/zap.png'),
        merchant: require('../assets/icons/merchant.png'),
        tasks: require('../assets/icons/tasks.png'),
        userFeed: require('../assets/icons/user-feed.png'),
        publicFeed: require('../assets/icons/public-feed.png'),
        tick: require('../assets/icons/tick.png'),
    };

    return (
        <Image
            source={iconMap[name]}
            style={[
                styles.icon,
                { width: size, height: size },
                color ? { tintColor: color } : undefined,
                style
            ]}
            resizeMode="contain"
        />
    );
};

const styles = StyleSheet.create({
    icon: {
        // Base styles if needed
    }
});
