import { Pressable, StyleSheet, Text } from 'react-native';

import { t } from '@/i18n';

import { colors } from './theme';

type Props = { text: string; onPress: () => void };

export function PhraseCard({ text, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('home.speakA11y', { text })}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <Text style={styles.text} adjustsFontSizeToFit numberOfLines={3}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 120,
    margin: 6,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
  text: { color: colors.cardText, fontSize: 24, fontWeight: '800', textAlign: 'center' },
});
