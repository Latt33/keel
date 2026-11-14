import { useEffect, useMemo, useState } from 'react'
import { api, DOSE_LABEL, type LiveState, type Story } from '../api'
import KeelApp, { type Item } from './KeelApp'
import { riskColor } from '../lib'
import { LearnedBars } from '../story/Panels'


export default function PhonePage({ story }: { story: Story }) {
  const [st, setSt] = useState<LiveState | null>(null)
  const [prev, setPrev] = useState<LiveState | null>(null)
  const [items, setItems] = useState<Record<string, Item>>({})
  const [sent, setSent] = useState(false)
  useEffect(() => {
    api.live().then(setSt)
    fetch('/api/items').then((r) => r.json()).then((d) => setItems(Object.fromEntries(d.items.map((i: Item) => [i.key, i]))))
  }, [])
  const submit = async (answers: Record<string, number>, done: string[]) => {
    if (!st) return
    const before = st
    const nxt = await api.checkin(answers, done)
    setPrev(before); setSt(nxt); setSent(true)
    return nxt
  }
  const preset = async (hard: boolean) => {
    if (!st) return
    const answers = Object.fromEntries(st.questions.map((k) => [k, k === 'safety' ? 0 : hard ? 2 : 0]))
    await submit(answers, hard ? [] : st.plan.slice(0, 1))
  }
  const reset = async () => { const s = await api.reset(); setPrev(null); setSt(s); setSent(false) }

  if (!st || !Object.keys(items).length) return <div className="p-8 text-ink/60">Opening Aino’s phone…</div>
  const name = story.profile.name
  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-12 px-6 py-8 lg:grid-cols-[400px_1fr]">
      <div className="mx-auto w-[390px] max-w-full rounded-[48px] bg-ink p-3">
        <div className="relative h-[min(800px,calc(100vh-130px))] overflow-hidden rounded-[38px]">
          <KeelApp st={st} story={story} items={items} onSubmit={submit} />
        </div>
      </div>
      <BehindTheScenes st={st} prev={prev} sent={sent} items={items} onPreset={preset} onReset={reset} name={name} />
    </div>
  )
}

function BehindTheScenes({ st, prev, sent, items, onPreset, onReset, name }: {
  st: LiveState; prev: LiveState | null; sent: boolean; items: Record<string, Item>; onPreset: (hard: boolean) => void; onReset: () => void; name: string
}) {
  const last = st.history[st.history.length - 1] as (LiveState['history'][number] & { answers?: Record<string, number> }) | undefined
  const added = useMemo(() => (prev ? st.plan.filter((k) => !prev.plan.includes(k)) : []), [st, prev])
  const steps = [
    {
      key: 'sense', title: 'Sense', body: last?.answers ? (
        <ul className="space-y-1 text-[13px] text-ink/75">
          {Object.entries(last.answers).map(([k, v]) => <li key={k}><span className="text-ink/45">{items[k]?.domain}:</span> “{items[k]?.statements[v]}”</li>)}
          <li className="text-ink/45">Ring: sleep regularity {st.passive.sleep_regularity.toFixed(0)}, steps {Math.round(st.passive.steps).toLocaleString('en')}</li>
        </ul>
      ) : <div className="text-[13px] text-ink/60">Waiting for today’s three questions. The ring keeps sending sleep and activity.</div>,
    },
    {
      key: 'forecast', title: 'Forecast', body: (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          {prev && <><RiskPill r={prev.risk} /><span className="text-ink/40">to</span></>}
          <RiskPill r={st.risk} />
          <span className="text-ink/60">chance of relapse in 2 weeks. Only her care team sees this.</span>
        </div>
      ),
    },
    {
      key: 'plan', title: 'Plan tomorrow', body: (
        <div className="text-[13px] text-ink/75">{st.plan.map((k) => (added.includes(k) ? `+ ${DOSE_LABEL[k]}` : DOSE_LABEL[k])).join(' · ')}</div>
      ),
    },
    { key: 'learn', title: 'Learn', body: <LearnedBars mean={st.learned.mean} sd={st.learned.sd} dark={false} highlight={st.plan} /> },
    {
      key: 'clinic', title: 'Clinic', body: (
        <div className={`text-[13px] ${st.alert || st.safety ? 'text-[#c0392b]' : 'text-ink/60'}`}>
          {st.safety ? `${name} answered the self-harm question. Her nurse is asked to call her today.`
            : st.alert ? `${name} is on this week’s call list. A booster block is suggested for day ${st.booster_pending ?? '–'}.`
              : st.tier === 'steady' ? 'Nothing to send. Her nurse sees a quiet week.' : `Watching. ${Math.min(st.streak, 3)} of 3 high-risk days in a row before her nurse is told.`}
        </div>
      ),
    },
  ]
  return (
    <div className="pt-2">
      <h2 className="font-serif text-[clamp(2.2rem,3.8vw,3.4rem)] leading-[1.02]">Three questions a day. The rest happens in the background.</h2>
      <p className="mt-3 max-w-[36rem] text-[15px] leading-relaxed text-ink/60">
        {name}’s own model, paused two days into her hard week. Tap the notification on her phone and answer as her, tap a day on her path, or let a whole day answer itself.
        The questions follow the Beck Depression Inventory’s structure, 21 topics over a week, each starting from “about as usual”.
      </p>
      <div className="mt-5 flex flex-wrap gap-2 text-[14px]">
        <button onClick={() => onPreset(false)} className="rounded-full border border-ink px-4 py-2 hover:bg-ink hover:text-fog">A steady day</button>
        <button onClick={() => onPreset(true)} className="rounded-full border border-ink px-4 py-2 hover:bg-ink hover:text-fog">A harder day</button>
        <button onClick={onReset} className="rounded-full px-4 py-2 text-ink/50 hover:text-ink">Start over</button>
      </div>
      <ol className="mt-8">
        {steps.map((s, i) => (
          <li key={s.key + (sent ? st.day : '')} className={`grid grid-cols-[40px_1fr] gap-3 border-t border-ink/15 py-4 ${sent ? 'fade-in' : ''}`} style={{ animationDelay: `${i * 100}ms` }}>
            <span className={`text-[13px] ${s.key === 'clinic' && (st.alert || st.safety) ? 'text-[#c0392b]' : 'text-ink/40'}`}>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <div className="mb-1.5 text-[15px]">{s.title}</div>
              {s.body}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

const pctText = (r: number) => (r > 0.95 ? 'over 95%' : r < 0.02 ? 'under 2%' : `${Math.round(r * 100)}%`)

function RiskPill({ r }: { r: number }) {
  return <span className="rounded-full px-2.5 py-0.5 tabular-nums text-sea" style={{ background: riskColor(r) }}>{pctText(r)}</span>
}
