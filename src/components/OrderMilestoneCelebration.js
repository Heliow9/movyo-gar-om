import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

const COLORS = ["#ff3b8a", "#ff9b2d", "#7c3aed", "#22c55e", "#38bdf8", "#fde047"];
const PARTICLES = Array.from({ length: 34 }, (_, index) => ({
  id: index,
  color: COLORS[index % COLORS.length],
  left: `${4 + ((index * 29) % 92)}%`,
  delay: (index % 9) * 55,
  distance: 230 + (index % 6) * 32,
  rotation: 180 + (index % 5) * 90,
  size: 7 + (index % 4) * 3,
}));

function Particle({ config, progress }) {
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, config.distance],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${config.rotation}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.12, 0.82, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          backgroundColor: config.color,
          height: config.size * 1.8,
          left: config.left,
          opacity,
          transform: [{ translateY }, { rotate }],
          width: config.size,
        },
      ]}
    />
  );
}

export default function OrderMilestoneCelebration({ milestone, visible, onClose }) {
  const entrance = useRef(new Animated.Value(0)).current;
  const fireworks = useRef(new Animated.Value(0)).current;
  const countdown = useRef(new Animated.Value(1)).current;
  const particles = useMemo(() => PARTICLES, []);

  useEffect(() => {
    if (!visible) {
      entrance.setValue(0);
      fireworks.setValue(0);
      countdown.setValue(1);
      return undefined;
    }

    entrance.setValue(0);
    fireworks.setValue(0);
    countdown.setValue(1);
    Animated.parallel([
      Animated.spring(entrance, {
        toValue: 1,
        friction: 6,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.timing(fireworks, {
        toValue: 1,
        duration: 2600,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(countdown, {
        toValue: 0,
        duration: 15000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(onClose, 15000);
    return () => clearTimeout(timeout);
  }, [countdown, entrance, fireworks, onClose, visible]);

  const scale = entrance.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
  const translateY = entrance.interpolate({ inputRange: [0, 1], outputRange: [35, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay} accessibilityViewIsModal accessibilityLabel={`Comemoração do marco de ${milestone} pedidos`}>
        <View pointerEvents="none" style={styles.particlesLayer}>
          {particles.map((particle) => <Particle key={particle.id} config={particle} progress={fireworks} />)}
        </View>

        <Animated.View style={[styles.cardWrap, { opacity: entrance, transform: [{ translateY }, { scale }] }]}>
          <LinearGradient colors={["#ff3b8a", "#f97316", "#ffb703"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
            <View style={styles.iconCircle}>
              <Ionicons name="trophy" size={48} color="#f59e0b" />
            </View>
            <Text style={styles.eyebrow}>NOVO MARCO DE PEDIDOS!</Text>
            <Text style={styles.number}>{Number(milestone || 0).toLocaleString("pt-BR")}</Text>
            <Text style={styles.title}>pedidos realizados</Text>
            <Text style={styles.message}>Parabéns, equipe! Vocês estão fazendo acontecer.</Text>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} accessibilityRole="button">
              <Text style={styles.buttonText}>Fechar comemoração</Text>
            </Pressable>
            <View style={styles.countdownTrack}>
              <Animated.View style={[styles.countdownBar, { transform: [{ scaleX: countdown }] }]} />
            </View>
            <Text style={styles.countdownText}>Fecha automaticamente em 15 segundos.</Text>
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(10, 7, 18, 0.78)",
    flex: 1,
    justifyContent: "center",
    padding: 22,
  },
  particlesLayer: {
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },
  particle: {
    borderRadius: 3,
    position: "absolute",
    top: "8%",
  },
  cardWrap: {
    maxWidth: 430,
    width: "100%",
  },
  card: {
    alignItems: "center",
    borderRadius: 30,
    elevation: 18,
    overflow: "hidden",
    paddingHorizontal: 24,
    paddingVertical: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.35,
    shadowRadius: 28,
  },
  iconCircle: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 46,
    height: 86,
    justifyContent: "center",
    marginBottom: 18,
    width: 86,
  },
  eyebrow: {
    color: "#fff8e7",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 1.6,
  },
  number: {
    color: "#fff",
    fontSize: 58,
    fontWeight: "900",
    letterSpacing: -2,
    lineHeight: 65,
    marginTop: 7,
  },
  title: {
    color: "#fff",
    fontSize: 25,
    fontWeight: "900",
  },
  message: {
    color: "#fff8e7",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 23,
    marginTop: 14,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#fff",
    borderRadius: 999,
    marginTop: 25,
    paddingHorizontal: 24,
    paddingVertical: 13,
  },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#c2410c", fontSize: 15, fontWeight: "900" },
  countdownTrack: { backgroundColor: "rgba(255,255,255,.24)", borderRadius: 999, height: 4, marginTop: 22, overflow: "hidden", width: "100%" },
  countdownBar: { backgroundColor: "#fff", height: "100%", width: "100%" },
  countdownText: { color: "rgba(255,255,255,.84)", fontSize: 12, fontWeight: "700", marginTop: 9 },
});
