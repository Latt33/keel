import { useEffect, useState } from 'react'
import type { Cohort } from '../api'
import { lin, pathOf, useSize } from '../lib'

interface Evidence extends Cohort {
  evidence: {
    days: number[]
    survival: Record<'none' | 'fixed' | 'keel_plan' | 'keel', number[]>
    roc: { keel: [number, number][]; checkin_only: [number, number][] }
    lead_days: { keel: number[]; checkin_only: number[] }
    learning_curve: { days: number[]; abs_error: number[]; top2_in_top3: number[] }
    calibration: { days: number[]; model: number[]; published: { day: number; value: number }[]; source: string }
    outcomes: Record<'kept_well' | 'shorter' | 'well_anyway' | 'relapsed_both', number>
  }
  real_data: { auc: Record<string, number>; n_samples: number; n_participants: number } | null
}
interface Pair {
  seed: number; outcome: 'kept_well' | 'well_anyway' | 'shorter' | 'relapsed_both' | 'keel_worse'
  none: { phq7: number[]; relapse: number | null; alerts: number[]; boosters: number[]; days_relapsed: number }
  keel: { phq7: number[]; relapse: number | null; alerts: number[]; boosters: number[]; days_relapsed: number }
}

const INK = '#142231', STORM = '#d1493c', CALM = '#2e8c73', SQUALL = '#c98a1b', BODY = '#3b7fc4'

export default function ProofPage() {
  const [ev, setEv] = useState<Evidence | null>(null)
  useEffect(() => { fetch('/api/evidence').then((r) => r.json()).then(setEv) }, [])
  if (!ev) return <div className="p-8 text-ink/60">Loading the evaluation…</div>
  const e = ev.evidence
  const p = ev.policies
  return (
    <div className="mx-auto max-w-[1180px] px-6 py-8">
      <h1 className="font-serif text-[clamp(2.4rem,5vw,4.4rem)] leading-[1.02]">How we know it works.</h1>

      <RollAPatient outcomes={e.outcomes} n={ev.n_patients} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Virtual patients relapse at the rate clinics report.">
          <Chart xMax={365} yMin={0.2} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 91, 182, 273, 365]} xFmt={(d) => (d === 0 ? 'discharge' : `${Math.round(d / 30.4)} mo`)}
            series={[{ xs: e.calibration.days, ys: e.calibration.model, color: INK, width: 2.2, label: 'Virtual patients, no support' }]}
            dots={e.calibration.published.slice(1).map((d) => ({ x: d.day, y: d.value, color: STORM, label: `${Math.round(d.value * 100)}%` }))}
            endLabels />
        </Card>

        <Card title={`Same ${ev.n_patients} lives, four ways of caring.`}>
          <Chart xMax={180} yMin={0.4} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={(d) => `day ${d}`}
            series={[
              { xs: e.days, ys: e.survival.none, color: STORM, width: 2, label: `Usual care ${Math.round(p.none.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.fixed, color: SQUALL, width: 1.6, label: `Same plan ${Math.round(p.fixed.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.keel_plan, color: BODY, width: 1.6, dash: '5 4', label: `No booster ${Math.round(p.keel_plan.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.keel, color: CALM, width: 2.6, label: `Keel ${Math.round(p.keel.relapse_free_180 * 100)}%` },
            ]} endLabels />
        </Card>

        <Card title={`Warnings come ${ev.forecast.median_warning_days_keel} days ahead, a week earlier than asking alone.`}>
          <LeadHistogram keel={e.lead_days.keel} checkin={e.lead_days.checkin_only} />
        </Card>

        <Card title="It learns what helps each person.">
          <Chart xMax={180} yMin={0.5} yMax={0.9} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={(d) => `day ${d}`}
            series={[{ xs: e.learning_curve.days, ys: e.learning_curve.top2_in_top3, color: CALM, width: 2.4, label: 'Keel' }]}
            hline={{ y: e.learning_curve.top2_in_top3[0], label: 'one plan fits all', color: INK }}
            dots={[{ x: 180, y: e.learning_curve.top2_in_top3[e.learning_curve.top2_in_top3.length - 1], color: CALM, label: `${Math.round(e.learning_curve.top2_in_top3[e.learning_curve.top2_in_top3.length - 1] * 100)}%` }]}
            />
        </Card>
      </div>

      {ev.real_data && <RealData rd={ev.real_data} />}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ink/15 pt-5">
      <h2 className="font-serif text-[28px] leading-[1.1]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Nudge label positions apart so none overlap. */
function spread(ys: number[], gap: number) {
  const idx = ys.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = [...ys]
  let last = -Infinity
  for (const [v, i] of idx) { const nv = Math.max(v, last + gap); out[i] = nv; last = nv }
  return out
}

type Series = { xs: number[]; ys: number[]; color: string; width?: number; dash?: string; label: string }
function Chart({ series, dots = [], hline, xMax, yMin, yMax, yFmt, xTicks, xFmt, endLabels = false, height = 230 }: {
  series: Series[]; dots?: { x: number; y: number; color: string; label?: string }[]; hline?: { y: number; label: string; color: string }
  xMax: number; yMin: number; yMax: number; yFmt: (v: number) => string; xTicks: number[]; xFmt: (v: number) => string; endLabels?: boolean; height?: number
}) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10), H = height
  const m = { l: 40, r: endLabels && series.length > 1 ? 104 : 26, t: 10, b: 24 }
  const x = lin(0, xMax, m.l, W - m.r)
  const y = lin(yMin, yMax, H - m.b, m.t)
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4)
  return (
    <div ref={ref}>
      {width > 60 && (
        <svg width={W} height={H} className="block">
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={INK} strokeOpacity={0.07} />
              <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={INK} fillOpacity={0.5}>{yFmt(v)}</text>
            </g>
          ))}
          {xTicks.map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK} fillOpacity={0.5}>{xFmt(v)}</text>)}
          {hline && (
            <g>
              <line x1={m.l} x2={W - m.r} y1={y(hline.y)} y2={y(hline.y)} stroke={hline.color} strokeOpacity={0.5} strokeDasharray="4 4" />
              <text x={W - m.r - 4} y={y(hline.y) + 14} textAnchor="end" fontSize={11} fill={hline.color} fillOpacity={0.7}>{hline.label}</text>
            </g>
          )}
          {series.map((s) => (
            <path key={s.label} d={pathOf(s.xs.map((d, i) => [x(d), y(Math.max(yMin, s.ys[i]))]))} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />
          ))}
          {endLabels && series.length > 1 && spread(series.map((s) => y(Math.max(yMin, s.ys[s.ys.length - 1]))), 13).map((yy, i) => (
            <text key={i} x={W - m.r + 6} y={yy + 4} fontSize={11} fontWeight={series[i].width && series[i].width! > 2.2 ? 600 : 400} fill={series[i].color}>{series[i].label}</text>
          ))}
          {dots.map((d, i) => (
            <g key={i}>
              <circle cx={x(d.x)} cy={y(d.y)} r={5} fill={d.color} stroke="white" strokeWidth={2} />
              {d.label && <text x={x(d.x) + (x(d.x) > W - m.r - 30 ? -8 : 8)} y={y(d.y) - 9} textAnchor={x(d.x) > W - m.r - 30 ? 'end' : 'start'} fontSize={11} fontWeight={600} fill={d.color}>{d.label}</text>}
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

function LeadHistogram({ keel, checkin }: { keel: number[]; checkin: number[] }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10), H = 230
  const m = { l: 40, r: 16, t: 14, b: 24 }
  const bins = Array.from({ length: 10 }, (_, i) => i * 6)      // 0..54+ days
  const count = (arr: number[]) => bins.map((b, i) => arr.filter((v) => v >= b && (i === bins.length - 1 || v < bins[i + 1])).length / Math.max(1, arr.length))
  const ck = count(keel), cm = count(checkin)
  const maxY = Math.max(...ck, ...cm) * 1.15
  const x = lin(0, 60, m.l, W - m.r)
  const y = lin(0, maxY, H - m.b, m.t)
  const bw = (x(6) - x(0)) / 2 - 2
  const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)]
  return (
    <div ref={ref}>
      {width > 60 && (
        <svg width={W} height={H} className="block">
          {bins.map((b, i) => (
            <g key={b}>
              <rect x={x(b) + 1} y={y(cm[i])} width={bw} height={y(0) - y(cm[i])} fill={INK} opacity={0.25} />
              <rect x={x(b) + 1 + bw + 1} y={y(ck[i])} width={bw} height={y(0) - y(ck[i])} fill={CALM} />
            </g>
          ))}
          {[0, 12, 24, 36, 48, 60].map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK} fillOpacity={0.5}>{v === 60 ? '60+' : v === 0 ? '0 days' : v}</text>)}
          {[{ v: med(checkin), c: INK, t: 'check-ins alone' }, { v: med(keel), c: CALM, t: 'Keel' }].map((q, i) => (
            <g key={q.t}>
              <line x1={x(q.v)} x2={x(q.v)} y1={m.t} y2={H - m.b} stroke={q.c} strokeDasharray="3 3" strokeOpacity={0.8} />
              <text x={x(q.v) + (i ? 4 : -4)} y={m.t + 10} textAnchor={i ? 'start' : 'end'} fontSize={11} fill={q.c}>{q.t} {q.v} days</text>
            </g>
          ))}
        </svg>
      )}
    </div>
  )
}

function RealData({ rd }: { rd: NonNullable<Evidence['real_data']> }) {
  const rows = [
    { label: 'Wearable only', v: rd.auc['wearable only'], c: BODY },
    { label: 'Questionnaire only', v: rd.auc['PHQ-9 now only'], c: '#e6ecef' },
    { label: 'Both', v: rd.auc['wearable + PHQ-9 now'], c: CALM },
  ]
  return (
    <section className="mt-10 grid grid-cols-1 gap-8 bg-ink p-10 text-fog lg:grid-cols-[1fr_1.1fr]">
      <div>
        <h2 className="font-serif text-[34px] leading-[1.08]">Checked against real people, the ring alone is weak.</h2>
        <p className="mt-4 text-[15px] leading-relaxed text-fog/75">
          In {rd.n_participants.toLocaleString('en')} people with consumer wearables, sleep and steps barely beat a coin flip at
          spotting who becomes depressed. So Keel compares each person with their own normal, looks two weeks ahead, and always
          pairs the ring with a check-in.
        </p>
      </div>
      <div className="self-center">
        {rows.map((r) => (
          <div key={r.label} className="mb-2.5">
            <div className="mb-1 flex justify-between text-[13px]"><span className="text-fog/85">{r.label}</span><span className="font-medium tabular-nums">{r.v.toFixed(2)}</span></div>
            <div className="relative h-3 rounded-full bg-fog/10">
              <div className="h-full rounded-full" style={{ width: `${((r.v - 0.4) / 0.6) * 100}%`, background: r.c }} />
              <div className="absolute top-[-3px] h-[18px] w-px bg-fog/50" style={{ left: `${((0.5 - 0.4) / 0.6) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function RollAPatient({ outcomes, n }: { outcomes: Evidence['evidence']['outcomes']; n: number }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const [pair, setPair] = useState<Pair | null>(null)
  const [busy, setBusy] = useState(false)
  const roll = async (s: number) => {
    setBusy(true)
    const r: Pair = await fetch(`/api/simulate?seed=${s}`).then((x) => x.json())
    setPair(r); setBusy(false)
  }
  useEffect(() => { roll(seed) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="mt-6 grid grid-cols-1 gap-5 border-t border-ink/15 pt-5 lg:grid-cols-[1fr_300px]">
      <div>
        <h2 className="font-serif text-[28px] leading-[1.1]">Meet a patient picked at random.</h2>
        <div className="mt-3">{pair ? <PairChart pair={pair} /> : <div className="h-[230px]" />}</div>
        <OutcomeBar outcomes={outcomes} n={n} />
      </div>
      <div className="flex flex-col">
        <button disabled={busy} onClick={() => { const s = seed + 1; setSeed(s); roll(s) }}
          className="rounded-full bg-ink px-6 py-3 text-[16px] tracking-[-0.03em] text-fog disabled:opacity-60">{busy ? 'Living 180 days twice…' : 'Meet another patient'}</button>
        {pair && <p className="mt-4 text-[14px] leading-relaxed text-ink/80">{verdict(pair)}</p>}
      </div>
    </section>
  )
}

const OUT = [
  { k: 'kept_well', label: 'kept well', c: CALM, t: 'text-white' },
  { k: 'shorter', label: 'shorter', c: '#7fbfae', t: 'text-ink' },
  { k: 'well_anyway', label: 'well either way', c: '#c9d3da', t: 'text-ink/70' },
  { k: 'relapsed_both', label: 'relapsed', c: STORM, t: 'text-white' },
] as const

function OutcomeBar({ outcomes, n }: { outcomes: Evidence['evidence']['outcomes']; n: number }) {
  return (
    <div className="mt-5 flex h-8 overflow-hidden rounded-full text-[12px]" title={`All ${n} virtual patients`}>
      {OUT.map((o) => outcomes[o.k] > 0 && (
        <div key={o.k} className={`flex min-w-0 items-center overflow-hidden whitespace-nowrap px-3 ${o.t}`} style={{ width: `${(outcomes[o.k] / n) * 100}%`, background: o.c }} title={`${o.label}: ${outcomes[o.k]}`}>
          {outcomes[o.k] / n > 0.08 && <span className="truncate">{outcomes[o.k]} {o.label}</span>}
        </div>
      ))}
    </div>
  )
}

function verdict(p: Pair) {
  const n = p.none, k = p.keel
  const warn = k.alerts.length ? ` Keel warned the clinic on day ${k.alerts[0]}${k.boosters.length ? ` and a booster followed on day ${k.boosters[0]}` : ''}.` : ''
  switch (p.outcome) {
    case 'kept_well': return `Without Keel this person relapses on day ${n.relapse}.${warn} With Keel they stay below the line for all 180 days.`
    case 'well_anyway': return `This person stays well either way.${k.alerts.length ? ` Keel still raised ${k.alerts.length === 1 ? 'one false alarm' : `${k.alerts.length} alarms`}, which cost a booster block they may not have needed.` : ' Keel never bothers the clinic about them.'}`
    case 'shorter': return `Both versions cross the line, but with Keel this person spends ${k.days_relapsed} days there instead of ${n.days_relapsed}.${warn}`
    default: return `This person relapses either way (${n.days_relapsed} vs ${k.days_relapsed} days above the line). Not everyone can be caught.`
  }
}

function PairChart({ pair }: { pair: Pair }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10), H = 230
  const m = { l: 32, r: 92, t: 10, b: 24 }
  const x = lin(0, 179, m.l, W - m.r)
  const y = lin(0, 24, H - m.b, m.t)
  const [yk, yn] = spread([y(Math.min(24, pair.keel.phq7[179])), y(Math.min(24, pair.none.phq7[179]))], 14)
  return (
    <div ref={ref}>
      {width > 60 && (
        <svg width={W} height={H} className="block">
          <rect x={m.l} y={m.t} width={W - m.l - m.r} height={y(15) - m.t} fill={STORM} opacity={0.06} />
          <line x1={m.l} x2={W - m.r} y1={y(15)} y2={y(15)} stroke={STORM} strokeDasharray="4 4" strokeOpacity={0.6} />
          {[0, 5, 10, 15, 20].map((v) => <text key={v} x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={INK} fillOpacity={0.5}>{v}</text>)}
          {[0, 30, 60, 90, 120, 150, 179].map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK} fillOpacity={0.5}>{v === 0 ? 'home' : `day ${v === 179 ? 180 : v}`}</text>)}
          {pair.keel.boosters.map((b) => <rect key={b} x={x(b)} y={m.t} width={Math.max(3, x(b + 5) - x(b))} height={H - m.b - m.t} fill="#d9b878" opacity={0.35} />)}
          <path d={pathOf(pair.none.phq7.map((v, i) => [x(i), y(Math.min(24, v))]))} fill="none" stroke={STORM} strokeWidth={2} strokeOpacity={0.8} />
          <path d={pathOf(pair.keel.phq7.map((v, i) => [x(i), y(Math.min(24, v))]))} fill="none" stroke={INK} strokeWidth={2.6} />
          {pair.keel.alerts.map((a) => <circle key={a} cx={x(a)} cy={y(Math.min(24, pair.keel.phq7[a]))} r={6} fill="none" stroke={STORM} strokeWidth={2} />)}
          <text x={W - m.r + 6} y={yk + 4} fontSize={11} fontWeight={600} fill={INK}>with Keel</text>
          <text x={W - m.r + 6} y={yn + 4} fontSize={11} fill={STORM}>without</text>
        </svg>
      )}
    </div>
  )
}
