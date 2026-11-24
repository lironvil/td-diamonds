import { type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'

export const C = {
  ink: '#221F1F', gold: '#D1D199', goldDeep: '#A8A86A', bg: '#F6F4EF', panel: '#FFFFFF', line: '#E4E0D6',
  muted: '#6E6A64', faint: '#9B968E', bad: '#B42318', badBg: '#FDECEA', warn: '#9A6700', warnBg: '#FFF6DA', ok: '#2E7D32', okBg: '#EAF5EA',
}

export function Btn({ title, onPress, kind = 'plain', disabled, busy, style, small }: {
  title: string; onPress: () => void; kind?: 'primary' | 'plain' | 'danger' | 'gold'; disabled?: boolean; busy?: boolean; style?: ViewStyle; small?: boolean
}) {
  const bg = kind === 'primary' ? C.ink : kind === 'gold' ? C.gold : C.panel
  const fg = kind === 'primary' ? C.gold : kind === 'danger' ? C.bad : C.ink
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1, borderColor: kind === 'plain' || kind === 'danger' ? C.line : bg }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, small && { fontSize: 15 }, { color: fg }]}>{title}</Text>}
    </Pressable>
  )
}

export const Card = ({ children, style }: { children: ReactNode; style?: ViewStyle }) => <View style={[s.card, style]}>{children}</View>
export const H = ({ children }: { children: ReactNode }) => <Text style={s.h}>{children}</Text>
export const Small = ({ children, color }: { children: ReactNode; color?: string }) => <Text style={[s.small, color ? { color } : null]}>{children}</Text>
export const Note = ({ children, tone = 'warn' }: { children: ReactNode; tone?: 'warn' | 'bad' | 'ok' }) => (
  <View style={[s.note, { backgroundColor: tone === 'bad' ? C.badBg : tone === 'ok' ? C.okBg : C.warnBg }]}>
    <Text style={{ color: tone === 'bad' ? C.bad : tone === 'ok' ? C.ok : C.warn, fontSize: 15 }}>{children}</Text>
  </View>
)

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 90 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor={C.faint} style={s.input} {...p} />
    </View>
  )
}

export const s = StyleSheet.create({
  btn: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginVertical: 5 },
  btnSmall: { minHeight: 40, borderRadius: 10, paddingHorizontal: 12 },
  btnText: { fontSize: 17, fontWeight: '600' },
  card: { backgroundColor: C.panel, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  h: { fontSize: 20, fontWeight: '700', color: C.ink, marginBottom: 8 },
  small: { fontSize: 14, color: C.muted },
  note: { borderRadius: 12, padding: 12, marginBottom: 10 },
  label: { fontSize: 13, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, fontSize: 17, color: C.ink, backgroundColor: C.panel },
  row: { paddingVertical: 14, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: C.line, flexDirection: 'row', justifyContent: 'space-between' },
})
