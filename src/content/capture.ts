// Screen-region capture for OCR: user drags a rectangle, we crop the
// captureVisibleTab screenshot to it. The crop happens here in the page
// context; the image goes only to the extension's own offscreen document.

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export function selectRegion(): Promise<Region | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div')
    host.setAttribute('data-double-check-capture', '')
    const root = host.attachShadow({ mode: 'closed' })
    const overlay = document.createElement('div')
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.12)'
    const rect = document.createElement('div')
    rect.style.cssText =
      'position:fixed;border:2px dashed #166534;background:rgba(22,101,52,.08);display:none;pointer-events:none'
    const tip = document.createElement('div')
    tip.textContent = 'Drag to select the value to scan — Esc to cancel'
    tip.style.cssText =
      'position:fixed;top:12px;left:50%;transform:translateX(-50%);font:600 13px system-ui,sans-serif;' +
      'background:#166534;color:#fff;padding:6px 14px;border-radius:9999px;pointer-events:none'
    overlay.append(rect, tip)
    root.appendChild(overlay)
    document.documentElement.appendChild(host)

    let startX = 0, startY = 0, dragging = false

    const finish = (r: Region | null) => {
      window.removeEventListener('keydown', onKey, true)
      host.remove()
      resolve(r)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        finish(null)
      }
    }
    window.addEventListener('keydown', onKey, true)

    overlay.addEventListener('mousedown', (e) => {
      dragging = true
      startX = e.clientX
      startY = e.clientY
      rect.style.display = 'block'
    })
    overlay.addEventListener('mousemove', (e) => {
      if (!dragging) return
      const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY)
      rect.style.left = `${x}px`
      rect.style.top = `${y}px`
      rect.style.width = `${Math.abs(e.clientX - startX)}px`
      rect.style.height = `${Math.abs(e.clientY - startY)}px`
    })
    overlay.addEventListener('mouseup', (e) => {
      const region: Region = {
        x: Math.min(startX, e.clientX),
        y: Math.min(startY, e.clientY),
        w: Math.abs(e.clientX - startX),
        h: Math.abs(e.clientY - startY),
      }
      finish(region.w >= 8 && region.h >= 8 ? region : null)
    })
  })
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  const img = new Image()
  await new Promise<void>((res, rej) => {
    img.onload = () => res()
    img.onerror = () => rej(new Error('image decode failed'))
    img.src = dataUrl
  })
  return img
}

export async function cropToRegion(dataUrl: string, r: Region): Promise<string> {
  const img = await loadImage(dataUrl)
  const scaleX = img.naturalWidth / window.innerWidth
  const scaleY = img.naturalHeight / window.innerHeight
  const srcW = Math.max(1, r.w * scaleX)
  const srcH = Math.max(1, r.h * scaleY)
  // upscale small crops — tesseract reads small UI text far better at 2–4x
  const scale = Math.max(1, Math.min(4, 800 / srcW))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(srcW * scale)
  canvas.height = Math.round(srcH * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = scale === 1
  ctx.drawImage(img, r.x * scaleX, r.y * scaleY, srcW, srcH, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(file)
  })
}
