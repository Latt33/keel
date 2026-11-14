export type Fan = { p10: number[]; p50: number[]; p90: number[] }

export interface KeelDay {
  day: number; phq: number; checkin: number | null; body: number; mood: number | null; risk: number
  alert: boolean; in_booster: boolean; s: number[]; plan: string[]; done: string[]
  passive: Record<string, number>; contrib: Record<string, number>; fan: Fan
  learned: { mean: number[]; sd: number[] }; life_event: number
}
export interface NoneDay { day: number; phq: number; s: number[]; passive: Record<string, number>; mood: number | null; checkin: number | null }
export interface TmsDay { day: number; phq: number; s: number[]; session: boolean; session_no: number | null; passive: Record<string, number>; checkin: number | null }
export interface Intervention { key: string; label: string; minutes: number; detail: string }
export interface PassiveMeta { key: string; label: string; unit: string; baseline: number }

export interface PolicyResult { relapse_free_90: number; relapse_free_180: number; days_relapsed_mean: number; boosters_per_patient: number }
export interface Cohort {
  n_patients: number; days: number
  policies: Record<'none' | 'fixed' | 'keel_plan' | 'keel', PolicyResult>
  forecast: { auc_14d_keel: number; auc_14d_checkin_only: number; median_warning_days_keel: number; median_warning_days_checkin_only: number }
  learning: Record<string, number>
}

export interface Story {
  profile: { name: string; age: number; city: string; history: string; tms: string }
  dims: string[]; relapse_phq: number; well_phq: number
  interventions: Intervention[]; passive: PassiveMeta[]
  tms: TmsDay[]; keel: KeelDay[]; none: NoneDay[]
  events: {
    life_event: number[]; body_rise: number | null; mood_rise_without: number | null; watch: number | null
    alert: number | null; booster: number[]; relapse_without: number | null; found_without: number | null
    visits: number[]; max_phq_keel: number
  }
  truth_relief: number[]
  cohort: Cohort | null
  real_data: { auc: Record<string, number>; n_samples: number; n_participants: number } | null
}

export interface LiveState {
  day: number; tier: 'steady' | 'watch' | 'act'; risk: number; plan: string[]
  why: { key: string; relief: number; sd: number }[]
  fan: Fan; body: number; mood: number | null; well_phq: number
  trend: { day: number; mood: number | null; body: number; checkin: number | null }[]
  learned: { mean: number[]; sd: number[] }
  pareto: { front: { doses: string[]; relief: number; minutes: number }[]; all: { relief: number; minutes: number }[] }
  contrib: Record<string, number>; passive: Record<string, number>
  week: Record<string, number>; baseline: Record<string, number>
  alert: boolean; booster_pending: number | null; streak: number
  questions: string[]; safety: boolean
  path: { day: number; checkin: boolean; done: string[]; booster: boolean; alert: boolean; answers: Record<string, number> | null; rel: Record<string, number> }[]
  history: { day: number; phq: number; risk_before: number; risk_after: number; done: string[]; answers?: Record<string, number> }[]
  changed?: { risk_before: number; risk_after: number }
}

export interface ClinicRow {
  id: string; name: string; age: number; day: number; risk: number; status: 'act' | 'watch' | 'steady'
  action: string | null; spark: { mood: number | null; body: number }[]
  reasons: { kind: string; text: string; label?: string; pct?: number }[]
  mood: number | null; well_phq: number; suggest: string | null
}
export interface ClinicDetail extends ClinicRow {
  series: { day: number; mood: number | null; body: number; checkin: number | null; booster: boolean }[]
  fan: Fan
  learned: { key: string; label: string; mean: number; sd: number }[]
  plan: string[]; adherence: number; checkin_rate: number
  signals: { key: string; label: string; baseline: number; series: number[] }[]
  boosters: number[]; tier: string
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init)
  if (!r.ok) throw new Error(`${url} answered ${r.status}`)
  return r.json()
}
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

/** One id per browser tab, so every visitor of a shared deployment gets their own copy of Aino's phone. */
const SESSION = (() => {
  try {
    const k = 'keel-session', v = sessionStorage.getItem(k)
    if (v) return v
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    sessionStorage.setItem(k, id); return id
  } catch { return Math.random().toString(36).slice(2) }
})()
const withSession = (init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers ?? {}), 'X-Keel-Session': SESSION } })

export const api = {
  story: () => j<Story>('/api/story'),
  live: () => j<LiveState>('/api/live', withSession()),
  checkin: (answers: Record<string, number>, done: string[]) => j<LiveState>('/api/live/checkin', withSession(post({ answers, done }))),
  reset: () => j<LiveState>('/api/live/reset', withSession(post({}))),
  clinic: () => j<ClinicRow[]>('/api/clinic'),
  clinicDetail: (id: string) => j<ClinicDetail>(`/api/clinic/${id}`),
  act: (id: string, action: string) => j<{ id: string; action: string }>(`/api/clinic/${id}/action`, post({ action })),
}

export const DOSE_LABEL: Record<string, string> = {
  light: 'Morning light', walk: 'Brisk walk', anchor: 'Same wake-up time',
  social: 'Reach out to someone', breathe: 'Slow breathing + music', pleasant: 'One thing you enjoy',
}
export const DOSE_KEYS = ['light', 'walk', 'anchor', 'social', 'breathe', 'pleasant']
