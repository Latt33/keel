import type { Story } from '../api'
import { lin, pathOf, riskColor, useSize } from '../lib'

const X0 = -42
const X1 = 180
const Y1 = 24

export default function MoodChart({ story, day, world }: { story: Story; day: number; world: 'keel' | 'none' }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>()
  const m = { l: 34, r: 28, t: 40, b: 30 }
  const W = Math.max(width, 10), H = Math.max(height, 10)
  const x = lin(X0, X1, m.l, W - m.r)
  const y = lin(0, Y1, H - m.b, m.t)
  const ev = story.events
  const today = Math.floor(day)
  const found = ev.found_without ?? X1
  const keelNow = story.keel[Math.max(0, Math.min(story.keel.length - 1, today))]

  // How she feels: weekly clinic scores during TMS, then her daily check-ins (smoothed)
  const tmsPts = story.tms.filter((d) => d.day <= day).map((d) => [x(d.day), y(d.phq)] as [number, number])
  const moodPts = story.keel.filter((d) => d.day <= day).map((d) => (d.mood == null ? null : [x(d.day), y(Math.min(Y1, d.mood))] as [number, number]))
  const bodySm: number[] = []
  story.keel.forEach((d, i) => { bodySm.push(i === 0 ? d.body : bodySm[i - 1] + 0.3 * (d.body - bodySm[i - 1])) })
  const bodyPts = story.keel.filter((d) => d.day >= 3 && d.day <= day).map((d) => [x(d.day), y(Math.min(Y1, bodySm[d.day]))] as [number, number])
  const lastTms = story.tms[story.tms.length - 1]
  const without = story.none.filter((d) => d.day <= Math.min(day, found)).map((d) => (d.mood == null ? null : [x(d.day), y(Math.min(Y1, d.mood))] as [number, number]))
  const joinTms = (pts: ([number, number] | null)[]) => (day >= 0 ? [[x(lastTms.day), y(lastTms.phq)] as [number, number], ...pts] : pts)

  const showFan = day >= 14 && world === 'keel' && keelNow
  const fan = keelNow?.fan
  const fanArea = showFan && fan
    ? pathOf([[x(today), y(keelNow.mood ?? keelNow.body)], ...fan.p90.map((v, h) => [x(today + h + 1), y(Math.min(Y1, v))] as [number, number])])
      + fan.p10.slice().reverse().map((v, h) => `L${x(today + fan.p10.length - h).toFixed(1)},${y(Math.min(Y1, v)).toFixed(1)}`).join('') + 'Z'
    : ''
  const fanMid = showFan && fan ? pathOf([[x(today), y(keelNow.mood ?? keelNow.body)], ...fan.p50.map((v, h) => [x(today + h + 1), y(Math.min(Y1, v))] as [number, number])]) : ''
  const fc = riskColor(keelNow?.risk ?? 0)

  const boosterStart = ev.booster[0]
  const boosterEnd = ev.booster[ev.booster.length - 1]
  const relapseY = y(story.relapse_phq)
  const strongKeel = world === 'keel'
  const sm = W < 520            // phone: fewer labels, the legend names the two lives
  // name the two lives right where they are drawn, so the comparison needs no legend
  const head = (pts: ([number, number] | null)[]) => { for (let i = pts.length - 1; i >= 0; i--) if (pts[i]) return pts[i]!; return null }
  const kH = day >= 3 ? head(moodPts) : null
  const nH = day >= 3 && day <= found + 0.5 ? head(without) : null
  let kY = kH?.[1] ?? 0, nY = nH?.[1] ?? 0
  const apart = !!(kH && nH && Math.abs(kY - nY) > 28)   // label only once the two lives have visibly split
  if (kH && nH && Math.abs(kY - nY) < 16) { const mid = (kY + nY) / 2; if (kY <= nY) { kY = mid - 8; nY = mid + 8 } else { kY = mid + 8; nY = mid - 8 } }

  const items: { label: string; color: string; kind: 'line' | 'dash' | 'fan'; show: boolean }[] = [
    { label: day < 0 ? 'How she feels' : sm ? 'With Keel' : 'How she feels, with Keel', color: '#f3efe6', kind: 'line', show: true },
    { label: sm ? 'Without Keel' : 'Same life, without Keel', color: '#ef6a5b', kind: 'line', show: day >= 0 },
    { label: sm ? 'Ring' : 'What her ring says', color: '#8ec5ff', kind: 'dash', show: day >= 3 && world === 'keel' },
    { label: 'Next 2 weeks', color: fc, kind: 'fan', show: !sm && day >= 14 && world === 'keel' },
  ]
  const legend: { label: string; color: string; kind: 'line' | 'dash' | 'fan'; x: number }[] = []
  let lx = 0
  for (const it of items.filter((i) => i.show)) {
    const w = 30 + it.label.length * 6.1
    if (lx + w > W - m.l - 4) break
    legend.push({ ...it, x: lx }); lx += w + 14
  }

  return (
    <div ref={ref} className="relative h-full w-full">
      {width > 60 && height > 60 && <svg width={W} height={H} className="block" role="img" aria-label="Depression score over time">
        {/* relapse zone */}
        <rect x={m.l} y={m.t} width={W - m.l - m.r} height={relapseY - m.t} fill="#ef6a5b" opacity={0.08} />
        <line x1={m.l} x2={W - m.r} y1={relapseY} y2={relapseY} stroke="#ef6a5b" strokeOpacity={0.7} strokeDasharray="4 4" />
        {!(sm && day >= found) && <text x={W - m.r - 4} y={relapseY - 6} textAnchor="end" className="fill-storm text-[11px]">Relapse line</text>}
        {!sm && <text x={W - m.r - 4} y={m.t + 14} textAnchor="end" className="fill-storm/70 text-[11px]">Depression is back</text>}

        {/* TMS course and booster shading */}
        <rect x={x(X0)} y={m.t} width={x(0) - x(X0)} height={H - m.b - m.t} fill="#d9b878" opacity={0.07} />
        <text x={x(-21)} y={H - m.b - 8} textAnchor="middle" className="fill-brass text-[11px]">{sm ? 'TMS' : 'TMS in the clinic'}</text>
        {boosterStart != null && day >= boosterStart && world === 'keel' && (
          <g>
            <rect x={x(boosterStart)} y={m.t} width={Math.max(3, x(boosterEnd + 1) - x(boosterStart))} height={H - m.b - m.t} fill="#d9b878" opacity={0.22} />
            {!sm && <text x={x(boosterStart) + 4} y={m.t + 30} className="fill-brass text-[11px]">Booster TMS</text>}
          </g>
        )}
        {ev.visits.filter((v) => v <= X1).map((v) => (
          <g key={v} opacity={day >= v - 30 ? 1 : 0.35}>
            <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke="#9fb3c4" strokeOpacity={0.35} />
            {!sm && <text x={x(v) - 4} y={H - m.b - 8} textAnchor="end" className="fill-mist text-[11px]">{v === 90 ? '3-month visit' : '6-month visit'}</text>}
          </g>
        ))}

        {/* y axis */}
        {[0, 5, 10, 15, 20].map((v) => (
          <text key={v} x={m.l - 8} y={y(v) + 4} textAnchor="end" className="fill-mist/70 text-[10px]">{v}</text>
        ))}
        {/* x axis: weeks since going home */}
        {(W < 520 ? [0, 60, 120, 180] : [0, 30, 60, 90, 120, 150, 180]).map((v) => (
          <text key={v} x={x(v)} y={H - 10} textAnchor="middle" className="fill-mist/70 text-[10px]">{v === 0 ? 'Home' : `day ${v}`}</text>
        ))}

        {/* forecast fan */}
        {fanArea && <path d={fanArea} fill={fc} opacity={0.22} />}
        {fanMid && <path d={fanMid} fill="none" stroke={fc} strokeWidth={1.5} strokeDasharray="2 3" />}

        {/* the same life without Keel: always visible in red, stronger when it is the one being shown */}
        <path d={pathOf(joinTms(without))} fill="none" stroke="#ef6a5b" strokeWidth={strongKeel ? 2 : 3} strokeOpacity={strongKeel ? 0.8 : 1} strokeLinejoin="round" />
        {day >= found && ev.relapse_without != null && (
          <g>
            <circle cx={x(found)} cy={y(Math.min(Y1, story.none[found].mood ?? story.none[found].phq))} r={5} fill="#ef6a5b" />
            <text x={x(found) + 8} y={y(Math.min(Y1, story.none[found].mood ?? story.none[found].phq)) - 6} className="fill-storm text-[11px] font-medium">{sm ? 'Found at visit' : 'Relapse found at visit'}</text>
          </g>
        )}

        {/* what her body shows (ring): leads */}
        {world === 'keel' && <path d={pathOf(bodyPts)} fill="none" stroke="#8ec5ff" strokeWidth={2.2} strokeDasharray="6 4" />}
        {/* how she feels */}
        <path d={pathOf(tmsPts)} fill="none" stroke="#f3efe6" strokeWidth={strongKeel ? 3 : 1.5} strokeOpacity={strongKeel ? 1 : 0.5} strokeLinejoin="round" />
        <path d={pathOf(joinTms(moodPts))} fill="none" stroke="#f3efe6" strokeWidth={world === 'keel' ? 3 : 1.5} strokeOpacity={world === 'keel' ? 1 : 0.35} strokeLinejoin="round" />

        {/* markers */}
        {ev.life_event.filter((d) => d <= day && d < 70).map((d) => (
          <g key={d}>
            <line x1={x(d)} x2={x(d)} y1={y(3)} y2={m.t + 22} stroke="#f0b24a" strokeOpacity={0.5} strokeDasharray="2 3" />
            {!sm && <text x={x(d)} y={m.t + 16} textAnchor="middle" className="fill-squall text-[11px]">Hard week</text>}
          </g>
        ))}
        {ev.alert != null && day >= ev.alert && world === 'keel' && (
          <g>
            <circle cx={x(ev.alert)} cy={y(story.keel[ev.alert].mood ?? 10)} r={9} fill="none" stroke="#ef6a5b" strokeWidth={2} />
            {!sm && <g transform={`translate(${x(ev.alert) - 10},${y(story.keel[ev.alert].mood ?? 10) + 14})`}>
              <rect x={-92} y={0} width={92} height={20} rx={10} fill="#ef6a5b" />
              <text x={-46} y={14} textAnchor="middle" className="fill-sea text-[11px] font-medium">Clinic alerted</text>
            </g>}
          </g>
        )}

        {/* today */}
        <line x1={x(day)} x2={x(day)} y1={m.t - 8} y2={H - m.b} stroke="#eef3f5" strokeOpacity={0.5} />

        {/* the two lives, labelled at their heads */}
        {!sm && apart && kH && <text x={kH[0] - 8} y={kY >= nY ? kY + 18 : kY - 8} textAnchor="end" className={`text-[12px] font-medium ${strongKeel ? 'fill-foam' : 'fill-foam/50'}`}>with Keel</text>}
        {!sm && apart && nH && <text x={nH[0] - 8} y={kY >= nY ? nY - 8 : nY + 18} textAnchor="end" className={`text-[12px] font-medium ${strongKeel ? 'fill-storm/70' : 'fill-storm'}`}>without Keel</text>}

        {/* legend: laid out left to right, dropping what doesn't fit */}
        <g transform={`translate(${m.l},14)`} className="text-[11px]">
          {legend.map((it) => (
            <g key={it.label} transform={`translate(${it.x},0)`}>
              {it.kind === 'fan' ? <rect x={0} y={-5} width={18} height={10} fill={fc} opacity={0.35} />
                : <line x1={0} x2={18} y1={0} y2={0} stroke={it.color} strokeWidth={it.kind === 'dash' ? 1.8 : 3} strokeDasharray={it.kind === 'dash' ? '5 4' : undefined} />}
              <text x={24} y={4} className="fill-foam">{it.label}</text>
            </g>
          ))}
        </g>
      </svg>}
    </div>
  )
}
