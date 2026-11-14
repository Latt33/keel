import type { Fan } from '../api'
import { lin, pathOf, riskColor, useSize } from '../lib'

/** Recent mood (solid), body signal (dashed) and the 14-day forecast band. Light theme. */
export default function MiniForecast({ trend, fan, risk, relapse = 15, height = 150, dark = false, gentle = false }: {
  trend: { mood: number | null; body: number }[]; fan: Fan; risk: number; relapse?: number; height?: number; dark?: boolean
  gentle?: boolean   // patient view: no relapse line, neutral band colour
}) {
  const [ref, { width }] = useSize<HTMLDivElement>()
  const W = Math.max(width, 10)
  const H = height
  const n = trend.length
  const total = n + fan.p50.length
  const x = lin(0, total - 1, 6, W - 6)
  const y = lin(0, 24, H - 16, 8)
  const last = trend[n - 1]
  const start: [number, number] = [x(n - 1), y(last?.mood ?? last?.body ?? 8)]
  const up = fan.p90.map((v, h) => [x(n + h), y(Math.min(24, v))] as [number, number])
  const lo = fan.p10.map((v, h) => [x(n + h), y(Math.min(24, v))] as [number, number]).reverse()
  const area = pathOf([start, ...up]) + lo.map((p) => `L${p[0]},${p[1]}`).join('') + 'Z'
  const c = gentle ? '#7a8fa3' : riskColor(risk)
  const ink = dark ? '#eef3f5' : '#142231'
  return (
    <div ref={ref} style={{ height: H }}>
      {width > 60 && <svg width={W} height={H} className="block">
        {!gentle && <rect x={0} y={8} width={W} height={y(relapse) - 8} fill="#ef6a5b" opacity={0.08} />}
        {!gentle && <line x1={0} x2={W} y1={y(relapse)} y2={y(relapse)} stroke="#ef6a5b" strokeDasharray="3 3" strokeOpacity={0.7} />}
        <line x1={x(n - 1)} x2={x(n - 1)} y1={6} y2={H - 14} stroke={ink} strokeOpacity={0.2} />
        <text x={x(n - 1) - 4} y={H - 3} textAnchor="end" fontSize={10} fill={ink} fillOpacity={0.5}>today</text>
        <text x={W - 4} y={H - 3} textAnchor="end" fontSize={10} fill={ink} fillOpacity={0.5}>+14 days</text>
        <path d={area} fill={c} opacity={0.28} />
        <path d={pathOf([start, ...fan.p50.map((v, h) => [x(n + h), y(Math.min(24, v))] as [number, number])])} fill="none" stroke={c} strokeWidth={1.5} strokeDasharray="2 3" />
        <path d={pathOf(trend.map((t, i) => [x(i), y(Math.min(24, t.body))]))} fill="none" stroke={dark ? '#8ec5ff' : '#3b7fc4'} strokeWidth={1.4} strokeDasharray="4 3" />
        <path d={pathOf(trend.map((t, i) => (t.mood == null ? null : [x(i), y(Math.min(24, t.mood))])))} fill="none" stroke={ink} strokeWidth={2.4} strokeLinejoin="round" />
      </svg>}
    </div>
  )
}
