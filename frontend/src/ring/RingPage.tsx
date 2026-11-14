import { useEffect, useState } from 'react'
import { lin, pathOf, riskColor, useSize } from '../lib'

export interface OuraReplay {
  baseline: Record<string, number>
  baseline_days: string[]
  days: { day: string; body: number; risk: number; contrib: Record<string, number>; passive: Record<string, number>; observed: string[] }[]
}

const LABEL: Record<string, string> = {
  sleep_regularity: 'Sleep regularity', rhythm_strength: 'Day/night rhythm', sleep_efficiency: 'Sleep efficiency',
  night_wake_min: 'Awake at night', steps: 'Steps', hrv_ms: 'Heart rate variability',
}

export async function fetchOura(): Promise<OuraReplay | null> {
  const r = await fetch('/api/oura')
  return r.ok ? r.json() : null
}

export default function RingPage() {
  const [data, setData] = useState<OuraReplay | null | undefined>(undefined)
  useEffect(() => { fetchOura().then(setData) }, [])
  if (data === undefined) return <div className="p-8 text-ink/60">Reading the ring export…</div>
  if (data === null) return <div className="p-8 text-ink/70">No ring data yet. Put an Oura export in <code>data/oura/</code> and reload.</div>
  const last = data.days.slice(-7)
  const well = data.days[0].body - (data.days[0].body - 5)
  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8">
      <h1 className="font-serif text-[clamp(2.2rem,4vw,3.6rem)] leading-[1.02]">A real ring, against its own normal.</h1>
      <p className="mt-2 max-w-[44rem] text-[15px] leading-relaxed text-ink/60">
        {data.days.length} days from an Oura export, run through the same loop as Aino. The first {data.baseline_days.length} days
        ({data.baseline_days[0]} to {data.baseline_days[data.baseline_days.length - 1]}) define normal. No check-ins here, so this shows
        how far sleep and activity drift from that normal, in the same units as the depression score.
      </p>
      <div className="mt-6 border-t border-ink/15 pt-5">
        <DriftChart data={data} well={well} />
      </div>
      <h2 className="mt-6 text-[15px] font-medium">Last 7 days against normal</h2>
      <div className="mt-2 grid grid-cols-1 gap-2 border-t border-ink/15 pt-5 sm:grid-cols-2">
        {Object.keys(LABEL).map((k) => {
          const base = data.baseline[k]
          const now = last.reduce((a, d) => a + d.passive[k], 0) / last.length
          const observed = data.days.some((d) => d.observed.includes(k))
          const pct = base ? ((now - base) / base) * 100 : 0
          return (
            <div key={k} className="flex items-center justify-between text-[13px]">
              <span className="text-ink/70">{LABEL[k]}</span>
              <span className={`tabular-nums ${!observed ? 'text-ink/30' : Math.abs(pct) > 8 ? 'font-medium text-[#b5443a]' : 'text-ink'}`}>
                {observed ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%` : 'not in export'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DriftChart({ data, well }: { data: OuraReplay; well: number }) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10), H = 260
  const n = data.days.length
  const x = lin(0, n - 1, 36, W - 10)
  const ys = data.days.map((d) => d.body - well)
  const hi = Math.max(8, ...ys) + 1
  const y = lin(-3, hi, H - 26, 10)
  return (
    <div ref={ref}>
      {width > 60 && <svg width={W} height={H}>
        <rect x={x(0)} y={10} width={x(data.baseline_days.length - 1) - x(0)} height={H - 36} fill="#142231" opacity={0.04} />
        <text x={x(0) + 4} y={H - 30} fontSize={11} fill="#142231" fillOpacity={0.5}>normal is learned here</text>
        <line x1={36} x2={W - 10} y1={y(0)} y2={y(0)} stroke="#142231" strokeOpacity={0.3} />
        {[0, 4, 8].map((v) => <text key={v} x={30} y={y(v) + 4} textAnchor="end" fontSize={10} fill="#142231" fillOpacity={0.5}>{v > 0 ? `+${v}` : v}</text>)}
        {data.days.map((d, i) => <rect key={d.day} x={x(i) - 2} y={H - 18} width={Math.max(2, x(1) - x(0))} height={6} fill={riskColor(d.risk)} />)}
        <path d={pathOf(ys.map((v, i) => [x(i), y(v)]))} fill="none" stroke="#3b7fc4" strokeWidth={2} strokeDasharray="5 3" />
        <text x={W - 12} y={H - 2} textAnchor="end" fontSize={10} fill="#142231" fillOpacity={0.5}>{data.days[n - 1].day}</text>
        <text x={36} y={H - 2} fontSize={10} fill="#142231" fillOpacity={0.5}>{data.days[0].day}</text>
      </svg>}
      <div className="mt-1 text-[11px] text-ink/50">Dashed: drift from normal in PHQ-9 points. Strip: two-week outlook (calm, unsettled, storm likely).</div>
    </div>
  )
}
