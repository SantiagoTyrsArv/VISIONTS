import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePhrases } from '@/api/usePhrases';
import { t } from '@/i18n';
import { MockSignRecognizer } from '@/services/recognition/MockSignRecognizer';
import type { SignRecognizer } from '@/services/recognition/SignRecognizer';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';
import { colors } from '@/ui/theme';

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { data: phrases } = usePhrases();
  const [lastSign, setLastSign] = useState<string | null>(null);
  const [debugIndex, setDebugIndex] = useState(0);

  // Fase 2/3: sustituir por el reconocedor real (MediaPipe + TFLite). El resto
  // de la pantalla solo conoce la interfaz SignRecognizer.
  const recognizer = useMemo(() => new MockSignRecognizer(), []);
  const recognizerApi: SignRecognizer = recognizer;

  // Catálogo accesible desde el callback sin re-suscribirse en cada render.
  const phrasesRef = useRef(phrases);
  phrasesRef.current = phrases;

  const granted = permission?.granted === true;

  useEffect(() => {
    if (!granted) return;
    const off = recognizerApi.onSign(({ code }) => {
      const phrase = phrasesRef.current?.find((p) => p.code === code);
      if (!phrase) return;
      setLastSign(phrase.text_es);
      void speechService.speak({ code: phrase.code, text: phrase.text_es });
    });
    void recognizerApi.start();
    return () => {
      off();
      recognizerApi.stop();
    };
  }, [granted, recognizerApi]);

  if (!permission) return <View style={styles.safe} />;

  if (!granted) {
    const blocked = permission.canAskAgain === false;
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('camera.permissionTitle')}
        </Text>
        <Text style={styles.body}>
          {blocked ? t('camera.permissionDenied') : t('camera.permissionBody')}
        </Text>
        {blocked ? (
          <Button label={t('camera.openSettings')} onPress={() => void Linking.openSettings()} />
        ) : (
          <Button label={t('camera.permissionGrant')} onPress={() => void requestPermission()} />
        )}
      </SafeAreaView>
    );
  }

  const next = phrases && phrases.length > 0 ? phrases[debugIndex % phrases.length] : undefined;

  return (
    <View style={styles.safe}>
      <CameraView style={StyleSheet.absoluteFill} facing="front" />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>{t('camera.comingSoon')}</Text>
        </View>

        <View style={styles.bottom} pointerEvents="box-none">
          {lastSign ? (
            <Text style={styles.detected}>{t('camera.signDetected', { text: lastSign })}</Text>
          ) : null}
          {next ? (
            <View style={styles.debug}>
              <Text style={styles.debugTitle}>{t('camera.debugTitle')}</Text>
              <Button
                variant="secondary"
                label={t('camera.debugSimulate', { text: next.text_es })}
                onPress={() => {
                  recognizer.simulate(next.code);
                  setDebugIndex((i) => i + 1);
                }}
              />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textMuted, fontSize: 17, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between', padding: 16 },
  banner: {
    alignSelf: 'center',
    backgroundColor: 'rgba(11,18,32,0.85)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  bannerText: { color: colors.card, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  bottom: { gap: 12 },
  detected: {
    color: colors.cardText,
    backgroundColor: colors.card,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    padding: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  debug: { backgroundColor: 'rgba(11,18,32,0.85)', borderRadius: 14, padding: 12, gap: 8 },
  debugTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
});
