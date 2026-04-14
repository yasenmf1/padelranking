const zlib = require('zlib')
const fs = require('fs')

// CRC32 (same as generate-icons.cjs)
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF]
  return ((crc ^ 0xFFFFFFFF) >>> 0)
}
function pngChunk(type, data) {
  const t = Buffer.from(type)
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}

// Create a screenshot: dark background with neon-green logo bar at top + grid of cards
function createScreenshot(width, height) {
  const BG  = [10, 10, 10]       // #0a0a0a
  const BAR = [17, 17, 17]       // #111111 navbar
  const CARD = [26, 26, 26]      // #1a1a1a cards
  const NEON = [204, 255, 0]     // #CCFF00

  const rowBytes = 1 + width * 3
  const raw = Buffer.alloc(height * rowBytes, 0)

  const navH    = Math.round(height * 0.07)
  const padding = Math.round(width * 0.04)
  const cardH   = Math.round(height * 0.14)
  const cardR   = Math.round(width * 0.015) // corner radius approx
  const gap     = Math.round(height * 0.025)

  // Cards: start below navbar + gap
  const cardY0 = navH + Math.round(height * 0.08)
  const numCards = 4

  // Neon accent bar width in navbar (logo area)
  const accentW = Math.round(width * 0.28)
  const accentH = Math.round(navH * 0.35)
  const accentY = Math.round((navH - accentH) / 2)
  const accentX = Math.round(padding)

  function setPixel(x, y, rgb) {
    if (x < 0 || x >= width || y < 0 || y >= height) return
    const off = y * rowBytes + 1 + x * 3
    raw[off] = rgb[0]; raw[off + 1] = rgb[1]; raw[off + 2] = rgb[2]
  }

  function fillRect(x1, y1, x2, y2, rgb) {
    for (let y = y1; y < y2; y++)
      for (let x = x1; x < x2; x++)
        setPixel(x, y, rgb)
  }

  // Background
  fillRect(0, 0, width, height, BG)

  // Navbar background
  fillRect(0, 0, width, navH, BAR)

  // Neon logo bar
  fillRect(accentX, accentY, accentX + accentW, accentY + accentH, NEON)

  // Cards
  for (let i = 0; i < numCards; i++) {
    const cy = cardY0 + i * (cardH + gap)
    if (cy + cardH > height) break
    fillRect(padding, cy, width - padding, cy + cardH, CARD)

    // Left neon accent stripe on each card
    const stripeW = Math.round(width * 0.008)
    fillRect(padding, cy, padding + stripeW, cy + cardH, NEON)

    // Two "text" lines inside card
    const lineH = Math.round(cardH * 0.12)
    const lineY1 = cy + Math.round(cardH * 0.22)
    const lineY2 = cy + Math.round(cardH * 0.55)
    const lineX1 = padding + stripeW + Math.round(width * 0.025)
    const textW1 = Math.round(width * (0.3 + (i % 3) * 0.08))
    const textW2 = Math.round(width * (0.15 + (i % 2) * 0.05))
    const TEXT = [80, 80, 80]
    fillRect(lineX1, lineY1, lineX1 + textW1, lineY1 + lineH, TEXT)
    fillRect(lineX1, lineY2, lineX1 + textW2, lineY2 + Math.round(lineH * 0.8), [50, 80, 0])
  }

  // Bottom neon bar (tab bar for mobile / footer for desktop)
  const botH = Math.round(height * 0.065)
  fillRect(0, height - botH, width, height, BAR)
  // 3 tab indicators
  const tabW = Math.round(width / 4)
  const tabAccentW = Math.round(tabW * 0.35)
  const tabAccentH = Math.round(botH * 0.06)
  for (let t = 0; t < 3; t++) {
    const tx = Math.round(width * 0.12) + t * tabW
    fillRect(tx, height - botH + 2, tx + tabAccentW, height - botH + 2 + tabAccentH, t === 0 ? NEON : [40, 40, 40])
    // dot icon
    const dotR = Math.round(botH * 0.18)
    const dotCX = tx + Math.round(tabAccentW / 2)
    const dotCY = height - botH + Math.round(botH * 0.42)
    fillRect(dotCX - dotR, dotCY - dotR, dotCX + dotR, dotCY + dotR, t === 0 ? NEON : [60, 60, 60])
  }

  // Set filter bytes to 0 (None) for each row
  for (let y = 0; y < height; y++) raw[y * rowBytes] = 0

  const compressed = zlib.deflateSync(raw, { level: 6 })
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(2, 9) // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/screenshot-desktop.png', createScreenshot(1280, 720))
fs.writeFileSync('public/screenshot-mobile.png',  createScreenshot(390, 844))
console.log('Screenshots generated: screenshot-desktop.png (1280x720), screenshot-mobile.png (390x844)')
