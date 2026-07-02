// Read a pasted/selected image (a File, or a Blob straight off the clipboard)
// into a data URL for local OCR. The image goes only to the extension's own
// offscreen document and is discarded after text extraction.
export function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('file read failed'))
    reader.readAsDataURL(blob)
  })
}
