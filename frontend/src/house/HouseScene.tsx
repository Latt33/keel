/**
 * Aino's day, as a little house seen from above. Time runs as a sun and moon circling the house;
 * what she does at each hour follows the model's state for that day: sleep, getting up, morning
 * light outside, the sofa, the TMS clinic, the evening check-in on her phone.
 * Nothing here is measured directly: it is the model's state, told as a routine.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

export interface HouseInput {
  s: number[]            // symptom dims 0..3
  day: number            // story day (float)
  atClinic: boolean      // TMS session or booster day
  phone: boolean         // Keel is running (evening check-in)
  plan: string[]         // doses planned today
}

export interface Activity { clock: string; what: string }

const c01 = (x: number) => Math.max(0, Math.min(1, x))
const load = (s: number[]) => c01(((s[0] + s[1] + s[3]) / 3 - 0.75) / 1.4)
const sleepLoad = (s: number[]) => c01((s[2] - 0.75) / 1.4)
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

type Pose = 'stand' | 'sit' | 'lie'
interface Spot { p: [number, number, number]; pose: Pose; face: number; out?: boolean; away?: boolean }
const SPOT: Record<string, Spot> = {
  bed: { p: [-1.55, 0.6, -1.2], pose: 'lie', face: 0 },
  bedEdge: { p: [-1.75, 0.08, -0.45], pose: 'sit', face: 0 },
  sofa: { p: [1.4, 0.1, -1.38], pose: 'sit', face: 0 },
  kitchen: { p: [2.05, 0, 0.35], pose: 'stand', face: Math.PI / 2 },
  window: { p: [-0.5, 0, -1.55], pose: 'stand', face: Math.PI },
  garden: { p: [0.4, 0, 3.4], pose: 'stand', face: 0, out: true },
  away: { p: [4.7, 0, 4.85], pose: 'stand', face: 0, out: true, away: true },
}
// walking routes: rooms are joined only at the open end of the divider wall (z > -0.5) and the door
const V = (x: number, z: number) => new THREE.Vector3(x, 0, z)
type Room = 0 | 1 | 2   // bedroom, living room + kitchen, outside
const roomOf = (v: THREE.Vector3): Room =>
  v.x < 3 && v.x > -3.1 && v.z < 2.1 && v.z > -2.1 ? (v.x < 0.05 ? 0 : 1) : 2
/** The next point to walk to: straight to the target in the same room, otherwise toward the opening. */
function nextGoal(pos: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  const a = roomOf(pos), b = roomOf(target)
  if (a === b) return target
  if (a === 0) return pos.z < -0.25 ? V(-0.6, 0.05) : V(0.7, 0.05)        // out of the bedroom, round the wall end
  if (a === 1 && b === 0) return pos.z < -0.25 ? V(0.7, 0.05) : V(-0.6, 0.05)
  if (a === 1) return pos.x < 2.2 && pos.z < 1.35 ? V(1.95, 1.55) : V(3.5, 2.55)  // round the counter, out the door
  const porch = pos.distanceTo(V(3.5, 2.55)) < 0.6 || (pos.x > 2.3 && pos.z < 2.6)
  return porch ? V(2.35, 1.6) : V(3.5, 2.55)                               // back to the door, then in
}
const GARDEN_LOOP = [[-1.2, 3.2], [1.6, 3.6], [2.2, 4.6], [-0.4, 4.9], [-2.4, 4.0]]

function plan(tod: number, inp: HouseInput, dayN: number): { spot: string; what: string; lamp: boolean; phone: boolean } {
  const L = load(inp.s), S = sleepLoad(inp.s)
  const h = tod * 24
  const r = hash(dayN)
  const wakesAtNight = S > 0.25 && r < 0.35 + 0.6 * S
  if (h < 6.5 || h >= 23) {
    if (wakesAtNight && h > 2.5 && h < 4.2) return { spot: 'bedEdge', what: 'Awake in the night', lamp: true, phone: false }
    return { spot: 'bed', what: 'Asleep', lamp: false, phone: false }
  }
  const late = L > 0.55
  if (h < 8.5) {
    if (late && h < 8) return { spot: 'bed', what: 'Still in bed', lamp: false, phone: false }
    if (inp.atClinic) return { spot: 'kitchen', what: 'Breakfast before the clinic', lamp: false, phone: false }
    if (inp.plan.includes('light')) return { spot: 'garden', what: 'Morning light outside', lamp: false, phone: false }
    return { spot: 'kitchen', what: 'Breakfast', lamp: false, phone: false }
  }
  if (h < 15.5) {
    if (inp.atClinic) return { spot: 'away', what: 'At the TMS clinic', lamp: false, phone: false }
    if (L > 0.7) return { spot: h < 12 ? 'bed' : 'sofa', what: h < 12 ? 'Back in bed' : 'On the sofa, curtains drawn', lamp: false, phone: false }
    if (inp.plan.includes('walk') && h > 11 && h < 13) return { spot: 'garden', what: 'A brisk walk', lamp: false, phone: false }
    if (L < 0.4) return { spot: h < 12 ? 'window' : 'kitchen', what: 'Getting on with the day', lamp: false, phone: false }
    return { spot: 'sofa', what: 'A slow day', lamp: false, phone: false }
  }
  if (h < 18.5) {
    if (inp.plan.includes('walk') && L < 0.7) return { spot: 'garden', what: 'Out for a walk', lamp: false, phone: false }
    return { spot: L > 0.6 ? 'sofa' : 'kitchen', what: L > 0.6 ? 'On the sofa' : 'Cooking', lamp: false, phone: false }
  }
  if (inp.phone && h >= 19 && h < 19.6) return { spot: 'sofa', what: 'Three quick questions on her phone', lamp: true, phone: true }
  if (inp.plan.includes('social') && h >= 19.6 && h < 20.6) return { spot: 'sofa', what: 'Calling a friend', lamp: true, phone: true }
  return { spot: 'sofa', what: 'Evening', lamp: true, phone: false }
}

const clockOf = (tod: number) => {
  const m = Math.floor(tod * 24 * 60) % (24 * 60)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor((m % 60) / 30) * 30).padStart(2, '0')}`
}

const SKY_NIGHT = new THREE.Color('#0d1418'), SKY_DAY = new THREE.Color('#2b404b'), SKY_DUSK = new THREE.Color('#47372d')
// the sun and moon travel a circle that faces the camera, set behind the island
const CAM = new THREE.Vector3(9, 8.5, 11)
const LOOK = new THREE.Vector3(0.3, 0.4, 0.9)
const CDIR = CAM.clone().sub(LOOK).normalize()
const RIGHT = new THREE.Vector3(0, 1, 0).cross(CDIR).normalize()
const UPS = CDIR.clone().cross(RIGHT).normalize()
const ORBIT_C = LOOK.clone().addScaledVector(CDIR, -12).addScaledVector(UPS, 0.1)
const ORBIT_R = 5.7
const SKY_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), CDIR)

function World({ inp, onActivity }: { inp: HouseInput; onActivity?: (a: Activity) => void }) {
  const { scene, size, camera } = useThree()
  const tod = useRef(0.3)
  const prevDay = useRef(inp.day)
  const inpRef = useRef(inp); inpRef.current = inp
  const sun = useRef<THREE.Mesh>(null!), moon = useRef<THREE.Mesh>(null!)
  const sunLight = useRef<THREE.DirectionalLight>(null!), amb = useRef<THREE.HemisphereLight>(null!)
  const lamp = useRef<THREE.PointLight>(null!), room = useRef<THREE.PointLight>(null!)
  const who = useRef<THREE.Group>(null!), body = useRef<THREE.Group>(null!), head = useRef<THREE.Mesh>(null!)
  const aura = useRef<THREE.Mesh>(null!), phone = useRef<THREE.Mesh>(null!), stars = useRef<THREE.Points>(null!)
  const win = useRef<THREE.MeshStandardMaterial>(null!)
  const sky = useRef<THREE.Mesh>(null!)
  const lastWhat = useRef('')
  const lastEmit = useRef(0)
  const pos = useRef(new THREE.Vector3(...SPOT.bed.p))
  const loopI = useRef(0)

  void scene
  const ortho = camera as THREE.OrthographicCamera
  ortho.zoom = Math.min(size.width / 14, size.height / 14.6)
  ortho.updateProjectionMatrix()

  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry(); const a: number[] = []
    for (let i = 0; i < 140; i++) {
      const r = Math.sqrt(Math.random()) * (ORBIT_R + 0.6), th = Math.random() * Math.PI * 2
      a.push(Math.cos(th) * r, Math.sin(th) * r, 0)
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); return g
  }, [])

  useFrame((_, dt0) => {
    const dt = Math.min(dt0, 0.05)
    const i = inpRef.current
    const storyRate = Math.abs(i.day - prevDay.current) / Math.max(dt, 1e-3)
    prevDay.current = i.day
    const rate = Math.min(0.85, Math.max(1 / 16, storyRate))
    tod.current = (tod.current + dt * rate) % 1
    const t = tod.current

    // sun and moon on a tilted circle around the house
    const ang = t * Math.PI * 2 - Math.PI / 2       // noon at the top
    const c = Math.cos(ang), sn = Math.sin(ang)
    sun.current.position.copy(ORBIT_C).addScaledVector(RIGHT, c * ORBIT_R).addScaledVector(UPS, sn * ORBIT_R)
    moon.current.position.copy(ORBIT_C).addScaledVector(RIGHT, -c * ORBIT_R).addScaledVector(UPS, -sn * ORBIT_R)
    const elev = sn
    const day = c01(elev * 2.2 + 0.25)
    const dusk = c01(1 - Math.abs(elev) * 3.5) * c01(elev + 0.4)
    ;(sky.current.material as THREE.MeshBasicMaterial).color.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, dusk * 0.7)
    const up = elev > 0
    sunLight.current.position.set((up ? c : -c) * 8, Math.abs(sn) * 9 + 1.5, 6)
    sunLight.current.intensity = up ? 0.5 + 2.1 * day : 0.55
    sunLight.current.color.set(up ? (dusk > 0.3 ? '#ffd9a8' : '#fff1dc') : '#9db4d6')
    amb.current.intensity = 0.7 + 0.6 * day
    ;(stars.current.material as THREE.PointsMaterial).opacity = c01(1 - day * 1.6) * 0.85

    // what she is doing now
    const p = plan(t, i, Math.floor(i.day))
    const L = load(i.s)
    const key = p.what + clockOf(t)
    const now = performance.now()
    if (onActivity && key !== lastWhat.current && (now - lastEmit.current > 140 || !lastWhat.current.startsWith(p.what))) {
      lastWhat.current = key; lastEmit.current = now; onActivity({ clock: clockOf(t), what: p.what })
    }
    ;(sun.current.material as THREE.MeshBasicMaterial).opacity = elev > -0.15 ? 1 : 0.25
    ;(moon.current.material as THREE.MeshBasicMaterial).opacity = -elev > -0.15 ? 1 : 0.25
    lamp.current.intensity = THREE.MathUtils.lerp(lamp.current.intensity, p.lamp && p.spot.startsWith('bed') ? 2.2 : 0, 0.15)
    room.current.intensity = THREE.MathUtils.lerp(room.current.intensity, p.lamp && !p.spot.startsWith('bed') ? 3.0 * (L > 0.6 ? 0.45 : 1) : 0, 0.15)
    win.current.emissiveIntensity = 0.15 + 0.6 * day

    // walk toward the spot, through the door if crossing in/out
    const spot = SPOT[p.spot]
    let target = new THREE.Vector3(...spot.p)
    if (p.spot === 'garden') {
      const g = GARDEN_LOOP[loopI.current % GARDEN_LOOP.length]
      target = new THREE.Vector3(g[0], 0, g[1])
      if (pos.current.distanceTo(target) < 0.25) loopI.current++
    }
    const goal = nextGoal(pos.current, target)
    const speed = (1.1 + rate * 6) * (L > 0.6 ? 0.7 : 1)
    const d = goal.clone().sub(pos.current)
    const flat = new THREE.Vector3(d.x, 0, d.z)
    const moving = flat.length() > 0.06
    const pose: Pose = moving ? 'stand' : spot.pose
    if (moving) {
      // when walking, stay on the floor; sitting or lying heights blend in once arrived
      const step = Math.min(flat.length(), speed * dt)
      pos.current.add(flat.normalize().multiplyScalar(step))
      pos.current.y = THREE.MathUtils.lerp(pos.current.y, 0, 0.3)
      who.current.rotation.y = THREE.MathUtils.lerp(who.current.rotation.y, Math.atan2(d.x, d.z), 0.25)
    } else {
      pos.current.lerp(target, 0.2)
      who.current.rotation.y = THREE.MathUtils.lerp(who.current.rotation.y, spot.face, 0.15)
    }
    who.current.position.copy(pos.current)
    const farAway = pos.current.distanceTo(new THREE.Vector3(...SPOT.away.p)) < 0.6
    who.current.visible = !farAway

    // posture: lying, sitting, slumped
    const tgtRot = pose === 'lie' ? Math.PI / 2 : 0
    body.current.rotation.z = THREE.MathUtils.lerp(body.current.rotation.z, tgtRot, 0.2)
    body.current.rotation.x = THREE.MathUtils.lerp(body.current.rotation.x, pose === 'stand' ? L * 0.22 : L * 0.12, 0.1)
    body.current.position.y = moving ? Math.abs(Math.sin(performance.now() / 110)) * 0.04 : 0
    head.current.position.z = THREE.MathUtils.lerp(head.current.position.z, pose === 'lie' ? 0 : L * 0.08, 0.1)
    head.current.position.y = pose === 'sit' ? 0.9 : 0.98
    ;(aura.current.material as THREE.MeshBasicMaterial).color.copy(MOOD(L))
    aura.current.visible = pose !== 'lie'
    phone.current.visible = p.phone && !moving
    if (phone.current.visible) (phone.current.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(performance.now() / 260)
  })

  return (
    <>
      <hemisphereLight ref={amb} args={['#cfe2ff', '#1a2226', 0.6]} />
      <directionalLight ref={sunLight} castShadow position={[5, 8, 2]} shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-bias={-0.0008} />
      <mesh ref={sun}><sphereGeometry args={[0.55, 24, 24]} /><meshBasicMaterial color="#f6d58e" transparent /></mesh>
      <mesh ref={moon}><sphereGeometry args={[0.38, 24, 24]} /><meshBasicMaterial color="#e6ebf0" transparent /></mesh>
      <mesh ref={sky} position={ORBIT_C.clone().addScaledVector(CDIR, -0.5)} quaternion={SKY_Q}><circleGeometry args={[ORBIT_R + 0.9, 96]} /><meshBasicMaterial color="#0d1418" /></mesh>
      <mesh position={ORBIT_C.clone().addScaledVector(CDIR, -0.4)} quaternion={SKY_Q}><ringGeometry args={[ORBIT_R - 0.012, ORBIT_R + 0.012, 160]} /><meshBasicMaterial color="#f4f5f3" transparent opacity={0.12} /></mesh>
      <points ref={stars} geometry={starGeo} position={ORBIT_C.clone().addScaledVector(CDIR, -0.3)} quaternion={SKY_Q}><pointsMaterial color="#dfe8f0" size={0.06} transparent opacity={0.8} sizeAttenuation={false} /></points>

      {/* ground and garden */}
      <mesh position={[0, -0.37, 1.3]} receiveShadow><cylinderGeometry args={[6.2, 5.9, 0.5, 72]} /><meshStandardMaterial color="#1d3530" /></mesh>
      <mesh rotation-x={-Math.PI / 2} position={[3.75, -0.11, 3.3]} rotation-z={0.56} receiveShadow><planeGeometry args={[0.8, 3.6]} /><meshStandardMaterial color="#2c3438" /></mesh>
      <Tree p={[-4.2, 0, 2.4]} s={1.15} /><Tree p={[-3.0, 0, 4.6]} s={0.8} /><Tree p={[4.2, 0, -1.3]} s={0.95} />
      <mesh position={[-2.6, 0.18, 4.4]} castShadow><boxGeometry args={[1.1, 0.12, 0.38]} /><meshStandardMaterial color="#6b5a45" /></mesh>

      {/* the house: floor, two back walls, a divider, a window */}
      <mesh position={[0, -0.06, 0]} receiveShadow><boxGeometry args={[6.2, 0.12, 4.2]} /><meshStandardMaterial color="#b8ab90" /></mesh>
      <mesh position={[0, 1.1, -2.06]} castShadow receiveShadow><boxGeometry args={[6.2, 2.2, 0.12]} /><meshStandardMaterial color="#e6e8e4" /></mesh>
      <mesh position={[-3.06, 1.1, 0]} castShadow receiveShadow><boxGeometry args={[0.12, 2.2, 4.2]} /><meshStandardMaterial color="#d9dcd8" /></mesh>
      <mesh position={[0.05, 1.1, -1.25]} castShadow receiveShadow><boxGeometry args={[0.1, 2.2, 1.5]} /><meshStandardMaterial color="#d9dcd8" /></mesh>
      <mesh position={[-1.4, 1.35, -1.995]}><planeGeometry args={[1.1, 0.8]} /><meshStandardMaterial ref={win} color="#9fc4e8" emissive="#9fc4e8" emissiveIntensity={0.5} /></mesh>
      <mesh position={[1.6, 1.35, -1.995]}><planeGeometry args={[1.3, 0.8]} /><meshStandardMaterial color="#9fc4e8" emissive="#9fc4e8" emissiveIntensity={0.35} /></mesh>
      {/* rug */}
      <mesh rotation-x={-Math.PI / 2} position={[1.3, 0.005, -0.6]} receiveShadow><planeGeometry args={[1.8, 1.1]} /><meshStandardMaterial color="#6f8a99" /></mesh>

      {/* bedroom */}
      <mesh position={[-1.85, 0.22, -1.2]} castShadow receiveShadow><boxGeometry args={[1.7, 0.36, 1.1]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      <mesh position={[-1.7, 0.44, -1.2]} castShadow receiveShadow><boxGeometry args={[1.4, 0.1, 1.06]} /><meshStandardMaterial color="#8ab4ff" /></mesh>
      <mesh position={[-2.5, 0.48, -1.2]} castShadow><boxGeometry args={[0.32, 0.12, 0.8]} /><meshStandardMaterial color="#f4f5f3" /></mesh>
      <mesh position={[-2.78, 0.22, -0.32]} castShadow><boxGeometry args={[0.38, 0.44, 0.38]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      <mesh position={[-2.78, 0.58, -0.32]}><sphereGeometry args={[0.1, 16, 16]} /><meshStandardMaterial color="#ffe2a8" emissive="#ffd08a" emissiveIntensity={0.6} /></mesh>
      <pointLight ref={lamp} position={[-2.7, 0.9, -0.3]} color="#ffcf8a" intensity={0} distance={4} />

      {/* living room and kitchen */}
      <mesh position={[1.4, 0.22, -1.62]} castShadow receiveShadow><boxGeometry args={[1.8, 0.4, 0.7]} /><meshStandardMaterial color="#5f6d75" /></mesh>
      <mesh position={[1.4, 0.6, -1.9]} castShadow><boxGeometry args={[1.8, 0.55, 0.16]} /><meshStandardMaterial color="#5f6d75" /></mesh>
      <mesh position={[1.35, 0.2, -0.55]} castShadow><boxGeometry args={[0.8, 0.06, 0.45]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      <mesh position={[2.62, 0.45, 0.35]} castShadow receiveShadow><boxGeometry args={[0.6, 0.9, 1.7]} /><meshStandardMaterial color="#eceeec" /></mesh>
      <mesh position={[0.4, 0.5, 0.8]} castShadow><cylinderGeometry args={[0.18, 0.12, 0.45, 16]} /><meshStandardMaterial color="#8a7a63" /></mesh>
      <mesh position={[0.4, 0.9, 0.8]} castShadow><sphereGeometry args={[0.32, 16, 16]} /><meshStandardMaterial color="#2f6b57" /></mesh>
      <pointLight ref={room} position={[1.2, 1.9, -0.6]} color="#ffd59a" intensity={0} distance={6} />

      {/* Aino */}
      <group ref={who} scale={1.25}>
        <mesh ref={aura} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}><circleGeometry args={[0.34, 32]} /><meshBasicMaterial color="#6fd3b6" transparent opacity={0.45} /></mesh>
        <group ref={body}>
          <mesh position={[0, 0.45, 0]} castShadow><capsuleGeometry args={[0.16, 0.42, 6, 16]} /><meshStandardMaterial color="#f4f5f3" /></mesh>
          <mesh ref={head} position={[0, 0.98, 0]} castShadow><sphereGeometry args={[0.15, 20, 20]} /><meshStandardMaterial color="#e9c9a8" /></mesh>
          <mesh ref={phone} position={[0.0, 0.72, 0.24]}><boxGeometry args={[0.13, 0.2, 0.02]} /><meshBasicMaterial color="#6fd3b6" transparent /></mesh>
        </group>
      </group>
    </>
  )
}

const C_CALM = new THREE.Color('#6fd3b6'), C_SQ = new THREE.Color('#e8b75e'), C_ST = new THREE.Color('#ff6f61')
const MOOD = (L: number) => (L < 0.5 ? C_CALM.clone().lerp(C_SQ, L / 0.5) : C_SQ.clone().lerp(C_ST, (L - 0.5) / 0.5))

function Tree({ p, s }: { p: [number, number, number]; s: number }) {
  return (
    <group position={p} scale={s}>
      <mesh position={[0, 0.5, 0]} castShadow><cylinderGeometry args={[0.09, 0.13, 1, 8]} /><meshStandardMaterial color="#4b3b2c" /></mesh>
      <mesh position={[0, 1.35, 0]} castShadow><coneGeometry args={[0.6, 1.4, 10]} /><meshStandardMaterial color="#2f6b57" /></mesh>
    </group>
  )
}

export default function HouseScene({ inp, onActivity }: { inp: HouseInput; onActivity?: (a: Activity) => void }) {
  return (
    <Canvas orthographic shadows dpr={[1, 2]} gl={{ alpha: true, antialias: true }} camera={{ position: [9, 8.5, 11], zoom: 60, near: -50, far: 100 }}
      onCreated={({ camera }) => camera.lookAt(LOOK)}>
      <World inp={inp} onActivity={onActivity} />
    </Canvas>
  )
}
