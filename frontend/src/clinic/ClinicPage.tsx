import { useEffect, useState } from 'react'
import { api, DOSE_LABEL, type ClinicDetail, type ClinicRow } from '../api'
import MiniForecast from '../charts/MiniForecast'
import { lin, pathOf } from '../lib'
import { LearnedBars } from '../story/Panels'

const GROUPS: { key: ClinicRow['status']; title: string; hint: string }[] = [
  { key: 'act', title: 'Talk about a booster', hint: 'Forecast says relapse is likely within two weeks' },
  { key: 'watch', title: 'Worth a short call', hint: 'Rhythm or mood drifting from their own normal' },
  { key: 'steady', title: 'Steady', hint: 'No action needed this week' },
]

export default function ClinicPage() {
  const [rows, setRows] = useState<ClinicRow[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [detail, setDetail] = useState<ClinicDetail | null>(null)
  useEffect(() => { api.clinic().then((r) => { setRows(r); setSel(r.find((x) => x.name.startsWith('Aino'))?.id ?? r[0]?.id ?? null) }) }, [])
  useEffect(() => { if (sel) api.clinicDetail(sel).then(setDetail) }, [sel])
  const act = async (id: string, action: string) => {
    await api.act(id, action)
    setRows((rs) => rs?.map((r) => (r.id === id ? { ...r, action } : r)) ?? null)
    setDetail((d) => (d && d.id === id ? { ...d, action } : d))
  }
  if (!rows) return <div className="p-8 text-ink/60">Loading this week’s list…</div>
  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, rows.filter((r) => r.status === g.key).length]))
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1fr)_520px]">
      <div>
        <div className="mb-5">
          <h1 className="font-serif text-[30px] leading-tight">This week: {counts.act} to call about a booster, {counts.watch} to check on.</h1>
          <p className="mt-1 text-[14px] text-ink/60">{rows.length} people discharged after TMS. Everyone else is doing fine without you.</p>
        </div>
        {GROUPS.map((g) => (
          <section key={g.key} className="mb-6">
            <div className="mb-2 flex items-baseline gap-3">
              <h2 className="text-[15px] font-semibold">{g.title}</h2>
              <span className="text-[12px] text-ink/50">{g.hint}</span>
            </div>
            <div className="overflow-hidden rounded-xl bg-white">
              {rows.filter((r) => r.status === g.key).map((r) => (
                <button key={r.id} onClick={() => setSel(r.id)}
                  className={`grid w-full grid-cols-[150px_130px_1fr_auto] items-center gap-4 border-b border-ink/5 px-4 py-3 text-left last:border-0 hover:bg-fog/50 ${sel === r.id ? 'bg-fog/70' : ''}`}>
                  <div>
                    <div className="text-[14px] font-medium">{r.name}</div>
                    <div className="text-[12px] text-ink/50">{r.age} · day {r.day} after TMS</div>
                  </div>
                  <Spark data={r.spark} status={r.status} />
                  <div className="flex flex-wrap gap-1">
                    {r.reasons.slice(0, 3).map((x) => (
                      <span key={x.text} className={`rounded-full px-2 py-0.5 text-[11px] ${x.kind === 'mood' ? 'bg-storm/10 text-[#b5443a]' : 'bg-squall/15 text-[#8a5a0c]'}`}>{x.text}</span>
                    ))}
                  </div>
                  <div className="text-right">
                    {r.action ? <span className="text-[12px] font-medium text-[#2e8c73]">{r.action}</span>
                      : r.suggest ? <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${r.status === 'act' ? 'bg-storm text-white' : 'bg-squall/80 text-ink'}`}>{r.suggest}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <aside className="xl:sticky xl:top-4 xl:self-start">
        {detail ? <Detail d={detail} onAct={act} /> : <div className="rounded-xl bg-white p-6 text-ink/50">Pick someone to see why they are on the list.</div>}
      </aside>
    </div>
  )
}

function Spark({ data, status }: { data: ClinicRow['spark']; status: ClinicRow['status'] }) {
  const W = 120, H = 34
  const x = lin(0, data.length - 1, 1, W - 1)
  const y = lin(2, 20, H - 2, 2)
  return (
    <svg width={W} height={H} aria-hidden>
      <line x1={0} x2={W} y1={y(15)} y2={y(15)} stroke="#ef6a5b" strokeOpacity={0.4} strokeDasharray="2 2" />
      <path d={pathOf(data.map((d, i) => [x(i), y(Math.min(20, d.body))]))} fill="none" stroke="#3b7fc4" strokeWidth={1.2} strokeDasharray="3 2" />
      <path d={pathOf(data.map((d, i) => (d.mood == null ? null : [x(i), y(Math.min(20, d.mood))])))} fill="none" stroke={status === 'act' ? '#d1493c' : '#142231'} strokeWidth={1.8} />
    </svg>
  )
}

function Detail({ d, onAct }: { d: ClinicDetail; onAct: (id: string, a: string) => void }) {
  const pronoun = d.name.startsWith('Aino') || ['Sara', 'Leena', 'Hanna', 'Emilia', 'Noora', 'Riikka'].some((n) => d.name.startsWith(n)) ? 'her' : 'his'
  return (
    <div className="rounded-xl bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[26px] leading-tight">{d.name}</h2>
          <p className="text-[13px] text-ink/60">{d.age} years · day {d.day} after TMS · answers {Math.round(d.checkin_rate * 100)}% of check-ins · does {Math.round(d.adherence * 100)}% of {pronoun} plan</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${d.status === 'act' ? 'bg-storm text-white' : d.status === 'watch' ? 'bg-squall text-ink' : 'bg-calm text-ink'}`}>{Math.round(d.risk * 100)}% risk</span>
      </div>

      <h3 className="mt-4 text-[13px] font-semibold">Last 30 days and the next 14</h3>
      <MiniForecast trend={d.series.slice(-30)} fan={d.fan} risk={d.risk} height={150} />
      <div className="flex gap-4 text-[11px] text-ink/60">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4 bg-ink" />check-ins</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0 w-4 border-t border-dashed border-[#3b7fc4]" />sleep and activity, in the same units</span>
      </div>

      {d.reasons.length > 0 && (<>
        <h3 className="mt-4 text-[13px] font-semibold">Why {pronoun === 'her' ? 'she is' : 'he is'} on the list</h3>
        <ul className="mt-1 space-y-1 text-[13px] text-ink/80">{d.reasons.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
      </>)}

      <h3 className="mt-4 text-[13px] font-semibold">Ring, last 60 days against {pronoun} own normal</h3>
      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        {d.signals.filter((s) => s.key !== 'sleep_efficiency').map((s) => <SignalRow key={s.key} s={s} />)}
      </div>

      <h3 className="mt-4 text-[13px] font-semibold">What helps {pronoun === 'her' ? 'her' : 'him'}, learned from {pronoun} own days</h3>
      <div className="mt-2"><LearnedBars mean={d.learned.map((l) => l.mean)} sd={d.learned.map((l) => l.sd)} dark={false} highlight={d.plan} /></div>
      <p className="mt-2 text-[12px] text-ink/50">Current plan: {d.plan.map((k) => DOSE_LABEL[k]).join(', ') || 'none'}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {d.action ? (
          <div className="w-full rounded-lg bg-calm/15 px-3 py-2 text-[13px] text-ink">{d.action}. {d.name.split(' ')[0]} gets a message in the app.</div>
        ) : (<>
          {d.status === 'act' && <button onClick={() => onAct(d.id, 'Booster block booked')} className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-fog">Book booster block</button>}
          <button onClick={() => onAct(d.id, 'Call scheduled')} className="rounded-full border border-ink/20 px-4 py-2 text-[13px]">Schedule a call</button>
          <button onClick={() => onAct(d.id, 'Marked as fine')} className="rounded-full px-4 py-2 text-[13px] text-ink/50">Mark as fine</button>
        </>)}
      </div>
    </div>
  )
}

function SignalRow({ s }: { s: ClinicDetail['signals'][number] }) {
  const W = 110, H = 22
  const vals = s.series
  const lo = Math.min(...vals, s.baseline), hi = Math.max(...vals, s.baseline)
  const pad = (hi - lo) * 0.1 || 1
  const x = lin(0, vals.length - 1, 0, W)
  const y = lin(lo - pad, hi + pad, H, 0)
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-ink/70">{s.label}</span>
      <svg width={W} height={H} aria-hidden>
        <line x1={0} x2={W} y1={y(s.baseline)} y2={y(s.baseline)} stroke="#142231" strokeOpacity={0.25} strokeDasharray="2 2" />
        <path d={pathOf(vals.map((v, i) => [x(i), y(v)]))} fill="none" stroke="#3b7fc4" strokeWidth={1.3} />
      </svg>
    </div>
  )
}
