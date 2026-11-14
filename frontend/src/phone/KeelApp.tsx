/**
 * Aino's phone app. Structure follows the team's earlier "path" app pattern: one vertical
 * path of her days since TMS, a single + button, and bottom sheets for everything else.
 * Colours and type are Keel's.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { DOSE_KEYS, DOSE_LABEL, type LiveState, type Story } from '../api'
import MiniForecast from '../charts/MiniForecast'
import { LearnedBars } from '../story/Panels'

export interface Item { key: string; domain: string; dim: string | null; statements: string[] }
type Sheet = null | 'checkin' | 'note' | 'activity' | 'helps' | 'settings' | { day: number }

const DISCHARGE = new Date(2026, 8, 20)            // last TMS session: Sunday 20 September 2026
const dateOf = (d: number) => new Date(DISCHARGE.getTime() + d * 86400000)
const fmtLong = (d: number) => dateOf(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
const fmtShort = (d: number) => dateOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const INK = '#0a0e10', PATH = '#3b7fc4', FAINT = '#8ab4ff', BRASS = '#b59a5b', CALM = '#2e8c73'

export default function KeelApp({ st, story, items, onSubmit }: {
  st: LiveState; story: Story; items: Record<string, Item>
  onSubmit: (answers: Record<string, number>, done: string[]) => Promise<unknown>
}) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [fab, setFab] = useState(false)
  const [banner, setBanner] = useState(false)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [doneToday, setDoneToday] = useState<string[]>([])
  const [outlook, setOutlook] = useState(false)
  const checkedInToday = useRef(-1)
  useEffect(() => {
    setDoneToday([])
    if (checkedInToday.current === st.day) return
    const t = setTimeout(() => setBanner(true), 1100)
    const h = setTimeout(() => setBanner(false), 9000)
    return () => { clearTimeout(t); clearTimeout(h) }
  }, [st.day])

  const finish = async (answers: Record<string, number>, done: string[]) => {
    checkedInToday.current = st.day + 1
    setBanner(false); setSheet(null)
    await onSubmit(answers, Array.from(new Set([...done, ...doneToday])))
  }

  return (
    <div className="relative h-full overflow-hidden bg-foam text-ink">
      <StatusBar />
      <header className="absolute left-0 right-0 top-8 z-10 bg-gradient-to-b from-foam via-foam/95 to-foam/0 px-5 pb-6 pt-2">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[19px] tracking-[-0.02em]">Keel</span>
              <span className="rounded-full bg-fog px-2.5 py-0.5 text-[11px] text-ink/70">Path</span>
            </div>
            <div className="mt-0.5 text-[12px] text-ink/55">Day {st.day} at home · last TMS session {fmtShort(0)}</div>
          </div>
          <button onClick={() => setSheet('settings')} aria-label="Settings" className="flex h-9 w-9 items-center justify-center rounded-full bg-fog"><Gear /></button>
        </div>
      </header>

      {banner && !sheet && (
        <button onClick={() => { setBanner(false); setSheet('checkin') }}
          className="fade-in absolute left-3 right-3 top-9 z-30 rounded-[20px] bg-white p-3.5 text-left shadow-[0_10px_30px_rgba(10,14,16,.18)]">
          <div className="flex items-center justify-between text-[11px] text-ink/50"><span>Keel</span><span>now</span></div>
          <div className="mt-0.5 text-[14px]">{['One','Two','Three','Four'][Math.max(0, Math.min(3, st.questions.length - 1))]} quick questions</div>
          <div className="text-[13px] text-ink/55">Under a minute.</div>
        </button>
      )}

      <PathView st={st} notes={notes} onDay={(d) => setSheet({ day: d })} />

      {/* the one button, with its arc of actions */}
      {fab && <button aria-label="Close menu" onClick={() => setFab(false)} className="absolute inset-0 z-10 bg-foam/60" />}
      <div className="absolute bottom-7 left-1/2 z-20 -translate-x-1/2">
        {fab && ARC.map((a, i) => (
          <button key={a.key} onClick={() => { setFab(false); setSheet(a.key) }}
            className="fade-in absolute flex flex-col items-center" style={{ left: a.x, top: a.y, animationDelay: `${i * 40}ms` }}>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-fog shadow-[0_2px_8px_rgba(10,14,16,.12)]">{a.icon}</span>
            <span className="mt-1 whitespace-nowrap text-[11px] text-ink/70">{a.label}</span>
          </button>
        ))}
        <button onClick={() => setFab(!fab)} aria-label={fab ? 'Close' : 'Add'}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-foam shadow-[0_6px_18px_rgba(10,14,16,.3)]">
          <span className={`text-[28px] leading-none transition-transform ${fab ? 'rotate-45' : ''}`}>+</span>
        </button>
      </div>

      {sheet && <div className="absolute inset-0 z-30 bg-ink/15" onClick={() => setSheet(null)} />}
      {sheet === 'checkin' && <CheckInSheet st={st} items={items} onCancel={() => setSheet(null)} onFinish={finish} />}
      {sheet === 'note' && <NoteSheet day={st.day} onCancel={() => setSheet(null)} onSave={(t) => { setNotes({ ...notes, [st.day - 1]: t }); setSheet(null) }} />}
      {sheet === 'activity' && <ActivitySheet st={st} story={story} done={doneToday} onCancel={() => setSheet(null)} onSave={(d) => { setDoneToday(d); setSheet(null) }} />}
      {sheet === 'helps' && <HelpsSheet st={st} outlook={outlook} setOutlook={setOutlook} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <SettingsSheet outlook={outlook} setOutlook={setOutlook} onClose={() => setSheet(null)} />}
      {sheet && typeof sheet === 'object' && <DaySheet st={st} items={items} day={sheet.day} note={notes[sheet.day]} onClose={() => setSheet(null)} />}
      {st.safety && <SafetyCard />}
      {st.alert && !st.safety && !sheet && !fab && (
        <div className="fade-in absolute bottom-28 left-4 right-4 z-10 rounded-2xl bg-fog p-4">
          <div className="text-[11px] text-ink/50">Liisa · Espoo TMS clinic</div>
          <div className="mt-0.5 text-[14px] leading-snug">I’d like to check in with you, so I’ll call tomorrow morning. Nothing you need to prepare.</div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ path */

const STEP = 13
const TMS_ROWS = 10

function PathView({ st, notes, onDay }: { st: LiveState; notes: Record<number, string>; onDay: (d: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const W = 366
  const cx = W / 2
  const days = st.path
  const top = 120
  const yTms = (i: number) => top + i * STEP
  const yDay = (d: number) => top + (TMS_ROWS + 2) * STEP + d * STEP
  const today = days.length
  const yToday = yDay(today) + 8
  const H = yToday + 300
  const xAt = (d: number) => cx + 22 * Math.sin(d / 6.5) + 9 * Math.sin(d / 2.1 + 1)
  const pts = useMemo(() => {
    const p: [number, number][] = []
    for (let i = -TMS_ROWS - 2; i <= today; i++) p.push([xAt(i), i < 0 ? yTms(i + TMS_ROWS + 2) : yDay(i)])
    return p
  }, [today]) // eslint-disable-line react-hooks/exhaustive-deps
  const line = (dx: number, ph: number) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x + dx * Math.sin(i / 3 + ph)).toFixed(1)},${y.toFixed(1)}`).join('')
  const boosterDays = days.filter((d) => d.booster).map((d) => d.day)
  const alertDay = days.find((d) => d.alert)?.day
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight })
  useEffect(() => { if (ref.current) ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }) }, [today])

  // roots below today: the days ahead, drawn as soft branching strands
  const roots = useMemo(() => Array.from({ length: 12 }).map((_, k) => {
    const spread = (k - 5.5) * 15
    const x0 = xAt(today), y0 = yToday
    return `M${x0},${y0} C${x0 + spread * 0.2},${y0 + 60} ${x0 + spread * 0.9},${y0 + 110} ${x0 + spread * 1.3 + Math.sin(k) * 10},${y0 + 260}`
  }), [today]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={ref} className="absolute inset-0 overflow-y-auto overflow-x-hidden pt-24">
      <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[366px]">
        {/* eras */}
        <rect x={0} y={yTms(0) - 16} width={W} height={(TMS_ROWS + 1) * STEP + 20} fill={BRASS} opacity={0.1} />
        <text x={16} y={yTms(0) - 2} fontSize={10} fill={BRASS} letterSpacing="0.02em">TMS course · 30 sessions</text>
        {boosterDays.length > 0 && (
          <g>
            <rect x={0} y={yDay(boosterDays[0]) - 8} width={W} height={(boosterDays.length) * STEP + 8} fill={BRASS} opacity={0.14} />
            <text x={16} y={yDay(boosterDays[0]) + 4} fontSize={10} fill={BRASS}>Booster sessions</text>
          </g>
        )}
        {/* braided strands + main path */}
        {[[6, 0], [4, 2], [8, 4]].map(([dx, ph], i) => <path key={i} d={line(dx, ph)} fill="none" stroke={FAINT} strokeOpacity={0.45} strokeWidth={1} />)}
        <path d={line(0, 0)} fill="none" stroke={PATH} strokeWidth={2} strokeLinejoin="round" />
        {roots.map((d, i) => <path key={i} d={d} fill="none" stroke={FAINT} strokeOpacity={0.35 + (i % 3) * 0.12} strokeWidth={1} />)}

        {/* TMS sessions */}
        {Array.from({ length: TMS_ROWS }).map((_, i) => <circle key={i} cx={xAt(i - TMS_ROWS - 2)} cy={yTms(i)} r={2.6} fill={BRASS} />)}

        {/* days */}
        {days.map((d) => (
          <g key={d.day} onClick={() => onDay(d.day)} className="cursor-pointer">
            <circle cx={xAt(d.day)} cy={yDay(d.day)} r={8} fill="transparent" />
            {d.checkin && <circle cx={xAt(d.day)} cy={yDay(d.day)} r={d.answers ? 3.6 : 2.6} fill={d.answers ? INK : PATH} />}
          </g>
        ))}

        {/* events */}
        <EventNode x={xAt(0)} y={yDay(0)} kind="home" label="Home" sub={fmtShort(0)} />
        {alertDay != null && <EventNode x={xAt(alertDay)} y={yDay(alertDay)} kind="call" label="Call from Liisa" sub={fmtShort(alertDay + 1)} />}
        {Object.keys(notes).map((k) => <EventNode key={k} x={xAt(+k)} y={yDay(+k)} kind="note" label="Note" sub={fmtShort(+k)} onClick={() => onDay(+k)} />)}

        {/* today */}
        <circle cx={xAt(today)} cy={yToday} r={9} fill="#f4f5f3" stroke={INK} strokeWidth={1.6} />
        <text x={xAt(today) - 16} y={yToday + 4} textAnchor="end" fontSize={12} fill={INK}>Today</text>
      </svg>
    </div>
  )
}

function EventNode({ x, y, kind, label, sub, onClick }: { x: number; y: number; kind: 'home' | 'call' | 'note'; label: string; sub: string; onClick?: () => void }) {
  const fill = kind === 'home' ? CALM : INK
  return (
    <g onClick={onClick} className={onClick ? 'cursor-pointer' : ''}>
      <circle cx={x} cy={y} r={11} fill={fill} />
      <g transform={`translate(${x - 6},${y - 6})`} stroke="#f4f5f3" strokeWidth={1.4} fill="none" strokeLinecap="round">
        {kind === 'home' && <path d="M3 11V1.5M3 2h6l-1.5 2.2L9 6.5H3" />}
        {kind === 'note' && <path d="M2 3h8M2 6h8M2 9h5" />}
        {kind === 'call' && <path d="M3 1.5l2 2.5-1.2 1.4a7 7 0 0 0 2.8 2.8L8 6.9l2.5 2-1 1.6C5.5 10.5 1.5 6.5 1.5 2.5z" />}
      </g>
      <line x1={x + 14} x2={x + 24} y1={y} y2={y} stroke={INK} strokeOpacity={0.3} />
      <text x={x + 28} y={y - 2} fontSize={9.5} fill={INK} fillOpacity={0.5} letterSpacing="0.02em">{sub}</text>
      <text x={x + 28} y={y + 10} fontSize={12} fill={INK}>{label}</text>
    </g>
  )
}

/* ------------------------------------------------------------------ actions */

const icon = (d: string) => <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
const ARC: { key: 'checkin' | 'note' | 'activity' | 'helps'; label: string; x: number; y: number; icon: React.ReactNode }[] = [
  { key: 'note', label: 'Note', x: -92, y: -40, icon: icon('M4 5h10M4 9h10M4 13h6') },
  { key: 'checkin', label: 'Check in', x: -42, y: -96, icon: icon('M3 5l1.5 1.5L7 4M3 12l1.5 1.5L7 11M10 5.5h5M10 12.5h5') },
  { key: 'activity', label: 'Activity', x: 30, y: -96, icon: icon('M9 2v4M9 12v4M2 9h4M12 9h4M4 4l2.5 2.5M11.5 11.5L14 14M14 4l-2.5 2.5M6.5 11.5L4 14') },
  { key: 'helps', label: 'What helps', x: 82, y: -40, icon: icon('M9 15s-6-3.5-6-8a3.2 3.2 0 0 1 6-1.6A3.2 3.2 0 0 1 15 7c0 4.5-6 8-6 8z') },
]

/* ------------------------------------------------------------------ sheets */

function Sheet({ title, sub, children, footer, tall = false }: { title: string; sub?: string; children: React.ReactNode; footer: React.ReactNode; tall?: boolean }) {
  return (
    <div className={`sheet-up absolute bottom-0 left-0 right-0 z-40 flex flex-col rounded-t-[28px] bg-fog ${tall ? 'h-[82%]' : 'max-h-[82%]'}`}>
      <div className="mx-auto mb-1 mt-3 h-1 w-9 rounded-full bg-ink/25" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3">
        <h3 className="text-[22px] leading-tight tracking-[-0.025em]">{title}</h3>
        {sub && <div className="mt-1 text-[12px] text-ink/55">{sub}</div>}
        <div className="mt-4">{children}</div>
      </div>
      <div className="flex items-center justify-between gap-2 px-5 pb-6 pt-2">{footer}</div>
    </div>
  )
}
const Pill = ({ children, onClick, primary = false, disabled = false }: { children: React.ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled}
    className={`rounded-full px-5 py-2.5 text-[14px] ${primary ? 'bg-ink text-foam disabled:bg-ink/25' : 'bg-foam text-ink'}`}>{children}</button>
)

function CheckInSheet({ st, items, onCancel, onFinish }: {
  st: LiveState; items: Record<string, Item>; onCancel: () => void; onFinish: (a: Record<string, number>, done: string[]) => void
}) {
  const qs = st.questions
  const tip = st.plan[0]
  const n = qs.length + (tip ? 1 : 0)
  const [i, setI] = useState(0)
  const [ans, setAns] = useState<Record<string, number>>({})
  const [didTip, setDidTip] = useState<boolean | null>(null)
  const [crisis, setCrisis] = useState(false)
  const it = i < qs.length ? items[qs[i]] : null
  const chosen = it ? ans[it.key] : didTip == null ? undefined : 1
  const next = () => {
    if (it && it.key === 'safety' && (ans.safety ?? 0) >= 1 && !crisis) { setCrisis(true); return }
    setCrisis(false)
    if (i + 1 < n) setI(i + 1)
    else onFinish(ans, didTip && tip ? [tip] : [])
  }
  return (
    <Sheet title="Today’s check-in" sub={it ? `Question ${i + 1} of ${qs.length}` : "One last thing"} tall
      footer={<><Pill onClick={i ? () => setI(i - 1) : onCancel}>{i ? 'Back' : 'Later'}</Pill><Pill primary disabled={chosen === undefined} onClick={next}>{i + 1 === n ? 'Done' : 'Next'}</Pill></>}>
      {crisis ? <CrisisBody /> : it ? (
        <div key={it.key} className="fade-in">
          <div className="text-[12px] text-ink/50">{it.domain}</div>
          <div className="mt-1 text-[17px] leading-snug">Which fits today best?</div>
          <div className="mt-3 space-y-2">
            {it.statements.map((s, v) => (
              <button key={v} onClick={() => setAns({ ...ans, [it.key]: v })}
                className={`block w-full rounded-2xl px-4 py-3 text-left text-[14px] leading-snug transition-colors ${ans[it.key] === v ? 'bg-ink text-foam' : 'bg-foam text-ink'}`}>{s}</button>
            ))}
          </div>
        </div>
      ) : (
        <div className="fade-in">
          <div className="text-[12px] text-ink/50">Today’s suggestion</div>
          <div className="mt-1 text-[17px] leading-snug">{tip && DOSE_LABEL[tip]}</div>
          <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-full bg-foam text-[14px]">
            {[true, false].map((v) => (
              <button key={String(v)} onClick={() => setDidTip(v)} className={`py-2.5 ${didTip === v ? 'bg-ink text-foam' : ''}`}>{v ? 'Did it' : 'Not today'}</button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function NoteSheet({ day, onCancel, onSave }: { day: number; onCancel: () => void; onSave: (t: string) => void }) {
  const [t, setT] = useState('')
  return (
    <Sheet title={`Note · ${fmtShort(day - 1)}`} footer={<><Pill onClick={onCancel}>Cancel</Pill><Pill primary disabled={!t.trim()} onClick={() => onSave(t.trim())}>Save</Pill></>}>
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={5} placeholder="Anything about today, for you or your care team"
        className="w-full resize-none rounded-2xl bg-foam p-4 text-[14px] outline-none placeholder:text-ink/40" />
    </Sheet>
  )
}

function ActivitySheet({ st, story, done, onCancel, onSave }: { st: LiveState; story: Story; done: string[]; onCancel: () => void; onSave: (d: string[]) => void }) {
  const [sel, setSel] = useState<string[]>(done)
  return (
    <Sheet title="What did you do today?" sub="Logged with tonight’s check-in" footer={<><Pill onClick={onCancel}>Cancel</Pill><Pill primary onClick={() => onSave(sel)}>Save</Pill></>}>
      <div className="space-y-2">
        {DOSE_KEYS.map((k) => {
          const on = sel.includes(k)
          const meta = story.interventions.find((v) => v.key === k)!
          return (
            <button key={k} onClick={() => setSel(on ? sel.filter((x) => x !== k) : [...sel, k])}
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left ${on ? 'bg-ink text-foam' : 'bg-foam'}`}>
              <span className="text-[14px]">{DOSE_LABEL[k]}{st.plan.includes(k) && <span className={`ml-2 text-[11px] ${on ? 'text-foam/60' : 'text-ink/45'}`}>suggested</span>}</span>
              <span className={`text-[12px] ${on ? 'text-foam/60' : 'text-ink/45'}`}>{meta.minutes} min</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

const WEEK = [{ k: 'sleep_regularity', label: 'Regular sleep' }, { k: 'rhythm_strength', label: 'Active days, quiet nights' }, { k: 'steps', label: 'Moving' }]

function UsualBars({ rel }: { rel: Record<string, number> }) {
  return (
    <div className="space-y-2.5">
      {WEEK.map((s) => {
        const r = rel[s.k] ?? 1
        return (
          <div key={s.k}>
            <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink/70">{s.label}</span><span className="text-ink/45">{r < 0.9 ? 'less than usual' : 'like usual'}</span></div>
            <div className="relative h-1.5 rounded-full bg-ink/10">
              <div className="absolute top-0 h-1.5 rounded-full bg-ink/70" style={{ width: `${Math.min(100, r * 80)}%` }} />
              <div className="absolute top-[-4px] h-[14px] w-px bg-ink/50" style={{ left: '80%' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function HelpsSheet({ st, outlook, setOutlook, onClose }: { st: LiveState; outlook: boolean; setOutlook: (v: boolean) => void; onClose: () => void }) {
  const rel = Object.fromEntries(WEEK.map((s) => [s.k, st.baseline[s.k] ? st.week[s.k] / st.baseline[s.k] : 1]))
  const top = DOSE_KEYS.map((k, i) => ({ k, m: st.learned.mean[i], sd: st.learned.sd[i] })).filter((r) => r.m > 0.6 && r.sd < 0.8).sort((a, b) => b.m - a.m).slice(0, 2).map((r) => r.k)
  return (
    <Sheet title="What has been helping you" sub="Learned from your own days since you came home" tall footer={<><span /><Pill onClick={onClose}>Close</Pill></>}>
      <div className="rounded-2xl bg-foam p-4">
        <div className="mb-3 text-[12px] text-ink/50">On days you do these, you tend to feel better</div>
        <LearnedBars mean={st.learned.mean} sd={st.learned.sd} dark={false} highlight={top} you />
      </div>
      <div className="mt-3 rounded-2xl bg-foam p-4">
        <div className="mb-3 text-[12px] text-ink/50">This week, against your usual</div>
        <UsualBars rel={rel} />
      </div>
      {outlook && (
        <div className="mt-3 rounded-2xl bg-foam p-4">
          <div className="mb-1 text-[12px] text-ink/50">Next two weeks</div>
          <MiniForecast trend={st.trend} fan={st.fan} risk={st.risk} height={100} gentle />
          <p className="text-[12px] leading-snug text-ink/55">{st.tier === 'steady' ? 'Looks steady.' : 'Less settled than usual. A forecast, not a diagnosis, and it often turns out fine.'}</p>
        </div>
      )}
      <label className="mt-3 flex items-center justify-between rounded-2xl bg-foam p-4 text-[14px]">
        <span>Show my two-week outlook<span className="block text-[12px] text-ink/50">Agree this with your clinician first</span></span>
        <Toggle on={outlook} onChange={setOutlook} />
      </label>
    </Sheet>
  )
}

function DaySheet({ st, items, day, note, onClose }: { st: LiveState; items: Record<string, Item>; day: number; note?: string; onClose: () => void }) {
  const d = st.path.find((p) => p.day === day)
  if (!d) return null
  return (
    <Sheet title={fmtLong(day)} sub={`Day ${day} at home${d.booster ? ' · booster session' : ''}`} footer={<><span /><Pill onClick={onClose}>Close</Pill></>}>
      <div className="rounded-2xl bg-foam p-4">
        <div className="mb-2 text-[12px] text-ink/50">Check-in</div>
        {d.answers ? (
          <ul className="space-y-1.5 text-[14px]">{Object.entries(d.answers).map(([k, v]) => <li key={k}><span className="text-ink/50">{items[k]?.domain}: </span>{items[k]?.statements[v]}</li>)}</ul>
        ) : <div className="text-[14px] text-ink/70">{d.checkin ? 'Answered' : 'Skipped, that’s fine'}</div>}
      </div>
      <div className="mt-3 rounded-2xl bg-foam p-4">
        <div className="mb-2 text-[12px] text-ink/50">Did</div>
        <div className="text-[14px]">{d.done.length ? d.done.map((k) => DOSE_LABEL[k]).join(', ') : 'Nothing logged'}</div>
      </div>
      <div className="mt-3 rounded-2xl bg-foam p-4">
        <div className="mb-3 text-[12px] text-ink/50">Ring, against your usual</div>
        <UsualBars rel={d.rel} />
      </div>
      {note && <div className="mt-3 rounded-2xl bg-foam p-4"><div className="mb-2 text-[12px] text-ink/50">Note</div><div className="text-[14px]">{note}</div></div>}
    </Sheet>
  )
}

function SettingsSheet({ outlook, setOutlook, onClose }: { outlook: boolean; setOutlook: (v: boolean) => void; onClose: () => void }) {
  const Row = ({ t, s, r }: { t: string; s?: string; r: React.ReactNode }) => (
    <div className="flex items-center justify-between rounded-2xl bg-foam px-4 py-3"><div><div className="text-[14px]">{t}</div>{s && <div className="text-[12px] text-ink/50">{s}</div>}</div><div className="text-[13px]">{r}</div></div>
  )
  return (
    <Sheet title="Settings" tall footer={<><span /><Pill onClick={onClose}>Close</Pill></>}>
      <div className="mb-2 text-[12px] text-ink/50">Connections</div>
      <div className="space-y-2">
        <Row t="Ring" s="Sleep, activity, heart rate variability" r={<span className="text-[#2e8c73]">Connected</span>} />
        <Row t="Daily questions" s="Notification at 19:00" r="Change" />
      </div>
      <div className="mb-2 mt-5 text-[12px] text-ink/50">Care team</div>
      <div className="space-y-2">
        <Row t="Espoo TMS clinic" s="Nurse: Liisa · weekdays 8–16" r="Call" />
        <Row t="What they see" s="Your answers, ring summary and a relapse forecast. You see your own week and what helps." r="" />
      </div>
      <div className="mb-2 mt-5 text-[12px] text-ink/50">Display</div>
      <div className="flex items-center justify-between rounded-2xl bg-foam px-4 py-3 text-[14px]">Two-week outlook<Toggle on={outlook} onChange={setOutlook} /></div>
    </Sheet>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-ink' : 'bg-ink/15'}`}>
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-foam transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  )
}

function CrisisBody() {
  return (
    <div className="fade-in rounded-2xl bg-ink p-4 text-foam">
      <div className="text-[15px]">Thank you for telling us. You don’t have to handle this alone.</div>
      <div className="mt-2 text-[13px] text-foam/75">Your care team will call you today. If you need someone right now: MIELI crisis line 09 2525 0111, or 112 in an emergency.</div>
    </div>
  )
}
function SafetyCard() {
  return <a href="tel:0925250111" className="absolute bottom-28 left-4 right-4 z-20 block"><CrisisBody /></a>
}

function StatusBar() {
  return (
    <div className="absolute left-0 right-0 top-0 z-20 flex h-8 items-center justify-between bg-foam px-6 text-[12px]">
      <span>19:02</span>
      <span className="flex items-center gap-1.5">
        <svg width="14" height="10" viewBox="0 0 14 10"><path d="M1 9h2V7H1zm3.5 0h2V5h-2zM8 9h2V3H8zm3.5 0h2V1h-2z" fill={INK} /></svg>
        <svg width="18" height="10" viewBox="0 0 18 10"><rect x=".5" y=".5" width="15" height="9" rx="2" fill="none" stroke={INK} /><rect x="2" y="2" width="10" height="6" rx="1" fill={INK} /><rect x="16" y="3.5" width="1.5" height="3" fill={INK} /></svg>
      </span>
    </div>
  )
}

function Gear() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.6"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
}
