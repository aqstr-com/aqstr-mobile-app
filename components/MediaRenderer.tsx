import React, { useMemo, useState, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, Text, TouchableOpacity, Modal, Pressable, PanResponder, Animated } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface MediaRendererProps {
    urls: string[];
}

const { width } = Dimensions.get('window');
// content area width = screen width - (list horizontal padding) - (card horizontal padding)
const CONTENT_WIDTH = width - 64;

const isVideoUrl = (url: string) => {
    const videoExtensions = ['.mp4', '.mov', '.m4v'];
    return videoExtensions.some(ext => url.toLowerCase().includes(ext));
};

export default function MediaRenderer({ urls }: MediaRendererProps) {
    const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
    const pan = useRef(new Animated.ValueXY()).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                const { dx, dy } = gestureState;
                return Math.abs(dx) > 10 || Math.abs(dy) > 10;
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
                useNativeDriver: false
            }),
            onPanResponderRelease: (_, gestureState) => {
                const { dx, dy, vx, vy } = gestureState;
                const threshold = 100;
                const velocityThreshold = 0.5;

                const shouldClose =
                    Math.abs(dx) > threshold ||
                    Math.abs(dy) > threshold ||
                    Math.abs(vx) > velocityThreshold ||
                    Math.abs(vy) > velocityThreshold;

                if (shouldClose) {
                    setSelectedMedia(null);
                    pan.setValue({ x: 0, y: 0 });
                } else {
                    Animated.spring(pan, {
                        toValue: { x: 0, y: 0 },
                        useNativeDriver: false,
                    }).start();
                }
            },
        })
    ).current;

    const videos = useMemo(() => urls.filter(isVideoUrl), [urls]);
    const images = useMemo(() => urls.filter(url => !isVideoUrl(url)), [urls]);

    const handleSelect = (url: string) => {
        pan.setValue({ x: 0, y: 0 });
        setSelectedMedia(url);
    };

    if (!urls || urls.length === 0) return null;

    return (
        <View style={styles.container}>
            {images.length > 0 && (
                <View style={styles.galleryContainer}>
                    {images.length === 1 ? (
                        <TouchableOpacity
                            onPress={() => handleSelect(images[0])}
                            activeOpacity={0.9}
                        >
                            <MediaItem url={images[0]} />
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.grid}>
                            {images.map((url, index) => {
                                let itemStyle: any = {
                                    width: '48.5%',
                                    marginBottom: 8
                                };

                                if (images.length === 3 && index === 0) {
                                    itemStyle.width = '100%';
                                } else {
                                    const isLeftColumn = images.length === 3 ? index % 2 === 1 : index % 2 === 0;
                                    if (isLeftColumn) {
                                        itemStyle.marginRight = '3%';
                                    }
                                }

                                return (
                                    <TouchableOpacity
                                        key={`${url}-${index}`}
                                        onPress={() => handleSelect(url)}
                                        activeOpacity={0.9}
                                        style={[styles.gridItem, itemStyle]}
                                    >
                                        <Image
                                            source={{ uri: url }}
                                            style={[
                                                styles.gridImage,
                                                images.length === 3 && index === 0 ? { height: 200 } : { height: 120 }
                                            ]}
                                            resizeMode="cover"
                                        />
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>
            )}

            {videos.map((url, index) => (
                <TouchableOpacity
                    key={`${url}-${index}`}
                    onPress={() => handleSelect(url)}
                    activeOpacity={0.9}
                >
                    <MediaItem url={url} />
                </TouchableOpacity>
            ))}

            <Modal
                visible={!!selectedMedia}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedMedia(null)}
            >
                <View style={styles.modalOverlay}>
                    <Pressable
                        style={styles.modalBackground}
                        onPress={() => setSelectedMedia(null)}
                    />
                    <Animated.View
                        style={[
                            styles.modalContent,
                            {
                                transform: [
                                    { translateX: pan.x },
                                    { translateY: pan.y }
                                ]
                            }
                        ]}
                        {...panResponder.panHandlers}
                    >
                        <Pressable style={styles.contentPressable} onPress={() => setSelectedMedia(null)}>
                            {selectedMedia && (
                                <MediaItem url={selectedMedia} isFullScreen />
                            )}
                        </Pressable>
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setSelectedMedia(null)}
                        >
                            <Text style={styles.closeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

function MediaItem({ url, isFullScreen }: { url: string; isFullScreen?: boolean }) {
    const isVideo = useMemo(() => isVideoUrl(url), [url]);

    if (isVideo) {
        return <VideoPlayerItem url={url} isFullScreen={isFullScreen} />;
    }

    return (
        <Image
            source={{ uri: url }}
            style={isFullScreen ? styles.fullImage : styles.image}
            resizeMode={isFullScreen ? "contain" : "cover"}
        />
    );
}

function VideoPlayerItem({ url, isFullScreen }: { url: string; isFullScreen?: boolean }) {
    const player = useVideoPlayer(url, (player) => {
        player.loop = true;
        player.muted = !isFullScreen;
        if (isFullScreen) {
            player.play();
        }
    });

    return (
        <View style={isFullScreen ? styles.fullVideoContainer : styles.videoContainer}>
            <VideoView
                style={styles.video}
                player={player}
                fullscreenOptions={{ enable: true }}
                allowsPictureInPicture
                nativeControls={isFullScreen}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 4,
    },
    image: {
        width: CONTENT_WIDTH,
        height: CONTENT_WIDTH * 0.75,
        borderRadius: 12,
        backgroundColor: '#18181b',
    },
    fullImage: {
        width: width,
        height: '100%',
        backgroundColor: 'transparent',
    },
    galleryContainer: {
        width: '100%',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    gridItem: {
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#18181b',
    },
    gridImage: {
        width: '100%',
        height: 120,
    },
    videoContainer: {
        width: CONTENT_WIDTH,
        height: CONTENT_WIDTH * 0.75,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#000',
    },
    fullVideoContainer: {
        width: width,
        height: '80%',
        backgroundColor: '#000',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
    },
    modalBackground: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    modalContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2,
    },
    contentPressable: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 20,
    },
    closeButtonText: {
        color: '#fff',
        fontSize: 24,
        fontWeight: '300',
    },
});
