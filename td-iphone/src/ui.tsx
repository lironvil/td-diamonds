import { type ReactNode, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'

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

/** Tap to choose an account; search by name or account #. */
export function AccountSelect<T extends { id: string; acct_no: number; company: string; types: string[] | null }>({ label, value, list, onPick, types }: {
  label: string; value: T | null; list: T[]; onPick: (a: T) => void; types?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return list.filter((a) => (!types || !a.types || a.types.some((x) => types.includes(x)) || t) && (!t || a.company.toLowerCase().includes(t) || String(a.acct_no) === t)).slice(0, 200)
  }, [q, list, types])
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={s.label}>{label}</Text>
      <Pressable onPress={() => setOpen(true)} style={[s.input, { justifyContent: 'center' }]}>
        <Text style={{ fontSize: 17, color: value ? C.ink : C.faint }}>{value ? value.company : 'Choose…'}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: C.bg, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={[s.h, { flex: 1, marginBottom: 0 }]}>{label}</Text>
            <Btn small title="Close" onPress={() => setOpen(false)} />
          </View>
          <TextInput autoFocus placeholder="Name or account #" placeholderTextColor={C.faint} value={q} onChangeText={setQ} style={[s.input, { marginBottom: 10 }]} />
          <FlatList data={shown} keyExtractor={(a) => a.id} keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable onPress={() => { onPick(item); setOpen(false); setQ('') }} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.line }]}>
                <Text style={{ fontSize: 17, color: C.ink }}>{item.company}</Text><Text style={s.small}>#{item.acct_no}</Text>
              </Pressable>)} />
        </View>
      </Modal>
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
