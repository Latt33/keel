import { Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { LINKS, REGIONS, loadColor, loadHex } from './mapping'

const BRAIN_HEIGHT = 2.1

function Brain({ health }: { health: React.MutableRefObject<number[]> }) {
  const { scene } = useGLTF('/brain.glb')
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#9cc3d8', emissive: new THREE.Color('#2b5876'), emissiveIntensity: 0.25,
    transparent: true, opacity: 0.2, roughness: 0.35, metalness: 0, depthWrite: false, side: THREE.DoubleSide,
  }), [])
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) { m.material = mat; m.renderOrder = -1 }
    })
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)
    const k = BRAIN_HEIGHT / Math.max(size.y, 1e-3)
    const g = new THREE.Group()
    root.position.sub(center)
    g.add(root)
    g.scale.setScalar(k)
    return g
  }, [scene, mat])
  useFrame(() => {
    // the whole brain warms slightly when the network is under strain
    const tint = health.current.reduce((a, b) => a + b, 0) / health.current.length
    const c = new THREE.Color('#2b5876').lerp(new THREE.Color('#6a2f3a'), tint * 0.8)
    mat.emissive.lerp(c, 0.08)
  })
  return <primitive object={model} />
}
useGLTF.preload('/brain.glb')

type V3 = [number, number, number]
const pos = (k: string) => new THREE.Vector3(...(REGIONS.find((r) => r.key === k)!.pos as V3))

function Link({ a, b, health }: { a: string; b: string; health: React.MutableRefObject<number[]> }) {
  const ia = REGIONS.findIndex((r) => r.key === a)
  const ib = REGIONS.findIndex((r) => r.key === b)
  const curve = useMemo(() => {
    const A = pos(a), B = pos(b)
    const mid = A.clone().add(B).multiplyScalar(0.5)
    mid.add(mid.clone().normalize().multiplyScalar(0.25)).add(new THREE.Vector3(0, 0.12, 0))
    return new THREE.QuadraticBezierCurve3(A, mid, B)
  }, [a, b])
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 40, 0.008, 6, false), [curve])
  const matRef = useRef<THREE.MeshBasicMaterial>(null)
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const N = 4
  useFrame((st) => {
    const l = (health.current[ia] + health.current[ib]) / 2
    if (matRef.current) {
      matRef.current.color.copy(loadColor(l))
      matRef.current.opacity = 0.18 + 0.4 * (1 - l)
    }
    const speed = 0.12 + 0.25 * (1 - l)
    for (let i = 0; i < N; i++) {
      const d = dots.current[i]
      if (!d) continue
      const t = (st.clock.elapsedTime * speed + i / N) % 1
      d.position.copy(curve.getPoint(t))
      ;(d.material as THREE.MeshBasicMaterial).color.copy(loadColor(l))
      ;(d.material as THREE.MeshBasicMaterial).opacity = (1 - l) * 0.9 + 0.1
    }
  })
  return (
    <group>
      <mesh geometry={tube}><meshBasicMaterial ref={matRef} transparent toneMapped={false} depthWrite={false} /></mesh>
      {Array.from({ length: N }).map((_, i) => (
        <mesh key={i} ref={(el) => { dots.current[i] = el }}>
          <sphereGeometry args={[0.018, 8, 8]} />
          <meshBasicMaterial transparent toneMapped={false} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Node({ i, health }: { i: number; health: React.MutableRefObject<number[]> }) {
  const r = REGIONS[i]
  const core = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  useFrame((st) => {
    const l = health.current[i]
    const c = loadColor(l)
    const wob = 1 + Math.sin(st.clock.elapsedTime * (1.5 + 4 * l) + i) * (0.04 + 0.12 * l)
    if (core.current) {
      core.current.scale.setScalar((0.04 + 0.035 * l) * wob)
      ;(core.current.material as THREE.MeshBasicMaterial).color.copy(c)
    }
    if (halo.current) {
      halo.current.scale.setScalar((0.075 + 0.075 * l) * wob)
      ;(halo.current.material as THREE.MeshBasicMaterial).color.copy(c)
      ;(halo.current.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.16 * l
    }
  })
  return (
    <group position={r.pos as V3}>
      <mesh ref={core}><sphereGeometry args={[1, 24, 24]} /><meshBasicMaterial toneMapped={false} /></mesh>
      <mesh ref={halo}><sphereGeometry args={[1, 24, 24]} /><meshBasicMaterial transparent depthWrite={false} toneMapped={false} /></mesh>
    </group>
  )
}

/** Figure-8 TMS coil resting over the left DLPFC, firing pulse trains when active. */
function Coil({ active }: { active: boolean }) {
  const g = useRef<THREE.Group>(null)
  const shells = useRef<(THREE.Mesh | null)[]>([])
  const mats = useRef<THREE.MeshStandardMaterial[]>([])
  const target = pos('dlpfc')
  const dir = target.clone().sub(new THREE.Vector3(0, 0.3, 0)).normalize()
  const place = target.clone().add(dir.clone().multiplyScalar(0.3))
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)
  useFrame((st, dt) => {
    if (!g.current) return
    const want = active ? 1 : 0
    const cur = g.current.scale.x
    const nxt = cur + (want - cur) * Math.min(1, dt * 4)
    g.current.scale.setScalar(Math.max(0.0001, nxt))
    g.current.visible = nxt > 0.02
    // 10 Hz trains: 4 s on, short pause (schematic of an rTMS train)
    const t = st.clock.elapsedTime
    const on = active && t % 2.2 < 1.4
    const flash = on ? 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 5) : 0
    mats.current.forEach((m) => { if (m) m.emissiveIntensity = 0.15 + 0.5 * flash })
    shells.current.forEach((s, i) => {
      if (!s) return
      const ph = (t * 1.6 + i / 3) % 1
      const k = on ? ph : 0
      s.position.set(0, 0, -0.4 * k)
      s.scale.setScalar(0.1 + 0.16 * k)
      ;(s.material as THREE.MeshBasicMaterial).opacity = on ? (1 - ph) * 0.35 : 0
    })
  })
  return (
    <group position={place} quaternion={quat}>
      <group ref={g} scale={0.0001}>
        {[-0.128, 0.128].map((x, i) => (
          <mesh key={x} position={[x, 0, 0]}>
            <torusGeometry args={[0.12, 0.026, 16, 48]} />
            <meshStandardMaterial ref={(m) => { if (m) mats.current[i] = m }} color="#c9a764" emissive="#d9b878" emissiveIntensity={0.15} metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0, 0.0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.022, 0.022, 0.12, 12]} />
          <meshStandardMaterial color="#5c6b78" metalness={0.5} roughness={0.5} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(el) => { shells.current[i] = el }}>
            <ringGeometry args={[0.9, 1, 48]} />
            <meshBasicMaterial color="#f3e2b8" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  )
}

type Els = React.MutableRefObject<(HTMLDivElement | null)[]>

/** Projects each region to screen space every frame and moves the HTML label there. */
function LabelProjector({ els, health }: { els: Els; health: React.MutableRefObject<number[]> }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    REGIONS.forEach((r, i) => {
      const el = els.current[i]
      if (!el) return
      v.set(r.pos[0], r.pos[1] - 0.3 + (r.below ? -0.1 : 0.12), r.pos[2]).project(camera)
      const x = (v.x * 0.5 + 0.5) * size.width
      const y = (-v.y * 0.5 + 0.5) * size.height
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, ${r.below ? '0%' : '-100%'})`
      el.style.opacity = v.z < 1 ? '1' : '0'
      const dot = el.firstElementChild as HTMLElement | null
      if (dot) dot.style.background = loadHex(health.current[i])
    })
  })
  return null
}

function Rig({ s, coil, labels, autoRotate, labelEls }: { s: number[]; coil: boolean; labels: boolean; autoRotate: boolean; labelEls: Els }) {
  const health = useRef<number[]>(REGIONS.map((r) => r.load(s)))
  const target = useRef<number[]>(health.current)
  target.current = REGIONS.map((r) => r.load(s))
  useFrame((_, dt) => {
    const k = Math.min(1, dt * 3)
    health.current = health.current.map((h, i) => h + (target.current[i] - h) * k)
  })
  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[-3, 4, 4]} intensity={1.2} />
      <pointLight position={[3, -2, -3]} intensity={0.6} color="#7fb2ff" />
      <group position={[0, -0.3, 0]}>
        <Suspense fallback={null}><Brain health={health} /></Suspense>
        {LINKS.map(([a, b]) => <Link key={a + b} a={a} b={b} health={health} />)}
        {REGIONS.map((_, i) => <Node key={i} i={i} health={health} />)}
        {labels && <LabelProjector els={labelEls} health={health} />}
        <Coil active={coil} />
        {location.search.includes("axes") && <axesHelper args={[1.5]} />}
      </group>
      <OrbitControls target={[0, -0.05, 0]} enablePan={false} minDistance={2.6} maxDistance={6} autoRotate={autoRotate} autoRotateSpeed={0.35} enableDamping />
    </>
  )
}

export default function BrainScene({ s, coil = false, labels = true, autoRotate = true, camera = [-2.7, 0.6, 2.05] }: {
  s: number[]; coil?: boolean; labels?: boolean; autoRotate?: boolean; camera?: [number, number, number]
}) {
  const labelEls = useRef<(HTMLDivElement | null)[]>([])
  return (
    <div className="relative h-full w-full">
      <Canvas camera={{ position: camera, fov: 40 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <Rig s={s} coil={coil} labels={labels} autoRotate={autoRotate} labelEls={labelEls} />
      </Canvas>
      {labels && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {REGIONS.map((r, i) => (
            <div key={r.key} ref={(el) => { labelEls.current[i] = el }}
              className="absolute left-0 top-0 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-sea/70 px-2 py-0.5 text-[11px] leading-tight text-foam backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 rounded-full" />
              <span className="font-medium">{r.plain}</span>
              <span className="text-mist">{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
