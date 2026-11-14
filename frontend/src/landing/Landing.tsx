import { useCallback, useEffect, useState } from 'react'
import BrainScene from '../brain/BrainScene'

const LOW = [2.3, 2.1, 2.2, 2.2, 1.9]
const WELL = [0.4, 0.4, 0.5, 0.45, 0.4]

/** The front door: one brain that settles after treatment, one line, one way in. */
export default function Landing() {
  const [s, setS] = useState(LOW)
  const [coil, setCoil] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  // the treatment plays once the brain is on screen, however long it took to load
  useEffect(() => {
    if (!ready) return
    const a = setTimeout(() => setCoil(true), 900)
    const b = setTimeout(() => setS(WELL), 2000)
    const c = setTimeout(() => setCoil(false), 4800)
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [ready])
  const enter = () => { setLeaving(true); setTimeout(() => { location.hash = '#/story' }, 450) }
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'ArrowRight') enter() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <div className={`relative h-full overflow-hidden bg-sea text-foam transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <BrainScene s={s} coil={coil} labels={false} autoRotate camera={[-3.5, 0.7, 2.9]} ease={0.7} onReady={onReady} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-sea via-sea/80 to-transparent" />
      <div className="relative flex h-full flex-col justify-end px-6 pb-12 sm:px-14 sm:pb-14">
        <h1 className="land-1 max-w-[16ch] font-serif text-[clamp(2.6rem,6vw,5.6rem)] leading-[0.98]">Staying well after TMS.</h1>
        <p className="land-2 mt-5 max-w-[34rem] text-[17px] leading-relaxed text-mist">
          A ring, three short questions a day, and a care team that hears early when things start to slip.
        </p>
        <div className="land-3 mt-9 flex items-center gap-5 sm:gap-6">
          <button onClick={enter} className="pointer-events-auto whitespace-nowrap rounded-full bg-foam px-6 py-3.5 text-[16px] sm:px-8 tracking-[-0.03em] text-sea transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-calm">
            Follow Aino’s six months
          </button>
          <a href="#/proof" className="pointer-events-auto whitespace-nowrap text-[15px] text-mist underline-offset-[6px] hover:text-foam hover:underline">How we know</a>
        </div>
      </div>
      <div className="land-1 absolute left-8 top-6 flex items-baseline gap-2 sm:left-14">
        <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden className="translate-y-[4px]">
          <path d="M1 7h32l-7 8H8z" fill="none" stroke="#f4f5f3" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M17 15v6" stroke="#f4f5f3" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span className="text-[19px] leading-none tracking-[-0.02em]">Keel</span>
      </div>
      <div className="absolute bottom-4 right-6 hidden text-[11px] text-mist/40 sm:block">Brain: MNI ICBM152 template</div>
    </div>
  )
}
