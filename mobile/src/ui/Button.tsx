import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, MIN_TOUCH } from './theme';

type Props = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  accessibilityLabel,
}: Props) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        (pressed || inactive) && styles.dim,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? colors.primaryText : colors.text} />
      ) : (
        <Text style={[styles.label, variant !== 'primary' && styles.labelLight]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 8,
    borderRadius: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  secondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  dim: { opacity: 0.7 },
  label: { color: colors.primaryText, fontSize: 18, fontWeight: '700' },
  labelLight: { color: colors.text },
});
