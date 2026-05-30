import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const STORAGE_KEY = 'potorder:state:v1';

const FOODS = ['🍤', '🥟', '🍄', '🌽', '🥬', '🥩', '🍢', '🍅', '🥕', '🦀', '🌶️', '🧅'] as const;
type Food = (typeof FOODS)[number];

const BELT_HEIGHT = 120;
const ITEM_SIZE = 64;
const POT_SIZE = 180;
const BASE_TRAVEL_MS = 6000;
const MIN_TRAVEL_MS = 2200;
const SPAWN_MIN_MS = 700;
const SPAWN_MAX_MS = 1600;
const MAX_LIVES = 3;
const FEVER_REQUIRED_COMBO = 8;
const FEVER_DURATION_MS = 6000;

type Item = {
  id: string;
  food: Food;
  spawnedAt: number;
  travelMs: number;
  x: Animated.Value;
  consumed: boolean;
};

type SavedState = {
  highScore: number;
  haptics: boolean;
};

export default function App() {
  useKeepAwake();
  const [scene, setScene] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [items, setItems] = useState<Item[]>([]);
  const [request, setRequest] = useState<Food>(FOODS[0]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [fever, setFever] = useState(false);
  const [highScore, setHighScore] = useState(0);
  const [haptics, setHaptics] = useState(true);
  const [loaded, setLoaded] = useState(false);

  const itemsRef = useRef<Item[]>([]);
  const liveRef = useRef(true);
  const sceneRef = useRef<typeof scene>('menu');
  const requestRef = useRef<Food>(FOODS[0]);
  const feverRef = useRef(false);
  const feverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spawnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);
  useEffect(() => {
    requestRef.current = request;
  }, [request]);
  useEffect(() => {
    feverRef.current = fever;
  }, [fever]);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s = JSON.parse(raw) as Partial<SavedState>;
          if (typeof s.highScore === 'number') setHighScore(s.highScore);
          if (typeof s.haptics === 'boolean') setHaptics(s.haptics);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // Save
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ highScore, haptics } satisfies SavedState)).catch(() => {});
  }, [highScore, haptics, loaded]);

  const tick = useCallback(
    (kind: 'light' | 'medium' | 'success' | 'warning' | 'error' = 'light') => {
      if (!haptics) return;
      switch (kind) {
        case 'success':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'warning':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
          break;
        case 'error':
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          break;
        case 'medium':
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          break;
        default:
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    },
    [haptics],
  );

  const clearTimers = useCallback(() => {
    if (spawnTimerRef.current) clearTimeout(spawnTimerRef.current);
    spawnTimerRef.current = null;
    if (feverTimerRef.current) clearTimeout(feverTimerRef.current);
    feverTimerRef.current = null;
  }, []);

  const endGame = useCallback(() => {
    if (sceneRef.current !== 'playing') return;
    liveRef.current = false;
    clearTimers();
    tick('error');
    setHighScore((hs) => Math.max(hs, scoreRef.current));
    setScene('gameover');
  }, [clearTimers, tick]);

  // Score ref for end-of-game capture
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const loseLife = useCallback(() => {
    setLives((l) => {
      const next = l - 1;
      if (next <= 0) {
        // schedule endGame on next tick so state has settled
        setTimeout(endGame, 0);
        return 0;
      }
      tick('warning');
      return next;
    });
    setCombo(0);
  }, [endGame, tick]);

  const rollRequest = useCallback(() => {
    // pick something different from current; prefer items currently on belt
    const onBelt = itemsRef.current
      .filter((it) => !it.consumed)
      .map((it) => it.food);
    const pool =
      onBelt.length > 0 && Math.random() < 0.7
        ? onBelt
        : (FOODS as readonly Food[]);
    let next = pool[Math.floor(Math.random() * pool.length)];
    if (next === requestRef.current && pool.length > 1) {
      for (let i = 0; i < 5; i++) {
        const candidate = pool[Math.floor(Math.random() * pool.length)];
        if (candidate !== requestRef.current) {
          next = candidate;
          break;
        }
      }
    }
    setRequest(next);
  }, []);

  const enterFever = useCallback(() => {
    setFever(true);
    tick('success');
    if (feverTimerRef.current) clearTimeout(feverTimerRef.current);
    feverTimerRef.current = setTimeout(() => {
      setFever(false);
      feverTimerRef.current = null;
    }, FEVER_DURATION_MS);
  }, [tick]);

  const spawnItem = useCallback(() => {
    if (!liveRef.current || sceneRef.current !== 'playing') return;
    const food = FOODS[Math.floor(Math.random() * FOODS.length)];
    // Travel time scales down with score for difficulty ramp.
    const ramp = Math.min(1, scoreRef.current / 60);
    const travelMs = Math.round(BASE_TRAVEL_MS - (BASE_TRAVEL_MS - MIN_TRAVEL_MS) * ramp);
    const item: Item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      food,
      spawnedAt: Date.now(),
      travelMs,
      x: new Animated.Value(SCREEN_W),
      consumed: false,
    };
    setItems((prev) => [...prev, item]);
    Animated.timing(item.x, {
      toValue: -ITEM_SIZE - 8,
      duration: travelMs,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      // Item slid off without being tapped — only counts as miss if it
      // matched the active request.
      const current = itemsRef.current.find((i) => i.id === item.id);
      if (!current || current.consumed) return;
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (item.food === requestRef.current && sceneRef.current === 'playing') {
        loseLife();
      }
    });
    // Schedule next spawn.
    const spawnRamp = Math.max(0.55, 1 - scoreRef.current / 80);
    const nextDelay =
      SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS) * spawnRamp;
    spawnTimerRef.current = setTimeout(spawnItem, nextDelay);
  }, [loseLife]);

  const startGame = useCallback(() => {
    clearTimers();
    setItems([]);
    setScore(0);
    setCombo(0);
    setBestCombo(0);
    setLives(MAX_LIVES);
    setFever(false);
    setRequest(FOODS[Math.floor(Math.random() * FOODS.length)]);
    liveRef.current = true;
    sceneRef.current = 'playing';
    setScene('playing');
    spawnTimerRef.current = setTimeout(spawnItem, 600);
  }, [clearTimers, spawnItem]);

  const handleTap = useCallback(
    (item: Item) => {
      if (sceneRef.current !== 'playing' || item.consumed) return;
      const matched = item.food === requestRef.current;
      // Stop the slide animation in place; mark consumed so the end
      // callback doesn't fire a miss too.
      item.x.stopAnimation();
      const consumedItem = { ...item, consumed: true };
      setItems((prev) =>
        prev.map((p) => (p.id === item.id ? consumedItem : p)).filter((p) => !(p.id === item.id && !matched)),
      );

      if (matched) {
        // Fly into pot
        Animated.parallel([
          Animated.timing(item.x, {
            toValue: SCREEN_W / 2 - ITEM_SIZE / 2,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          setItems((prev) => prev.filter((p) => p.id !== item.id));
        });
        const points = (feverRef.current ? 2 : 1) * (1 + Math.floor(combo / 5));
        setScore((s) => s + points);
        setCombo((c) => {
          const next = c + 1;
          setBestCombo((b) => Math.max(b, next));
          if (!feverRef.current && next > 0 && next % FEVER_REQUIRED_COMBO === 0) {
            enterFever();
          }
          return next;
        });
        tick(feverRef.current ? 'success' : 'light');
        rollRequest();
      } else {
        // Wrong item — bounce and drop, lose a life
        Animated.sequence([
          Animated.timing(item.x, {
            toValue: (item.x as any)._value - 24,
            duration: 80,
            useNativeDriver: true,
          }),
          Animated.timing(item.x, {
            toValue: (item.x as any)._value,
            duration: 120,
            useNativeDriver: true,
          }),
        ]).start(() => {
          setItems((prev) => prev.filter((p) => p.id !== item.id));
        });
        loseLife();
      }
    },
    [combo, enterFever, loseLife, rollRequest, tick],
  );

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const beltY = useMemo(() => SCREEN_H * 0.62, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <View style={styles.brand}>
          <Text style={styles.brandText}>
            Pot <Text style={styles.brandItalic}>Order</Text>
          </Text>
        </View>
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>SCORE</Text>
          <Text style={styles.scoreValue}>{score}</Text>
        </View>
      </View>

      <View style={styles.statRow}>
        <View style={styles.livesRow}>
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <Text key={i} style={[styles.heart, i >= lives && styles.heartDim]}>
              ♥
            </Text>
          ))}
        </View>
        <Text style={styles.comboLabel}>
          {combo > 0 ? `×${combo}` : ' '}
          {fever ? '   FEVER' : ''}
        </Text>
        <Text style={styles.bestLabel}>BEST {highScore}</Text>
      </View>

      {/* Pot */}
      <View style={styles.potWrap} pointerEvents="none">
        <View style={[styles.pot, fever && styles.potFever]}>
          <Text style={styles.steam}>～</Text>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{request}</Text>
            <Text style={styles.bubbleSub}>order</Text>
          </View>
        </View>
      </View>

      {/* Belt */}
      <View style={[styles.belt, { top: beltY }]} pointerEvents={scene === 'playing' ? 'auto' : 'none'}>
        <View style={styles.beltSurface} />
        {scene === 'playing' &&
          items.map((it) => (
            <Animated.View
              key={it.id}
              style={[
                styles.beltItem,
                { transform: [{ translateX: it.x }] },
              ]}
            >
              <Pressable
                onPress={() => handleTap(it)}
                hitSlop={10}
                style={({ pressed }) => [styles.itemTouch, pressed && { transform: [{ scale: 0.92 }] }]}
              >
                <Text style={styles.itemEmoji}>{it.food}</Text>
              </Pressable>
            </Animated.View>
          ))}
      </View>

      <View style={styles.beltFootnote} pointerEvents="none">
        <Text style={styles.beltFootnoteText}>tap matching items to feed the pot</Text>
      </View>

      {/* Menu */}
      <Modal visible={scene === 'menu'} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>
              Pot <Text style={styles.menuTitleItalic}>Order</Text>
            </Text>
            <Text style={styles.menuTagline}>
              Send the right food to the pot before it slides off the belt.
            </Text>
            <View style={styles.howRow}>
              <HowItem n="01" text="The pot orders one ingredient at a time" />
              <HowItem n="02" text="Tap items on the belt that match the order" />
              <HowItem n="03" text="Three misses and dinner's over" />
            </View>
            <Pressable
              onPress={startGame}
              style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.playBtnText}>Start cooking</Text>
            </Pressable>
            <Pressable
              onPress={() => setHaptics((h) => !h)}
              style={styles.hapticsToggle}
              hitSlop={8}
            >
              <Text style={styles.hapticsText}>{haptics ? '◉ Haptics on' : '◯ Haptics off'}</Text>
            </Pressable>
            <Text style={styles.menuFoot}>BEST · {highScore}</Text>
          </View>
        </View>
      </Modal>

      {/* Game over */}
      <Modal visible={scene === 'gameover'} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.menuCard}>
            <Text style={styles.gameoverEyebrow}>SERVICE OVER</Text>
            <Text style={styles.gameoverScore}>{score}</Text>
            <Text style={styles.gameoverLabel}>orders filled</Text>
            <View style={styles.scoreStrip}>
              <View style={styles.scoreCell}>
                <Text style={styles.scoreCellLabel}>BEST COMBO</Text>
                <Text style={styles.scoreCellValue}>×{bestCombo}</Text>
              </View>
              <View style={styles.scoreCell}>
                <Text style={styles.scoreCellLabel}>HIGH SCORE</Text>
                <Text style={styles.scoreCellValue}>{highScore}</Text>
              </View>
            </View>
            <Pressable
              onPress={startGame}
              style={({ pressed }) => [styles.playBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.playBtnText}>Cook again</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                clearTimers();
                setScene('menu');
              }}
              style={styles.menuLink}
              hitSlop={8}
            >
              <Text style={styles.menuLinkText}>Back to menu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function HowItem({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.howRowItem}>
      <Text style={styles.howN}>{n}</Text>
      <Text style={styles.howT}>{text}</Text>
    </View>
  );
}

const COLORS = {
  bg: '#1a0e0c',
  bgWarm: '#231311',
  ink: '#fef3ec',
  inkDim: '#bda49a',
  accent: '#d24a2a',
  accentDeep: '#8a2f1a',
  pot: '#1a1a1a',
  potRim: '#4d3a32',
  belt: '#3a2823',
  beltLine: '#2c1d18',
  feverGold: '#e5a23a',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4,
  },
  brand: {},
  brandText: { fontSize: 18, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.2 },
  brandItalic: { fontStyle: 'italic', color: COLORS.accent, fontWeight: '600' },
  scoreBox: { alignItems: 'flex-end' },
  scoreLabel: { fontSize: 10, color: COLORS.inkDim, letterSpacing: 2 },
  scoreValue: { fontSize: 28, color: COLORS.ink, fontWeight: '300', fontVariant: ['tabular-nums'], lineHeight: 30 },

  statRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8,
  },
  livesRow: { flexDirection: 'row', gap: 4 },
  heart: { fontSize: 18, color: COLORS.accent },
  heartDim: { color: '#3a2828' },
  comboLabel: { fontSize: 14, color: COLORS.feverGold, fontWeight: '700', letterSpacing: 1 },
  bestLabel: { fontSize: 10, color: COLORS.inkDim, letterSpacing: 2 },

  potWrap: {
    position: 'absolute',
    top: SCREEN_H * 0.22,
    left: 0, right: 0,
    alignItems: 'center',
  },
  pot: {
    width: POT_SIZE, height: POT_SIZE * 0.78,
    borderRadius: POT_SIZE / 2,
    backgroundColor: COLORS.pot,
    borderTopWidth: 6,
    borderTopColor: COLORS.potRim,
    alignItems: 'center', justifyContent: 'flex-start',
    paddingTop: 6,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 24,
  },
  potFever: {
    shadowColor: COLORS.feverGold,
    shadowOpacity: 0.8,
  },
  steam: { color: COLORS.inkDim, fontSize: 22, opacity: 0.55, marginTop: -4 },
  bubble: {
    position: 'absolute',
    top: -68, alignSelf: 'center',
    backgroundColor: COLORS.ink, borderRadius: 18,
    paddingHorizontal: 18, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  bubbleText: { fontSize: 36, lineHeight: 40 },
  bubbleSub: { fontSize: 9, color: '#7a3a2a', letterSpacing: 2, marginTop: 2 },

  belt: {
    position: 'absolute',
    left: 0, right: 0,
    height: BELT_HEIGHT,
  },
  beltSurface: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: COLORS.belt,
    borderTopWidth: 1, borderTopColor: COLORS.beltLine,
    borderBottomWidth: 1, borderBottomColor: COLORS.beltLine,
  },
  beltItem: {
    position: 'absolute',
    top: (BELT_HEIGHT - ITEM_SIZE) / 2,
    width: ITEM_SIZE, height: ITEM_SIZE,
  },
  itemTouch: {
    width: ITEM_SIZE, height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    backgroundColor: '#fef3ec',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  itemEmoji: { fontSize: 36 },

  beltFootnote: { position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center' },
  beltFootnoteText: { fontSize: 11, color: COLORS.inkDim, letterSpacing: 1.5 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(10,5,4,0.85)',
    alignItems: 'center', justifyContent: 'center',
    padding: 28,
  },
  menuCard: {
    backgroundColor: COLORS.bgWarm,
    borderRadius: 22, padding: 28,
    width: '100%', maxWidth: 360,
    borderWidth: 1, borderColor: '#3a2823',
    alignItems: 'center',
  },
  menuTitle: { fontSize: 36, color: COLORS.ink, fontWeight: '700', letterSpacing: -0.5 },
  menuTitleItalic: { fontStyle: 'italic', color: COLORS.accent, fontWeight: '600' },
  menuTagline: {
    fontSize: 14, color: COLORS.inkDim, textAlign: 'center',
    marginTop: 8, marginBottom: 22, lineHeight: 20,
  },
  howRow: { alignSelf: 'stretch', marginBottom: 22, gap: 12 },
  howRowItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howN: { fontStyle: 'italic', color: COLORS.accent, width: 24, fontSize: 14, fontWeight: '700' },
  howT: { flex: 1, color: COLORS.ink, fontSize: 13, lineHeight: 18, opacity: 0.85 },
  playBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 36, paddingVertical: 14, borderRadius: 999,
  },
  playBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', letterSpacing: 0.3 },
  hapticsToggle: { marginTop: 16, paddingVertical: 4 },
  hapticsText: { color: COLORS.inkDim, fontSize: 12, letterSpacing: 1 },
  menuFoot: { marginTop: 14, color: COLORS.inkDim, fontSize: 11, letterSpacing: 2 },

  gameoverEyebrow: { color: COLORS.accent, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  gameoverScore: { color: COLORS.ink, fontSize: 64, fontWeight: '300', marginTop: 8, fontVariant: ['tabular-nums'] },
  gameoverLabel: { color: COLORS.inkDim, fontSize: 12, letterSpacing: 2, marginBottom: 22 },
  scoreStrip: { flexDirection: 'row', gap: 22, marginBottom: 22 },
  scoreCell: { alignItems: 'center' },
  scoreCellLabel: { color: COLORS.inkDim, fontSize: 9, letterSpacing: 1.5 },
  scoreCellValue: { color: COLORS.ink, fontSize: 22, fontWeight: '600', marginTop: 4, fontVariant: ['tabular-nums'] },
  menuLink: { marginTop: 12, paddingVertical: 4 },
  menuLinkText: { color: COLORS.inkDim, fontSize: 12, letterSpacing: 1 },
});
