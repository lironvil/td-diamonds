import { useCallback, useEffect, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, RefreshControl, SafeAreaView, ScrollView, Text, TextInput, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { CameraView } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { useIncomingShare } from 'expo-sharing'
import type { Session } from '@supabase/supabase-js'
import { supabase, errText, type Me } from './src/supabase'
import { loadAccounts, readIntake, sendToInbox, type Account, type Extraction, type Picked } from './src/docs'
import { CertFlow, CustomerFlow, MemoInFlow, PurchaseFlow } from './src/flows'
import { Btn, C, Card, H, Note, Small, s } from './src/ui'

type Job = 'memo_in' | 'purchase' | 'cert' | 'customer'
const JOBS: { id: Job; title: string; sub: string; hint: 'memo' | 'invoice' | 'gia_cert' | 'auto' }[] = [
  { id: 'memo_in', title: 'Memo-in', sub: 'A supplier’s memo → memo-in', hint: 'memo' },
  { id: 'purchase', title: 'Supplier invoice', sub: 'Invoice → purchase (from memo-in or new stones)', hint: 'invoice' },
  { id: 'customer', title: 'Stone for a customer', sub: 'Memo-in, invoice or certificate → customer memo or invoice', hint: 'auto' },
  { id: 'cert', title: 'Certificate', sub: 'GIA certificate → details of a stone in stock', hint: 'gia_cert' },
]
type Screen = { name: 'home' } | { name: 'job'; files: Picked[] | null; intakeId?: string } | { name: 'source'; job: Job } | { name: 'work'; job: Job; intakeId: string }
type Pending = { id: string; doc_kind: string; status: string; created_at: string; note: string; extraction: Extraction | null; error: string }

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
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [accounts, setAccounts] = useState<Account[]>([])
  const share = useIncomingShare()
  useEffect(() => { loadAccounts().then(setAccounts) }, [])

  // Files shared from WhatsApp, Mail, Files, Photos… → choose what they are.
  useEffect(() => {
    const files = share.resolvedSharedPayloads
      .filter((p) => p.contentUri && (p.contentType === 'image' || p.contentType === 'file'))
      .map((p) => ({ uri: p.contentUri!, name: p.originalName ?? 'shared', mime: p.contentMimeType ?? (p.contentType === 'image' ? 'image/jpeg' : 'application/pdf') }))
    if (files.length) { setScreen({ name: 'job', files }); share.clearSharedPayloads() }
  }, [share.resolvedSharedPayloads])

  const home = () => setScreen({ name: 'home' })
  if (screen.name === 'job') return <ChooseJob files={screen.files} intakeId={screen.intakeId} onBack={home} onWork={(job, intakeId) => setScreen({ name: 'work', job, intakeId })} />
  if (screen.name === 'source') return <Capture job={screen.job} onBack={home} onWork={(intakeId) => setScreen({ name: 'work', job: screen.job, intakeId })} />
  if (screen.name === 'work') return <Work job={screen.job} intakeId={screen.intakeId} accounts={accounts} onBack={home} />
  return <Home me={me} onJob={(job) => setScreen({ name: 'source', job })} onOpen={(id) => setScreen({ name: 'job', files: null, intakeId: id })} />
}

function Home({ me, onJob, onOpen }: { me: Me; onJob: (j: Job) => void; onOpen: (id: string) => void }) {
  const [pending, setPending] = useState<Pending[]>([])
  const [loading, setLoading] = useState(false)
  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('intakes').select('id,doc_kind,status,created_at,note,extraction,error').in('status', ['new', 'reading', 'ready', 'failed']).order('created_at', { ascending: false }).limit(20)
    setPending((data ?? []) as Pending[]); setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ flex: 1, fontSize: 26, fontWeight: '700', color: C.ink }}>TD Diamonds</Text>
        <Pressable onPress={() => Alert.alert('Sign out?', me.email, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => supabase.auth.signOut() }])}>
          <Small>{me.name || me.email}</Small>
        </Pressable>
      </View>
      {JOBS.map((j) => (
        <Pressable key={j.id} onPress={() => onJob(j.id)} style={({ pressed }) => [s.card, { backgroundColor: pressed ? C.line : C.panel, paddingVertical: 20 }]}>
          <Text style={{ fontSize: 21, fontWeight: '700', color: C.ink }}>{j.title}</Text>
          <Small>{j.sub}</Small>
        </Pressable>
      ))}
      <Small>Tip: in WhatsApp or Mail, tap Share → TD Diamonds to send a photo or PDF straight here.</Small>
      {pending.length > 0 && (
        <Card style={{ marginTop: 16 }}>
          <H>Waiting in the Inbox</H>
          {pending.map((p) => (
            <Pressable key={p.id} onPress={() => onOpen(p.id)} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16 }}>{p.extraction?.supplier ?? p.note ?? 'Photo'}{p.extraction?.doc_number ? ' #' + p.extraction.doc_number : ''}</Text>
                <Small>{{ memo: 'Memo', invoice: 'Invoice', gia_cert: 'Certificate', auto: 'Document' }[p.doc_kind] ?? 'Document'} · {new Date(p.created_at).toLocaleDateString()}{p.status === 'failed' ? ' · could not be read' : ''}</Small>
              </View>
              <Text style={{ color: C.goldDeep, fontSize: 22 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}

function ChooseJob({ files, intakeId, onBack, onWork }: { files: Picked[] | null; intakeId?: string; onBack: () => void; onWork: (j: Job, intakeId: string) => void }) {
  const [busy, setBusy] = useState<Job | null>(null)
  async function pick(j: (typeof JOBS)[number]) {
    if (intakeId) return onWork(j.id, intakeId)
    setBusy(j.id)
    try { onWork(j.id, await sendToInbox(files ?? [], j.hint, 'From the iPhone app')) } catch (e) { Alert.alert('Upload failed', errText(e)) } finally { setBusy(null) }
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Btn small title="‹ Back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <H>{files ? `${files.length} file${files.length === 1 ? '' : 's'} received. What is it?` : 'What is this document?'}</H>
      {JOBS.map((j) => <Btn key={j.id} title={j.title} busy={busy === j.id} disabled={!!busy && busy !== j.id} onPress={() => pick(j)} />)}
    </ScrollView>
  )
}

function Capture({ job, onBack, onWork }: { job: Job; onBack: () => void; onWork: (intakeId: string) => void }) {
  const j = JOBS.find((x) => x.id === job)!
  const [busy, setBusy] = useState(false)
  async function send(files: Picked[]) {
    if (!files.length) return
    setBusy(true)
    try { onWork(await sendToInbox(files, j.hint, 'From the iPhone app')) } catch (e) { Alert.alert('Upload failed', errText(e)) } finally { setBusy(false) }
  }
  async function scan() {
    if (!CameraView.isDocumentScannerAvailable) return Alert.alert('The document scanner is not available on this phone. Use Photos instead.')
    const r = await CameraView.scanDocumentAsync({ quality: 0.9 })
    if (r?.pages.length) send(r.pages.map((uri, i) => ({ uri, name: `scan-${i + 1}.jpg`, mime: 'image/jpeg' })))
  }
  async function photos() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10, quality: 1 })
    if (!r.canceled) send(r.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${i + 1}.jpg`, mime: a.mimeType ?? 'image/jpeg' })))
  }
  async function files() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true })
    if (!r.canceled) send(r.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType ?? 'application/pdf' })))
  }
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Btn small title="‹ Back" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
      <H>{j.title}</H>
      <Small>{j.sub}</Small>
      <View style={{ height: 12 }} />
      <Btn kind="primary" title="Scan document" onPress={scan} busy={busy} />
      <Btn title="Choose from Photos" onPress={photos} disabled={busy} />
      <Btn title="Choose a PDF or file" onPress={files} disabled={busy} />
      {busy && <Small>Uploading…</Small>}
    </ScrollView>
  )
}

function Work({ job, intakeId, accounts, onBack }: { job: Job; intakeId: string; accounts: Account[]; onBack: () => void }) {
  const [x, setX] = useState<Extraction | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const read = useCallback((force = false) => { setErr(null); setX(null); readIntake(intakeId, force).then(setX).catch((e) => setErr(errText(e))) }, [intakeId])
  useEffect(() => { read() }, [read])
  const done = (msg: string) => Alert.alert('Done', msg, [{ text: 'OK', onPress: onBack }])
  const props = { intakeId, x: x!, accounts, onDone: done }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Btn small title="‹ Home" onPress={onBack} style={{ alignSelf: 'flex-start' }} />
        <H>{JOBS.find((j) => j.id === job)!.title}</H>
        {err ? (<><Note tone="bad">{err}</Note><Btn title="Read again" onPress={() => read(true)} /></>)
          : !x ? <Card><Text style={{ fontSize: 17 }}>Reading the document… (5–20 seconds)</Text></Card>
          : job === 'memo_in' ? <MemoInFlow {...props} />
          : job === 'purchase' ? <PurchaseFlow {...props} />
          : job === 'cert' ? <CertFlow {...props} />
          : <CustomerFlow {...props} />}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
