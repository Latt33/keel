import { useEffect, useMemo, useRef, useState } from 'react'
import { api, DOSE_KEYS, DOSE_LABEL, type LiveState, type Story } from '../api'
import MiniForecast from '../charts/MiniForecast'
import { riskColor } from '../lib'
import { LearnedBars } from '../story/Panels'

const QUESTIONS = [
  { label: 'Feeling down', low: 'not at all', high: 'all day' },
  { label: 'Little interest in things', low: 'not at all', high: 'nothing appeals' },
  { label: 'Sleep was poor', low: 'slept well', high: 'barely slept' },
  { label: 'Tired, low energy', low: 'full of energy', high: 'exhausted' },
  { label: 'Worried, on edge', low: 'calm', high: 'constantly' },
]
const GOOD = [0.5, 0.5, 0.5, 0.5, 0.5]
const BAD = [2, 2, 1.5, 2, 1.5]

export default function PhonePage({ story }: { story: Story }) {
  const [st, setSt] = useState<LiveState | null>(null)
  const [prev, setPrev] = useState<LiveState | null>(null)
  const [answers, setAnswers] = useState<number[]>(GOOD)
  const [done, setDone] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [showOutlook, setShowOutlook] = useState(false)
  const screen = useRef<HTMLDivElement>(null)
  useEffect(() => { api.live().then(setSt) }, [])
  useEffect(() => { if (st) setDone(st.plan.slice(0, 1)) }, [st?.day]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!st) return
    setBusy(true)
    const before = st
    const nxt = await api.checkin(answers, done)
    setPrev(before); setSt(nxt); setBusy(false); setSent(true)
    screen.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const reset = async () => { const s = await api.reset(); setPrev(null); setSt(s); setSent(false); setAnswers(GOOD) }

  if (!st) return <div className="p-8 text-ink/60">Opening Aino’s phone…</div>
  const name = story.profile.name
  return (
    <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-start gap-10 px-6 py-8 lg:grid-cols-[400px_1fr]">
      <Phone screenRef={screen}>
        <div className="flex items-baseline justify-between">
          <h2 className="font-serif text-[26px] leading-tight">Good evening, {name}</h2>
          <span className="text-[12px] text-ink/50">day {st.day} at home</span>
        </div>

        {st.alert && (
          <section className="fade-in mt-4 rounded-2xl bg-ink p-4 text-fog">
            <div className="text-[11px] text-fog/60">Espoo TMS clinic</div>
            <p className="mt-1 text-[14px] leading-snug">Hi {name}, Liisa here from the clinic. I’d like to check in with you, so I’ll give you a call tomorrow morning. Nothing you need to prepare.</p>
          </section>
        )}

        <YourWeek st={st} prev={prev} />

        <section className="mt-4 rounded-2xl bg-white p-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span>
              <span className="block text-[14px] font-medium">Show my two-week outlook</span>
              <span className="block text-[12px] text-ink/50">Off unless you and your clinician choose to turn it on.</span>
            </span>
            <input type="checkbox" checked={showOutlook} onChange={() => setShowOutlook(!showOutlook)} className="h-5 w-5 accent-[#2e8c73]" />
          </label>
          {showOutlook && (
            <div className="fade-in mt-3">
              <MiniForecast trend={st.trend} fan={st.fan} risk={st.risk} height={110} gentle />
              <p className="text-[12px] leading-snug text-ink/60">
                {st.tier === 'steady' ? 'Looks steady for the next two weeks.' : 'The next two weeks look less settled than usual. This is a forecast, not a diagnosis, and it often turns out fine.'}
              </p>
            </div>
          )}
        </section>

        <section className="mt-4 rounded-2xl bg-white p-4">
          <h3 className="mb-2 text-[14px] font-medium">Today’s plan</h3>
          <ul className="space-y-2">
            {st.plan.map((k) => {
              const i = DOSE_KEYS.indexOf(k)
              const m = st.learned.mean[i], sd = st.learned.sd[i]
              const on = done.includes(k)
              const meta = story.interventions.find((v) => v.key === k)!
              return (
                <li key={k}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-fog/60">
                    <input type="checkbox" checked={on} onChange={() => setDone(on ? done.filter((x) => x !== k) : [...done, k])}
                      className="mt-0.5 h-5 w-5 accent-[#2e8c73]" />
                    <span>
                      <span className="block text-[14px] font-medium">{DOSE_LABEL[k]} <span className="font-normal text-ink/50">· {meta.minutes} min</span></span>
                      <span className="block text-[12px] text-ink/60">{meta.detail}</span>
                      <span className="mt-0.5 block text-[12px] text-[#2e8c73]">
                        {sd > 0.6 ? 'Still finding out if this helps you.' : m > 0.4 ? `On days you do this, you score about ${m.toFixed(1)} points better.` : 'Seems to do little for you, so it comes up less.'}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="mt-4 rounded-2xl bg-white p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-[14px] font-medium">How was today?</h3>
            <span className="text-[11px] text-ink/40">about a minute</span>
          </div>
          {QUESTIONS.map((q, i) => (
            <div key={q.label} className="py-2">
              <div className="mb-1.5 text-[13px]">{q.label}</div>
              <input type="range" min={0} max={3} step={0.5} value={answers[i]} aria-label={q.label} className="slider w-full"
                onChange={(e) => { const a = answers.slice(); a[i] = Number(e.target.value); setAnswers(a) }} />
              <div className="mt-1 flex justify-between text-[11px] text-ink/40"><span>{q.low}</span><span>{q.high}</span></div>
            </div>
          ))}
          <button onClick={send} disabled={busy} className="mt-3 w-full rounded-full bg-ink py-3 text-[15px] font-medium text-fog disabled:opacity-60">
            {busy ? 'Sending…' : 'Send check-in'}
          </button>
        </section>

        <a href="tel:0925250111" className="mt-4 block rounded-2xl border border-storm/40 bg-storm/5 p-3 text-center text-[13px] text-ink">
          Need to talk to someone now? <span className="font-medium">MIELI crisis line 09 2525 0111</span>. Emergency: 112.
        </a>
      </Phone>

      <BehindTheScenes st={st} prev={prev} sent={sent} onPreset={(bad) => setAnswers(bad ? BAD : GOOD)} onReset={reset} name={name} />
    </div>
  )
}

const WEEK_SIGNALS = [
  { k: 'sleep_regularity', label: 'Regular sleep', word: 'sleep rhythm', up: true },
  { k: 'rhythm_strength', label: 'Active days, quiet nights', word: 'day/night rhythm', up: true },
  { k: 'steps', label: 'Moving', word: 'activity', up: true },
]

/** What the patient sees instead of a risk number: her week against her own usual, and what to do about it. */
function YourWeek({ st, prev }: { st: LiveState; prev: LiveState | null }) {
  const rows = WEEK_SIGNALS.map((s) => {
    const base = st.baseline[s.k], now = st.week[s.k]
    const rel = base ? now / base : 1
    return { ...s, rel, off: rel < 0.9 }
  })
  const worst = rows.filter((r) => r.off).sort((a, b) => a.rel - b.rel)[0]
  const added = prev ? st.plan.filter((k) => !prev.plan.includes(k)) : []
  const tip = added[0] ?? st.plan[0]
  const i = DOSE_KEYS.indexOf(tip)
  const helped = i >= 0 && st.learned.sd[i] <= 0.6 && st.learned.mean[i] > 0.4
  return (
    <section className="mt-4 rounded-2xl bg-white p-4 shadow-[0_1px_0_rgba(20,34,49,.06)]">
      <h3 className="text-[14px] font-medium">Your week, against your usual</h3>
      <div className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.k}>
            <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink/70">{r.label}</span><span className="text-ink/40">{r.off ? 'less than usual' : 'like usual'}</span></div>
            <div className="relative h-2 rounded-full bg-ink/5">
              <div className="absolute top-0 h-2 rounded-full bg-[#2e8c73]/70 transition-all duration-500" style={{ width: `${Math.min(100, r.rel * 80)}%` }} />
              <div className="absolute top-[-3px] h-[14px] w-px bg-ink/40" style={{ left: '80%' }} title="your usual" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink/70">
        {worst
          ? <>Your {worst.word} has been a bit off this week. That happens. {tip ? <>Tomorrow’s plan includes <b className="font-medium text-ink">{DOSE_LABEL[tip].toLowerCase()}</b>{helped ? ', which has helped you before.' : '.'}</> : null}</>
          : 'Your sleep and activity look like your usual. Keep the small habits going.'}
      </p>
    </section>
  )
}

function Phone({ children, screenRef }: { children: React.ReactNode; screenRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="mx-auto w-[390px] max-w-full rounded-[44px] bg-ink p-3 shadow-2xl">
      <div ref={screenRef} className="relative h-[min(800px,calc(100vh-120px))] overflow-y-auto rounded-[34px] bg-fog px-5 pb-6 pt-10">
        <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
        {children}
      </div>
    </div>
  )
}

function BehindTheScenes({ st, prev, sent, onPreset, onReset, name }: {
  st: LiveState; prev: LiveState | null; sent: boolean; onPreset: (bad: boolean) => void; onReset: () => void; name: string
}) {
  const last = st.history[st.history.length - 1]
  const added = useMemo(() => (prev ? st.plan.filter((k) => !prev.plan.includes(k)) : []), [st, prev])
  const removed = useMemo(() => (prev ? prev.plan.filter((k) => !st.plan.includes(k)) : []), [st, prev])
  const steps = [
    {
      key: 'sense', title: 'Sense', body: (
        <div className="text-[13px] text-ink/70">
          {last ? <>Check-in score <b className="text-ink">{last.phq.toFixed(0)}</b> of 27 · ring: sleep regularity <b className="text-ink">{st.passive.sleep_regularity.toFixed(0)}</b>, steps <b className="text-ink">{Math.round(st.passive.steps).toLocaleString('en')}</b></> : 'Waiting for tonight’s check-in. The ring keeps sending sleep and activity.'}
        </div>
      ),
    },
    {
      key: 'forecast', title: 'Forecast', body: (
        <div className="flex items-center gap-2 text-[13px]">
          {prev && <><RiskPill r={prev.risk} /><span className="text-ink/40">to</span></>}
          <RiskPill r={st.risk} />
          <span className="text-ink/60">chance of relapse in 2 weeks · only her care team sees this</span>
        </div>
      ),
    },
    {
      key: 'plan', title: 'Plan tomorrow', body: (
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
          {st.plan.map((k) => (
            <span key={k} className={`rounded-full px-2.5 py-1 ${added.includes(k) ? 'bg-squall/30 text-ink' : 'bg-ink/5 text-ink/80'}`}>{added.includes(k) ? '+ ' : ''}{DOSE_LABEL[k]}</span>
          ))}
          {removed.map((k) => <span key={k} className="rounded-full px-2.5 py-1 text-ink/40 line-through">{DOSE_LABEL[k]}</span>)}
        </div>
      ),
    },
    { key: 'learn', title: 'Learn', body: <LearnedBars mean={st.learned.mean} sd={st.learned.sd} dark={false} highlight={st.plan} /> },
    {
      key: 'clinic', title: 'Clinic', body: (
        <div className={`text-[13px] ${st.alert ? 'font-medium text-storm' : 'text-ink/60'}`}>
          {st.alert ? `${name} is on this week’s call list. A booster block is suggested for day ${st.booster_pending ?? '–'}.` : st.tier === 'steady' ? 'Nothing to send. Her nurse sees a quiet week.' : `Watching. ${Math.min(st.streak, 3)} of 3 high-risk days in a row before her nurse is told.`}
        </div>
      ),
    },
  ]
  return (
    <div className="pt-2">
      <h2 className="font-serif text-[clamp(2.2rem,3.8vw,3.4rem)] leading-[1.02]">Every check-in closes the loop.</h2>
      <p className="mt-2 max-w-[34rem] text-[15px] leading-relaxed text-ink/60">
        This is {name}’s own model, paused on day {st.day - st.history.length}, two days into her hard week. Her ring has started to notice; she has not said anything yet. Answer as her and watch what changes. The phone shows her what she can do; the risk goes to her care team.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        <button onClick={() => onPreset(false)} className="rounded-full border border-ink px-4 py-2 hover:bg-ink hover:text-fog">Answer as a good day</button>
        <button onClick={() => onPreset(true)} className="rounded-full border border-ink px-4 py-2 hover:bg-ink hover:text-fog">Answer as a bad day</button>
        <button onClick={onReset} className="rounded-full px-3 py-1.5 text-ink/50 hover:text-ink">Start over</button>
      </div>
      <ol className="relative mt-6 space-y-3">
        <div className="absolute bottom-6 left-[15px] top-6 w-px bg-ink/15" />
        {steps.map((s, i) => (
          <li key={s.key + (sent ? st.day : '')} className={`relative grid grid-cols-[32px_1fr] gap-3 ${sent ? 'fade-in' : ''}`} style={{ animationDelay: `${i * 120}ms` }}>
            <span className={`z-10 flex h-8 w-8 items-center justify-center rounded-full border text-[13px] ${s.key === 'clinic' && st.alert ? 'pulse-ring border-storm bg-storm text-white' : 'border-ink/30 bg-fog text-ink'}`}>{i + 1}</span>
            <div className="border-t border-ink/15 pt-3">
              <div className="mb-1.5 text-[13px] font-medium">{s.title}</div>
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
  return <span className="rounded-full px-2.5 py-0.5 font-medium tabular-nums text-sea" style={{ background: riskColor(r) }}>{pctText(r)}</span>
}
