/**
 * Schematic mapping from the model's 5 symptom dimensions to 5 brain regions that the
 * depression and TMS literature ties to them. This is NOT a measurement: nothing here is
 * imaged. It is a way to show the model's inferred state on the anatomy clinicians use.
 *
 * symptoms s = [mood, interest, sleep, energy, anxiety], each 0 (none) .. 3 (nearly every day)
 *
 *   left DLPFC       drive and focus; under-active in depression; the rTMS target
 *   subgenual ACC    low mood; over-active in depression, anti-correlated with DLPFC
 *   default mode     rumination (posterior cingulate hub)
 *   amygdala         threat and worry
 *   hypothalamus     sleep and body clock
 */
import * as THREE from 'three'

export interface Region {
  key: string; name: string; plain: string; pos: [number, number, number]; below?: boolean
  load: (s: number[]) => number           // 0 = settled, 1 = strongly dysregulated
}

const c01 = (x: number) => Math.max(0, Math.min(1, x))
// rescale so remission (~0.6 per item) reads as settled and a relapse (~2) as dysregulated
const norm = (x: number) => c01((x - 0.75) / 1.4)

// positions in the scene's brain space (x: right, y: up, z: front), tuned to brain.glb
export const REGIONS: Region[] = [
  { key: 'dlpfc', name: 'Left DLPFC', plain: 'Drive & focus', pos: [-0.6, 0.6, 0.55], load: (s) => norm((s[1] + s[3]) / 2) },
  { key: 'sgacc', name: 'Subgenual ACC', plain: 'Low mood', pos: [-0.05, 0.22, 0.55], load: (s) => norm(s[0]) },
  { key: 'dmn', name: 'Default mode', plain: 'Rumination', pos: [-0.05, 0.62, -0.7], load: (s) => norm((s[0] + s[4]) / 2) },
  { key: 'amyg', name: 'Amygdala', plain: 'Worry', below: true, pos: [-0.42, -0.06, 0.22], load: (s) => norm(s[4]) },
  { key: 'hypo', name: 'Hypothalamus', plain: 'Sleep & body clock', below: true, pos: [0.0, -0.02, 0.05], load: (s) => norm(s[2]) },
]

export const LINKS: [string, string][] = [
  ['dlpfc', 'sgacc'], ['dlpfc', 'amyg'], ['sgacc', 'dmn'], ['sgacc', 'amyg'], ['amyg', 'hypo'], ['dmn', 'dlpfc'],
]

const CALM = new THREE.Color('#62c2a6')
const SQUALL = new THREE.Color('#f0b24a')
const STORM = new THREE.Color('#ef6a5b')
export function loadColor(x: number): THREE.Color {
  const c = new THREE.Color()
  if (x < 0.5) c.copy(CALM).lerp(SQUALL, x / 0.5)
  else c.copy(SQUALL).lerp(STORM, (x - 0.5) / 0.5)
  return c
}
export const loadHex = (x: number) => '#' + loadColor(x).getHexString()
