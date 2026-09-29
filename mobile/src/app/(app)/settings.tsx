import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { queryClient } from '@/api/queryClient';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { colors, MIN_TOUCH } from '@/ui/theme';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 100) / 100;

function Stepper({
  label,
  value,
  display,
  onChange,
  step,
  min,
  max,
}: {
  label: string;
  value: number;
  display: string;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} -`}
          style={styles.stepBtn}
          onPress={() => onChange(round(clamp(value - step, min, max)))}
        >
          <Text style={styles.stepText}>−</Text>
        </Pressable>
        <Text accessibilityLabel={`${label}: ${display}`} style={styles.value}>
          {display}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          style={styles.stepBtn}
          onPress={() => onChange(round(clamp(value + step, min, max)))}
        >
          <Text style={styles.stepText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const { volume, rate, setVolume, setRate } = useSettings();
  const [loggingOut, setLoggingOut] = useState(false);

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    queryClient.clear();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('settings.title')}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.profile')}</Text>
          <Text style={styles.name}>{user?.display_name}</Text>
          <Text style={styles.muted}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('settings.voice')}</Text>
          <Stepper
            label={t('settings.volume')}
            value={volume}
            display={`${Math.round(volume * 100)}%`}
            onChange={setVolume}
            step={0.1}
            min={0}
            max={1}
          />
          <Stepper
            label={t('settings.rate')}
            value={rate}
            display={`${rate.toFixed(2)}×`}
            onChange={setRate}
            step={0.25}
            min={0.5}
            max={2}
          />
          <Button
            variant="secondary"
            label={t('settings.test')}
            onPress={() => void speechService.speak(t('settings.testPhrase'))}
          />
        </View>

        <Button
          variant="danger"
          label={loggingOut ? t('settings.loggingOut') : t('settings.logout')}
          accessibilityLabel={t('settings.logout')}
          loading={loggingOut}
          onPress={() => void onLogout()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 20 },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  section: { backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  name: { color: colors.text, fontSize: 22, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { color: colors.text, fontSize: 18 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 26, fontWeight: '700' },
  value: { color: colors.text, fontSize: 18, minWidth: 64, textAlign: 'center' },
});
