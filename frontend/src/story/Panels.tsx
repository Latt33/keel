import type { KeelDay, Story } from '../api'
import { DOSE_KEYS, DOSE_LABEL } from '../api'
import { clamp } from '../lib'

/** What Keel believes each dose does for this person: dot = estimate, bar = uncertainty. */
export function LearnedBars({ mean, sd, dark = true, highlight, you = false }: { mean: number[]; sd: number[]; dark?: boolean; highlight?: string[]; you?: boolean }) {
  const rows = DOSE_KEYS.map((k, i) => ({ k, m: mean[i], s: sd[i] })).sort((a, b) => b.m - a.m)
  const max = 3
  const X = (v: number) => `${clamp((v + 0.5) / (max + 0.5), 0, 1) * 100}%`
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const hl = highlight?.includes(r.k)
        return (
          <div key={r.k} className={`grid ${you ? "grid-cols-[8rem_1fr]" : "grid-cols-[9.5rem_1fr]"} items-center gap-2 text-[12px]`}>
            <span className={`truncate ${hl ? (dark ? 'text-foam font-medium' : 'text-ink font-medium') : dark ? 'text-mist' : 'text-ink/70'}`}>{DOSE_LABEL[r.k]}</span>
            <div className={`relative h-4 rounded-sm ${dark ? 'bg-sea-3/40' : 'bg-ink/5'}`}>
              <div className="absolute top-0 h-full w-px bg-mist/40" style={{ left: X(0) }} />
              <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-all duration-500"
                style={{ left: X(r.m - 1.28 * r.s), width: `calc(${X(r.m + 1.28 * r.s)} - ${X(r.m - 1.28 * r.s)})`, background: dark ? 'rgba(98,194,166,.35)' : 'rgba(46,140,115,.25)' }} />
              <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-500"
                style={{ left: X(r.m), background: dark ? '#62c2a6' : '#2e8c73' }} />
            </div>
          </div>
        )
      })}
      {you && (
        <div className="grid grid-cols-[8rem_1fr] gap-2 text-[10px] text-ink/50">
          <span />
          <div className="flex justify-between gap-2"><span>no effect</span><span className="text-right">helps a lot</span></div>
        </div>
      )}
    </div>
  )
}

const RING = [
  { k: 'sleep_regularity', label: 'Sleep regularity' },
  { k: 'rhythm_strength', label: 'Day/night rhythm' },
  { k: 'steps', label: 'Activity' },
  { k: 'hrv_ms', label: 'Heart rate variability' },
]

export function RingSignals({ story, rec }: { story: Story; rec: { passive: Record<string, number> } }) {
  return (
    <div className="space-y-1.5">
      {RING.map(({ k, label }) => {
        const base = story.passive.find((p) => p.key === k)!.baseline
        const pct = ((rec.passive[k] - base) / base) * 100
        const w = clamp(Math.abs(pct) / 40, 0, 1) * 50
        const bad = pct < -6
        return (
          <div key={k} className="grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-2 text-[12px]">
            <span className="text-mist">{label}</span>
            <div className="relative h-3 rounded-sm bg-sea-3/40">
              <div className="absolute left-1/2 top-0 h-full w-px bg-mist/50" />
              <div className="absolute top-0 h-full rounded-sm transition-all duration-300"
                style={{ left: pct < 0 ? `${50 - w}%` : '50%', width: `${w}%`, background: bad ? '#f0b24a' : '#62c2a6' }} />
            </div>
            <span className={`text-right tabular-nums ${bad ? 'text-squall' : 'text-mist'}`}>{pct > 0 ? '+' : ''}{pct.toFixed(0)}%</span>
          </div>
        )
      })}
      <div className="grid grid-cols-[9.5rem_1fr_2.5rem] gap-2 text-[10px] text-mist/70"><span /><div className="text-center">her own normal</div><span /></div>
    </div>
  )
}

export function PlanToday({ rec }: { rec: KeelDay }) {
  if (!rec.plan.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {rec.plan.map((k) => {
        const done = rec.done.includes(k)
        return (
          <span key={k} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] ${done ? 'bg-calm/20 text-foam' : 'bg-sea-3/50 text-mist'}`}>
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] ${done ? 'bg-calm text-sea' : 'border border-mist/50'}`}>{done ? '✓' : ''}</span>
            {DOSE_LABEL[k]}
          </span>
        )
      })}
    </div>
  )
}
