import { useEffect, useState } from 'react'
import { api, type Story } from './api'
import StoryPage from './story/StoryPage'
import PhonePage from './phone/PhonePage'
import ClinicPage from './clinic/ClinicPage'
import RingPage, { fetchOura } from './ring/RingPage'
import ProofPage from './proof/ProofPage'
import Landing from './landing/Landing'

type Route = 'home' | 'story' | 'phone' | 'clinic' | 'ring' | 'proof'
const routeFromHash = (): Route => {
  const h = location.hash.replace('#/', '')
  return h === 'story' || h === 'phone' || h === 'clinic' || h === 'ring' || h === 'proof' ? h : 'home'
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash())
  const [story, setStory] = useState<Story | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [hasRing, setHasRing] = useState(false)
  useEffect(() => {
    const on = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { api.story().then(setStory).catch((e) => setErr(String(e))) }, [])
  useEffect(() => { fetchOura().then((d) => setHasRing(!!d)).catch(() => {}) }, [])

  const light = route !== 'story'
  if (route === 'home') return <Landing />
  return (
    <div className={`grid h-full grid-rows-[auto_1fr] ${light ? 'bg-fog text-ink' : 'bg-sea text-foam'}`}>
      <header className="flex min-w-0 items-center gap-4 px-4 py-4 sm:gap-8 sm:px-8">
        <a href="#/" className="flex shrink-0 items-baseline gap-2">
          <Logo light={light} />
          <span className="hidden text-[19px] leading-none tracking-[-0.02em] sm:inline">Keel</span>
        </a>
        <nav className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto text-[13px] sm:gap-3 sm:text-[16px]">
          {([['story', 'Aino’s story', 'Story'], ['phone', 'What Aino sees', 'Aino'], ['clinic', 'What her nurse sees', 'Nurse'], ['proof', 'How we know', 'Evidence'], ...(hasRing ? [['ring', 'Your ring', 'Ring']] : [])] as [Route, string, string][]).map(([r, label, short]) => (
            <a key={r} href={`#/${r}`} aria-current={route === r ? 'page' : undefined}
              className={`whitespace-nowrap px-1.5 py-1 tracking-[-0.03em] decoration-1 underline-offset-[6px] sm:px-2 ${route === r ? 'underline' : 'hover:underline'} ${light ? 'text-ink' : 'text-foam'}`}>
              <span className="hidden sm:inline">{label}</span><span className="sm:hidden">{short}</span>
            </a>
          ))}
        </nav>
      </header>
      <main className="min-h-0 overflow-y-auto overflow-x-hidden">
        {err && <div className="p-8 text-storm">The demo server is not answering ({err}). Start it with <code>npm run dev</code> in the repo root.</div>}
        {!err && !story && <div className="p-8 text-mist">Loading Aino’s six months…</div>}
        {story && route === 'story' && <StoryPage story={story} />}
        {story && route === 'phone' && <PhonePage story={story} />}
        {story && route === 'clinic' && <ClinicPage />}
        {route === 'ring' && <RingPage />}
        {route === 'proof' && <ProofPage />}
      </main>
    </div>
  )
}

function Logo({ light }: { light: boolean }) {
  const c = light ? '#0a0e10' : '#f4f5f3'
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden className="translate-y-[4px]">
      <path d="M1 7h32l-7 8H8z" fill="none" stroke={c} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M17 15v6" stroke={c} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}
