import { useEffect, useState } from 'react'
import { api, type Story } from './api'
import StoryPage from './story/StoryPage'
import PhonePage from './phone/PhonePage'
import ClinicPage from './clinic/ClinicPage'

type Route = 'story' | 'phone' | 'clinic'
const routeFromHash = (): Route => {
  const h = location.hash.replace('#/', '')
  return h === 'phone' || h === 'clinic' ? h : 'story'
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash())
  const [story, setStory] = useState<Story | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    const on = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => { api.story().then(setStory).catch((e) => setErr(String(e))) }, [])

  const light = route !== 'story'
  return (
    <div className={`grid h-full grid-rows-[auto_1fr] ${light ? 'bg-fog text-ink' : 'bg-sea text-foam'}`}>
      <header className={`flex items-center gap-4 px-4 py-3 sm:gap-8 sm:px-6 ${light ? 'border-b border-ink/10' : ''}`}>
        <a href="#/story" className="flex items-baseline gap-2">
          <Logo light={light} />
          <span className="font-serif text-[22px] leading-none">Keel</span>
          <span className={`hidden text-[13px] sm:inline ${light ? 'text-ink/60' : 'text-mist'}`}>staying well after TMS</span>
        </a>
        <nav className="ml-auto flex gap-1 text-[12px] sm:text-[14px]">
          {([['story', 'Aino’s story'], ['phone', 'Aino’s phone'], ['clinic', 'The clinic']] as const).map(([r, label]) => (
            <a key={r} href={`#/${r}`} aria-current={route === r ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-2.5 py-1.5 sm:px-3.5 ${route === r ? (light ? 'bg-ink text-fog' : 'bg-foam text-sea') : light ? 'text-ink/70 hover:text-ink' : 'text-mist hover:text-foam'}`}>
              {label}
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
      </main>
    </div>
  )
}

function Logo({ light }: { light: boolean }) {
  const c = light ? '#142231' : '#62c2a6'
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden className="translate-y-[3px]">
      <path d="M3 11h26l-5 9H8z" fill={c} />
      <path d="M16 20v9" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
