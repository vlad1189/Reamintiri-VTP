'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Settings,
  Plus,
  Users,
  AlertCircle,
  Clock,
  Send,
  ArrowLeft,
  Phone,
  MapPin,
  Flame,
  Calendar,
  AlarmClock,
  CheckCircle2,
  Trash2,
  Edit3,
  Loader2,
  Download,
  Search,
  X,
  StickyNote,
  History as HistoryIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const formatRoDate = (d) => {
  if (!d) return ''
  const date = new Date(d)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}.${mm}.${date.getFullYear()}`
}
const daysUntil = (d) => {
  if (!d) return 9999
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return Math.round((x - t) / (1000 * 60 * 60 * 24))
}
const statusOf = (d) => {
  const days = daysUntil(d)
  if (days <= 0) return { label: 'SCADENT', tone: 'red' }
  if (days <= 30) return { label: 'CURÂND', tone: 'orange' }
  return { label: 'OK', tone: 'green' }
}

const NAVY = '#0F172A'

function App() {
  const [view, setView] = useState('home')
  const [clients, setClients] = useState([])
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [editing, setEditing] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function loadAll() {
    try {
      const [c, s] = await Promise.all([
        fetch('/api/clients').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json()),
      ])
      setClients(Array.isArray(c) ? c : [])
      setSettings(s)
    } catch {
      toast.error('Eroare la încărcarea datelor')
    } finally {
      setLoading(false)
    }
  }
  async function loadHistory() {
    const h = await fetch('/api/sms-history').then((r) => r.json())
    setHistory(Array.isArray(h) ? h : [])
  }

  useEffect(() => {
    loadAll()
    fetch('/api/cron/check', { method: 'POST' }).catch(() => {})
  }, [])

  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId),
    [clients, selectedId]
  )

  const stats = useMemo(() => {
    let due = 0,
      soon = 0,
      smsTotal = 0
    clients.forEach((c) => {
      const d = daysUntil(c.dueDate)
      if (d <= 0) due++
      else if (d <= 30) soon++
      smsTotal += c.smsCount || 0
    })
    return { total: clients.length, due, soon, smsTotal }
  }, [clients])

  const dueClients = clients.filter((c) => daysUntil(c.dueDate) <= 0)
  const soonClients = clients
    .filter((c) => {
      const d = daysUntil(c.dueDate)
      return d > 0 && d <= 30
    })
    .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate))

  async function saveClient(payload, id) {
    setBusy(true)
    try {
      const res = await fetch(id ? `/api/clients/${id}` : '/api/clients', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      toast.success(id ? 'Client actualizat' : 'Client adăugat')
      await loadAll()
      setEditing(null)
      if (id) setView('detail')
      else {
        setSelectedId(data.id)
        setView('detail')
      }
    } catch {
      toast.error('Eroare la salvare')
    } finally {
      setBusy(false)
    }
  }

  async function deleteClient(id) {
    setBusy(true)
    await fetch(`/api/clients/${id}`, { method: 'DELETE' })
    toast.success('Client șters')
    setBusy(false)
    setConfirmDelete(null)
    await loadAll()
    setView('list')
  }

  async function markVerifiedToday(id) {
    setBusy(true)
    await fetch(`/api/clients/${id}/verify`, { method: 'POST' })
    toast.success('Verificare înregistrată azi. Următoarea peste 2 ani.')
    await loadAll()
    setBusy(false)
  }

  async function sendSmsNow(id, template = '2_weeks') {
    setBusy(true)
    const r = await fetch(`/api/clients/${id}/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template }),
    }).then((r) => r.json())
    if (r.ok) toast.success('SMS trimis cu succes')
    else toast.error('SMS eșuat: ' + (r.error || ''))
    await loadAll()
    setBusy(false)
  }

  async function saveSettings(payload) {
    setBusy(true)
    const r = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json())
    setSettings(r)
    toast.success('Setări salvate')
    setBusy(false)
    setView('home')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100 flex justify-center">
      <div className="w-full max-w-md bg-slate-50 min-h-screen shadow-2xl flex flex-col">
        <header
          className="px-5 py-4 flex items-center justify-between text-white"
          style={{ backgroundColor: NAVY }}
        >
          <div className="flex items-center gap-3">
            {view !== 'home' && (
              <button
                onClick={() => {
                  if (view === 'detail') setView('list')
                  else setView('home')
                }}
                className="p-1 hover:bg-white/10 rounded-none transition"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-xl font-bold tracking-tight">
              {view === 'home' && 'Reamintiri VTP'}
              {view === 'new' && (editing ? 'Editează client' : 'Client nou')}
              {view === 'list' && 'Toți clienții'}
              {view === 'detail' && 'Detalii client'}
              {view === 'settings' && 'Setări mesaje'}
              {view === 'history' && 'Istoric SMS'}
            </h1>
          </div>
          {view === 'home' && (
            <button
              onClick={() => setView('settings')}
              className="p-2 hover:bg-white/10 rounded-none transition"
              aria-label="Setări"
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </header>

        <main className="flex-1 px-5 py-5">
          {view === 'home' && (
            <HomeView
              stats={stats}
              dueClients={dueClients}
              soonClients={soonClients}
              total={clients.length}
              onNew={() => {
                setEditing(null)
                setView('new')
              }}
              onAll={() => setView('list')}
              onHistory={() => {
                loadHistory()
                setView('history')
              }}
              onSelect={(id) => {
                setSelectedId(id)
                setView('detail')
              }}
            />
          )}

          {view === 'new' && (
            <ClientForm
              initial={editing}
              busy={busy}
              onCancel={() => {
                setEditing(null)
                setView(editing ? 'detail' : 'home')
              }}
              onSubmit={(data) => saveClient(data, editing?.id)}
            />
          )}

          {view === 'list' && (
            <ClientList
              clients={clients}
              onSelect={(id) => {
                setSelectedId(id)
                setView('detail')
              }}
            />
          )}

          {view === 'detail' && selected && (
            <ClientDetail
              client={selected}
              busy={busy}
              onSendSMS={() => sendSmsNow(selected.id, '2_weeks')}
              onVerifiedToday={() => markVerifiedToday(selected.id)}
              onEdit={() => {
                setEditing(selected)
                setView('new')
              }}
              onDelete={() => setConfirmDelete(selected)}
            />
          )}

          {view === 'settings' && settings && (
            <SettingsView
              settings={settings}
              busy={busy}
              onCancel={() => setView('home')}
              onSubmit={saveSettings}
            />
          )}

          {view === 'history' && <HistoryView history={history} />}
        </main>
      </div>

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Șterge client?</AlertDialogTitle>
            <AlertDialogDescription>
              Acțiunea va elimina definitiv clientul „{confirmDelete?.name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anulează</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteClient(confirmDelete.id)}
            >
              Șterge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function HomeView({ stats, dueClients, soonClients, total, onNew, onAll, onHistory, onSelect }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Reamintiri VTP
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Verificări odată la 2 ani · SMS automat
        </p>
      </div>

      <div className="grid grid-cols-2 gap-0 bg-white rounded-none border border-slate-200 overflow-hidden">
        <StatCell value={stats.total} label="Total clienți" color="text-slate-900" border="border-r border-b" />
        <StatCell value={stats.due} label="Scadenți" color="text-red-600" border="border-b" />
        <StatCell value={stats.soon} label="Curând (30 zile)" color="text-orange-500" border="border-r" />
        <StatCell value={stats.smsTotal} label="SMS trimise" color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onNew}
          className="flex items-center justify-center gap-2 py-3.5 rounded-none text-white font-semibold shadow-sm hover:opacity-90 transition"
          style={{ backgroundColor: NAVY }}
        >
          <Plus className="w-5 h-5" /> Client Nou
        </button>
        <button
          onClick={onAll}
          className="flex items-center justify-center gap-2 py-3.5 rounded-none bg-white border-2 font-semibold transition hover:bg-slate-50"
          style={{ borderColor: NAVY, color: NAVY }}
        >
          Toți Clienții
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onHistory}
          className="flex items-center justify-center gap-2 py-3 rounded-none bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
        >
          <Clock className="w-4 h-4" /> Istoric SMS
        </button>
        <a
          href="/api/export/csv"
          className="flex items-center justify-center gap-2 py-3 rounded-none bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 transition"
        >
          <Download className="w-4 h-4" /> Export CSV
        </a>
      </div>

      {soonClients.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">
            Curând (30 zile)
          </p>
          {soonClients.map((c) => {
            const days = daysUntil(c.dueDate)
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c.id)}
                className="w-full text-left p-4 rounded-none bg-white border border-orange-100 flex items-center justify-between gap-3 hover:border-orange-300 transition"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 truncate">{c.name}</div>
                  <div className="text-xs text-slate-500 truncate">
                    {c.model || '—'} · {c.phone}
                  </div>
                  <div className="text-xs text-slate-500">
                    Scadent: {formatRoDate(c.dueDate)}
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-bold text-orange-600 border border-orange-300 rounded whitespace-nowrap">
                  {days} {days === 1 ? 'ZI' : 'ZILE'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {dueClients.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-xs font-bold tracking-wider text-slate-500 uppercase">
            Atenție urgent
          </p>
          {dueClients.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full text-left p-4 rounded-none bg-white border border-red-100 flex items-center justify-between gap-3 hover:border-red-300 transition"
            >
              <div className="min-w-0">
                <div className="font-bold text-slate-900 truncate">{c.name}</div>
                <div className="text-xs text-slate-500 truncate">
                  {c.model} · {c.phone}
                </div>
                <div className="text-xs text-slate-500">
                  Scadent: {formatRoDate(c.dueDate)}
                </div>
              </div>
              <span className="px-2.5 py-1 text-xs font-bold text-red-600 border border-red-300 rounded">
                SCADENT
              </span>
            </button>
          ))}
        </div>
      )}

      {total === 0 && <EmptyState onNew={onNew} />}
    </div>
  )
}

function StatCell({ value, label, color, border = '' }) {
  return (
    <div className={`p-5 ${border} border-slate-200`}>
      <div className={`text-4xl font-extrabold ${color}`}>{value}</div>
      <div className="mt-3 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
        {label}
      </div>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="text-center py-10 bg-white rounded-none border border-dashed border-slate-300">
      <Users className="w-10 h-10 mx-auto text-slate-400" />
      <p className="mt-3 text-slate-600 font-medium">Niciun client adăugat</p>
      <p className="text-xs text-slate-400">Adaugă primul client pentru a începe</p>
      <Button onClick={onNew} className="mt-4" style={{ backgroundColor: NAVY }}>
        <Plus className="w-4 h-4 mr-2" /> Adaugă client
      </Button>
    </div>
  )
}

function ClientForm({ initial, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    phone: initial?.phone || '+40',
    address: initial?.address || '',
    model: initial?.model || '',
    notes: initial?.notes || '',
    lastVerification:
      initial?.lastVerification || new Date().toISOString().slice(0, 10),
  })

  const submit = (e) => {
    e.preventDefault()
    if (!form.name || !form.phone) {
      toast.error('Numele și telefonul sunt obligatorii')
      return
    }
    onSubmit(form)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nume client" required>
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="ex: Georgescu Vasile"
        />
      </Field>
      <Field label="Telefon" required>
        <Input
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          placeholder="+40755666777"
        />
      </Field>
      <Field label="Adresă">
        <Input
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          placeholder="Str. Scurta 2, Timisoara"
        />
      </Field>
      <Field label="Model centrală">
        <Input
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
          placeholder="Bosch Condens 2500"
        />
      </Field>
      <Field label="Data ultimei verificări">
        <Input
          type="date"
          value={form.lastVerification}
          onChange={(e) => setForm({ ...form, lastVerification: e.target.value })}
        />
        <p className="text-xs text-slate-500 mt-1">
          Scadența se calculează automat la 2 ani
        </p>
      </Field>
      <Field label="Notițe">
        <Textarea
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="ex: are probleme cu schimbătorul, cere factură pe firmă..."
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Anulează
        </Button>
        <Button
          type="submit"
          className="flex-1 text-white"
          style={{ backgroundColor: NAVY }}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, required, children }) {
  return (
    <div>
      <Label className="text-xs font-bold tracking-wider text-slate-500 uppercase">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  )
}

function ClientList({ clients, onSelect }) {
  const [q, setQ] = useState('')
  const filtered = clients.filter(
    (c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.phone.includes(q) ||
      (c.model || '').toLowerCase().includes(q.toLowerCase())
  )
  return (
    <div className="space-y-3">
      <Input
        placeholder="Caută după nume, telefon, model..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {filtered.length === 0 && (
        <p className="text-center text-slate-500 py-8">Niciun client găsit</p>
      )}
      {filtered.map((c) => {
        const s = statusOf(c.dueDate)
        const tone =
          s.tone === 'red'
            ? 'text-red-600 border-red-300 bg-red-50'
            : s.tone === 'orange'
            ? 'text-orange-600 border-orange-300 bg-orange-50'
            : 'text-emerald-700 border-emerald-300 bg-emerald-50'
        return (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className="w-full text-left p-4 rounded-none bg-white border border-slate-200 flex items-center justify-between gap-3 hover:border-slate-400 transition"
          >
            <div className="min-w-0">
              <div className="font-bold text-slate-900 truncate">{c.name}</div>
              <div className="text-xs text-slate-500 truncate">
                {c.model || '—'} · {c.phone}
              </div>
              <div className="text-xs text-slate-500">
                Scadent: {formatRoDate(c.dueDate)}
              </div>
            </div>
            <span className={`px-2.5 py-1 text-xs font-bold border rounded ${tone}`}>
              {s.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function ClientDetail({ client, busy, onSendSMS, onVerifiedToday, onEdit, onDelete }) {
  const s = statusOf(client.dueDate)
  const isDue = s.tone === 'red'
  const isSoon = s.tone === 'orange'
  const verifications = (client.verificationHistory || [])
    .slice()
    .sort((a, b) => (b.date > a.date ? 1 : -1))

  return (
    <div className="space-y-4">
      <div
        className={`rounded-none border-2 p-4 ${
          isDue
            ? 'border-red-300 bg-red-50'
            : isSoon
            ? 'border-orange-300 bg-orange-50'
            : 'border-emerald-300 bg-emerald-50'
        }`}
      >
        <div
          className={`text-xs font-bold tracking-wider uppercase ${
            isDue ? 'text-red-600' : isSoon ? 'text-orange-600' : 'text-emerald-700'
          }`}
        >
          STATUS - {s.label}
        </div>
        <div
          className={`text-lg font-bold mt-0.5 ${
            isDue ? 'text-red-600' : isSoon ? 'text-orange-600' : 'text-emerald-700'
          }`}
        >
          {isDue
            ? 'Verificare depășită!'
            : isSoon
            ? `Verificare în ${daysUntil(client.dueDate)} zile`
            : 'În regulă'}
        </div>
      </div>

      <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight break-words">
        {client.name}
      </h2>

      <div className="bg-white rounded-none border border-slate-200 divide-y divide-slate-100">
        <Row icon={<Phone className="w-4 h-4" />} label="Telefon" value={client.phone} />
        <Row icon={<MapPin className="w-4 h-4" />} label="Adresă" value={client.address || '—'} />
        <Row icon={<Flame className="w-4 h-4" />} label="Model centrală" value={client.model || '—'} />
        <Row icon={<Calendar className="w-4 h-4" />} label="Ultima verificare" value={formatRoDate(client.lastVerification)} />
        <Row
          icon={<AlarmClock className="w-4 h-4" />}
          label="Data scadență (+2 ani)"
          value={formatRoDate(client.dueDate)}
          bold
        />
        <Row icon={<Send className="w-4 h-4" />} label="SMS-uri trimise" value={String(client.smsCount || 0)} />
      </div>

      {client.notes && (
        <div className="bg-amber-50 border border-amber-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="w-4 h-4 text-amber-700" />
            <span className="text-[11px] font-bold tracking-wider text-amber-700 uppercase">
              Notițe
            </span>
          </div>
          <p className="text-sm text-slate-800 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {verifications.length > 0 && (
        <div className="bg-white border border-slate-200">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
            <HistoryIcon className="w-4 h-4 text-slate-500" />
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Istoric verificări ({verifications.length})
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {verifications.map((v) => (
              <div key={v.id || v.date} className="px-4 py-3">
                <div className="text-sm font-bold text-slate-900">
                  {formatRoDate(v.date)}
                </div>
                {v.notes && (
                  <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap">
                    {v.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onSendSMS}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-none text-white font-bold uppercase tracking-wider shadow-sm hover:opacity-90 transition disabled:opacity-50"
        style={{ backgroundColor: NAVY }}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        Trimite SMS acum
      </button>

      <button
        onClick={onVerifiedToday}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-none bg-emerald-500 hover:bg-emerald-600 text-white font-bold uppercase tracking-wider shadow-sm transition disabled:opacity-50"
      >
        <CheckCircle2 className="w-5 h-5" />
        Am făcut verificarea azi
      </button>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onEdit} className="font-semibold">
          <Edit3 className="w-4 h-4 mr-2" /> Editează
        </Button>
        <Button
          variant="outline"
          onClick={onDelete}
          className="font-semibold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 className="w-4 h-4 mr-2" /> Șterge
        </Button>
      </div>
    </div>
  )
}

function Row({ icon, label, value, bold }) {
  return (
    <div className="px-4 py-3 flex items-start gap-3">
      <div className="text-slate-400 mt-1">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          {label}
        </div>
        <div
          className={`mt-0.5 text-slate-900 break-words ${
            bold ? 'text-lg font-extrabold' : ''
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function SettingsView({ settings, busy, onCancel, onSubmit }) {
  const [form, setForm] = useState({
    messageTwoWeeks: settings.messageTwoWeeks,
    messageDueDate: settings.messageDueDate,
    contactPhone: settings.contactPhone || '',
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(form)
      }}
      className="space-y-4"
    >
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-none text-xs text-blue-800">
        Variabile disponibile: <code className="font-mono">{'{nume}'}</code>,{' '}
        <code className="font-mono">{'{model}'}</code>,{' '}
        <code className="font-mono">{'{data}'}</code>,{' '}
        <code className="font-mono">{'{adresa}'}</code>,{' '}
        <code className="font-mono">{'{telefon}'}</code>
      </div>

      <Field label="Mesaj cu 2 săptămâni înainte">
        <Textarea
          rows={5}
          value={form.messageTwoWeeks}
          onChange={(e) => setForm({ ...form, messageTwoWeeks: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">
          {form.messageTwoWeeks.length} caractere
        </p>
      </Field>

      <Field label="Mesaj la data scadenței">
        <Textarea
          rows={5}
          value={form.messageDueDate}
          onChange={(e) => setForm({ ...form, messageDueDate: e.target.value })}
        />
        <p className="text-xs text-slate-400 mt-1">
          {form.messageDueDate.length} caractere
        </p>
      </Field>

      <Field label="Telefon contact">
        <Input
          value={form.contactPhone}
          onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          placeholder="+40752832309"
        />
      </Field>

      <div className="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          Anulează
        </Button>
        <Button
          type="submit"
          className="flex-1 text-white"
          style={{ backgroundColor: NAVY }}
          disabled={busy}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvează'}
        </Button>
      </div>
    </form>
  )
}

function HistoryView({ history }) {
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(() => {
    return history.filter((h) => {
      const ql = q.trim().toLowerCase()
      if (ql) {
        const hay = (
          (h.clientName || '') +
          ' ' +
          (h.phone || '') +
          ' ' +
          (h.model || '') +
          ' ' +
          (h.message || '')
        ).toLowerCase()
        if (!hay.includes(ql)) return false
      }
      if (from) {
        if (new Date(h.sentAt) < new Date(from + 'T00:00:00')) return false
      }
      if (to) {
        if (new Date(h.sentAt) > new Date(to + 'T23:59:59')) return false
      }
      return true
    })
  }, [history, q, from, to])

  const reset = () => {
    setQ('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Caută nume, telefon, model centrală..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              De la data
            </Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
              Până la data
            </Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {(q || from || to) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reset}
            className="w-full"
          >
            <X className="w-3 h-3 mr-1" /> Resetează filtre
          </Button>
        )}
        <p className="text-xs text-slate-500 text-center">
          {filtered.length} din {history.length} mesaje
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-slate-500 py-8">Niciun rezultat</p>
      ) : (
        filtered.map((h) => (
          <div key={h.id} className="bg-white rounded-none border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="font-bold text-slate-900">{h.clientName}</div>
              <span
                className={`px-2 py-0.5 text-xs font-bold rounded-none ${
                  h.status === 'sent'
                    ? 'text-emerald-700 bg-emerald-100'
                    : 'text-red-700 bg-red-100'
                }`}
              >
                {h.status === 'sent' ? 'TRIMIS' : 'EȘUAT'}
              </span>
            </div>
            <div className="text-xs text-slate-500 mb-2">
              {h.phone}
              {h.model ? ` · ${h.model}` : ''} ·{' '}
              {new Date(h.sentAt).toLocaleString('ro-RO')} ·{' '}
              {h.type === '2_weeks'
                ? '2 săptămâni'
                : h.type === 'due_date'
                ? 'Scadență'
                : 'Manual'}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{h.message}</p>
            {h.error && <p className="mt-2 text-xs text-red-600">Eroare: {h.error}</p>}
          </div>
        ))
      )}
    </div>
  )
}

export default App
