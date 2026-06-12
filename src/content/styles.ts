// Card styles, injected into the closed shadow root. Self-contained: never
// inherits page styles, never leaks ours.
export const CARD_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.card {
  position: fixed;
  z-index: 2147483647;
  width: 380px;
  max-width: calc(100vw - 24px);
  background: #ffffff;
  color: #1f2937;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0,0,0,.18);
  font: 14px/1.45 system-ui, -apple-system, sans-serif;
}
.hd {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 1px solid #e5e7eb;
}
.hd .logo { width: 18px; height: 18px; border-radius: 5px; background: #166534; position: relative; flex: none; }
.hd .logo::after { content: '✓✓'; color: #fff; font-size: 9px; font-weight: 700; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; letter-spacing: -2px; }
.hd .title { font-weight: 650; font-size: 13px; }
.hd select {
  flex: 1; min-width: 0; font: 13px system-ui, sans-serif; padding: 4px 6px;
  border: 1px solid #d1d5db; border-radius: 7px; background: #f9fafb; color: #1f2937;
}
.hd .close {
  border: 0; background: none; font-size: 16px; line-height: 1; cursor: pointer;
  color: #6b7280; padding: 4px; border-radius: 6px; flex: none;
}
.hd .close:hover { background: #f3f4f6; color: #111827; }
.bd { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 9999px;
  border: 1px solid transparent; display: inline-flex; align-items: center; gap: 4px;
}
.chip.ok { background: #dcfce7; color: #166534; border-color: #86efac; }
.chip.err { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
.chip.warn { background: #fef3c7; color: #92400e; border-color: #fcd34d; }
.lbl { font-size: 12px; color: #4b5563; font-weight: 600; }
.entry {
  width: 100%; font: 16px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace;
  padding: 9px 10px; border: 2px solid #d1d5db; border-radius: 8px; color: #111827;
  background: #fff;
}
.entry:focus { outline: none; border-color: #166534; }
.card.state-match .entry, .entry.good { border-color: #16a34a; background: #f0fdf4; }
.card.state-mismatch .entry, .entry.bad { border-color: #dc2626; background: #fef2f2; }
.entry.ok-shape { border-color: #2563eb; background: #eff6ff; }
.big {
  font: 700 22px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: 1px; word-break: break-all; padding: 10px 12px; border-radius: 8px;
  text-align: center;
}
.big.good { background: #f0fdf4; color: #166534; border: 1px solid #86efac; }
.words { font-size: 13px; color: #374151; text-align: center; font-style: italic; }
.panel { border-radius: 8px; padding: 10px 12px; }
.panel.bad { background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b; }
.panel.bad .why { font-weight: 650; margin-bottom: 6px; }
.diff { font: 600 15px ui-monospace, SFMono-Regular, Menlo, monospace; overflow-x: auto; }
.diff .row { display: flex; gap: 1px; align-items: center; margin-top: 4px; }
.diff .tag { font: 600 10px system-ui, sans-serif; color: #6b7280; width: 52px; flex: none; }
.diff span.c { padding: 1px 2px; border-radius: 3px; min-width: 12px; text-align: center; }
.diff span.c.hl { background: #fecaca; color: #7f1d1d; }
.diff span.c.gap { color: #d1d5db; }
.attest { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: #374151; }
.attest input { margin-top: 2px; accent-color: #166534; }
.btnrow { display: flex; gap: 8px; }
button.btn {
  flex: 1; padding: 8px 10px; border-radius: 8px; font: 600 13px system-ui, sans-serif;
  cursor: pointer; border: 1px solid #d1d5db; background: #fff; color: #1f2937;
}
button.btn:hover { background: #f9fafb; }
button.btn.primary { background: #166534; border-color: #166534; color: #fff; }
button.btn.primary:hover { background: #14532d; }
button.btn.primary:disabled { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }
button.btn.speak { flex: none; width: 38px; }
button.btn.rate { flex: none; width: 40px; font-variant-numeric: tabular-nums; }
.ocr { display: flex; flex-direction: column; gap: 8px; border-top: 1px dashed #e5e7eb; padding-top: 10px; }
.chip.cand { cursor: pointer; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.chip.cand:hover { filter: brightness(.95); }
.ft {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #6b7280;
}
.ft a { color: #166534; cursor: pointer; text-decoration: underline; }
.done { text-align: center; padding: 6px 0; color: #166534; font-weight: 650; }
.hint { font-size: 11.5px; color: #6b7280; }
@media (prefers-color-scheme: dark) {
  .card { background: #1f2937; color: #f3f4f6; border-color: #4b5563; }
  .hd { border-color: #374151; }
  .hd .title { color: #f3f4f6; }
  .hd select { background: #111827; color: #f3f4f6; border-color: #4b5563; }
  .hd .close { color: #9ca3af; }
  .hd .close:hover { background: #374151; color: #f3f4f6; }
  .lbl { color: #d1d5db; }
  .entry { background: #111827; color: #f9fafb; border-color: #4b5563; }
  .entry.good { background: #052e16; }
  .entry.bad { background: #450a0a; }
  .entry.ok-shape { background: #172554; border-color: #3b82f6; }
  .big.good { background: #052e16; color: #bbf7d0; border-color: #166534; }
  .words { color: #d1d5db; }
  .panel.bad { background: #450a0a; border-color: #b91c1c; color: #fecaca; }
  .diff .tag { color: #9ca3af; }
  .diff span.c.hl { background: #7f1d1d; color: #fecaca; }
  .attest { color: #d1d5db; }
  button.btn { background: #374151; color: #f3f4f6; border-color: #4b5563; }
  button.btn:hover { background: #4b5563; }
  .ft { border-color: #374151; color: #9ca3af; }
  .ft a { color: #86efac; }
  .hint { color: #9ca3af; }
}
`
