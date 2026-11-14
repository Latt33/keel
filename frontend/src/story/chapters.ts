import type { Story } from '../api'

export interface Chapter {
  id: string; start: number; end: number; world: 'keel' | 'none'
  title: string; line: string; coil?: boolean
}

export function chaptersFor(st: Story): Chapter[] {
  const e = st.events
  const p = st.profile
  const life = e.life_event.find((d) => d > 20) ?? 53
  const alert = e.alert ?? life + 6
  const b0 = e.booster[0] ?? alert + 3
  const b1 = e.booster[e.booster.length - 1] ?? b0 + 4
  const found = e.found_without ?? 90
  const lead = (e.relapse_without ?? found) - alert
  return [
    { id: 'before', start: -42, end: -42, world: 'keel', title: `${p.name} has been depressed for most of two years.`,
      line: 'Two antidepressants did not help enough. Her psychiatrist refers her for TMS.' },
    { id: 'tms', start: -42, end: -1, world: 'keel', coil: true, title: 'Six weeks of TMS lift the weight.',
      line: 'Magnetic pulses over the left prefrontal cortex, every weekday. Drive comes back, the low mood quiets down.' },
    { id: 'home', start: 0, end: 14, world: 'keel', title: 'Then the daily visits end.',
      line: 'About half of people who recover with TMS relapse within a year. Aino goes home with a smart ring and a one-minute check-in.' },
    { id: 'learn', start: 14, end: life - 3, world: 'keel', title: 'Keel learns what keeps her well.',
      line: 'Each morning it suggests one or two small things. Each day it checks what actually moved her mood.' },
    { id: 'storm', start: life - 3, end: alert - 1, world: 'keel', title: 'A hard week. Her body notices first.',
      line: 'Her sleep slips and her days flatten out. She still says she feels fine.' },
    { id: 'warning', start: alert - 1, end: b0 - 1, world: 'keel', title: `Keel sees the relapse coming ${lead} days early.`,
      line: 'Her plan steps up, and her clinic gets her name at the top of this week’s call list, with the reasons.' },
    { id: 'booster', start: b0 - 1, end: b1 + 10, world: 'keel', coil: true, title: 'Five booster sessions, booked before a crisis.',
      line: 'A short TMS block, timed by the forecast instead of a fixed calendar.' },
    { id: 'without', start: b1 + 10, end: found + 2, world: 'none', title: 'Without Keel, the same week becomes a relapse.',
      line: `Nobody sees it until her 3-month visit on day ${found}. By then she has been sliding for weeks.` },
    { id: 'well', start: found + 2, end: 179, world: 'keel', title: 'Six months on, Aino is still well.',
      line: 'The same loop, run for 300 simulated patients calibrated to published TMS relapse rates:' },
  ]
}

export const chapterAt = (chs: Chapter[], day: number) => {
  let idx = 0
  chs.forEach((c, i) => { if (day >= c.start) idx = i })
  // the first chapter is a single moment; once time moves we are in the TMS chapter
  if (idx === 0 && day > -42) idx = 1
  return idx
}
