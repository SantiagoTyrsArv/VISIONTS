import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { usePhrases } from '@/api/usePhrases';
import { t } from '@/i18n';
import { speechService } from '@/services/speech';
import { Button } from '@/ui/Button';
import { PhraseCard } from '@/ui/PhraseCard';
import { colors } from '@/ui/theme';

export default function HomeScreen() {
  const { data, isPending, isError, refetch, isRefetching } = usePhrases();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('home.title')}
      </Text>
      <Text style={styles.hint}>{t('home.hint')}</Text>

      {isPending ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.card} />
          <Text style={styles.hint}>{t('home.loading')}</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('home.error')}</Text>
          <Button label={t('home.retry')} loading={isRefetching} onPress={() => void refetch()} />
        </View>
      ) : (
        <FlatList
          data={data}
          numColumns={2}
          keyExtractor={(p) => p.code}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <PhraseCard
              text={item.text_es}
              onPress={() => void speechService.speak({ code: item.code, text: item.text_es })}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', paddingHorizontal: 20, paddingTop: 12 },
  hint: { color: colors.textMuted, fontSize: 16, paddingHorizontal: 20, paddingBottom: 8 },
  grid: { padding: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorText: { color: colors.danger, fontSize: 18, textAlign: 'center' },
});
