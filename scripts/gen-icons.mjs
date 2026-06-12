// Generates extension icons (rounded green square, double check mark)
// as PNGs without any image library — hand-rolled PNG encoder.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}

function png(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    raw[y * (1 + size * 4)] = 0 // filter: none
    rgba.copy(raw, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// distance from point to segment, all in unit coords
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1)
  const qx = ax + t * dx, qy = ay + t * dy
  return Math.hypot(px - qx, py - qy)
}

function checkDist(px, py, ox) {
  // check mark polyline: (.24,.54)->(.42,.72)->(.78,.32), shifted by ox
  return Math.min(
    segDist(px, py, 0.24 + ox, 0.54, 0.42 + ox, 0.72),
    segDist(px, py, 0.42 + ox, 0.72, 0.78 + ox, 0.32),
  )
}

const BG = [22, 101, 52]      // green-800
const ECHO = [74, 222, 128]   // green-400
const FG = [255, 255, 255]

function render(size) {
  const SS = 4 // supersample
  const buf = Buffer.alloc(size * size * 4)
  const r = 0.22 // corner radius (unit)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size
          const dx = Math.max(Math.abs(u - 0.5) - (0.5 - r), 0)
          const dy = Math.max(Math.abs(v - 0.5) - (0.5 - r), 0)
          if (Math.hypot(dx, dy) > r) continue // outside rounded square
          let c = BG
          const w = 0.085 // stroke half-width
          if (checkDist(u, v, 0.07) < w) c = ECHO // back check (the "double")
          if (checkDist(u, v, -0.05) < w) c = FG  // front check
          acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      // premultiplied-looking AA: average color over all samples that hit
      const hits = acc[3] / 255
      buf[i] = hits ? Math.round(acc[0] / hits) : 0
      buf[i + 1] = hits ? Math.round(acc[1] / hits) : 0
      buf[i + 2] = hits ? Math.round(acc[2] / hits) : 0
      buf[i + 3] = Math.round((acc[3] / n))
    }
  }
  return buf
}

mkdirSync('public/icons', { recursive: true })
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, render(size)))
  console.log(`icon${size}.png`)
}
