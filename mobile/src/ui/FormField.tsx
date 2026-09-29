import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors, MIN_TOUCH } from './theme';

type Props<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
} & Pick<
  TextInputProps,
  'secureTextEntry' | 'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType'
>;

export function FormField<T extends FieldValues>({ control, name, label, ...inputProps }: Props<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value }, fieldState: { error } }) => (
        <View style={styles.wrapper}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            {...inputProps}
            accessibilityLabel={label}
            style={[styles.input, error && styles.inputError]}
            placeholderTextColor={colors.textMuted}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
          />
          {error?.message ? (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {error.message}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 18,
    paddingHorizontal: 14,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 14 },
});
