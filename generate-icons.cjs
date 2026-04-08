const zlib = require('zlib')
const fs = require('fs')

// CRC32 table
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

// Draw a dark square with rounded neon-green circle + "P" letter silhouette
function createIcon(size) {
  const [br, bg, bb] = [10, 10, 10]      // #0a0a0a background
  const [fr, fg, fb] = [204, 255, 0]     // #CCFF00 foreground

  const rowBytes = 1 + size * 3
  const raw = Buffer.alloc(size * rowBytes, 0)

  const cx = size / 2, cy = size / 2
  const outerR = size * 0.42
  const innerR = size * 0.28
  const stemW = size * 0.10
  const bowlX = cx - stemW * 0.4
  const bowlY = cy - outerR * 0.55

  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)

      // Circle background
      const inCircle = dist <= outerR

      // Draw "P" shape inside circle
      // Vertical stem
      const inStem = inCircle &&
        x >= cx - stemW * 1.8 && x <= cx - stemW * 0.8 &&
        y >= bowlY && y <= cy + outerR * 0.52

      // Bowl of P (half-circle on right side of stem)
      const bowlDx = x - bowlX, bowlDy = y - (bowlY + innerR)
      const bowlDist = Math.sqrt(bowlDx * bowlDx + bowlDy * bowlDy)
      const inBowl = inCircle && bowlDist <= innerR && x >= cx - stemW * 0.8

      const isFg = inStem || inBowl

      const off = y * rowBytes + 1 + x * 3
      if (inCircle) {
        raw[off]     = isFg ? fr : br
        raw[off + 1] = isFg ? fg : bg
        raw[off + 2] = isFg ? fb : bb
      } else {
        raw[off]     = br
        raw[off + 1] = bg
        raw[off + 2] = bb
      }
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 })

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr.writeUInt8(8, 8); ihdr.writeUInt8(2, 9) // 8-bit RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

fs.mkdirSync('public', { recursive: true })
fs.writeFileSync('public/pwa-192x192.png', createIcon(192))
fs.writeFileSync('public/pwa-512x512.png', createIcon(512))
fs.writeFileSync('public/apple-touch-icon.png', createIcon(180))
console.log('PWA icons generated: 192x192, 512x512, 180x180 (apple-touch-icon)')
