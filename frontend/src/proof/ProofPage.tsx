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
      <h1 className="font-serif text-[34px] leading-tight">How we know it works, and where it might not.</h1>
      <p className="mt-2 max-w-[48rem] text-[15px] leading-relaxed text-ink/60">
        Aino is one virtual patient. Below, the same code runs on {ev.n_patients} others, each living the same {ev.days} days
        four ways, and on a public dataset of real wearable data.
      </p>

      <RollAPatient outcomes={e.outcomes} n={ev.n_patients} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="The simulated patients relapse at the rate TMS clinics report."
          note={`With no home support, the virtual cohort is fit to the rTMS durability meta-analysis (${e.calibration.source.split(' (')[0]}). Dots are the published figures. The model matches at 3 and 6 months and is slightly too pessimistic at 12; the demo only uses the first 6.`}>
          <Chart xMax={365} yMin={0.2} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 91, 182, 273, 365]} xFmt={(d) => (d === 0 ? 'discharge' : `${Math.round(d / 30.4)} mo`)}
            series={[{ xs: e.calibration.days, ys: e.calibration.model, color: INK, width: 2.2, label: 'Virtual patients, no support' }]}
            dots={e.calibration.published.slice(1).map((d) => ({ x: d.day, y: d.value, color: STORM, label: `${Math.round(d.value * 100)}%` }))}
            yLabel="still well" />
        </Card>

        <Card title={`Same ${ev.n_patients} lives, four ways of caring.`}
          note="Each virtual patient meets the same stress on the same days in every version. Most of Keel’s gain comes from timing booster TMS, not from the habits plan alone.">
          <Chart xMax={180} yMin={0.4} yMax={1} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={(d) => `day ${d}`}
            series={[
              { xs: e.days, ys: e.survival.none, color: STORM, width: 2, label: `Usual care · ${Math.round(p.none.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.fixed, color: SQUALL, width: 1.6, label: `Same plan for all · ${Math.round(p.fixed.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.keel_plan, color: BODY, width: 1.6, dash: '5 4', label: `Keel plan, no booster · ${Math.round(p.keel_plan.relapse_free_180 * 100)}%` },
              { xs: e.days, ys: e.survival.keel, color: CALM, width: 2.6, label: `Keel · ${Math.round(p.keel.relapse_free_180 * 100)}%` },
            ]} yLabel="still well" legend />
        </Card>

        <Card title={`The warning comes about ${ev.forecast.median_warning_days_keel} days ahead, a week earlier than asking alone.`}
          note={`Days between the first warning and the relapse, for the untreated patients who relapsed, at the same 10 % false-alarm rate. Ring + check-ins vs check-ins alone (AUC ${ev.forecast.auc_14d_keel.toFixed(2)} vs ${ev.forecast.auc_14d_checkin_only.toFixed(2)}).`}>
          <LeadHistogram keel={e.lead_days.keel} checkin={e.lead_days.checkin_only} />
        </Card>

        <Card title="It learns what helps each person."
          note="How often Keel’s two favourite doses for a person are among that person’s real top three. At day 0 everyone gets the population guess.">
          <Chart xMax={180} yMin={0.5} yMax={0.9} yFmt={(v) => `${Math.round(v * 100)}%`} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={(d) => `day ${d}`}
            series={[{ xs: e.learning_curve.days, ys: e.learning_curve.top2_in_top3, color: CALM, width: 2.4, label: 'Keel, learning from each person' }]}
            hline={{ y: e.learning_curve.top2_in_top3[0], label: 'one plan fits all', color: INK }}
            dots={[{ x: 180, y: e.learning_curve.top2_in_top3[e.learning_curve.top2_in_top3.length - 1], color: CALM, label: `${Math.round(e.learning_curve.top2_in_top3[e.learning_curve.top2_in_top3.length - 1] * 100)}%` }]}
            yLabel="picks right" />
        </Card>
      </div>

      {ev.real_data && <RealData rd={ev.real_data} simAuc={ev.forecast.auc_14d_keel} />}
    </div>
  )
}

function Card({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="font-serif text-[21px] leading-snug">{title}</h2>
      <div className="mt-3">{children}</div>
      <p className="mt-2 text-[12px] leading-snug text-ink/55">{note}</p>
    </section>
  )
}

type Series = { xs: number[]; ys: number[]; color: string; width?: number; dash?: string; label: string }
function Chart({ series, dots = [], hline, xMax, yMin, yMax, yFmt, xTicks, xFmt, yLabel, legend = false, height = 230 }: {
  series: Series[]; dots?: { x: number; y: number; color: string; label?: string }[]; hline?: { y: number; label: string; color: string }
  xMax: number; yMin: number; yMax: number; yFmt: (v: number) => string; xTicks: number[]; xFmt: (v: number) => string; yLabel?: string; legend?: boolean; height?: number
}) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10), H = height
  const m = { l: 40, r: 26, t: 10, b: 24 }
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
          {yLabel && <text x={m.l + 4} y={m.t + 10} fontSize={10} fill={INK} fillOpacity={0.45}>{yLabel}</text>}
          {hline && (
            <g>
              <line x1={m.l} x2={W - m.r} y1={y(hline.y)} y2={y(hline.y)} stroke={hline.color} strokeOpacity={0.5} strokeDasharray="4 4" />
              <text x={W - m.r - 4} y={y(hline.y) + 14} textAnchor="end" fontSize={11} fill={hline.color} fillOpacity={0.7}>{hline.label}</text>
            </g>
          )}
          {series.map((s) => (
            <path key={s.label} d={pathOf(s.xs.map((d, i) => [x(d), y(Math.max(yMin, s.ys[i]))]))} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeDasharray={s.dash} strokeLinejoin="round" />
          ))}
          {dots.map((d, i) => (
            <g key={i}>
              <circle cx={x(d.x)} cy={y(d.y)} r={5} fill={d.color} stroke="white" strokeWidth={2} />
              {d.label && <text x={x(d.x) - 8} y={y(d.y) - 9} textAnchor="end" fontSize={11} fontWeight={600} fill={d.color}>{d.label}</text>}
            </g>
          ))}
        </svg>
      )}
      {legend && (
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/70">
          {series.map((s) => <span key={s.label} className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>)}
        </div>
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
          {[0, 12, 24, 36, 48, 60].map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK} fillOpacity={0.5}>{v === 60 ? '60+ days' : v}</text>)}
          {[{ v: med(checkin), c: INK, t: 'check-ins alone' }, { v: med(keel), c: CALM, t: 'Keel' }].map((q, i) => (
            <g key={q.t}>
              <line x1={x(q.v)} x2={x(q.v)} y1={m.t} y2={H - m.b} stroke={q.c} strokeDasharray="3 3" strokeOpacity={0.8} />
              <text x={x(q.v) + (i ? 4 : -4)} y={m.t + 10} textAnchor={i ? 'start' : 'end'} fontSize={11} fill={q.c}>{q.t}: median {q.v} d</text>
            </g>
          ))}
        </svg>
      )}
      <div className="mt-1 flex gap-4 text-[11px] text-ink/70">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5" style={{ background: CALM }} />Ring + check-ins (Keel)</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 opacity-40" style={{ background: INK }} />Check-ins alone</span>
      </div>
    </div>
  )
}

function RealData({ rd, simAuc }: { rd: NonNullable<Evidence['real_data']>; simAuc: number }) {
  const rows = [
    { label: 'Chance', v: 0.5, c: '#b8c3cc' },
    { label: 'Fitbit sleep and steps only', v: rd.auc['wearable only'], c: BODY },
    { label: 'Mood questionnaire today only', v: rd.auc['PHQ-9 now only'], c: '#e6ecef' },
    { label: 'Both', v: rd.auc['wearable + PHQ-9 now'], c: CALM },
  ]
  return (
    <section className="mt-5 grid grid-cols-1 gap-6 rounded-xl bg-ink p-6 text-fog lg:grid-cols-[1fr_1.1fr]">
      <div>
        <h2 className="font-serif text-[24px] leading-snug">Checked against real people, the ring alone is weak.</h2>
        <p className="mt-3 text-[14px] leading-relaxed text-fog/75">
          PSYCHE-D: {rd.n_samples.toLocaleString('en')} three-month stretches from {rd.n_participants.toLocaleString('en')} people with consumer
          wearables who were not depressed at the start. Who is depressed three months later? Two weeks of sleep and step data
          barely beat a coin flip. The simulator’s {simAuc.toFixed(2)} is an upper bound.
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-fog/75">
          That is why Keel compares each person with their own normal instead of with the population, looks two weeks ahead
          instead of three months, always pairs the ring with a one-minute check-in, and lets the clinician decide.
        </p>
      </div>
      <div className="self-center">
        <div className="mb-2 text-[12px] text-fog/60">How well each input tells who gets worse (AUC; 0.5 = coin flip, 1 = perfect)</div>
        {rows.map((r) => (
          <div key={r.label} className="mb-2.5">
            <div className="mb-1 flex justify-between text-[13px]"><span className="text-fog/85">{r.label}</span><span className="font-semibold tabular-nums">{r.v.toFixed(2)}</span></div>
            <div className="relative h-3 rounded-full bg-fog/10">
              <div className="h-full rounded-full" style={{ width: `${((r.v - 0.4) / 0.6) * 100}%`, background: r.c }} />
              <div className="absolute top-[-3px] h-[18px] w-px bg-fog/50" style={{ left: `${((0.5 - 0.4) / 0.6) * 100}%` }} />
            </div>
          </div>
        ))}
        <div className="text-[11px] text-fog/50">Grouped 5-fold cross-validation by person. Makhmutova et al. 2021, Zenodo 5085146.</div>
      </div>
    </section>
  )
}

function RollAPatient({ outcomes, n }: { outcomes: Evidence['evidence']['outcomes']; n: number }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000))
  const [pair, setPair] = useState<Pair | null>(null)
  const [busy, setBusy] = useState(false)
  const [tally, setTally] = useState<Record<string, number>>({})
  const roll = async (s: number) => {
    setBusy(true)
    const r: Pair = await fetch(`/api/simulate?seed=${s}`).then((x) => x.json())
    setPair(r); setBusy(false)
    setTally((t) => ({ ...t, [r.outcome]: (t[r.outcome] ?? 0) + 1 }))
  }
  useEffect(() => { roll(seed) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const met = Object.values(tally).reduce((a, b) => a + b, 0)
  return (
    <section className="mt-6 grid grid-cols-1 gap-5 rounded-xl bg-white p-5 lg:grid-cols-[1fr_300px]">
      <div>
        <h2 className="font-serif text-[21px] leading-snug">Aino was picked to tell the story. Meet someone picked at random.</h2>
        <div className="mt-3">{pair ? <PairChart pair={pair} /> : <div className="h-[230px]" />}</div>
        <OutcomeBar outcomes={outcomes} n={n} />
      </div>
      <div className="flex flex-col">
        <button disabled={busy} onClick={() => { const s = seed + 1; setSeed(s); roll(s) }}
          className="rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-fog disabled:opacity-60">{busy ? 'Living 180 days twice…' : 'Meet another patient'}</button>
        {pair && <p className="mt-4 text-[14px] leading-relaxed text-ink/80">{verdict(pair)}</p>}
        {met > 1 && (
          <div className="mt-auto pt-4 text-[12px] text-ink/60">
            You have met {met}. Kept well by Keel: {tally.kept_well ?? 0}. Relapse much shorter: {tally.shorter ?? 0}. Well either way: {tally.well_anyway ?? 0}. Relapsed either way: {(tally.relapsed_both ?? 0) + (tally.keel_worse ?? 0)}.
          </div>
        )}
      </div>
    </section>
  )
}

const OUT = [
  { k: 'kept_well', label: 'relapse prevented', c: CALM },
  { k: 'shorter', label: 'relapse much shorter', c: '#7fbfae' },
  { k: 'well_anyway', label: 'well either way', c: '#c9d3da' },
  { k: 'relapsed_both', label: 'relapsed either way', c: STORM },
] as const

function OutcomeBar({ outcomes, n }: { outcomes: Evidence['evidence']['outcomes']; n: number }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 text-[12px] text-ink/60">All {n} virtual patients in the evaluation</div>
      <div className="flex h-5 overflow-hidden rounded-full">
        {OUT.map((o) => outcomes[o.k] > 0 && <div key={o.k} style={{ width: `${(outcomes[o.k] / n) * 100}%`, background: o.c }} title={`${o.label}: ${outcomes[o.k]}`} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink/70">
        {OUT.map((o) => <span key={o.k} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: o.c }} />{o.label} · {outcomes[o.k]}</span>)}
      </div>
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
  const m = { l: 32, r: 26, t: 10, b: 24 }
  const x = lin(0, 179, m.l, W - m.r)
  const y = lin(0, 24, H - m.b, m.t)
  return (
    <div ref={ref}>
      {width > 60 && (
        <svg width={W} height={H} className="block">
          <rect x={m.l} y={m.t} width={W - m.l - m.r} height={y(15) - m.t} fill={STORM} opacity={0.06} />
          <line x1={m.l} x2={W - m.r} y1={y(15)} y2={y(15)} stroke={STORM} strokeDasharray="4 4" strokeOpacity={0.6} />
          <text x={W - m.r - 4} y={y(15) - 5} textAnchor="end" fontSize={11} fill={STORM}>relapse line</text>
          {[0, 5, 10, 15, 20].map((v) => <text key={v} x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill={INK} fillOpacity={0.5}>{v}</text>)}
          {[0, 30, 60, 90, 120, 150, 179].map((v) => <text key={v} x={x(v)} y={H - 6} textAnchor="middle" fontSize={10} fill={INK} fillOpacity={0.5}>{v === 0 ? 'home' : `day ${v === 179 ? 180 : v}`}</text>)}
          {pair.keel.boosters.map((b) => <rect key={b} x={x(b)} y={m.t} width={Math.max(3, x(b + 5) - x(b))} height={H - m.b - m.t} fill="#d9b878" opacity={0.35} />)}
          <path d={pathOf(pair.none.phq7.map((v, i) => [x(i), y(Math.min(24, v))]))} fill="none" stroke={STORM} strokeWidth={2} strokeOpacity={0.8} />
          <path d={pathOf(pair.keel.phq7.map((v, i) => [x(i), y(Math.min(24, v))]))} fill="none" stroke={INK} strokeWidth={2.6} />
          {pair.keel.alerts.map((a) => <circle key={a} cx={x(a)} cy={y(Math.min(24, pair.keel.phq7[a]))} r={6} fill="none" stroke={STORM} strokeWidth={2} />)}
        </svg>
      )}
      <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-ink/70">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: INK }} />With Keel</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: STORM }} />Same life without Keel</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: STORM }} />Clinic warned</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-3" style={{ background: '#d9b878', opacity: 0.6 }} />Booster TMS</span>
      </div>
    </div>
  )
}
