import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Story } from '../api'
import HouseScene, { type Activity } from '../house/HouseScene'
import { clamp, riskColor, riskWord } from '../lib'
import { chaptersFor } from './chapters'
import MoodChart from './MoodChart'
import { LearnedBars, PlanToday, RingSignals } from './Panels'

export default function StoryPage({ story }: { story: Story }) {
  const chapters = useMemo(() => chaptersFor(story), [story])
  const [day, setDay] = useState(-42)
  const [target, setTarget] = useState<number | null>(null)
  const [override, setOverride] = useState<'keel' | 'none' | null>(null)
  const [ci, setCi] = useState(0)
  const [auto, setAuto] = useState(() => new URLSearchParams(location.search).has('autoplay'))
  const raf = useRef<number>(0)
  const ch = chapters[ci]
  const world = override ?? ch.world

  // animate day toward target
  useEffect(() => {
    if (target == null) return
    const from = day
    const dist = Math.abs(target - from)
    const dur = clamp(dist / 30, 0.8, 2.8) * 1000
    const t0 = performance.now()
    const tick = (now: number) => {
      const k = clamp((now - t0) / dur, 0, 1)
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      setDay(from + (target - from) * e)
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else setTarget(null)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  const go = useCallback((i: number) => {
    const k = clamp(i, 0, chapters.length - 1)
    const c = chapters[k]
    setOverride(null)
    setCi(k)
    if (Math.abs(day - c.start) > 25) setDay(c.start)   // jumping far: start the chapter from its beginning
    setTarget(c.end)
  }, [chapters, day])
  const next = useCallback(() => go(ci + 1), [go, ci])
  const prev = useCallback(() => {
    const k = Math.max(0, ci - 1)
    setOverride(null); setTarget(null); setCi(k); setDay(chapters[k].start)
  }, [chapters, ci])

  // booth mode: advance by itself, with reading time after each chapter
  useEffect(() => {
    if (!auto || target != null) return
    const last = ci === chapters.length - 1
    const t = setTimeout(() => (last ? go(0) : next()), last ? 12000 : ci === 0 ? 3500 : 6500)
    return () => clearTimeout(t)
  }, [auto, target, ci, chapters.length, go, next])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  const d = Math.floor(day)
  const tmsRec = d < 0 ? story.tms[d + 42] : null
  const keelRec = d >= 0 ? story.keel[Math.min(d, story.keel.length - 1)] : null
  const noneRec = d >= 0 ? story.none[Math.min(d, story.none.length - 1)] : null
  const s = tmsRec ? tmsRec.s : world === 'none' ? noneRec!.s : keelRec!.s
  const atClinic = (ci > 0 && !!tmsRec?.session) || (world === 'keel' && !!keelRec?.in_booster)
  const [act, setAct] = useState<Activity | null>(null)
  const house = useMemo(() => ({ s, day, atClinic, phone: world === 'keel' && d >= 0, plan: world === 'keel' && keelRec ? keelRec.plan : [] }),
    [s, day, atClinic, world, d, keelRec])
  const sessionNo = tmsRec ? story.tms.slice(0, d + 43).filter((t) => t.session).length : 0

  return (
    <div className="grid min-h-full grid-rows-[1fr_auto] lg:h-full">
      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]">
        {/* left: her home, one day per turn of the sun */}
        <section className="relative flex min-h-[440px] min-w-0 flex-col sm:min-h-[460px]">
          <div key={ch.id} className="fade-in relative z-10 px-6 pt-5">
            <h1 className="max-w-[34rem] font-serif text-[clamp(2rem,3.4vw,3.4rem)] leading-[1.02] text-foam">{ch.title}</h1>
            <p className="mt-2.5 max-w-[32rem] text-[15px] leading-relaxed text-mist">{ch.line}</p>
            {ci === 0 && (
              <p className="mt-4 max-w-[32rem] border-l-2 border-calm pl-3 text-[14px] leading-relaxed text-foam/85">
                Aino is a simulated patient. You follow the same six months twice, once with Keel and once without.
                Each turn of the sun is one day in her home.
              </p>
            )}
            {ch.id === 'well' && (
              <nav className="mt-5 grid max-w-[30rem] gap-2" aria-label="Where to look next">
                {[['#/phone', 'What Aino sees', 'Three questions a day on her phone, and nothing about risk'],
                  ['#/clinic', 'What her nurse sees', 'Who to call this week, and why'],
                  ['#/proof', 'How we know it works', '300 simulated patients, real wearable data and the whitepaper']].map(([href, t, sub]) => (
                  <a key={href} href={href} className="group rounded-xl border border-foam/20 px-4 py-2.5 hover:border-foam hover:bg-foam/5">
                    <div className="text-[15px] text-foam">{t}</div>
                    <div className="text-[12px] text-mist">{sub}</div>
                  </a>
                ))}
              </nav>
            )}
            {world === 'none' && d >= 0 && (
              <button onClick={() => setOverride('keel')} className="mt-3 inline-flex items-center gap-2 rounded-full bg-storm/20 px-3 py-1 text-[12px] text-storm hover:bg-storm/30">
                Same six months, without Keel <span className="text-storm/70 underline underline-offset-2">show with Keel</span>
              </button>
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            <div className="absolute inset-0"><HouseScene inp={house} onActivity={setAct} /></div>
            {act && (
              <div className="pointer-events-none absolute left-6 top-3 text-[13px]">
                <span className="tabular-nums text-foam">{act.clock}</span>
                <span key={act.what} className="fade-in ml-3 text-mist">{act.what}</span>
              </div>
            )}
          </div>
        </section>

        {/* right: what is measured, forecast, what is done */}
        <section className="flex min-h-0 min-w-0 flex-col gap-3 px-4 pb-3 pt-4 sm:px-5 lg:overflow-hidden lg:pl-2 lg:pr-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-[13px] text-mist">
              {ci === 0 ? <>Before treatment</> : d < 0 ? <>TMS course · week {Math.floor((d + 42) / 7) + 1}{sessionNo ? `, session ${sessionNo} of 30` : ''}</> : <>Day {d} at home</>}
            </div>
            {d >= 14 && keelRec && world === 'keel' && (
              <div className="flex items-center gap-2 text-[13px]">
                <Who who="nurse" />
                <span className="text-mist">2-week outlook</span>
                <span className="rounded-full px-2.5 py-0.5 font-medium text-sea transition-colors" style={{ background: riskColor(keelRec.risk) }}>
                  {riskWord(keelRec.risk)} · {keelRec.risk > 0.95 ? 'over 95' : keelRec.risk < 0.02 ? 'under 2' : Math.round(keelRec.risk * 100)}% relapse risk
                </span>
              </div>
            )}
          </div>
          <div className="min-h-[260px] flex-1 border-t border-foam/15 lg:min-h-[150px]">
            <MoodChart story={story} day={day} world={world} />
          </div>

          {ch.id === 'well' && story.cohort ? (
            <Results story={story} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="hidden border-t border-foam/15 pt-4 md:block">
                {d < 0 ? (
                  <>
                    <h3 className="mb-2 text-[13px] font-medium text-foam">In the clinic</h3>
                    <p className="text-[13px] leading-relaxed text-mist">Daily 20-minute sessions. {d > -14 ? 'In the last two weeks she wears the ring, so Keel learns what her normal sleep and activity look like before she leaves.' : 'Psychiatrist, nurses and weekly scores keep track of her.'}</p>
                  </>
                ) : world === 'none' ? (
                  <>
                    <h3 className="mb-2 text-[13px] font-medium text-foam">Between visits, nobody is looking</h3>
                    <RingSignals story={story} rec={noneRec!} />
                  </>
                ) : (
                  <>
                    <h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foam">{d < 14 ? 'Learning her normal' : 'Today’s plan'}{d >= 1 && <Who who="aino" />}</h3>
                    {d >= 1 && <div className="mb-3"><PlanToday rec={keelRec!} /></div>}
                    <RingSignals story={story} rec={keelRec!} />
                  </>
                )}
              </div>
              {world === 'none' && d >= 0 ? (
                <Unnoticed story={story} day={d} />
              ) : ch.id === 'warning' && story.events.alert != null && d >= story.events.alert ? (
                <ClinicToast story={story} />
              ) : (
              <div className="hidden border-t border-foam/15 pt-4 md:block">
                <h3 className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foam">What helps {story.profile.name}{d >= 1 && <Who who="aino" />}</h3>
                <LearnedBars mean={(keelRec ?? story.keel[0]).learned.mean} sd={(keelRec ?? story.keel[0]).learned.sd} highlight={keelRec?.plan} />
              </div>
              )}
            </div>
          )}
        </section>
      </div>

      <Timeline chapters={chapters} ci={ci} day={day} onGo={go} onPrev={prev} onNext={next} auto={auto} onAuto={() => setAuto((a) => !a)}
        world={world} onWorld={(w) => setOverride(w)} canToggle={d >= 0} />
    </div>
  )
}

function Unnoticed({ story, day }: { story: Story; day: number }) {
  const start = story.events.life_event.find((x) => x > 20) ?? 53
  const visit = story.events.found_without ?? 90
  const sliding = Math.max(0, Math.min(day, visit) - start)
  return (
    <div className="border-t border-foam/15 pt-4">
      <h3 className="mb-2 text-[13px] font-medium text-foam">Who knew?</h3>
      <p className="text-[13px] leading-relaxed text-mist">
        <span className="font-serif text-[40px] leading-none text-storm">{sliding} days</span><br />
        since her sleep first slipped. Her next contact with the clinic is the 3-month visit{day >= visit ? ', and that is where it is found.' : ` on day ${visit}.`}
      </p>
    </div>
  )
}

const RING_WORDS: Record<string, string> = {
  sleep_regularity: 'Sleep regularity', rhythm_strength: 'Day/night rhythm', sleep_efficiency: 'Sleep efficiency',
  night_wake_min: 'Awake at night', steps: 'Activity', hrv_ms: 'Heart rate variability',
}

/** What the nurse sees the moment the forecast crosses the line. */
function ClinicToast({ story }: { story: Story }) {
  const a = story.events.alert!
  const rec = story.keel[a]
  const win = story.keel.slice(Math.max(0, a - 6), a + 1)
  const top = Object.entries(rec.contrib).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => {
    const base = story.passive.find((p) => p.key === k)!.baseline
    const now = win.reduce((acc, r) => acc + r.passive[k], 0) / win.length
    const pct = Math.round(((now - base) / base) * 100)
    return `${RING_WORDS[k]} ${pct > 0 ? '+' : ''}${pct}%`
  })
  return (
    <div className="fade-in self-start bg-foam p-5 text-ink">
      <div className="flex items-center justify-between text-[11px] text-ink/50"><span>Espoo TMS clinic call list, day {a}</span><Who who="nurse" light /></div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="pulse-ring inline-block h-2.5 w-2.5 rounded-full bg-storm" />
        <span className="text-[15px] font-medium">{story.profile.name} K. · talk about a booster</span>
      </div>
      <div className="mt-1 text-[12px] text-ink/70">{Math.round(rec.risk * 100)}% chance of relapse within 2 weeks</div>
      <div className="mt-2 flex flex-wrap gap-1">{top.map((t) => <span key={t} className="rounded-full bg-squall/20 px-2 py-0.5 text-[11px] text-[#8a5a0c]">{t}</span>)}</div>
    </div>
  )
}

function Results({ story }: { story: Story }) {
  const c = story.cohort!
  const none = c.policies.none, keel = c.policies.keel, fixed = c.policies.fixed
  const bars = [
    { label: 'Usual care: nothing until the next visit', v: none.relapse_free_180, color: '#ef6a5b' },
    { label: 'Same healthy-habits plan for everyone', v: fixed.relapse_free_180, color: '#f0b24a' },
    { label: 'Keel', v: keel.relapse_free_180, color: '#62c2a6' },
  ]
  return (
    <div className="fade-in grid grid-cols-1 gap-3 border-t border-foam/15 pt-4 md:grid-cols-[1.3fr_1fr]">
      <div>
        <h3 className="mb-3 text-[13px] font-medium text-foam">Still well 6 months after TMS</h3>
        <div className="space-y-2.5">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="mb-1 flex justify-between text-[12px]"><span className="text-mist">{b.label}</span><span className="font-medium tabular-nums text-foam">{Math.round(b.v * 100)}%</span></div>
              <div className="h-2.5 rounded-full bg-sea-3/50"><div className="h-full rounded-full" style={{ width: `${b.v * 100}%`, background: b.color }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 text-[13px] leading-snug text-mist">
        <p><span className="font-serif text-[30px] text-foam">{c.forecast.median_warning_days_keel} days</span><br />typical warning before a relapse, against {c.forecast.median_warning_days_checkin_only} from check-ins alone at the same false-alarm rate</p>
        <p><span className="font-serif text-[30px] text-foam">{keel.boosters_per_patient.toFixed(1)}</span> booster blocks per person in 6 months, only when the forecast called for one</p>
      </div>
    </div>
  )
}

/** Who sees this: the patient, or only her care team. */
function Who({ who, light = false }: { who: 'aino' | 'nurse'; light?: boolean }) {
  const t = who === 'aino' ? 'Aino sees this' : 'Only her nurse sees this'
  const c = who === 'aino'
    ? (light ? 'border-[#2e8c73]/40 text-[#2e8c73]' : 'border-calm/50 text-calm')
    : (light ? 'border-[#b5443a]/40 text-[#b5443a]' : 'border-storm/50 text-storm')
  return <span className={`whitespace-nowrap rounded-full border px-2 py-[1px] text-[10px] font-normal ${c}`}>{t}</span>
}

function Timeline({ chapters, ci, day, onGo, onPrev, onNext, world, onWorld, canToggle, auto, onAuto }: {
  chapters: ReturnType<typeof chaptersFor>; ci: number; day: number; onGo: (i: number) => void; onPrev: () => void; onNext: () => void
  auto: boolean; onAuto: () => void
  world: 'keel' | 'none'; onWorld: (w: 'keel' | 'none') => void; canToggle: boolean
}) {
  const X0 = -42, X1 = 180
  const pct = (v: number) => `${((v - X0) / (X1 - X0)) * 100}%`
  const atEnd = ci === chapters.length - 1 && day >= chapters[ci].end - 0.5
  return (
    <div className="sticky bottom-0 z-20 flex items-center gap-2 border-t border-sea-3/60 bg-sea px-3 py-3 sm:gap-4 sm:px-6">
      <button onClick={onPrev} className="rounded-full px-3 py-2 text-[13px] text-mist hover:text-foam" aria-label="Previous chapter">Back</button>
      <div className="flex-1">
        <div className="hidden md:grid" style={{ gridTemplateColumns: `repeat(${chapters.length - 1}, minmax(0, 1fr))` }}>
          {chapters.slice(1).map((c, i) => {
            const idx = i + 1
            const active = idx === ci
            return (
              <button key={c.id} onClick={() => onGo(idx)} aria-label={c.title}
                className={`truncate px-1 py-1 text-center text-[12px] ${active ? 'font-medium text-foam' : idx < ci ? 'text-mist' : 'text-mist/60 hover:text-foam'}`}>
                {LABELS[c.id]}
              </button>
            )
          })}
        </div>
        <div className="relative mt-1 h-1 rounded-full bg-sea-3" title="Days since leaving the clinic">
          <div className="absolute left-0 top-0 h-1 rounded-full bg-foam/70" style={{ width: pct(day) }} />
        </div>
      </div>
      <div className={`hidden items-center gap-2 text-[12px] sm:flex ${canToggle ? '' : 'opacity-40'}`} title="The same six months of Aino's life, lived with Keel or without it">
        <span className="hidden text-mist xl:inline">Same six months</span>
        <div className="flex rounded-full bg-sea-2 p-0.5" role="radiogroup" aria-label="Compare the same six months with and without Keel">
          {(['keel', 'none'] as const).map((w) => (
            <button key={w} disabled={!canToggle} onClick={() => onWorld(w)} role="radio" aria-checked={world === w}
              className={`rounded-full px-3 py-1.5 ${world === w ? (w === 'keel' ? 'bg-calm text-sea' : 'bg-storm text-sea') : 'text-mist hover:text-foam'}`}>
              {w === 'keel' ? 'With Keel' : 'Without Keel'}
            </button>
          ))}
        </div>
      </div>
      <button onClick={onAuto} aria-pressed={auto} title="Play the story by itself"
        className={`hidden rounded-full px-3 py-2 text-[13px] md:block ${auto ? 'text-calm' : 'text-mist hover:text-foam'}`}>{auto ? 'Autoplay on' : 'Autoplay'}</button>
      <button onClick={atEnd ? () => onGo(1) : onNext}
        className="rounded-full bg-foam px-6 py-2.5 text-[15px] tracking-[-0.03em] text-sea hover:bg-white">
        {ci === 0 && day <= -42 ? 'Start' : atEnd ? 'Replay' : 'Next'}
      </button>
    </div>
  )
}

const LABELS: Record<string, string> = {
  tms: 'TMS', home: 'Home', learn: 'Learning', storm: 'Hard week', warning: 'Warning', booster: 'Booster', without: 'Without Keel', well: '6 months',
}
