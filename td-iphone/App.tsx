import { useCallback, useEffect, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { CameraView } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useIncomingShare } from 'expo-sharing'
import type { Session } from '@supabase/supabase-js'
import { supabase, errText, type Me } from './src/supabase'
import { readIntake, sendToInbox, type Picked } from './src/docs'
import { Btn, C, Card, H, Note, Small, s } from './src/ui'

/**
 * TD Diamonds camera: photograph or share a document, say what it is, send it to the software's Inbox.
 * Reviewing and saving happens in the software on the computer.
 */
const KINDS: { id: 'memo' | 'invoice' | 'gia_cert' | 'auto'; title: string; sub: string }[] = [
  { id: 'memo', title: 'Supplier memo', sub: 'Becomes a memo-in' },
  { id: 'invoice', title: 'Supplier invoice', sub: 'Becomes a purchase' },
  { id: 'gia_cert', title: 'Certificate', sub: 'Details for a stone in stock' },
  { id: 'auto', title: 'Other / not sure', sub: 'The software decides' },
]
const KIND_NAME: Record<string, string> = { memo: 'Memo', invoice: 'Invoice', gia_cert: 'Certificate', auto: 'Document' }
type Recent = { id: string; doc_kind: string; status: string; created_at: string; extraction: { supplier: string | null; doc_number: string | null; stones: unknown[] } | null }

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s2) => setSession(s2))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setMe(null); return }
    supabase.rpc('whoami').then(({ data, error }) => (error ? Alert.alert('No access', errText(error)) : setMe(data as Me)))
  }, [session?.user.id])
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      {session === undefined ? null : !session ? <SignIn /> : me ? <Main me={me} /> : <Small>Loading…</Small>}
    </SafeAreaView>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) Alert.alert('Sign-in failed', error.message)
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <View style={{ backgroundColor: C.ink, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 24 }}>
        <Image source={require('./assets/logo-negative.png')} style={{ width: 180, height: 110, resizeMode: 'contain' }} />
      </View>
      <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Email" placeholderTextColor={C.faint} autoCapitalize="none" keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} />
      <TextInput style={[s.input, { marginBottom: 10 }]} placeholder="Password" placeholderTextColor={C.faint} secureTextEntry textContentType="password" value={pw} onChangeText={setPw} />
      <Btn kind="primary" title="Sign in" onPress={go} busy={busy} disabled={!email || !pw} />
      <Small>Same login as the TD Diamonds software.</Small>
    </KeyboardAvoidingView>
  )
}

function Main({ me }: { me: Me }) {
  const [files, setFiles] = useState<Picked[] | null>(null)
  const [stage, setStage] = useState<'' | 'sending' | 'reading'>('')
  const [sent, setSent] = useState<string | null>(null)
  const [recent, setRecent] = useState<Recent[]>([])
  const [loading, setLoading] = useState(false)
  const share = useIncomingShare()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('intakes').select('id,doc_kind,status,created_at,extraction').order('created_at', { ascending: false }).limit(15)
    setRecent((data ?? []) as Recent[]); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // Shared from WhatsApp, Mail, Files, Photos…
  useEffect(() => {
    const got = share.resolvedSharedPayloads
      .filter((p) => p.contentUri && (p.contentType === 'image' || p.contentType === 'file'))
      .map((p) => ({ uri: p.contentUri!, name: p.originalName ?? 'shared', mime: p.contentMimeType ?? (p.contentType === 'image' ? 'image/jpeg' : 'application/pdf') }))
    if (got.length) { setFiles(got); setSent(null); share.clearSharedPayloads() }
  }, [share.resolvedSharedPayloads])

  async function scan() {
    if (!CameraView.isDocumentScannerAvailable) return Alert.alert('The document scanner is not available on this phone. Use Photos instead.')
    const r = await CameraView.scanDocumentAsync({ quality: 0.9 })
    if (r?.pages.length) { setFiles(r.pages.map((uri, i) => ({ uri, name: `scan-${i + 1}.jpg`, mime: 'image/jpeg' }))); setSent(null) }
  }
  async function photos() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 })
    if (!r.canceled) { setFiles(r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${i + 1}.jpg`, mime: a.mimeType ?? 'image/jpeg' }))); setSent(null) }
  }
  async function pickFiles() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true })
    if (!r.canceled) { setFiles(r.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/pdf' }))); setSent(null) }
  }
  async function send(kind: (typeof KINDS)[number]['id']) {
    if (!files) return
    setStage('sending')
    try {
      const id = await sendToInbox(files, kind, `From ${me.name || me.email}'s iPhone`)
      setFiles(null); setStage('reading')
      // Read it now, so it is ready to review on the computer.
      try { await readIntake(id) } catch { /* it can be read again from the Inbox */ }
      setSent(`Sent to the Inbox (${KIND_NAME[kind].toLowerCase()}). Review and save it in the software.`)
      load()
    } catch (e) { Alert.alert('Not sent', errText(e)) } finally { setStage('') }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ flex: 1, fontSize: 26, fontWeight: '700', color: C.ink }}>TD Diamonds</Text>
        <Pressable onPress={() => Alert.alert('Sign out?', me.email, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() }])}>
          <Small>{me.name || me.email}</Small>
        </Pressable>
      </View>

      {sent && <Note tone="ok">{sent}</Note>}

      {stage ? (
        <Card><Text style={{ fontSize: 18 }}>{stage === 'sending' ? 'Sending…' : 'Reading the document… (5–20 seconds)'}</Text>
          {stage === 'reading' && <Small>It's already saved in the Inbox. You can leave the app.</Small>}</Card>
      ) : files ? (
        <Card>
          <H>{files.length} page{files.length === 1 ? '' : 's'} ready. What is it?</H>
          {KINDS.map((k) => (
            <Pressable key={k.id} onPress={() => send(k.id)} style={({ pressed }) => [s.btn, { backgroundColor: pressed ? C.line : C.panel, borderColor: C.line, alignItems: 'flex-start', paddingVertical: 10 }]}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: C.ink }}>{k.title}</Text><Small>{k.sub}</Small>
            </Pressable>
          ))}
          <Btn kind="danger" small title="Cancel" onPress={() => setFiles(null)} />
        </Card>
      ) : (
        <>
          <Btn kind="primary" title="Scan a document" onPress={scan} style={{ minHeight: 72 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn style={{ flex: 1 }} title="Photos" onPress={photos} />
            <Btn style={{ flex: 1 }} title="Files / PDF" onPress={pickFiles} />
          </View>
          <Small>From WhatsApp or Mail: tap Share → TD Diamonds.</Small>
        </>
      )}

      {recent.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <H>Recently sent</H>
          {recent.map((r) => (
            <View key={r.id} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16 }}>{KIND_NAME[r.doc_kind] ?? 'Document'}{r.extraction?.supplier ? ' · ' + r.extraction.supplier : ''}{r.extraction?.doc_number ? ' #' + r.extraction.doc_number : ''}</Text>
                <Small>{new Date(r.created_at).toLocaleString()}</Small>
              </View>
              <Text style={{ fontSize: 14, color: r.status === 'saved' ? C.ok : r.status === 'failed' ? C.bad : r.status === 'discarded' ? C.faint : C.warn }}>
                {{ saved: 'Saved', discarded: 'Discarded', failed: 'Couldn’t read', ready: 'To review', reading: 'Reading', new: 'To review' }[r.status] ?? r.status}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}
