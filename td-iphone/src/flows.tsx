import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, Switch, Text, TextInput, View } from 'react-native'
import { supabase, errText } from './supabase'
import {
  ITEM_COLS, discardIntake, findStock, label, matchAccount, matchLines, memoInLines, money, num, stone, toLines,
  type Account, type Extraction, type Item, type Line, type Match, type MiCand,
} from './docs'
import { AccountSelect, Btn, C, Card, Field, H, Note, Small, s } from './ui'

type FlowProps = { intakeId: string; x: Extraction; accounts: Account[]; onDone: (msg: string) => void }
const today = () => new Date().toISOString().slice(0, 10)

/** Stones read from the document: include/exclude and correct any detail. */
function LinesEditor({ lines, setLines, priceLabel = 'Price $', hidePrice }: { lines: Line[]; setLines: (l: Line[]) => void; priceLabel?: string; hidePrice?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  const set = (k: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === k ? { ...l, ...patch } : l)))
  return (
    <Card>
      <H>{lines.length} stone{lines.length === 1 ? '' : 's'} read</H>
      {lines.map((l) => (
        <View key={l.key} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Switch value={l.on} onValueChange={(v) => set(l.key, { on: v })} trackColor={{ true: C.goldDeep }} />
            <Pressable style={{ flex: 1 }} onPress={() => setOpen(open === l.key ? null : l.key)}>
              <Text style={{ fontSize: 16, color: l.on ? C.ink : C.faint }}>{label(l) || 'Stone ' + (l.key + 1)}</Text>
              {!hidePrice && <Small>{money(num(l.amount))}{'  ·  tap to edit'}</Small>}
            </Pressable>
          </View>
          {open === l.key && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Shape" value={l.shape} onChangeText={(v) => set(l.key, { shape: v })} />
                <Field label="Carat" value={l.carat} keyboardType="decimal-pad" onChangeText={(v) => set(l.key, { carat: v })} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="Color" value={l.color} autoCapitalize="characters" onChangeText={(v) => set(l.key, { color: v })} />
                <Field label="Clarity" value={l.clarity} autoCapitalize="characters" onChangeText={(v) => set(l.key, { clarity: v })} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Field label="GIA #" value={l.cert_no} keyboardType="number-pad" onChangeText={(v) => set(l.key, { cert_no: v })} />
                <Field label="Lot #" value={l.vendor_stock} onChangeText={(v) => set(l.key, { vendor_stock: v })} />
              </View>
              {!hidePrice && <Field label={priceLabel} value={l.amount} keyboardType="decimal-pad" onChangeText={(v) => set(l.key, { amount: v })} />}
            </View>
          )}
        </View>
      ))}
    </Card>
  )
}

function Header({ x, accounts, supplier, setSupplier, docNo, setDocNo, date, setDate, docLabel }: {
  x: Extraction; accounts: Account[]; supplier: Account | null; setSupplier: (a: Account) => void
  docNo: string; setDocNo: (v: string) => void; date: string; setDate: (v: string) => void; docLabel: string
}) {
  return (
    <Card>
      {x.warnings.length > 0 && <Note>{x.warnings.join('\n')}</Note>}
      <AccountSelect label={'Supplier' + (x.supplier && !supplier ? ` (read: ${x.supplier})` : '')} value={supplier} list={accounts} types={['supplier', 'partner']} onPick={setSupplier} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Field label={docLabel} value={docNo} onChangeText={setDocNo} />
        <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" />
      </View>
    </Card>
  )
}

function useHeader(x: Extraction, accounts: Account[]) {
  const [supplier, setSupplier] = useState<Account | null>(() => matchAccount(x.supplier, accounts))
  const [docNo, setDocNo] = useState(x.doc_number ?? '')
  const [date, setDate] = useState(x.doc_date ?? today())
  return { supplier, setSupplier, docNo, setDocNo, date, setDate }
}

// ---------------------------------------------------------------- memo-in
export function MemoInFlow({ intakeId, x, accounts, onDone }: FlowProps) {
  const h = useHeader(x, accounts)
  const [lines, setLines] = useState<Line[]>(() => toLines(x))
  const [dupes, setDupes] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const certs = lines.map((l) => l.cert_no).filter(Boolean)
    if (!certs.length) return
    supabase.from('items').select('cert_no,stock_no').in('cert_no', certs).in('status', ['available', 'on_memo']).then(({ data }) => {
      const d = Object.fromEntries((data ?? []).map((r) => [r.cert_no, r.stock_no]))
      setDupes(d)
      setLines((ls) => ls.map((l) => (d[l.cert_no] ? { ...l, on: false } : l)))
    })
  }, [])
  const on = lines.filter((l) => l.on)
  async function save() {
    if (!h.supplier) return Alert.alert('Choose the supplier.')
    if (!on.length) return Alert.alert('No stones selected.')
    setBusy(true)
    const payload = on.map((l) => { const { kind: _k, ...g } = stone(l); return { ...g, cost_total: num(l.amount) } })
    const { data, error } = await supabase.rpc('save_intake', { p_id: intakeId, p_header: { doc_kind: 'memo', supplier_id: h.supplier.id, ownership: 'memo_in', vendor_doc: h.docNo, received: h.date || null }, p_lines: payload })
    setBusy(false)
    if (error) return Alert.alert('Not saved', errText(error))
    const mi = (data as { memo_in_no?: number }[]).find((r) => r.memo_in_no)
    onDone(`Memo-in #${mi?.memo_in_no ?? ''} saved with ${on.length} stone${on.length === 1 ? '' : 's'}.`)
  }
  return (
    <>
      <Header x={x} accounts={accounts} {...h} docLabel="Their memo #" />
      {Object.keys(dupes).length > 0 && <Note>Already in stock (left out): {Object.entries(dupes).map(([c, n]) => `GIA ${c} = #${n}`).join(', ')}</Note>}
      <LinesEditor lines={lines} setLines={setLines} priceLabel="Memo price $" />
      <Btn kind="primary" title={`Save memo-in · ${on.length} stone${on.length === 1 ? '' : 's'}`} onPress={save} busy={busy} />
    </>
  )
}

// ---------------------------------------------------------------- supplier invoice -> purchase
export function PurchaseFlow({ intakeId, x, accounts, onDone }: FlowProps) {
  const h = useHeader(x, accounts)
  const [lines, setLines] = useState<Line[]>(() => toLines(x))
  const [fromMemo, setFromMemo] = useState<boolean | null>(null)
  const [matches, setMatches] = useState<Match[] | null>(null)
  const [conflicts, setConflicts] = useState<Record<number, MiCand>>({})
  const [buy, setBuy] = useState<Record<number, MiCand>>({})
  const [dupes, setDupes] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const on = lines.filter((l) => l.on)
  const sig = JSON.stringify([h.supplier?.id, on.map((l) => [l.cert_no, l.vendor_stock])])

  useEffect(() => {
    setMatches(null); setConflicts({}); setBuy({}); setDupes({})
    if (fromMemo === null || !h.supplier || !on.length) return
    setLoading(true)
    ;(async () => {
      try {
        if (fromMemo) setMatches(matchLines(on, await memoInLines({ supplierId: h.supplier!.id })))
        else {
          const certs = [...new Set(on.map((l) => l.cert_no).filter(Boolean))]
          const cands = (await memoInLines({ certs })).filter((c) => c.open)
          const cf: Record<number, MiCand> = {}
          for (const l of on) { const c = cands.find((y) => y.cert_no === l.cert_no); if (l.cert_no && c) cf[l.key] = c }
          setConflicts(cf)
          if (certs.length) {
            const { data } = await supabase.from('items').select('stock_no, cert_no').in('cert_no', certs).in('status', ['available', 'on_memo']).eq('ownership', 'owned')
            setDupes(Object.fromEntries(on.filter((l) => (data ?? []).some((r) => r.cert_no === l.cert_no)).map((l) => [l.key, (data ?? []).find((r) => r.cert_no === l.cert_no)!.stock_no])))
          }
        }
      } catch (e) { Alert.alert('Error', errText(e)) } finally { setLoading(false) }
    })()
  }, [fromMemo, sig])

  const missing = on.filter((l) => num(l.amount) == null)
  async function submit(payload: unknown[], diffs: string[]) {
    const run = async () => {
      setBusy(true)
      const { data, error } = await supabase.rpc('purchase_from_intake', { p_id: intakeId, p: { account_id: h.supplier!.id, vendor_doc: h.docNo, doc_date: h.date || null, lines: payload } })
      setBusy(false)
      if (error) return Alert.alert('Not saved', errText(error))
      onDone(`Purchase #${data.doc_no} saved · ${payload.length} stone${payload.length === 1 ? '' : 's'}. It's now an unpaid vendor bill.`)
    }
    if (diffs.length) Alert.alert('Prices differ from the memo-in', diffs.join('\n') + '\n\nThe invoice price becomes the stone’s cost, also on any customer invoice it is already on.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: run }])
    else run()
  }
  const diffText = (stock: number, memo: number | null, inv: number) => `#${stock}: ${money(memo)} → ${money(inv)}`
  function saveFromMemo() {
    const diffs: string[] = []
    const payload = matches!.map((m) => {
      const inv = num(m.line.amount)!
      if (m.cand!.amount == null || Math.abs(m.cand!.amount - inv) >= 0.01) diffs.push(diffText(m.cand!.stock_no, m.cand!.amount, inv))
      return { memo_in_line_id: m.cand!.line_id, amount: inv }
    })
    submit(payload, diffs)
  }
  function saveDirect() {
    const diffs: string[] = []
    const payload = on.map((l) => {
      const inv = num(l.amount)!, c = buy[l.key]
      if (c) { if (c.amount == null || Math.abs(c.amount - inv) >= 0.01) diffs.push(diffText(c.stock_no, c.amount, inv)); return { memo_in_line_id: c.line_id, amount: inv } }
      return { amount: inv, new: stone(l) }
    })
    submit(payload, diffs)
  }
  const bad = matches?.filter((m) => m.problem !== 'none') ?? []
  const otherSupplier = Object.values(conflicts).filter((c) => c.account_id !== h.supplier?.id)
  const blocked = Object.entries(conflicts).some(([k, c]) => c.account_id === h.supplier?.id && !buy[Number(k)]) || otherSupplier.length > 0 || Object.keys(dupes).length > 0

  return (
    <>
      <Header x={x} accounts={accounts} {...h} docLabel="Invoice #" />
      <LinesEditor lines={lines} setLines={setLines} priceLabel="Invoice price $" />
      <Card>
        <H>Is this from a memo-in?</H>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn style={{ flex: 1 }} kind={fromMemo === true ? 'primary' : 'plain'} title="Yes" onPress={() => setFromMemo(true)} />
          <Btn style={{ flex: 1 }} kind={fromMemo === false ? 'primary' : 'plain'} title="No, new stones" onPress={() => setFromMemo(false)} />
        </View>
        {fromMemo !== null && !h.supplier && <Note tone="bad">Choose the supplier first.</Note>}
        {fromMemo !== null && missing.length > 0 && <Note tone="bad">Enter the price on {missing.map((l) => label(l) || 'stone ' + (l.key + 1)).join(', ')}.</Note>}
        {loading && <Small>Checking memo-ins…</Small>}
      </Card>

      {fromMemo === true && matches && (bad.length ? (
        <Card>
          <Note tone="bad">These lines don’t match an open memo-in from {h.supplier?.company}:{'\n'}{bad.map((m) => '• ' + label(m.line) + (m.problem === 'done' ? ` — memo-in #${m.cand!.doc_no}, already returned or bought` : '')).join('\n')}</Note>
          <Small>The photo stays in the Inbox. Enter this purchase on the computer: Inbox → this invoice → “Enter it myself”.</Small>
          <Btn title="OK" onPress={() => onDone('The invoice is waiting in the Inbox.')} />
        </Card>
      ) : (
        <Card>
          <H>Matched to memo-in</H>
          {matches.map((m) => {
            const inv = num(m.line.amount), diff = inv != null && m.cand!.amount != null && Math.abs(inv - m.cand!.amount) >= 0.01
            return (
              <View key={m.line.key} style={s.row}>
                <View style={{ flex: 1 }}><Text style={{ fontSize: 16 }}>#{m.cand!.stock_no} · memo-in #{m.cand!.doc_no}{m.cand!.item_status === 'sold' ? ' · sold' : ''}</Text><Small>{label(m.line)}</Small></View>
                <Text style={{ fontSize: 16, color: diff ? C.warn : C.ink, fontWeight: diff ? '700' : '400' }}>{money(inv)}</Text>
              </View>)
          })}
          <Btn kind="primary" title={`Confirm purchase of ${matches.length} stone${matches.length === 1 ? '' : 's'}`} onPress={saveFromMemo} busy={busy} disabled={missing.length > 0} />
        </Card>
      ))}

      {fromMemo === false && h.supplier && !loading && (
        <Card>
          {Object.entries(conflicts).filter(([, c]) => c.account_id === h.supplier!.id).map(([k, c]) => {
            const l = on.find((y) => y.key === Number(k))!
            return buy[Number(k)] ? <Note key={k} tone="ok">GIA {l.cert_no} will be bought from memo-in #{c.doc_no} (#{c.stock_no}).</Note> : (
              <View key={k}><Note>GIA {l.cert_no} is on memo-in #{c.doc_no} from {h.supplier!.company}. Buy it from the memo-in?</Note>
                <Btn small kind="gold" title={`Buy from memo-in #${c.doc_no}`} onPress={() => setBuy({ ...buy, [Number(k)]: c })} /></View>)
          })}
          {otherSupplier.map((c) => <Note key={c.line_id} tone="bad">GIA {c.cert_no} is on memo-in #{c.doc_no} from another supplier (#{c.stock_no}).</Note>)}
          {Object.entries(dupes).map(([k, no]) => <Note key={k} tone="bad">GIA {on.find((y) => y.key === Number(k))?.cert_no} is already TD’s stock as #{no}.</Note>)}
          <Btn kind="primary" title={`Save purchase · ${on.length} stone${on.length === 1 ? '' : 's'} · ${money(on.reduce((a, l) => a + (num(l.amount) ?? 0), 0))}`}
            onPress={saveDirect} busy={busy} disabled={blocked || missing.length > 0 || !on.length} />
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- certificate -> stone in stock
const CERT_FIELDS: [string, string][] = [['lab', 'Lab'], ['cert_no', 'Report #'], ['cert_date', 'Report date'], ['shape', 'Shape'], ['carat', 'Carat'], ['color', 'Color'], ['clarity', 'Clarity'],
  ['cut', 'Cut'], ['polish', 'Polish'], ['symmetry', 'Symmetry'], ['fluorescence', 'Fluorescence'], ['measurements', 'Measurements'], ['depth_pct', 'Depth %'], ['table_pct', 'Table %'],
  ['girdle', 'Girdle'], ['culet', 'Culet'], ['inscription', 'Inscription'], ['key_to_symbols', 'Key to symbols'], ['lab_comments', 'Comments']]
const NUMS = ['carat', 'depth_pct', 'table_pct']
const str = (v: unknown) => (v == null ? '' : String(v).trim())
const same = (k: string, a: string, b: string) => (NUMS.includes(k) ? a !== '' && b !== '' && Number(a) === Number(b) : a.toUpperCase() === b.toUpperCase())

export function CertFlow({ intakeId, x, onDone }: FlowProps) {
  const st = x.stones[0] ?? {}
  const read = Object.fromEntries(CERT_FIELDS.map(([k]) => [k, str(st[k])]))
  const [item, setItem] = useState<(Item & Record<string, unknown>) | null>(null)
  const [stockNo, setStockNo] = useState('')
  const [looked, setLooked] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!read.cert_no) { setLooked(true); return }
    supabase.from('items').select('*').eq('cert_no', read.cert_no).in('status', ['available', 'on_memo']).maybeSingle().then(({ data }) => { setItem(data); setLooked(true) })
  }, [])
  async function find() {
    const { data } = await supabase.from('items').select('*').eq('stock_no', Number(stockNo)).eq('kind', 'white_diamond').maybeSingle()
    if (!data) return Alert.alert(`Stock #${stockNo} not found.`)
    setItem(data)
  }
  const rows = CERT_FIELDS.filter(([k]) => read[k] !== '')
  const cur = (k: string) => str(item?.[k])
  const changed = rows.filter(([k]) => !same(k, cur(k), read[k]))
  async function save() {
    if (!item) return
    setBusy(true)
    const line: Record<string, unknown> = { id: item.id }
    for (const [k] of rows) line[k] = NUMS.includes(k) ? Number(read[k]) : read[k]
    const { error } = await supabase.rpc('save_intake', { p_id: intakeId, p_header: { doc_kind: 'gia_cert' }, p_lines: [line] })
    setBusy(false)
    if (error) return Alert.alert('Not saved', errText(error))
    onDone(`Certificate added to #${item.stock_no}${changed.length ? ` · ${changed.length} detail${changed.length === 1 ? '' : 's'} updated` : ''}.`)
  }
  if (!looked) return <Small>Looking for the stone…</Small>
  return (
    <>
      {x.document_type !== 'gia_cert' && <Note tone="bad">This doesn’t look like a grading certificate.</Note>}
      {!item ? (
        <Card>
          <Note>{read.cert_no ? `GIA ${read.cert_no} is not in stock.` : 'No report # was read.'} A certificate only updates a stone already in stock. Enter the stock # it belongs to, or enter new stones through a memo-in or a purchase.</Note>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <Field label="Stock #" value={stockNo} keyboardType="number-pad" onChangeText={setStockNo} />
            <Btn small title="Find" onPress={find} disabled={!stockNo} />
          </View>
          <Btn title="Leave it in the Inbox" onPress={() => onDone('The certificate is waiting in the Inbox.')} />
        </Card>
      ) : (
        <Card>
          <H>Certificate for #{item.stock_no}</H>
          {cur('cert_no') !== '' && read.cert_no !== '' && cur('cert_no') !== read.cert_no && <Note tone="bad">This is report {read.cert_no}, but the stone has {cur('cert_no')}. Make sure it’s the right certificate.</Note>}
          {rows.map(([k, l]) => {
            const diff = !same(k, cur(k), read[k])
            return (
              <View key={k} style={s.row}>
                <Text style={{ fontSize: 15, color: C.muted, width: 110 }}>{l}</Text>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  {diff && cur(k) !== '' && <Text style={{ fontSize: 13, color: C.faint, textDecorationLine: 'line-through' }}>{cur(k)}</Text>}
                  <Text style={{ fontSize: 15, color: diff ? C.warn : C.ink, fontWeight: diff ? '700' : '400', textAlign: 'right' }}>{read[k]}</Text>
                </View>
              </View>)
          })}
          <Small>{changed.length ? `${changed.length} detail${changed.length === 1 ? '' : 's'} will change (highlighted).` : 'Everything already matches.'} The certificate is attached to the stone. Price and supplier stay as they are.</Small>
          <Btn kind="primary" title="Confirm" onPress={save} busy={busy} />
        </Card>
      )}
    </>
  )
}

// ---------------------------------------------------------------- stone for a customer (memo or invoice)
export function CustomerFlow({ intakeId, x, accounts, onDone }: FlowProps) {
  const [found, setFound] = useState<{ line: Line; item: Item | null }[] | null>(null)
  const [cust, setCust] = useState<Account | null>(null)
  const [doc, setDoc] = useState<'memo' | 'invoice'>('memo')
  const [price, setPrice] = useState<Record<string, string>>({})
  const [pick, setPick] = useState<Record<string, boolean>>({})
  const [stockNo, setStockNo] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    findStock(toLines(x)).then((f) => {
      setFound(f)
      const items = f.map((r) => r.item).filter((i): i is Item => !!i && i.status === 'available')
      setPick(Object.fromEntries(items.map((i) => [i.id, true])))
      setPrice(Object.fromEntries(items.map((i) => [i.id, i.ask_total != null ? String(i.ask_total) : ''])))
    }).catch((e) => Alert.alert('Error', errText(e)))
  }, [])
  async function addByStock() {
    const { data } = await supabase.from('items').select(ITEM_COLS).eq('stock_no', Number(stockNo)).maybeSingle()
    if (!data) return Alert.alert(`Stock #${stockNo} not found.`)
    const i = data as Item
    setFound([...(found ?? []), { line: { key: 1000 + i.stock_no, on: true, shape: i.shape, carat: String(i.carat ?? ''), color: i.color, clarity: i.clarity, lab: i.lab, cert_no: i.cert_no, vendor_stock: i.vendor_stock, rap_ct: '', amount: '', extra: {} }, item: i }])
    if (i.status === 'available') { setPick({ ...pick, [i.id]: true }); setPrice({ ...price, [i.id]: i.ask_total != null ? String(i.ask_total) : '' }) }
    setStockNo('')
  }
  const chosen = useMemo(() => (found ?? []).map((r) => r.item).filter((i): i is Item => !!i && i.status === 'available' && !!pick[i.id]), [found, pick])
  async function save() {
    if (!cust) return Alert.alert('Choose the customer.')
    if (!chosen.length) return Alert.alert('No stones selected.')
    if (doc === 'invoice' && chosen.some((i) => num(price[i.id] ?? '') == null)) return Alert.alert('Enter a price on every stone.')
    setBusy(true)
    const lines = chosen.map((i) => ({ item_id: i.id, amount: num(price[i.id] ?? '') }))
    const { data, error } = await supabase.rpc(doc === 'memo' ? 'create_memo' : 'create_invoice', { p: { account_id: cust.id, doc_date: today(), lines } })
    setBusy(false)
    if (error) return Alert.alert('Not saved', errText(error))
    await discardIntake(intakeId) // the photo was only used to find the stones
    onDone(`${doc === 'memo' ? 'Memo' : 'Invoice'} #${data.doc_no} to ${cust.company} · ${chosen.length} stone${chosen.length === 1 ? '' : 's'}.`)
  }
  if (!found) return <Small>Finding the stones…</Small>
  return (
    <>
      <Card>
        <H>Stones</H>
        {found.length === 0 && <Small>No stones were read from the photo.</Small>}
        {found.map(({ line, item }) => (
          <View key={line.key} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 10 }}>
            {!item ? <Text style={{ fontSize: 15, color: C.bad }}>{label(line)} — not in stock</Text>
              : item.status !== 'available' ? <Text style={{ fontSize: 15, color: C.warn }}>#{item.stock_no} {label(item as never)} — out on memo now (invoice it from the memo)</Text>
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Switch value={!!pick[item.id]} onValueChange={(v) => setPick({ ...pick, [item.id]: v })} trackColor={{ true: C.goldDeep }} />
                  <View style={{ flex: 1 }}><Text style={{ fontSize: 16 }}>#{item.stock_no}{item.ownership === 'memo_in' ? ' · memo-in' : ''}</Text><Small>{label(item as never)}</Small></View>
                  <TextInput style={[s.input, { width: 120, textAlign: 'right' }]} keyboardType="decimal-pad" placeholder="Price $" placeholderTextColor={C.faint}
                    value={price[item.id] ?? ''} onChangeText={(v) => setPrice({ ...price, [item.id]: v })} />
                </View>)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <Field label="Add by stock #" value={stockNo} keyboardType="number-pad" onChangeText={setStockNo} />
          <Btn small title="Add" onPress={addByStock} disabled={!stockNo} />
        </View>
      </Card>
      <Card>
        <AccountSelect label="Customer" value={cust} list={accounts} types={['customer']} onPick={setCust} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn style={{ flex: 1 }} kind={doc === 'memo' ? 'primary' : 'plain'} title="Memo" onPress={() => setDoc('memo')} />
          <Btn style={{ flex: 1 }} kind={doc === 'invoice' ? 'primary' : 'plain'} title="Invoice" onPress={() => setDoc('invoice')} />
        </View>
        <Btn kind="primary" busy={busy} disabled={!cust || !chosen.length}
          title={`Create ${doc} · ${chosen.length} stone${chosen.length === 1 ? '' : 's'}${doc === 'invoice' ? ' · ' + money(chosen.reduce((a, i) => a + (num(price[i.id] ?? '') ?? 0), 0)) : ''}`} onPress={save} />
      </Card>
    </>
  )
}
