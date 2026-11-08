// Draws one print-style poster per project onto a canvas. The only words are the
// title and the year; the write-up lives on the caption card. Each poster carries
// a drawing of that project's real idea or numbers (poster.viz.type picks it).
// Illustrative drawings say 'schematic'; nothing is plotted with an invented value.
// A second ink is printed slightly off-register, like a cheap two-colour run.
export const POSTER_W = 1024
export const POSTER_H = 1512
const PAPER = '#f3efe6', INK = '#22303f'
const FAMILY = "'Montserrat', 'Helvetica Neue', Arial, sans-serif"

function wrap(ctx, text, maxW) {
  const words = text.split(' '), rows = []
  let row = ''
  for (const w of words) {
    const t = row ? row + ' ' + w : w
    if (ctx.measureText(t).width > maxW && row) { rows.push(row); row = w } else row = t
  }
  if (row) rows.push(row)
  return rows
}

function grain(ctx, W, H, seed) {
  const rnd = rng(seed * 7 + 3)
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)'
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2)
  }
}

function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280)
}

function T(ctx, str, x, y, size, weight, color, align) {
  ctx.font = `${weight} ${size}px ${FAMILY}`
  ctx.fillStyle = color
  ctx.textAlign = align || 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(str, x, y)
  ctx.textAlign = 'left'
}

// Print a shape twice: accent first, offset, then the main ink on top.
function twoInk(p, fn, off = 6) {
  fn(p.accent, off, off)
  fn(p.ink, 0, 0)
}

// ---------- visualizations: each draws inside box {x, y, w, h}; no sentences ----------

// Wildlife: 15,000 segments, ranked; the top 10% lit; then the share of records.
function vizSegments(ctx, b, p, v) {
  const total = v.segments, barsH = 230
  const cols = Math.ceil(Math.sqrt(total * b.w / (b.h - barsH - 30)))
  const rows = Math.ceil(total / cols)
  const pitch = b.w / cols, gridH = rows * pitch
  const hi = Math.round(total * v.topPct / 100)
  const gy = b.y
  for (let i = 0; i < total; i++) {
    const cx = b.x + Math.floor(i / rows) * pitch + pitch / 2, cy = gy + (i % rows) * pitch + pitch / 2
    ctx.fillStyle = i < hi ? p.accent : p.ink
    ctx.globalAlpha = i < hi ? 1 : 0.5
    ctx.beginPath(); ctx.arc(cx, cy, pitch * (i < hi ? 0.46 : 0.3), 0, 6.3); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = p.accent; ctx.fillRect(b.x, gy + gridH + 12, hi / rows * pitch, 8)
  const bh = 78, scale = b.w, by = b.y + b.h - barsH + 30
  ctx.fillStyle = p.accent
  ctx.fillRect(b.x + 8, by + 8, scale * v.sharePct / 100, bh)
  ctx.fillStyle = p.ink
  ctx.fillRect(b.x, by, scale * v.sharePct / 100, bh)
  T(ctx, `${v.sharePct}%`, b.x + 22, by + 62, 62, 800, '#3f9457')
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.55
  ctx.fillRect(b.x, by + 110, scale * v.randomPct / 100, bh); ctx.globalAlpha = 1
  T(ctx, `${v.randomPct}%`, b.x + scale * v.randomPct / 100 + 20, by + 110 + 60, 52, 700, p.ink)
}

// Hospital: 328 participants as dots, the 10th place lit.
function vizRank(ctx, b, p, v) {
  const n = v.of, cols = Math.ceil(Math.sqrt(n * b.w * 1.1 / (b.h - 150))), rows = Math.ceil(n / cols)
  const pitch = b.w / cols, top = b.y
  for (let i = 0; i < n; i++) {
    const cx = b.x + (i % cols) * pitch + pitch / 2, cy = top + Math.floor(i / cols) * pitch * 1.1 + pitch / 2
    if (i < v.rank) {
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(cx + 3, cy + 3, pitch * 0.42, 0, 6.3); ctx.fill()
      ctx.fillStyle = i === v.rank - 1 ? '#ffffff' : p.ink
      ctx.beginPath(); ctx.arc(cx, cy, pitch * 0.42, 0, 6.3); ctx.fill()
    } else {
      ctx.fillStyle = p.ink; ctx.globalAlpha = 0.4
      ctx.beginPath(); ctx.arc(cx, cy, pitch * 0.3, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1
    }
  }
  const gridBottom = top + rows * pitch * 1.1
  const k = v.rank - 1
  const hx = b.x + (k % cols) * pitch + pitch / 2
  ctx.strokeStyle = p.ink; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(hx, top + pitch); ctx.lineTo(hx, gridBottom + 24); ctx.stroke()
  T(ctx, `10 of ${n}`, hx - 6, gridBottom + 100, 80, 800, p.ink)
}

// Taste model: held-out Spearman vs random, paired bars from zero.
function vizBars(ctx, b, p, v) {
  const max = 0.4, chartH = b.h - 200, base = b.y + b.h - 100
  const groupW = b.w / v.pairs.length
  ctx.fillStyle = p.ink; ctx.fillRect(b.x, base - 1.5, b.w, 4)
  v.pairs.forEach((pr, i) => {
    const gx = b.x + i * groupW + 40, bw = (groupW - 120) / 2
    const hm = pr.model / max * chartH, hr = pr.random / max * chartH
    ctx.fillStyle = p.accent; ctx.fillRect(gx + 8, base - hm + 8, bw, hm)
    ctx.fillStyle = p.ink; ctx.fillRect(gx, base - hm, bw, hm)
    T(ctx, pr.model.toFixed(2), gx + bw / 2, base - hm - 18, 60, 800, p.ink, 'center')
    const rx = gx + bw + 24
    ctx.save(); ctx.beginPath(); ctx.rect(rx, base - hr, bw, hr); ctx.clip()
    ctx.strokeStyle = p.ink; ctx.lineWidth = 4
    for (let k = -hr; k < bw + hr; k += 14) { ctx.beginPath(); ctx.moveTo(rx + k, base); ctx.lineTo(rx + k + hr, base - hr); ctx.stroke() }
    ctx.restore()
    ctx.strokeStyle = p.ink; ctx.lineWidth = 5; ctx.strokeRect(rx + 2, base - hr + 2, bw - 4, hr - 4)
    T(ctx, pr.random.toFixed(2), rx + bw / 2, base - hr - 18, 52, 700, p.ink, 'center')
  })
  // the one legend (two words): without it solid vs hatched would be a guess
  ctx.fillStyle = p.ink; ctx.fillRect(b.x, base + 40, 36, 36)
  T(ctx, 'model', b.x + 52, base + 72, 38, 700, p.ink)
  const lx = b.x + 250
  ctx.save(); ctx.beginPath(); ctx.rect(lx, base + 40, 36, 36); ctx.clip()
  ctx.strokeStyle = p.ink; ctx.lineWidth = 4
  for (let k = -36; k < 36; k += 10) { ctx.beginPath(); ctx.moveTo(lx + k, base + 76); ctx.lineTo(lx + k + 36, base + 40); ctx.stroke() }
  ctx.restore()
  ctx.lineWidth = 4; ctx.strokeRect(lx, base + 40, 36, 36)
  T(ctx, 'random', lx + 52, base + 72, 38, 700, p.ink)
}

// Streetcar ops: 150+ field entries as a tally.
function vizTally(ctx, b, p, v) {
  const groups = Math.floor(v.entries / 5), cols = 5, rows = Math.ceil((groups + 1) / cols)
  const gw = b.w / cols, gh = Math.min(210, (b.h - 20) / rows)
  ctx.lineCap = 'round'
  for (let g = 0; g <= groups; g++) {
    const gx = b.x + (g % cols) * gw + 14, gy = b.y + 20 + Math.floor(g / cols) * gh
    const last = g === groups
    twoInk(p, (col, dx, dy) => {
      ctx.strokeStyle = col; ctx.lineWidth = 9; ctx.setLineDash(last ? [10, 14] : [])
      for (let k = 0; k < 4; k++) {
        const x = gx + k * 30 + dx
        ctx.beginPath(); ctx.moveTo(x, gy + dy); ctx.lineTo(x, gy + gh * 0.68 + dy); ctx.stroke()
      }
      if (!last) { ctx.beginPath(); ctx.moveTo(gx - 12 + dx, gy + gh * 0.52 + dy); ctx.lineTo(gx + 104 + dx, gy + gh * 0.12 + dy); ctx.stroke() }
      ctx.setLineDash([])
    }, 4)
  }
}

// Streetcar delays: a straight line vs a flexible fit through a non-linear scatter.
function vizFit(ctx, b, p, v) {
  const cy = b.y + 20, ch = b.h - 40, rnd = rng(11)
  const f = (t) => 0.5 + 0.38 * Math.sin(t * 5.2 + 0.4) * (0.7 + 0.5 * t) - 0.2 * t
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.55
  for (let i = 0; i < 260; i++) {
    const t = rnd(), y = Math.min(0.97, Math.max(0.03, f(t) + (rnd() - 0.5) * 0.34))
    ctx.beginPath(); ctx.arc(b.x + t * b.w, cy + (1 - y) * ch, 8, 0, 6.3); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = p.ink; ctx.lineWidth = 8; ctx.beginPath()
  ctx.moveTo(b.x, cy + (1 - 0.56) * ch); ctx.lineTo(b.x + b.w, cy + (1 - 0.44) * ch); ctx.stroke()
  const steps = 14
  ctx.strokeStyle = p.accent; ctx.lineWidth = 10; ctx.beginPath()
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps, y = cy + (1 - f((t0 + t1) / 2)) * ch
    if (i === 0) ctx.moveTo(b.x, y); else ctx.lineTo(b.x + t0 * b.w, y)
    ctx.lineTo(b.x + t1 * b.w, y)
  }
  ctx.stroke()
}

// Accessibility: the two measures as decay curves.
function vizDecay(ctx, b, p, v) {
  const ax = b.x + 20, ay = b.y + b.h - 30, aw = b.w - 40, ah = b.h - 90
  ctx.strokeStyle = p.ink; ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(ax, ay - ah - 20); ctx.lineTo(ax, ay); ctx.lineTo(ax + aw, ay); ctx.stroke()
  const cut = 0.42
  twoInk(p, (col, dx, dy) => {
    ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.lineJoin = 'round'
    ctx.setLineDash([]); ctx.beginPath()
    ctx.moveTo(ax + dx, ay - ah + dy); ctx.lineTo(ax + cut * aw + dx, ay - ah + dy)
    ctx.lineTo(ax + cut * aw + dx, ay + dy); ctx.lineTo(ax + aw + dx, ay + dy); ctx.stroke()
  })
  ctx.strokeStyle = p.ink; ctx.lineWidth = 12; ctx.beginPath()
  for (let i = 0; i <= 120; i++) {
    const t = i / 120, y = ay - ah * Math.exp(-3.2 * t)
    if (i === 0) ctx.moveTo(ax, y); else ctx.lineTo(ax + t * aw, y)
  }
  ctx.stroke()
  ctx.setLineDash([8, 12]); ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(ax + cut * aw, ay - ah - 10); ctx.lineTo(ax + cut * aw, ay + 24); ctx.stroke(); ctx.setLineDash([])
}

// ASE: cameras removed, the road still measured.
function vizRoad(ctx, b, p, v) {
  const rh = 260, ry = b.y + b.h * 0.46
  ctx.fillStyle = p.accent; ctx.fillRect(b.x + 10, ry + 10, b.w, rh)
  ctx.fillStyle = p.ink; ctx.fillRect(b.x, ry, b.w, 8); ctx.fillRect(b.x, ry + rh, b.w, 8)
  ctx.setLineDash([54, 40]); ctx.lineWidth = 9; ctx.strokeStyle = p.ink
  ctx.beginPath(); ctx.moveTo(b.x, ry + rh / 2 + 4); ctx.lineTo(b.x + b.w, ry + rh / 2 + 4); ctx.stroke(); ctx.setLineDash([])
  const n = 4
  for (let i = 0; i < n; i++) {
    const x = b.x + 120 + i * ((b.w - 240) / (n - 1)), y = ry - 300
    ctx.setLineDash([14, 14]); ctx.strokeStyle = p.ink; ctx.lineWidth = 8
    ctx.strokeRect(x - 64, y, 128, 88)
    ctx.beginPath(); ctx.moveTo(x, y + 88); ctx.lineTo(x, ry - 6); ctx.stroke(); ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(x, y + 44, 21, 0, 6.3); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(x - 64, y + 88); ctx.lineTo(x + 64, y); ctx.stroke()
  }
  const m = 14
  for (let i = 0; i < m; i++) {
    const x = b.x + 40 + i * ((b.w - 80) / (m - 1))
    ctx.fillStyle = p.ink; ctx.beginPath(); ctx.arc(x, ry + rh + 90, 14, 0, 6.3); ctx.fill()
  }
}

// World Cup: a street network with a few congested links, watched automatically.
function vizNetwork(ctx, b, p, v) {
  const cols = 6, rows = 9, rnd = rng(23)
  const gx = b.w / (cols - 1), gy = (b.h - 40) / (rows - 1)
  const pts = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    pts.push({ x: b.x + c * gx + (rnd() - 0.5) * gx * 0.5, y: b.y + 20 + r * gy + (rnd() - 0.5) * gy * 0.45 })
  const id = (r, c) => r * cols + c
  const edges = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (c < cols - 1 && rnd() < 0.82) edges.push([id(r, c), id(r, c + 1)])
    if (r < rows - 1 && rnd() < 0.82) edges.push([id(r, c), id(r + 1, c)])
  }
  const route = [[1, 0], [1, 1], [2, 1], [3, 1], [3, 2], [4, 2], [5, 2], [5, 3], [6, 3], [6, 4], [7, 4]]
  const hotNodes = route.map(([r, c]) => id(r, c))
  ctx.strokeStyle = p.accent; ctx.lineWidth = 6; ctx.globalAlpha = 0.95
  for (const [a, c] of edges) { ctx.beginPath(); ctx.moveTo(pts[a].x, pts[a].y); ctx.lineTo(pts[c].x, pts[c].y); ctx.stroke() }
  ctx.globalAlpha = 1
  ctx.strokeStyle = p.ink; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.beginPath()
  hotNodes.forEach((n, i) => { const q = pts[n]; if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y) })
  ctx.stroke()
  ctx.fillStyle = p.ink
  for (const q of pts) { ctx.beginPath(); ctx.arc(q.x, q.y, 9, 0, 6.3); ctx.fill() }
  ctx.fillStyle = p.accent
  for (const q of pts) { ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, 6.3); ctx.fill() }
}

// ShiftED: two patients, each against their own baseline.
function vizBaseline(ctx, b, p, v) {
  const rnd = rng(5)
  const panels = [
    { mid: 0.5, band: 0.34, drift: true },
    { mid: 0.5, band: 0.5, drift: false },
  ]
  const ph = (b.h - 100) / 2
  panels.forEach((pn, k) => {
    const y0 = b.y + 10 + k * (ph + 80), mid = y0 + ph * (1 - pn.mid), bh = pn.band * ph
    ctx.fillStyle = p.ink; ctx.globalAlpha = 0.14; ctx.fillRect(b.x, mid - bh / 2, b.w, bh); ctx.globalAlpha = 1
    ctx.fillStyle = p.ink; ctx.fillRect(b.x, y0 + ph, b.w, 4)
    const N = 90, out = pn.drift ? 62 : N + 1
    const sig = (i) => {
      const t = i / N, wob = Math.sin(i * 0.9) * 0.35 + Math.sin(i * 2.3 + 1) * 0.25 + (rnd() - 0.5) * 0.5
      let y = mid - wob * bh * 0.4
      if (i > out) y -= (i - out) / (N - out) * ph * 0.42 * (0.4 + t)
      return y
    }
    const ys = []; for (let i = 0; i <= N; i++) ys.push(sig(i))
    twoInk(p, (col, dx, dy) => {
      ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.beginPath()
      ys.forEach((y, i) => { const x = b.x + i / N * b.w + dx; if (i === 0) ctx.moveTo(x, y + dy); else ctx.lineTo(x, y + dy) })
      ctx.stroke()
    }, 4)
    if (pn.drift) {
      let fi = out; for (let i = out; i <= N; i++) { if (ys[i] < mid - bh / 2) { fi = i; break } }
      const fx = b.x + fi / N * b.w
      ctx.strokeStyle = p.accent; ctx.lineWidth = 6; ctx.setLineDash([10, 10])
      ctx.beginPath(); ctx.moveTo(fx, y0 - 8); ctx.lineTo(fx, y0 + ph); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(fx, ys[fi], 20, 0, 6.3); ctx.fill()
    }
  })
}

// AADT: a year of daily counts collapsed into one average.
function vizSeason(ctx, b, p, v) {
  const top = b.y + 30, ch = b.h - 60, rnd = rng(9)
  const f = (t) => 0.1 + 0.8 * (0.5 - 0.5 * Math.cos((t - 0.06) * 6.283))
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.35
  for (let d = 0; d < 365; d++) {
    const t = d / 364, y = f(t) + (rnd() - 0.5) * 0.3 * (0.4 + f(t))
    ctx.beginPath(); ctx.arc(b.x + t * b.w, top + (1 - y) * ch, 6, 0, 6.3); ctx.fill()
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = p.ink; ctx.globalAlpha = 0.14; ctx.beginPath()
  for (let i = 0; i <= 100; i++) { const t = i / 100; ctx.lineTo(b.x + t * b.w, top + (1 - f(t) - 0.09 - 0.08 * f(t)) * ch) }
  for (let i = 100; i >= 0; i--) { const t = i / 100; ctx.lineTo(b.x + t * b.w, top + (1 - f(t) + 0.09 + 0.08 * f(t)) * ch) }
  ctx.fill(); ctx.globalAlpha = 1
  twoInk(p, (col, dx, dy) => {
    ctx.strokeStyle = col; ctx.lineWidth = 11; ctx.beginPath()
    for (let i = 0; i <= 100; i++) { const t = i / 100, x = b.x + t * b.w + dx, y = top + (1 - f(t)) * ch + dy; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
    ctx.stroke()
  }, 5)
  let mean = 0; for (let i = 0; i < 1000; i++) mean += f(i / 999); mean /= 1000
  const my = top + (1 - mean) * ch
  ctx.strokeStyle = p.accent; ctx.lineWidth = 8; ctx.setLineDash([22, 14])
  ctx.beginPath(); ctx.moveTo(b.x, my); ctx.lineTo(b.x + b.w, my); ctx.stroke(); ctx.setLineDash([])
}

// The single permitted label on drawings that are illustrations, not data.
const NOTES = {
  road: 'schematic', network: 'schematic', baseline: 'schematic',
  season: 'schematic', decay: 'schematic', fit: 'schematic',
}
const VIZ = {
  road: vizRoad, network: vizNetwork, segments: vizSegments, baseline: vizBaseline,
  rank: vizRank, bars: vizBars, season: vizSeason, decay: vizDecay, fit: vizFit, tally: vizTally,
}

// Largest size at which the title fits in w x maxH on at most 4 lines.
function fitTitle(ctx, text, w, maxH) {
  for (let size = 150; size >= 56; size -= 4) {
    ctx.font = `800 ${size}px ${FAMILY}`
    const rows = wrap(ctx, text, w)
    const lh = Math.round(size * 1.04)
    if (rows.length <= 4 && rows.length * lh <= maxH && rows.every((r) => ctx.measureText(r).width <= w)) return { size, rows, lh }
  }
  ctx.font = `800 56px ${FAMILY}`
  return { size: 56, rows: wrap(ctx, text, w), lh: 58 }
}

function drawTitle(ctx, t, x, top, color) {
  ctx.fillStyle = color
  ctx.font = `800 ${t.size}px ${FAMILY}`
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'
  t.rows.forEach((r, i) => ctx.fillText(r, x, top + t.size * 0.86 + i * t.lh))
  return top + t.rows.length * t.lh
}

function draw(project, index) {
  const p = project.poster
  const c = document.createElement('canvas')
  c.width = POSTER_W; c.height = POSTER_H
  const ctx = c.getContext('2d')
  const W = POSTER_W, H = POSTER_H, M = 70, IW = W - M * 2
  const titleText = p.short || project.title
  ctx.fillStyle = p.ground
  ctx.fillRect(0, 0, W, H)
  const viz = VIZ[p.viz && p.viz.type]
  let box

  // One layout for every poster: the title and year on top, the figure below filling the rest.
  // (poster.layout is no longer used.)
  const t = fitTitle(ctx, titleText, IW, 430)
  const end = drawTitle(ctx, t, M, M, p.ink)
  const rowY = end + 30
  T(ctx, project.year, M, rowY + 46, 58, 600, p.ink)
  const yw = ctx.measureText(project.year).width
  ctx.fillStyle = p.ink
  ctx.fillRect(M + yw + 26, rowY + 24, IW - yw - 26, 5)
  box = { x: M, y: rowY + 100, w: IW, h: H - M - (rowY + 100) }
  if (viz) {
    const note = NOTES[p.viz.type]
    if (note) { T(ctx, note, box.x, box.y + box.h, 36, 600, p.ink); box.h -= 70 }
    ctx.save(); viz(ctx, box, p, p.viz); ctx.restore()
  }
  grain(ctx, W, H, index + 3)
  return c
}

export async function drawPosters(projects) {
  try {
    await Promise.all([
      document.fonts.load(`800 80px Montserrat`), document.fonts.load(`700 40px Montserrat`),
      document.fonts.load(`600 40px Montserrat`), document.fonts.load(`500 40px Montserrat`),
    ])
  } catch (e) { /* fall back to the system sans */ }
  return projects.map(draw)
}

// A soft copy of a poster, used to push the unselected posters out of focus. Drawn small and
// scaled back up (so it works without ctx.filter), then blurred again where filters exist.
export function blurCanvas(src) {
  const w = Math.round(src.width / 2), h = Math.round(src.height / 2)
  const small = document.createElement('canvas')
  small.width = Math.round(w / 6); small.height = Math.round(h / 6)
  const sctx = small.getContext('2d')
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(src, 0, 0, small.width, small.height)
  const out = document.createElement('canvas')
  out.width = w; out.height = h
  const octx = out.getContext('2d')
  octx.imageSmoothingQuality = 'high'
  if ('filter' in octx) octx.filter = 'blur(14px)'
  octx.drawImage(small, -24, -24, w + 48, h + 48)
  return out
}
