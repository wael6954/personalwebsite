import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'

// ---------------------------------------------------------------------------
// Wael Halabi, Transit World (scrollytelling portfolio)
//   Lands in a slow auto-orbit (Aerial view available only here). The first
//   scroll wakes the streetcar and hands off to a damped, section-based tour:
//   scrolling reads the current panel, and only past the panel's end does it
//   ease to the next sign. About / Projects / Experience / Resume, then a high
//   Contact overview of the whole city with the name in the sky.
// ---------------------------------------------------------------------------

const RING_R = 17
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
const isMobile = matchMedia('(max-width: 720px)').matches

// no WebGL -> hand off to the plain HTML version
function webglOK() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch (e) { return false }
}
if (!webglOK()) location.replace('./simple.html')

const app = document.getElementById('app')
const loadingEl = document.getElementById('loading')
const loadPctEl = document.getElementById('load-pct')
const loadFillEl = document.getElementById('load-fill')
const hintEl = document.getElementById('hint')
const aerialBtn = document.getElementById('aerial-btn')
const navEl = document.getElementById('nav')
const panels = [...document.querySelectorAll('.panel')]

// ---------------------------------------------------------------------------
// Sound: everything is synthesized with WebAudio (no audio files). A soft wind
// ambience loops in the background; the streetcar dings; trees pop. The mute
// state persists in localStorage. Audio can only start after a user gesture.
// ---------------------------------------------------------------------------
const muteBtn = document.getElementById('mute-btn')
let audioCtx = null, masterGain = null
let muted = localStorage.getItem('tw-muted') === '1'
function syncMuteUI() {
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔇' : '🔊'
    muteBtn.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound')
  }
  if (masterGain) masterGain.gain.value = muted ? 0 : 1
}
function initAudio() {
  if (audioCtx) return
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  audioCtx = new AC()
  masterGain = audioCtx.createGain()
  masterGain.gain.value = muted ? 0 : 1
  masterGain.connect(audioCtx.destination)
  // wind: looped noise through a slowly wandering lowpass, very quiet
  const len = audioCtx.sampleRate * 3
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = audioCtx.createBufferSource(); src.buffer = buf; src.loop = true
  const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.4
  const g = audioCtx.createGain(); g.gain.value = 0.02
  const lfo = audioCtx.createOscillator(); lfo.frequency.value = 0.07
  const lfoG = audioCtx.createGain(); lfoG.gain.value = 120
  lfo.connect(lfoG); lfoG.connect(lp.frequency)
  src.connect(lp); lp.connect(g); g.connect(masterGain)
  src.start(); lfo.start()
  syncMuteUI()
}
function strike(freq, when, vol) {
  const t0 = audioCtx.currentTime + when
  for (const [f, v] of [[freq, 1], [freq * 2.76, 0.4], [freq * 5.4, 0.12]]) {
    const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(vol * v, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.7)
    o.connect(g); g.connect(masterGain); o.start(t0); o.stop(t0 + 0.75)
  }
}
function bellSfx() { initAudio(); if (!audioCtx) return; strike(1244, 0, 0.12); strike(1244, 0.17, 0.10) }
// deep church-bell toll: low fundamental, long inharmonic tail, struck twice
function bellToll(freq, when, vol) {
  const t0 = audioCtx.currentTime + when
  for (const [f, v, dec] of [[freq, 1, 2.6], [freq * 2.76, 0.5, 1.8], [freq * 5.4, 0.16, 1.0]]) {
    const o = audioCtx.createOscillator(); o.type = 'sine'; o.frequency.value = f
    const g = audioCtx.createGain()
    g.gain.setValueAtTime(vol * v, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec)
    o.connect(g); g.connect(masterGain); o.start(t0); o.stop(t0 + dec + 0.05)
  }
}
function churchSfx() { initAudio(); if (!audioCtx) return; bellToll(185, 0, 0.16); bellToll(185, 1.1, 0.12) }
// watery splash: short bandpassed noise burst with a fast decay
function splashSfx() {
  initAudio(); if (!audioCtx) return
  const t0 = audioCtx.currentTime, dur = 0.5
  const n = Math.floor(audioCtx.sampleRate * dur)
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2)
  const src = audioCtx.createBufferSource(); src.buffer = buf
  const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.7
  const g = audioCtx.createGain(); g.gain.value = 0.2
  src.connect(bp); bp.connect(g); g.connect(masterGain); src.start(t0)
}
function popSfx() {
  initAudio(); if (!audioCtx) return
  const t0 = audioCtx.currentTime
  const o = audioCtx.createOscillator(); o.type = 'triangle'
  o.frequency.setValueAtTime(420, t0)
  o.frequency.exponentialRampToValueAtTime(130, t0 + 0.14)
  const g = audioCtx.createGain()
  g.gain.setValueAtTime(0.12, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
  o.connect(g); g.connect(masterGain); o.start(t0); o.stop(t0 + 0.18)
}
if (muteBtn) muteBtn.addEventListener('click', () => {
  muted = !muted
  localStorage.setItem('tw-muted', muted ? '1' : '0')
  initAudio(); syncMuteUI()
})
addEventListener('pointerdown', initAudio, { once: true })
syncMuteUI()

// --- Résumé PDF viewer modal (opened from the Résumé panel) ---
const viewResumeBtn = document.getElementById('view-resume')
const pdfModal = document.getElementById('pdf-modal')
const pdfFrame = document.getElementById('pdf-frame')
const pdfClose = document.getElementById('pdf-close')
const pdfOpen = () => !!pdfModal && !pdfModal.classList.contains('gone')
function openPdf() {
  if (pdfFrame && !pdfFrame.getAttribute('src')) pdfFrame.setAttribute('src', './Wael_Halabi_Resume.pdf')
  if (pdfModal) pdfModal.classList.remove('gone')
}
function closePdf() { if (pdfModal) pdfModal.classList.add('gone') }
if (viewResumeBtn) viewResumeBtn.addEventListener('click', openPdf)
if (pdfClose) pdfClose.addEventListener('click', closePdf)
if (pdfModal) pdfModal.querySelector('.pdf-backdrop').addEventListener('click', closePdf)

// --- Renderer ---
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
app.appendChild(renderer.domElement)

// --- Scene + sky ---
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xbfe3f2)
scene.fog = new THREE.Fog(0xbfe3f2, 55, 160)

// --- Camera ---
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 500)

// --- Lighting ---
const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x6b7a5a, 0.85)
scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff0d6, 2.1)
sun.position.set(28, 44, 18)
sun.castShadow = true
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048)
const s = 46
sun.shadow.camera.left = -s; sun.shadow.camera.right = s
sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s
sun.shadow.camera.near = 1; sun.shadow.camera.far = 150
sun.shadow.bias = -0.0004
scene.add(sun)
const ambient = new THREE.AmbientLight(0xffffff, 0.25)
scene.add(ambient)

// ---------------------------------------------------------------------------
// Day / night. `theme` eases 0 (day) -> 1 (night). At night the sky turns
// indigo, stars + a moon fade in, the sun dims to cool moonlight, and building
// windows + streetlamps glow warm. Preference persists in localStorage.
// ---------------------------------------------------------------------------
const dayBtn = document.getElementById('day-btn')
let themeTarget = localStorage.getItem('tw-night') === '1' ? 1 : 0
let theme = themeTarget
const DAY_SKY = new THREE.Color(0xbfe3f2), NIGHT_SKY = new THREE.Color(0x141a33)
const DAY_SUN = new THREE.Color(0xfff0d6), MOON_COL = new THREE.Color(0x8093c0)
const DAY_HEMI_SKY = new THREE.Color(0xcfe8ff), NIGHT_HEMI_SKY = new THREE.Color(0x2a3560)
const DAY_HEMI_GND = new THREE.Color(0x6b7a5a), NIGHT_HEMI_GND = new THREE.Color(0x20242f)
const WINDOW_GLOW = new THREE.Color(0xffcb6e), LAMP_GLOW = new THREE.Color(0xffe0a0)
const windowMats = new Set(), lampMats = new Set()
const lampLights = [], _lb = new THREE.Vector3()
let stars = null, moon = null, fountLight = null
const lerp = (a, b, k) => a + (b - a) * k

function buildNightObjects() {
  // starfield: points scattered on a high dome, fade in with theme
  const SC = isMobile ? 380 : 700
  const sp = new Float32Array(SC * 3)
  for (let i = 0; i < SC; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.5 + 0.05  // upper dome
    const r = 190
    sp[i * 3] = Math.cos(u) * Math.cos(v * Math.PI) * r
    sp[i * 3 + 1] = Math.sin(v * Math.PI) * r * 0.9 + 12
    sp[i * 3 + 2] = Math.sin(u) * Math.cos(v * Math.PI) * r
  }
  const sg = new THREE.BufferGeometry()
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
  stars = new THREE.Points(sg, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.8, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false,
  }))
  stars.renderOrder = -1
  scene.add(stars)

  // moon: a pale glowing disc high opposite the sun
  moon = new THREE.Mesh(
    new THREE.SphereGeometry(4.2, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xf2f0e0, transparent: true, opacity: 0 })
  )
  moon.position.set(-60, 78, -70)
  scene.add(moon)
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(6.6, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0xbfd0f0, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false })
  )
  moon.add(halo); moon.userData.halo = halo

  // cool uplight in the fountain (cheap, one light)
  fountLight = new THREE.PointLight(0x6fd0f0, 0, 14, 2)
  fountLight.position.set(0, 2.2, 0)
  scene.add(fountLight)
}
buildNightObjects()

function applyTheme() {
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, theme)
  if (scene.fog) scene.fog.color.copy(scene.background)
  sun.intensity = lerp(2.1, 0.42, theme)
  sun.color.copy(DAY_SUN).lerp(MOON_COL, theme)
  hemi.intensity = lerp(0.85, 0.24, theme)
  hemi.color.copy(DAY_HEMI_SKY).lerp(NIGHT_HEMI_SKY, theme)
  hemi.groundColor.copy(DAY_HEMI_GND).lerp(NIGHT_HEMI_GND, theme)
  ambient.intensity = lerp(0.25, 0.11, theme)
  renderer.toneMappingExposure = lerp(1.05, 0.95, theme)
  for (const m of windowMats) m.emissiveIntensity = theme * 0.95
  for (const m of lampMats) m.emissiveIntensity = theme * 1.1
  for (const L of lampLights) L.intensity = theme * 1.6
  if (fountLight) fountLight.intensity = theme * 2.2
  if (stars) stars.material.opacity = theme
  if (moon) { moon.material.opacity = theme; moon.userData.halo.material.opacity = theme * 0.4 }
}

function setNight(on) {
  themeTarget = on ? 1 : 0
  localStorage.setItem('tw-night', on ? '1' : '0')
  if (dayBtn) {
    dayBtn.textContent = on ? '☀️' : '🌙'
    dayBtn.setAttribute('aria-label', on ? 'Switch to day' : 'Switch to night')
  }
}
if (dayBtn) dayBtn.addEventListener('click', () => setNight(themeTarget < 0.5))
setNight(themeTarget >= 0.5)

// ---------------------------------------------------------------------------
// Camera beats. Signs sit at Blender (+/-7.17, +/-7.17) -> three.js (x,2.4,-y).
// Stop 0 hero, 1..4 face each sign, 5 is a high city overview (name visible).
// ---------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const CENTER = V(0, 7, 0)
const HOME_LOOK = V(0, 14, 0)   // higher look target so the sky name is fully in frame

function beatForSign(sx, sz) {
  const dir = V(sx, 0, sz).normalize()
  const pos = V(dir.x * 19.5, 8.0, dir.z * 19.5)
  return { pos, look: V(sx * 0.7, 3.4, sz * 0.7) }
}

const STOPS = [
  { pos: V(0, 30, 44), look: HOME_LOOK },           // 0 hero
  beatForSign( 7.17, -7.17),                         // 1 About
  beatForSign(-7.17, -7.17),                         // 2 Projects
  beatForSign(-7.17,  7.17),                         // 3 Experience
  beatForSign( 7.17,  7.17),                         // 4 Resume
  { pos: V(23, 34, 46), look: V(0, 15, 0) },         // 5 Contact, high overview + name
]
const LABELS = ['Home', 'About', 'Projects', 'Experience', 'Résumé', 'Contact']
const N = STOPS.length
const SEG = 1 / (N - 1)
const beatG = (i) => i / (N - 1)

let posCurve = new THREE.CatmullRomCurve3(STOPS.map(s => s.pos), false, 'catmullrom', 0.4)
const lookCurve = new THREE.CatmullRomCurve3(STOPS.map(s => s.look), false, 'catmullrom', 0.4)

// The tour's first control point follows the live orbit, so leaving Home
// starts exactly where the camera is, whatever the current orbit angle.
let orbitA = Math.PI * 0.25
function rebuildHomeStart() {
  STOPS[0].pos.set(Math.sin(orbitA) * 44, 30, Math.cos(orbitA) * 44)
  posCurve = new THREE.CatmullRomCurve3(STOPS.map(s => s.pos), false, 'catmullrom', 0.4)
}

// ---------------------------------------------------------------------------
// Section-based input. targetBeat is the section we are easing toward; currentG
// smoothly follows it. Scrolling reads the active panel first; only when it is
// scrolled to its edge (or over the 3D area) does a threshold advance sections.
// ---------------------------------------------------------------------------
let currentG = 0, targetBeat = 0
let hasScrolled = false, aerial = false
let overscroll = 0, cooldownUntil = 0
const clamp01 = (v) => Math.max(0, Math.min(1, v))
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const nowMs = () => performance.now()

function firstScroll() {
  hasScrolled = true; hintEl.classList.add('gone')
  bellSfx()   // the streetcar wakes with a ding-ding
}
function setBeat(i) {
  i = Math.max(0, Math.min(N - 1, i))
  if (aerial) exitAerial()
  if (!hasScrolled && i > 0) firstScroll()
  if (i !== targetBeat) {
    if (targetBeat === 0 && i > 0 && currentG < 0.06) rebuildHomeStart()
    targetBeat = i
    panelOpen = false
    overscroll = 0
    cooldownUntil = nowMs() + 620
    const p = panels.find(p => +p.dataset.beat === i)
    if (p) p.querySelector('.panel-scroll').scrollTop = 0
  }
}
function tryAdvance(delta) {
  if (nowMs() < cooldownUntil) return
  if ((overscroll > 0) !== (delta > 0)) overscroll = 0   // reset on reversal
  overscroll += delta
  const THRESH = 150
  if (overscroll > THRESH) setBeat(targetBeat + 1)
  else if (overscroll < -THRESH) setBeat(targetBeat - 1)
}
function activeScroller() {
  const p = panels.find(p => +p.dataset.beat === targetBeat && p.classList.contains('active'))
  return p ? p.querySelector('.panel-scroll') : null
}

addEventListener('wheel', (e) => {
  if (pdfOpen()) return
  const overPanel = e.target.closest && e.target.closest('.panel')
  const sc = activeScroller()
  if (overPanel && sc) {
    const canScroll = e.deltaY > 0
      ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1
      : sc.scrollTop > 1
    if (canScroll) return          // let the panel scroll natively
  }
  e.preventDefault()
  if (aerial) exitAerial()
  tryAdvance(e.deltaY)
}, { passive: false })

// touch: drag over a panel scrolls it, drag over the world advances sections
let lastY = null, touchAcc = 0
addEventListener('touchstart', (e) => { lastY = e.touches[0].clientY; touchAcc = 0 }, { passive: true })
addEventListener('touchmove', (e) => {
  if (pdfOpen()) return
  if (lastY == null) return
  const dy = lastY - e.touches[0].clientY
  lastY = e.touches[0].clientY
  const overPanel = e.target.closest && e.target.closest('.panel')
  const sc = activeScroller()
  if (overPanel && sc) {
    const canScroll = dy > 0
      ? sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1
      : sc.scrollTop > 1
    if (canScroll) return
  }
  if (aerial) exitAerial()
  touchAcc += dy
  if (Math.abs(touchAcc) > 46) { setBeat(targetBeat + Math.sign(touchAcc)); touchAcc = 0 }
}, { passive: true })
addEventListener('touchend', () => { lastY = null })

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && pdfOpen()) { closePdf(); return }
  if (pdfOpen()) return
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setBeat(targetBeat + 1) }
  if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); setBeat(targetBeat - 1) }
  if (e.key === 'Home') setBeat(0)
  if (e.key === 'End') setBeat(N - 1)
  if (e.key === 'Escape') panelOpen = false
})

// --- Section nav dots ---
LABELS.forEach((lbl, i) => {
  const b = document.createElement('button')
  b.innerHTML = `<span class="txt">${lbl}</span><span class="dot"></span>`
  b.addEventListener('click', () => setBeat(i))
  navEl.appendChild(b)
})
const navBtns = [...navEl.children]

// --- Info button: a floating "i" above each sign opens that section's panel ---
const infoBtn = document.getElementById('info-btn')
const INFO_ANCHORS = {
  1: V( 7.17, 4.7, -7.17),   // above About sign
  2: V(-7.17, 4.7, -7.17),   // above Projects sign
  3: V(-7.17, 4.7,  7.17),   // above Experience sign
  4: V( 7.17, 4.7,  7.17),   // above Resume sign
  // 5 = Contact beat has no info button (3D contact info is shown directly)
}
let panelOpen = false
infoBtn.addEventListener('click', () => { panelOpen = true })
panels.forEach((p) => {
  const x = document.createElement('button')
  x.className = 'panel-close'
  x.setAttribute('aria-label', 'Close panel')
  x.textContent = '✕'
  x.addEventListener('click', () => { panelOpen = false })
  p.appendChild(x)
})
const _iv = new THREE.Vector3()

// --- Aerial view (top / landing only) ---
const aerialPose = { pos: V(0.01, 66, 0.01), look: V(0, 0, 0) }
const _al = V(0, 0, 0)
aerialBtn.addEventListener('click', () => { aerial ? exitAerial() : enterAerial() })
function enterAerial() { if (currentG > 0.03) return; aerial = true; aerialBtn.classList.add('active'); _al.copy(camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(10).add(camera.position)); aerialBtn.querySelector('span:first-child').textContent = '✕' }
function exitAerial() { aerial = false; aerialBtn.classList.remove('active'); aerialBtn.querySelector('span:first-child').textContent = '◳' }

// ---------------------------------------------------------------------------
// Transit-map overlay for the aerial view: the four section signs become
// labeled stations on a red loop line, with Contact as the central interchange.
// Station positions are projected from their real 3D anchors each frame, and
// clicking a station rides the tour to that section.
// ---------------------------------------------------------------------------
const svgNS = 'http://www.w3.org/2000/svg'
const tmap = document.createElementNS(svgNS, 'svg')
tmap.id = 'transit-map'; tmap.setAttribute('width', '100%'); tmap.setAttribute('height', '100%')
const tmTitle = document.createElementNS(svgNS, 'text')
tmTitle.setAttribute('class', 'tm-title'); tmTitle.setAttribute('text-anchor', 'middle')
tmTitle.textContent = 'Transit World · Route Map'; tmap.appendChild(tmTitle)
const tmSpokes = []
for (let i = 0; i < 4; i++) { const l = document.createElementNS(svgNS, 'line'); l.setAttribute('class', 'tm-spoke'); tmap.appendChild(l); tmSpokes.push(l) }
const tmLoop = document.createElementNS(svgNS, 'polyline'); tmLoop.setAttribute('class', 'tm-loop'); tmap.appendChild(tmLoop)
const STATION_ANCHORS = {
  1: V(7.17, 1.6, -7.17), 2: V(-7.17, 1.6, -7.17), 3: V(-7.17, 1.6, 7.17), 4: V(7.17, 1.6, 7.17), 5: V(0, 1.6, 0),
}
const tmStations = {}
for (const i of [1, 2, 3, 4, 5]) {
  const g = document.createElementNS(svgNS, 'g'); g.setAttribute('class', 'tm-station')
  const c = document.createElementNS(svgNS, 'circle'); c.setAttribute('class', 'tm-dot'); c.setAttribute('r', i === 5 ? 11 : 9)
  const tx = document.createElementNS(svgNS, 'text'); tx.setAttribute('class', 'tm-label'); tx.setAttribute('text-anchor', 'middle'); tx.textContent = LABELS[i]
  g.appendChild(c); g.appendChild(tx)
  g.addEventListener('click', () => { if (aerial) setBeat(i) })
  tmap.appendChild(g); tmStations[i] = { c, tx }
}
document.body.appendChild(tmap)
const _tv = new THREE.Vector3()
function projectPx(v) { _tv.copy(v).project(camera); return [(_tv.x * 0.5 + 0.5) * window.innerWidth, (-_tv.y * 0.5 + 0.5) * window.innerHeight] }
function updateTransitMap() {
  const show = aerial && camera.position.y > 48
  tmap.classList.toggle('on', show)
  if (!show) return
  const S = {}
  for (const i of [1, 2, 3, 4, 5]) {
    const [x, y] = projectPx(STATION_ANCHORS[i]); S[i] = [x, y]
    tmStations[i].c.setAttribute('cx', x); tmStations[i].c.setAttribute('cy', y)
    tmStations[i].tx.setAttribute('x', x); tmStations[i].tx.setAttribute('y', y + (i === 5 ? -18 : 26))
  }
  tmLoop.setAttribute('points', `${S[1]} ${S[2]} ${S[3]} ${S[4]} ${S[1]}`)
  for (let k = 0; k < 4; k++) {
    tmSpokes[k].setAttribute('x1', S[5][0]); tmSpokes[k].setAttribute('y1', S[5][1])
    tmSpokes[k].setAttribute('x2', S[k + 1][0]); tmSpokes[k].setAttribute('y2', S[k + 1][1])
  }
  tmTitle.setAttribute('x', window.innerWidth / 2); tmTitle.setAttribute('y', 56)
}

// --- Loaders (Draco) ---
const draco = new DRACOLoader()
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
const loader = new GLTFLoader()
loader.setDRACOLoader(draco)
const BUST = '?v=' + Date.now()
// byte-level progress across all six GLBs
const N_FILES = 6
const progressMap = {}
function trackProgress(url, e) {
  progressMap[url] = { loaded: e.loaded, total: e.total || 0 }
  let L = 0, T = 0
  for (const k in progressMap) { L += progressMap[k].loaded; T += progressMap[k].total }
  const n = Object.keys(progressMap).length
  const pct = Math.min(100, Math.round((L / Math.max(T, 1)) * 100 * (n / N_FILES)))
  if (loadPctEl) loadPctEl.textContent = pct + '%'
  if (loadFillEl) loadFillEl.style.width = pct + '%'
}
const load = (url) => new Promise((res, rej) => loader.load(url + BUST, res, (e) => trackProgress(url, e), rej))
function setShadows(root, cast = true, receive = true) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive } })
}

let tram = null, clouds = null, nameSky = null, statement = null
let statementMats = []
// fountain animation + clickable-toy state
let fountJet = null, fountJetMinY = 0
const fountSpills = [], treeMeshes = [], boings = []
const churchMeshes = [], fountMeshes = [], birdMeshes = []
let birdScatterStart = 0
let drops = null, dropData = null, tramBounceStart = 0
let smoke = null, smokeData = null, smokeUniforms = null
let leaves = null, leafData = null, leafUniforms = null
const waterTime = { value: 0 }

// Add a procedural moving sparkle to a water material without disturbing its
// lighting/shadows/day-night response — a cheap "sun glinting on ripples" look.
function makeWaterShimmer(mat, sparkleHex) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = waterTime
    shader.uniforms.uSparkle = { value: new THREE.Color(sparkleHex) }
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
    )
    shader.fragmentShader = 'uniform float uTime;\nuniform vec3 uSparkle;\nvarying vec3 vWPos;\n' +
      shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float w = sin(vWPos.x * 1.3 + uTime * 1.2) * sin(vWPos.z * 1.7 - uTime * 0.9)
                + sin(vWPos.x * 0.6 - uTime * 0.7) * sin(vWPos.z * 1.0 + uTime * 1.1);
        gl_FragColor.rgb += uSparkle * smoothstep(1.3, 1.95, w) * 0.6;`)
  }
  mat.needsUpdate = true
}
let contactGroup = null
let contactMats = []
const contactLabels = new Map()   // meshName -> { mesh, link }
const contact3dEl = document.getElementById('contact3d')
const contactLinks = contact3dEl ? [...contact3dEl.querySelectorAll('a')] : []
const _pv = new THREE.Vector3()
let tramPhi = 0, tramSpeed = 0
// tram-stop halt: eases to a stop beside TramStop (three.js (19,0,0) -> phi=π/2), dings, dwells
let tramDwell = 0, tramArmed = true
const STOP_PHI = Math.PI / 2, TAU = Math.PI * 2
// townsfolk + ducks circle the park/pond; the sailboat bobs on the sea
const duckObjs = [], pedObjs = [], duckData = [], pedData = []
const boatObjs = [], boats = []
let lastT = 0
const clock = new THREE.Clock()

async function init() {
  try {
    const [world, tramGltf, sky, nameGltf, stateGltf, contactGltf] = await Promise.all([
      load('./world.glb'), load('./tram.glb'), load('./sky.glb'), load('./name.glb'),
      load('./statement.glb'), load('./contact.glb'),
    ])
    setShadows(world.scene, true, true); scene.add(world.scene)
    clouds = sky.scene; setShadows(clouds, false, false); scene.add(clouds)
    // birds startle and scatter when the church bell tolls; remember home spots
    clouds.traverse((o) => {
      if (o.isMesh && o.name.startsWith('Bird')) {
        o.userData.base = o.position.clone()
        const r = Math.hypot(o.position.x, o.position.z) || 1
        o.userData.outX = o.position.x / r
        o.userData.outZ = o.position.z / r
        birdMeshes.push(o)
      }
    })
    tram = tramGltf.scene; setShadows(tram, true, false); scene.add(tram)
    nameSky = nameGltf.scene; nameSky.scale.setScalar(2.4); nameSky.position.set(0, 27, 0)
    setShadows(nameSky, false, false); scene.add(nameSky)
    // subtle red self-illumination so the sky text pops against any background
    const GLOW = new THREE.Color(0xb5432f)
    const GLOW_INTENSITY = 0.55
    nameSky.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        o.material.emissive = GLOW
        o.material.emissiveIntensity = GLOW_INTENSITY
      }
    })

    // 3D statement, sits below the sky name, Home-only
    statement = stateGltf.scene
    statement.scale.setScalar(2.2); statement.position.set(0, 20, 0)
    setShadows(statement, false, false); scene.add(statement)
    statement.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        o.material.transparent = true
        o.material.emissive = GLOW
        o.material.emissiveIntensity = GLOW_INTENSITY
        statementMats.push(o.material)
      }
    })

    // 3D contact info, Contact-beat only. LET'S CONNECT + 4 clickable labels.
    contactGroup = contactGltf.scene
    contactGroup.scale.setScalar(2.2); contactGroup.position.set(0, 15, 0)
    setShadows(contactGroup, false, false); scene.add(contactGroup)
    contactGroup.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone()
        o.material.transparent = true
        o.material.emissive = GLOW
        o.material.emissiveIntensity = GLOW_INTENSITY
        contactMats.push(o.material)
        if (o.name.startsWith('Contact_') && o.name !== 'Contact_Heading') {
          contactLabels.set(o.name, o)
        }
      }
    })

    // fountain animation targets + clickable trees (geometry is world-baked,
    // so bounding boxes give us world-space pivots for the animations)
    world.scene.traverse((o) => {
      if (!o.isMesh) return
      if (o.name === 'W_FountUpJet') fountJet = o
      else if (o.name.startsWith('W_FountSpill')) fountSpills.push(o)
      else if (o.name.startsWith('Tree')) treeMeshes.push(o)
      if (o.name.startsWith('CH')) churchMeshes.push(o)
      if (o.name.startsWith('W_Fount') || o.name === 'W_Pond') fountMeshes.push(o)
      if (o.name === 'W_Pond') makeWaterShimmer(o.material, 0xffffff)
      else if (o.name === 'Env_Sea') makeWaterShimmer(o.material, 0xcfe8ff)
      // night mode: warm-glow window glass + streetlamp heads
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      for (const m of mats) {
        if (!m || !m.color) continue
        const hex = m.color.getHexString()
        if (hex === '96c3cd') { m.emissive = WINDOW_GLOW.clone(); m.emissiveIntensity = 0; windowMats.add(m) }
        else if (o.name.startsWith('Lamph')) { m.emissive = LAMP_GLOW.clone(); m.emissiveIntensity = 0; lampMats.add(m) }
      }
      // a point light at each streetlamp head (desktop only, no shadows)
      if (o.name.startsWith('Lamph') && !isMobile) {
        o.geometry.computeBoundingBox()
        o.getWorldPosition(_lb)
        const bb = o.geometry.boundingBox
        const L = new THREE.PointLight(0xffd890, 0, 13, 2)
        L.position.set(_lb.x, (bb.min.y + bb.max.y) / 2 + 0.2, _lb.z)
        scene.add(L); lampLights.push(L)
      }
    })
    // ducks / pedestrians / boat export as multi-material Group nodes, so
    // collect them by name across all node types (not just meshes)
    world.scene.traverse((o) => {
      if (!o.name) return
      if (o.name.startsWith('Duck')) duckObjs.push(o)
      else if (o.name.startsWith('Ped_') && o.name !== 'Ped_Sit') pedObjs.push(o)
      else if (o.name.startsWith('Boat')) boatObjs.push(o)
    })
    if (fountJet) {
      fountJet.geometry.computeBoundingBox()
      fountJetMinY = fountJet.geometry.boundingBox.min.y
    }
    for (const sp of fountSpills) sp.geometry.computeBoundingBox()
    for (const tr of treeMeshes) tr.geometry.computeBoundingBox()

    // chimney smoke: one plume per townhouse, placed at its roof top
    scene.updateMatrixWorld(true)
    const chimMap = {}
    world.scene.traverse((o) => {
      const m = o.isMesh && o.name.match(/^TH(\d+)_roof/)
      if (!m) return
      o.geometry.computeBoundingBox()
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld)
      const e = chimMap[m[1]] || (chimMap[m[1]] = { x: 0, z: 0, y: -9, n: 0 })
      e.x += (b.min.x + b.max.x) / 2; e.z += (b.min.z + b.max.z) / 2
      e.y = Math.max(e.y, b.max.y); e.n++
    })
    buildSmoke(Object.values(chimMap).map(e => ({ x: e.x / e.n, y: e.y - 0.2, z: e.z / e.n })))
    buildLeaves()

    // ducks + strolling pedestrians circle the pond/park; capture each one's
    // radius, start angle and rest height so the tour can animate them
    const _wp = new THREE.Vector3()
    const initMover = (o, base) => {
      o.getWorldPosition(_wp)
      return { obj: o, r: Math.hypot(_wp.x, _wp.z), a0: Math.atan2(_wp.x, _wp.z), y0: _wp.y,
        speed: base * (0.7 + Math.random() * 0.6), dir: Math.random() < 0.5 ? 1 : -1, ph: Math.random() * TAU }
    }
    for (const o of duckObjs) duckData.push(initMover(o, 0.13))
    for (const o of pedObjs) pedData.push(initMover(o, 0.2))
    for (const o of boatObjs) { o.getWorldPosition(_wp); boats.push({ obj: o, y0: _wp.y, baseRotY: o.rotation.y, ph: Math.random() * TAU }) }

    // droplet particles raining off the fountain top
    const DROPS = 70
    dropData = []
    const dpos = new Float32Array(DROPS * 3)
    for (let i = 0; i < DROPS; i++) {
      const d = resetDrop({})
      d.y -= Math.random() * 3     // stagger the first cycle
      dropData.push(d)
      dpos[i * 3] = d.x; dpos[i * 3 + 1] = d.y; dpos[i * 3 + 2] = d.z
    }
    const dg = new THREE.BufferGeometry()
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3))
    drops = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0x9fd8f0, size: 0.14, transparent: true, opacity: 0.85,
    }))
    scene.add(drops)

    window.__tw = {
      renderer, scene, camera,
      get tram() { return tram },
      get state() { return { targetBeat, currentG: +currentG.toFixed(3), panelOpen, theme: +theme.toFixed(2) } },
      setNight,
    }

    applyTheme()   // apply saved day/night preference now that materials exist
    applyCamera(0)
    loadingEl.classList.add('hidden'); setTimeout(() => loadingEl.remove(), 800)
  } catch (err) {
    console.error(err)
    loadingEl.innerHTML = 'Failed to load models. Are you serving this over http:// ?'
  }
}
init()

// --- Camera resolve: orbit (top) blends into the beat path ---
const _pos = new THREE.Vector3(), _look = new THREE.Vector3()
function applyCamera(dt) {
  const atHome = targetBeat === 0 && currentG < 0.002
  if (atHome) {
    // resting at Home: live orbit. The tour path starts wherever this leaves off.
    if (!reduceMotion) orbitA += dt * 0.06
    _pos.set(Math.sin(orbitA) * 44, 30, Math.cos(orbitA) * 44)
    _look.copy(HOME_LOOK)
  } else {
    _pos.copy(posCurve.getPoint(currentG))
    _look.copy(lookCurve.getPoint(currentG))
  }
  camera.position.copy(_pos)
  camera.lookAt(_look)
}

// --- Panels + nav sync ---
function syncUI() {
  const settled = Math.abs(beatG(targetBeat) - currentG) < 0.02
  aerialBtn.classList.toggle('gone', currentG > 0.03 && !aerial)

  panels.forEach((p) => {
    const i = +p.dataset.beat
    const show = i === targetBeat && !aerial && panelOpen && settled
    p.classList.toggle('active', show)
    p.style.opacity = show ? 1 : 0
  })
  navBtns.forEach((b, i) => b.classList.toggle('on', i === targetBeat))

  // float the "i" above the current section's sign (screen-space projection)
  const anchor = INFO_ANCHORS[targetBeat]
  const showInfo = !!anchor && settled && !aerial && !panelOpen
  infoBtn.classList.toggle('gone', !showInfo)
  if (showInfo) {
    _iv.copy(anchor).project(camera)
    infoBtn.style.left = ((_iv.x * 0.5 + 0.5) * window.innerWidth) + 'px'
    infoBtn.style.top = ((-_iv.y * 0.5 + 0.5) * window.innerHeight) + 'px'
  }
}

// --- Animate ---
function tick() {
  requestAnimationFrame(tick)
  const t = clock.getElapsedTime()
  const dt = Math.min(t - lastT, 0.05); lastT = t

  waterTime.value = t

  // day <-> night easing
  if (Math.abs(themeTarget - theme) > 0.001) {
    theme += (themeTarget - theme) * (reduceMotion ? 0.5 : 0.045)
    applyTheme()
  }

  // damped, rate-limited follow toward the target beat
  const targetG = beatG(targetBeat)
  const follow = reduceMotion ? 0.22 : 0.06
  let stepG = (targetG - currentG) * follow
  const maxStep = 0.016
  if (stepG > maxStep) stepG = maxStep; else if (stepG < -maxStep) stepG = -maxStep
  currentG += stepG

  if (aerial) {
    camera.position.lerp(aerialPose.pos, 0.08)
    _look.lerp(aerialPose.look, 0.08); camera.lookAt(_look)
  } else {
    applyCamera(dt)
  }

  // streetcar: parked until first scroll, then cruises the ring, easing to a
  // halt at the tram stop each lap (dings + dwells), then pulls away
  if (tram) {
    if (!hasScrolled) {
      tramSpeed += (0 - tramSpeed) * 0.03
    } else if (tramDwell > 0) {
      tramDwell -= dt; tramSpeed = 0
    } else {
      const d = ((STOP_PHI - tramPhi) % TAU + TAU) % TAU   // forward distance to stop
      if (d > 1.0) tramArmed = true
      if (tramArmed && d < 0.55) {
        // kinematic deceleration so it glides to a precise stop at the shelter
        const a = (tramSpeed * tramSpeed) / (2 * Math.max(d, 1e-4))
        tramSpeed = Math.max(0, tramSpeed - a * dt)
        if (d < 0.012 || tramSpeed < 0.001) { tramSpeed = 0; tramPhi = STOP_PHI; tramDwell = 2.4; tramArmed = false; bellSfx() }
      } else {
        tramSpeed += (0.1 - tramSpeed) * 0.03
      }
    }
    tramPhi += tramSpeed * dt
    // little hop when clicked
    let tramY = 0
    if (tramBounceStart) {
      const k = (performance.now() - tramBounceStart) / 1000
      if (k < 1.5) tramY = Math.abs(Math.sin(k * 11)) * 0.4 * Math.exp(-k * 2.2)
      else tramBounceStart = 0
    }
    tram.position.set(RING_R * Math.sin(tramPhi), tramY, RING_R * Math.cos(tramPhi))
    tram.rotation.y = tramPhi
  }
  // ducks paddle around the pond (townsfolk stay put where Blender placed them)
  if (!reduceMotion) {
    for (const d of duckData) {
      const a = d.a0 + t * d.speed * d.dir
      d.obj.position.set(d.r * Math.sin(a), d.y0 + Math.sin(t * 1.6 + d.ph) * 0.03, d.r * Math.cos(a))
      d.obj.rotation.y = a + (d.dir > 0 ? 0 : Math.PI)
    }
    for (const b of boats) {
      // gentle bob/roll, phase-offset per boat so the fleet moves independently
      b.obj.position.y = b.y0 + Math.sin(t * 0.7 + b.ph) * 0.08
      b.obj.rotation.set(Math.sin(t * 0.5 + b.ph) * 0.02, b.baseRotY, Math.sin(t * 0.6 + b.ph) * 0.025)
    }
  }
  if (clouds && !reduceMotion) clouds.rotation.y = t * 0.008
  // church bell startles the flock: birds burst up and outward, then glide home
  if (birdScatterStart && birdMeshes.length) {
    const T = 2.6, k = (performance.now() - birdScatterStart) / 1000
    if (k > T) { for (const b of birdMeshes) b.position.copy(b.userData.base); birdScatterStart = 0 }
    else {
      const env = Math.sin((k / T) * Math.PI)
      for (let i = 0; i < birdMeshes.length; i++) {
        const b = birdMeshes[i], base = b.userData.base
        const out = 7 * env, up = 5 * env + Math.sin(k * 22 + i * 1.3) * 0.5 * env
        b.position.set(base.x + b.userData.outX * out, base.y + up, base.z + b.userData.outZ * out)
      }
    }
  } else if (birdMeshes.length && !reduceMotion) {
    // idle: each bird gently bobs so the flock reads as gliding, not frozen
    for (let i = 0; i < birdMeshes.length; i++) {
      const b = birdMeshes[i]
      b.position.y = b.userData.base.y + Math.sin(t * 2.3 + i * 1.7) * 0.22
    }
  }
  if (nameSky) {
    nameSky.visible = !aerial
    if (!aerial) {
      nameSky.rotation.y = Math.atan2(camera.position.x - nameSky.position.x, camera.position.z - nameSky.position.z)
      nameSky.position.y = 27 + (reduceMotion ? 0 : Math.sin(t * 0.6) * 0.5)
    }
  }
  if (statement) {
    const opacity = aerial ? 0 : (1 - smoothstep(0.01, 0.06, currentG))
    statement.visible = opacity > 0.005
    if (statement.visible) {
      for (const m of statementMats) m.opacity = opacity
      statement.rotation.y = Math.atan2(camera.position.x - statement.position.x, camera.position.z - statement.position.z)
      statement.position.y = 20 + (reduceMotion ? 0 : Math.sin(t * 0.6 + 0.3) * 0.4)
    }
  }
  if (contactGroup) {
    // fade in as we approach the Contact beat (g = 1.0)
    const opacity = aerial ? 0 : smoothstep(0.86, 0.98, currentG)
    contactGroup.visible = opacity > 0.005
    if (contactGroup.visible) {
      for (const m of contactMats) m.opacity = opacity
      contactGroup.rotation.y = Math.atan2(camera.position.x - contactGroup.position.x, camera.position.z - contactGroup.position.z)
      contactGroup.position.y = 15 + (reduceMotion ? 0 : Math.sin(t * 0.6) * 0.35)
    }
    // clickable overlays: project each label's geometry center to screen
    const showClicks = contactGroup.visible && opacity > 0.85 && !aerial
    contact3dEl.classList.toggle('gone', !showClicks)
    if (showClicks) {
      for (const a of contactLinks) {
        const mesh = contactLabels.get(a.dataset.key)
        if (!mesh) continue
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox
        // geometric center in mesh-local space (mesh.position is (0,0,0) since Blender baked the offset in)
        _pv.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2)
        mesh.localToWorld(_pv); _pv.project(camera)
        const sx = (_pv.x * 0.5 + 0.5) * window.innerWidth
        const sy = (-_pv.y * 0.5 + 0.5) * window.innerHeight
        // right edge for width estimate
        _pv.set(box.max.x, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2)
        mesh.localToWorld(_pv); _pv.project(camera)
        const rightSx = (_pv.x * 0.5 + 0.5) * window.innerWidth
        const widthPx = Math.max(100, Math.abs(rightSx - sx) * 2 + 30)
        a.style.left = (sx - widthPx / 2) + 'px'
        a.style.top = (sy - 22) + 'px'
        a.style.width = widthPx + 'px'
      }
    }
  }

  // fountain: pulse the jet (bottom pinned), shimmer the spill streams (top pinned)
  if (fountJet && !reduceMotion) {
    const js = 1 + Math.sin(t * 3.2) * 0.10 + Math.sin(t * 7.3) * 0.04
    fountJet.scale.y = js
    fountJet.position.y = fountJetMinY * (1 - js)
  }
  if (!reduceMotion) fountSpills.forEach((sp, i) => {
    const ss = 1 + Math.sin(t * 5 + i * 1.7) * 0.12
    sp.scale.y = ss
    sp.position.y = sp.geometry.boundingBox.max.y * (1 - ss)
  })
  if (drops && !reduceMotion) {
    const pAttr = drops.geometry.attributes.position
    for (let i = 0; i < dropData.length; i++) {
      const d = dropData[i]
      d.vy -= 4.5 * dt
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt
      if (d.y < 0.3) resetDrop(d)
      pAttr.setXYZ(i, d.x, d.y, d.z)
    }
    pAttr.needsUpdate = true
  }

  // chimney smoke: rise, drift, grow and dissolve
  if (smoke && !reduceMotion) {
    const pos = smoke.geometry.attributes.position, sz = smoke.geometry.attributes.aSize, al = smoke.geometry.attributes.aAlpha
    for (let i = 0; i < smokeData.length; i++) {
      const d = smokeData[i]
      d.age += dt
      if (d.age >= d.life) resetPuff(d)
      const p = d.age / d.life
      d.x += d.dx * dt; d.y += d.vy * dt; d.z += d.dz * dt
      pos.setXYZ(i, d.x, d.y, d.z)
      sz.array[i] = d.s0 + (d.s1 - d.s0) * p
      al.array[i] = smoothstep(0, 0.15, p) * (1 - p) * 0.5
    }
    pos.needsUpdate = true; sz.needsUpdate = true; al.needsUpdate = true
  }

  // falling leaves: drift down with a side-to-side flutter, fade near the ground
  if (leaves && !reduceMotion) {
    const pos = leaves.geometry.attributes.position, sz = leaves.geometry.attributes.aSize, al = leaves.geometry.attributes.aAlpha
    for (let i = 0; i < leafData.length; i++) {
      const d = leafData[i]
      d.age += dt; d.y += d.vy * dt
      if (d.y < 0.25 || d.age >= d.life) resetLeaf(d)
      pos.setXYZ(i,
        d.bx + Math.sin(t * d.swayFreq + d.phase) * d.swayAmp,
        d.y,
        d.bz + Math.cos(t * d.swayFreq * 0.8 + d.phase) * d.swayAmp * 0.6)
      sz.array[i] = d.size
      al.array[i] = smoothstep(0, 1.3, d.y) * 0.85
    }
    pos.needsUpdate = true; sz.needsUpdate = true; al.needsUpdate = true
  }

  // decaying squash-and-stretch on clicked trees (pivot = bbox base)
  for (let i = boings.length - 1; i >= 0; i--) {
    const b = boings[i]
    const k = (performance.now() - b.start) / 1000
    if (k > 1.2) {
      b.mesh.scale.set(1, 1, 1); b.mesh.position.set(0, 0, 0)
      boings.splice(i, 1); continue
    }
    const a = 0.22 * Math.sin(k * 13) * Math.exp(-k * 3.5)
    const sy = 1 + a, sxz = 1 - a * 0.55
    b.mesh.scale.set(sxz, sy, sxz)
    b.mesh.position.set(b.cx * (1 - sxz), b.minY * (1 - sy), b.cz * (1 - sxz))
  }

  syncUI()
  updateTransitMap()
  renderer.render(scene, camera)
}
tick()

// --- Soft round particles (shared by chimney smoke + falling leaves) ---
// A single Points cloud drawn with a tiny shader so each particle can carry its
// own size and alpha (PointsMaterial can't) — soft puffs in one draw call.
function pointScale() { return (window.innerHeight * 0.5) / Math.tan((45 * Math.PI / 180) / 2) }
function softPoints(count, colorHex) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1))
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1))
  const uniforms = { uScale: { value: pointScale() }, uColor: { value: new THREE.Color(colorHex) } }
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `
      attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uScale;
      void main(){ vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 0.1); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying float vAlpha; uniform vec3 uColor;
      void main(){ float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.15, d) * vAlpha; if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a); }`,
  })
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false
  return { pts, uniforms, geo }
}

// chimney smoke: puffs rise from each townhouse roof, drift, grow and dissolve
function resetPuff(d) {
  d.x = d.ex + (Math.random() - 0.5) * 0.3
  d.y = d.ey
  d.z = d.ez + (Math.random() - 0.5) * 0.3
  d.vy = 0.35 + Math.random() * 0.3
  d.dx = 0.12 + (Math.random() - 0.5) * 0.14      // gentle prevailing drift
  d.dz = (Math.random() - 0.5) * 0.14
  d.age = 0; d.life = 2.6 + Math.random() * 1.8
  d.s0 = 0.5 + Math.random() * 0.3; d.s1 = 2.0 + Math.random() * 1.2
  return d
}
function buildSmoke(chimneys) {
  if (!chimneys.length) return
  const PER = isMobile ? 7 : 11
  const count = chimneys.length * PER
  const S = softPoints(count, 0xdadada)
  smoke = S.pts; smokeUniforms = S.uniforms; smokeData = []
  for (let i = 0; i < count; i++) {
    const c = chimneys[Math.floor(i / PER)]
    const d = { ex: c.x, ey: c.y, ez: c.z }
    resetPuff(d); d.age = Math.random() * d.life   // stagger the first cycle
    smokeData.push(d)
  }
  scene.add(smoke)
}

// falling leaves: drift down through the park with a side-to-side flutter
function resetLeaf(d) {
  const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 11
  d.bx = Math.cos(a) * r; d.bz = Math.sin(a) * r
  d.y = 5.5 + Math.random() * 4
  d.vy = -(0.35 + Math.random() * 0.4)
  d.phase = Math.random() * Math.PI * 2
  d.swayAmp = 0.5 + Math.random() * 0.7
  d.swayFreq = 0.7 + Math.random() * 0.7
  d.size = 0.45 + Math.random() * 0.4
  d.age = 0; d.life = 7 + Math.random() * 4
  return d
}
function buildLeaves() {
  const count = isMobile ? 16 : 26
  const S = softPoints(count, 0xcbb24e)   // warm golden leaf
  leaves = S.pts; leafUniforms = S.uniforms; leafData = []
  for (let i = 0; i < count; i++) {
    const d = resetLeaf({}); d.age = Math.random() * d.life; d.y = 0.4 + Math.random() * 7.6
    leafData.push(d)
  }
  scene.add(leaves)
}

// droplets spray outward from the fountain finial and fall into the pond
function resetDrop(d) {
  const a = Math.random() * Math.PI * 2
  d.x = Math.cos(a) * 0.25; d.z = Math.sin(a) * 0.25
  d.y = 4.6 + Math.random() * 0.5
  d.vx = Math.cos(a) * (0.4 + Math.random() * 0.5)
  d.vz = Math.sin(a) * (0.4 + Math.random() * 0.5)
  d.vy = 0.4 + Math.random() * 0.8
  return d
}

// --- Clickable toys: streetcar dings + hops, trees boing ---
const raycaster = new THREE.Raycaster()
const _ptr = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!tram && !treeMeshes.length) return
  _ptr.x = (e.clientX / window.innerWidth) * 2 - 1
  _ptr.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(_ptr, camera)
  const tramHits = tram ? raycaster.intersectObject(tram, true) : []
  if (tramHits.length) { bellSfx(); tramBounceStart = performance.now(); return }
  // church -> deep bell toll + the flock takes off
  if (churchMeshes.length && raycaster.intersectObjects(churchMeshes, false).length) {
    churchSfx(); birdScatterStart = performance.now(); return
  }
  // fountain -> splash burst + a shower of extra spray
  if (fountMeshes.length && raycaster.intersectObjects(fountMeshes, false).length) {
    splashSfx()
    if (dropData) for (const d of dropData) { resetDrop(d); d.vy += 2.2 + Math.random() * 1.5; d.vx *= 1.6; d.vz *= 1.6 }
    return
  }
  const treeHits = raycaster.intersectObjects(treeMeshes, false)
  if (treeHits.length) {
    const m = treeHits[0].object
    if (!boings.some((b) => b.mesh === m)) {
      const bb = m.geometry.boundingBox
      boings.push({
        mesh: m, start: performance.now(),
        cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2, minY: bb.min.y,
      })
    }
    popSfx()
  }
})

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  const ps = pointScale()
  if (smokeUniforms) smokeUniforms.uScale.value = ps
  if (leafUniforms) leafUniforms.uScale.value = ps
})
