import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { palette } from '../theme';

interface SectionProps {
  title: string;
  eyebrow: string;
  children: ReactNode;
}

interface ChoiceRowProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

interface InputRowProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: KeyboardTypeOptions;
  accessibilityLabel?: string;
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  emphasis?: boolean;
}

export function Section({ title, eyebrow, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: ChoiceRowProps<T>) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.choices}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(option.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text
                style={[
                  styles.choiceText,
                  selected && styles.choiceTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: ToggleRowProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={styles.toggleRow}
    >
      <View style={styles.toggleCopy}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, value && styles.switchTrackActive]}>
        <View style={[styles.switchThumb, value && styles.switchThumbActive]} />
      </View>
    </Pressable>
  );
}

export function InputRow({
  label,
  value,
  onChangeText,
  keyboardType,
  accessibilityLabel,
}: InputRowProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        selectTextOnFocus={keyboardType === 'number-pad'}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  disabled = false,
  emphasis = false,
}: ActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        emphasis && styles.actionEmphasis,
        disabled && styles.actionDisabled,
      ]}
    >
      <Text style={[styles.actionText, emphasis && styles.actionTextEmphasis]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: palette.paper,
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#0F2747',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 15,
    elevation: 2,
  },
  eyebrow: {
    color: palette.blue,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: palette.ink,
    fontSize: 19,
    fontWeight: '800',
    marginTop: 4,
  },
  sectionBody: {
    gap: 15,
    marginTop: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  hint: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  choice: {
    backgroundColor: '#F5F7FA',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  choiceSelected: {
    backgroundColor: palette.blueWash,
    borderColor: palette.blue,
  },
  choiceText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  choiceTextSelected: {
    color: '#0D52B8',
  },
  toggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 40,
  },
  toggleCopy: {
    flex: 1,
  },
  switchTrack: {
    backgroundColor: '#CBD5E1',
    borderRadius: 14,
    height: 28,
    padding: 3,
    width: 48,
  },
  switchTrackActive: {
    backgroundColor: palette.blue,
  },
  switchThumb: {
    backgroundColor: palette.paper,
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  switchThumbActive: {
    transform: [{ translateX: 20 }],
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderColor: palette.line,
    borderRadius: 10,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  action: {
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderColor: palette.line,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  actionEmphasis: {
    backgroundColor: palette.blue,
    borderColor: palette.blue,
  },
  actionDisabled: {
    opacity: 0.42,
  },
  actionText: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  actionTextEmphasis: {
    color: palette.paper,
  },
});
