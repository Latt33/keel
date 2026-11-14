import { useEffect, useMemo, useState } from 'react'
import { api, DOSE_KEYS, DOSE_LABEL, type LiveState, type Story } from '../api'
import MiniForecast from '../charts/MiniForecast'
import { riskColor } from '../lib'
import { LearnedBars } from '../story/Panels'

interface Item { key: string; domain: string; dim: string | null; statements: string[] }
type Screen = 'home' | 'checkin' | 'thanks' | 'insights'

export default function PhonePage({ story }: { story: Story }) {
  const [st, setSt] = useState<LiveState | null>(null)
  const [prev, setPrev] = useState<LiveState | null>(null)
  const [items, setItems] = useState<Record<string, Item>>({})
  const [screen, setScreen] = useState<Screen>('home')
  const [banner, setBanner] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    api.live().then(setSt)
    fetch('/api/items').then((r) => r.json()).then((d) => setItems(Object.fromEntries(d.items.map((i: Item) => [i.key, i]))))
  }, [])
  // the check-in arrives as a notification, a moment after the phone is opened
  useEffect(() => {
    if (screen !== 'home' || !st) return
    const t = setTimeout(() => setBanner(true), 900)
    return () => clearTimeout(t)
  }, [screen, st?.day]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (answers: Record<string, number>, done: string[]) => {
    if (!st) return
    const before = st
    const nxt = await api.checkin(answers, done)
    setPrev(before); setSt(nxt); setSent(true); setBanner(false)
    return nxt
  }
  const preset = async (hard: boolean) => {
    if (!st) return
    const answers = Object.fromEntries(st.questions.map((k) => [k, k === 'safety' ? 0 : hard ? 2 : 0]))
    await submit(answers, hard ? [] : st.plan.slice(0, 1))
    setScreen('thanks')
  }
  const reset = async () => { const s = await api.reset(); setPrev(null); setSt(s); setSent(false); setScreen('home') }

  if (!st || !Object.keys(items).length) return <div className="p-8 text-ink/60">Opening Aino’s phone…</div>
  const name = story.profile.name
  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-12 px-6 py-8 lg:grid-cols-[400px_1fr]">
      <Phone>
        {banner && screen === 'home' && (
          <button onClick={() => { setBanner(false); setScreen('checkin') }}
            className="fade-in absolute left-3 right-3 top-9 z-20 rounded-[18px] bg-white/95 p-3 text-left shadow-[0_8px_30px_rgba(0,0,0,.18)] backdrop-blur">
            <div className="flex items-center justify-between text-[11px] text-ink/50"><span>Keel</span><span>now</span></div>
            <div className="mt-0.5 text-[14px] text-ink">Three quick questions</div>
            <div className="text-[13px] text-ink/60">Under a minute.</div>
          </button>
        )}
        {screen === 'home' && <Home st={st} story={story} name={name} onInsights={() => setScreen('insights')} />}
        {screen === 'checkin' && (
          <CheckIn st={st} items={items} onDone={async (a, d) => { await submit(a, d); setScreen('thanks') }} onCancel={() => setScreen('home')} />
        )}
        {screen === 'thanks' && <Thanks st={st} onHome={() => setScreen('home')} onInsights={() => setScreen('insights')} />}
        {screen === 'insights' && <Insights st={st} prev={prev} onBack={() => setScreen('home')} />}
      </Phone>

      <BehindTheScenes st={st} prev={prev} sent={sent} items={items} onPreset={preset} onReset={reset} name={name} />
    </div>
  )
}

function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-[390px] max-w-full rounded-[48px] bg-ink p-3">
      <div className="relative h-[min(780px,calc(100vh-130px))] overflow-y-auto rounded-[38px] bg-[#f6f6f4] px-6 pb-8 pt-14 text-ink">
        <div className="absolute left-1/2 top-3 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
        {children}
      </div>
    </div>
  )
}

function Crisis() {
  return (
    <a href="tel:0925250111" className="mb-5 block rounded-2xl bg-ink p-4 text-fog">
      <div className="text-[15px]">Thank you for telling us. You don’t have to handle this alone.</div>
      <div className="mt-2 text-[13px] text-fog/75">Your care team will call you today. If you need someone right now: MIELI crisis line 09 2525 0111, or 112 in an emergency.</div>
    </a>
  )
}

function Home({ st, story, name, onInsights }: { st: LiveState; story: Story; name: string; onInsights: () => void }) {
  const tip = st.plan[0]
  const meta = story.interventions.find((v) => v.key === tip)
  const [done, setDone] = useState(false)
  return (
    <div>
      {st.safety && <Crisis />}
      <div className="text-[13px] text-ink/45">Day {st.day} at home</div>
      <h2 className="font-serif mt-1 text-[34px] leading-[1.05]">Hi {name}.</h2>

      {st.alert && !st.safety && (
        <div className="fade-in mt-6 border-t border-ink/15 pt-4">
          <div className="text-[12px] text-ink/45">Liisa, Espoo TMS clinic</div>
          <p className="mt-1 text-[15px] leading-snug">I’d like to check in with you, so I’ll call tomorrow morning. Nothing you need to prepare.</p>
        </div>
      )}

      {meta && (
        <div className="mt-8 border-t border-ink/15 pt-4">
          <div className="text-[12px] text-ink/45">Today, if it fits</div>
          <div className="mt-1 flex items-start justify-between gap-3">
            <div>
              <div className="text-[19px] leading-tight tracking-[-0.02em]">{meta.label}</div>
              <div className="mt-1 text-[13px] leading-snug text-ink/55">{meta.detail}</div>
            </div>
            <button onClick={() => setDone(!done)} aria-pressed={done}
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] ${done ? 'border-ink bg-ink text-fog' : 'border-ink/40'}`}>{done ? 'Done' : 'Mark done'}</button>
          </div>
        </div>
      )}

      <button onClick={onInsights} className="mt-8 w-full border-t border-ink/15 pt-4 text-left">
        <div className="text-[12px] text-ink/45">Whenever you want to look</div>
        <div className="mt-1 text-[17px] tracking-[-0.02em] underline decoration-1 underline-offset-4">What has been helping you</div>
      </button>
    </div>
  )
}

function CheckIn({ st, items, onDone, onCancel }: {
  st: LiveState; items: Record<string, Item>; onDone: (a: Record<string, number>, done: string[]) => void; onCancel: () => void
}) {
  const qs = st.questions
  const [i, setI] = useState(0)
  const [ans, setAns] = useState<Record<string, number>>({})
  const [safetyShown, setSafetyShown] = useState(false)
  const tip = st.plan[0]
  const total = qs.length + (tip ? 1 : 0)
  if (safetyShown) return (
    <div className="fade-in">
      <Crisis />
      <button onClick={() => { setSafetyShown(false); setI(i + 1) }} className="mt-2 rounded-full border border-ink px-5 py-2 text-[14px]">Continue</button>
    </div>
  )
  if (i < qs.length) {
    const it = items[qs[i]]
    return (
      <div key={it.key} className="fade-in">
        <Progress i={i} n={total} onCancel={onCancel} />
        <div className="mt-6 text-[13px] text-ink/50">{it.domain}</div>
        <h3 className="font-serif mt-1 text-[24px] leading-[1.1]">Which fits today best?</h3>
        <div className="mt-5 border-t border-ink/15">
          {it.statements.map((s, v) => (
            <button key={v} onClick={() => {
              const a = { ...ans, [it.key]: v }
              setAns(a)
              if (it.key === 'safety' && v >= 1) setSafetyShown(true)
              else setI(i + 1)
            }} className="block w-full border-b border-ink/15 py-3.5 text-left text-[15px] leading-snug hover:bg-ink/[.03]">{s}</button>
          ))}
        </div>
      </div>
    )
  }
  if (tip) return (
    <div className="fade-in">
      <Progress i={qs.length} n={total} onCancel={onCancel} />
      <div className="mt-6 text-[13px] text-ink/50">Today’s suggestion</div>
      <h3 className="font-serif mt-1 text-[24px] leading-[1.1]">Did you get to: {DOSE_LABEL[tip].toLowerCase()}?</h3>
      <div className="mt-5 border-t border-ink/15">
        <button onClick={() => onDone(ans, [tip])} className="block w-full border-b border-ink/15 py-3.5 text-left text-[15px]">Yes</button>
        <button onClick={() => onDone(ans, [])} className="block w-full border-b border-ink/15 py-3.5 text-left text-[15px]">Not today</button>
      </div>
    </div>
  )
  onDone(ans, [])
  return null
}

function Progress({ i, n, onCancel }: { i: number; n: number; onCancel: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex gap-1.5">{Array.from({ length: n }).map((_, k) => <span key={k} className={`h-1 w-6 rounded-full ${k <= i ? 'bg-ink' : 'bg-ink/15'}`} />)}</div>
      <button onClick={onCancel} className="text-[13px] text-ink/45">Later</button>
    </div>
  )
}

function Thanks({ st, onHome, onInsights }: { st: LiveState; onHome: () => void; onInsights: () => void }) {
  return (
    <div className="fade-in">
      {st.safety && <Crisis />}
      <h2 className="font-serif mt-10 text-[34px] leading-[1.05]">Thanks. That’s all for today.</h2>
      <p className="mt-3 text-[15px] text-ink/55">See you tomorrow.</p>
      <div className="mt-10 flex gap-2">
        <button onClick={onHome} className="rounded-full bg-ink px-5 py-2 text-[14px] text-fog">Close</button>
        <button onClick={onInsights} className="rounded-full border border-ink px-5 py-2 text-[14px]">What has been helping</button>
      </div>
    </div>
  )
}

const WEEK_SIGNALS = [
  { k: 'sleep_regularity', label: 'Regular sleep' },
  { k: 'rhythm_strength', label: 'Active days, quiet nights' },
  { k: 'steps', label: 'Moving' },
]

function Insights({ st, onBack }: { st: LiveState; prev: LiveState | null; onBack: () => void }) {
  const [showOutlook, setShowOutlook] = useState(false)
  const helps = DOSE_KEYS.map((k, i) => ({ k, m: st.learned.mean[i], sd: st.learned.sd[i] })).filter((r) => r.m > 0.6 && r.sd < 0.8).sort((a, b) => b.m - a.m)
  return (
    <div className="fade-in">
      <button onClick={onBack} className="text-[13px] text-ink/50">Back</button>
      <h2 className="font-serif mt-3 text-[30px] leading-[1.05]">What has been helping you</h2>
      <p className="mt-2 text-[13px] leading-snug text-ink/55">Learned from your own days since you came home. It keeps updating.</p>

      <div className="mt-6 border-t border-ink/15 pt-4">
        <div className="mb-2 text-[12px] text-ink/45">On days you do these, you tend to feel better</div>
        <LearnedBars mean={st.learned.mean} sd={st.learned.sd} dark={false} highlight={helps.slice(0, 2).map((h) => h.k)} you />
      </div>

      <div className="mt-6 border-t border-ink/15 pt-4">
        <div className="mb-3 text-[12px] text-ink/45">This week, against your usual</div>
        {WEEK_SIGNALS.map((s) => {
          const rel = st.baseline[s.k] ? st.week[s.k] / st.baseline[s.k] : 1
          return (
            <div key={s.k} className="mb-2.5">
              <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink/70">{s.label}</span><span className="text-ink/40">{rel < 0.9 ? 'less than usual' : 'like usual'}</span></div>
              <div className="relative h-1.5 rounded-full bg-ink/10">
                <div className="absolute top-0 h-1.5 rounded-full bg-ink/70 transition-all duration-500" style={{ width: `${Math.min(100, rel * 80)}%` }} />
                <div className="absolute top-[-4px] h-[14px] w-px bg-ink/50" style={{ left: '80%' }} />
              </div>
            </div>
          )
        })}
      </div>

      <label className="mt-6 flex cursor-pointer items-center justify-between gap-3 border-t border-ink/15 pt-4">
        <span>
          <span className="block text-[14px]">Show my two-week outlook</span>
          <span className="block text-[12px] text-ink/50">Off unless you and your clinician turn it on.</span>
        </span>
        <input type="checkbox" checked={showOutlook} onChange={() => setShowOutlook(!showOutlook)} className="h-5 w-5 accent-[#0a0e10]" />
      </label>
      {showOutlook && (
        <div className="fade-in mt-3">
          <MiniForecast trend={st.trend} fan={st.fan} risk={st.risk} height={110} gentle />
          <p className="text-[12px] leading-snug text-ink/55">{st.tier === 'steady' ? 'Looks steady for the next two weeks.' : 'The next two weeks look less settled than usual. This is a forecast, not a diagnosis, and it often turns out fine.'}</p>
        </div>
      )}
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
        {name}’s own model, paused two days into her hard week. Open the notification on her phone and answer as her, or let a whole day answer itself.
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
