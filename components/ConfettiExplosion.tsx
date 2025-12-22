/**
 * Confetti Explosion Component
 * A fun celebration effect when completing tasks
 */
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    StyleSheet,
    Animated,
    Dimensions,
    Easing,
} from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const CONFETTI_COLORS = [
    '#f97316', // Orange (primary)
    '#fbbf24', // Yellow/Gold
    '#d1d5db', // Silver/Gray
    '#ffffff', // White
    '#f59e0b', // Amber
    '#fcd34d', // Light Gold
];

interface ConfettiPiece {
    id: number;
    x: Animated.Value;
    y: Animated.Value;
    rotation: Animated.Value;
    wobble: Animated.Value;
    scale: Animated.Value;
    opacity: Animated.Value;
    color: string;
    shape: 'square' | 'circle' | 'ribbon';
    size: number;
    velocityX: number;
    velocityY: number;
    wobbleSpeed: number;
    wobbleRange: number;
}

interface ConfettiExplosionProps {
    isActive: boolean;
    onComplete?: () => void;
    particleCount?: number;
    duration?: number;
}

export default function ConfettiExplosion({
    isActive,
    onComplete,
    particleCount = 60,
    duration = 3500,
}: ConfettiExplosionProps) {
    const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
    const animationsRef = useRef<Animated.CompositeAnimation[]>([]);

    useEffect(() => {
        if (isActive) {
            createConfetti();
        } else {
            animationsRef.current.forEach(anim => anim.stop());
            setPieces([]);
        }

        return () => {
            animationsRef.current.forEach(anim => anim.stop());
        };
    }, [isActive]);

    const createConfetti = () => {
        const newPieces: ConfettiPiece[] = [];
        const shapes: ('square' | 'circle' | 'ribbon')[] = ['square', 'circle', 'ribbon'];

        // Split particles between left and right emitters
        for (let i = 0; i < particleCount; i++) {
            const isLeft = i < particleCount / 2;
            const startX = isLeft ? -20 : SCREEN_WIDTH + 20;
            const startY = SCREEN_HEIGHT * 0.8;

            // Adjust angle based on emitter side (left shoots right-up, right shoots left-up)
            const angleRange = Math.PI / 3; // 60 degrees
            const baseAngle = isLeft ? -Math.PI / 4 : -Math.PI * 0.75;
            const angle = baseAngle + (Math.random() - 0.5) * angleRange;

            const speed = 600 + Math.random() * 800;
            const velocityX = Math.cos(angle) * speed;
            const velocityY = Math.sin(angle) * speed;

            newPieces.push({
                id: i,
                x: new Animated.Value(startX),
                y: new Animated.Value(startY),
                rotation: new Animated.Value(0),
                wobble: new Animated.Value(0),
                scale: new Animated.Value(0.1),
                opacity: new Animated.Value(1),
                color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
                shape: shapes[Math.floor(Math.random() * shapes.length)],
                size: 8 + Math.random() * 10,
                velocityX,
                velocityY,
                wobbleSpeed: 5 + Math.random() * 10,
                wobbleRange: 10 + Math.random() * 30,
            });
        }

        setPieces(newPieces);

        const animations = newPieces.map((piece, index) => {
            const isLeft = index < particleCount / 2;
            const startX = isLeft ? -20 : SCREEN_WIDTH + 20;
            const startY = SCREEN_HEIGHT * 0.8;
            const gravity = 1200 + Math.random() * 600; // Varied gravity

            // Motion animation
            const moveAnim = Animated.parallel([
                Animated.timing(piece.x, {
                    toValue: startX + piece.velocityX * 1.5,
                    duration,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(piece.y, {
                    // Complex gravity curve
                    toValue: startY + piece.velocityY * 0.5 + gravity * 0.2,
                    duration,
                    easing: Easing.bezier(0.1, 0.5, 0.5, 1),
                    useNativeDriver: true,
                }),
            ]);

            // Rotation animation
            const rotateAnim = Animated.timing(piece.rotation, {
                toValue: 360 * (4 + Math.random() * 6),
                duration,
                easing: Easing.linear,
                useNativeDriver: true,
            });

            // Wobble (air resistance simulation)
            const wobbleAnim = Animated.loop(
                Animated.sequence([
                    Animated.timing(piece.wobble, {
                        toValue: 1,
                        duration: 500 + Math.random() * 500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(piece.wobble, {
                        toValue: -1,
                        duration: 500 + Math.random() * 500,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                ]),
                { iterations: -1 }
            );

            // Scale and fade
            const scaleAndFade = Animated.sequence([
                Animated.timing(piece.scale, {
                    toValue: 1,
                    duration: 200,
                    easing: Easing.out(Easing.back(1.5)),
                    useNativeDriver: true,
                }),
                Animated.delay(duration * 0.7),
                Animated.parallel([
                    Animated.timing(piece.opacity, {
                        toValue: 0,
                        duration: duration * 0.3,
                        useNativeDriver: true,
                    }),
                    Animated.timing(piece.scale, {
                        toValue: 0.2,
                        duration: duration * 0.3,
                        useNativeDriver: true,
                    }),
                ]),
            ]);

            return Animated.parallel([
                moveAnim,
                rotateAnim,
                wobbleAnim,
                scaleAndFade,
            ]);
        });

        animationsRef.current = animations;

        Animated.parallel(animations).start(() => {
            setPieces([]);
            onComplete?.();
        });
    };

    const renderConfettiPiece = (piece: ConfettiPiece) => {
        const rotateInterpolation = piece.rotation.interpolate({
            inputRange: [0, 360],
            outputRange: ['0deg', '360deg'],
        });

        const wobbleInterpolation = piece.wobble.interpolate({
            inputRange: [-1, 1],
            outputRange: [-piece.wobbleRange, piece.wobbleRange],
        });

        const style = {
            position: 'absolute' as const,
            transform: [
                { translateX: piece.x },
                { translateY: piece.y },
                { translateX: wobbleInterpolation }, // Side-to-side wobble
                { translateX: -piece.size / 2 },
                { translateY: -piece.size / 2 },
                { rotate: rotateInterpolation },
                { scale: piece.scale },
            ],
            opacity: piece.opacity,
        };

        if (piece.shape === 'circle') {
            return (
                <Animated.View
                    key={piece.id}
                    style={[
                        style,
                        {
                            width: piece.size * 0.6, // Glitter is smaller
                            height: piece.size * 0.6,
                            borderRadius: piece.size * 0.3,
                            backgroundColor: piece.color,
                            shadowColor: piece.color,
                            shadowOffset: { width: 0, height: 0 },
                            shadowOpacity: 0.8,
                            shadowRadius: 2,
                        },
                    ]}
                />
            );
        }

        if (piece.shape === 'ribbon') {
            return (
                <Animated.View
                    key={piece.id}
                    style={[
                        style,
                        {
                            width: piece.size * 0.4,
                            height: piece.size * 2,
                            backgroundColor: piece.color,
                            borderRadius: 1,
                        },
                    ]}
                />
            );
        }

        // Square/Standard
        return (
            <Animated.View
                key={piece.id}
                style={[
                    style,
                    {
                        width: piece.size,
                        height: piece.size,
                        backgroundColor: piece.color,
                        borderRadius: 2,
                    },
                ]}
            />
        );
    };

    if (!isActive && pieces.length === 0) {
        return null;
    }

    return (
        <View style={styles.container} pointerEvents="none">
            {pieces.map(renderConfettiPiece)}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 9999,
    },
});
