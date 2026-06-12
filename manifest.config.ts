import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// Why: no host permissions on purpose. The keyboard shortcut / toolbar click
// is the user gesture that grants activeTab, and the service worker injects
// the card on demand. This is the privacy story AND the fast-review track.
export default defineManifest({
  manifest_version: 3,
  name: 'Double Check',
  version: pkg.version,
  // Why this exact wording: Chrome Web Store caps the manifest description
  // at 132 characters; longer uploads are rejected.
  description:
    'A second pair of eyes for numbers that can’t be wrong. Verify account numbers, amounts and IDs — values never leave your device.',
  minimum_chrome_version: '116',
  icons: {
    '16': 'icons/icon16.png',
    '32': 'icons/icon32.png',
    '48': 'icons/icon48.png',
    '128': 'icons/icon128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'Double Check',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  commands: {
    'check-field': {
      suggested_key: { default: 'Ctrl+Shift+Space', mac: 'Command+Shift+Space' },
      description: 'Double-check the focused field',
    },
  },
  // Why no 'tts': read-aloud uses the page's speechSynthesis (local voices
  // only) from the content script, so the value never crosses contexts.
  permissions: ['activeTab', 'scripting', 'storage', 'offscreen', 'alarms', 'contextMenus'],
  // Why: MV3's DEFAULT extension CSP lacks 'wasm-unsafe-eval', so the bundled
  // Tesseract WASM can't even instantiate without declaring it. This is the
  // only loosening MV3 permits and it covers wasm only — no JS eval.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
  },
  // Why: the ONLY host entry. ExtPay needs its relay on extensionpay.com for
  // payment/trial callbacks. No user-page host permissions exist anywhere.
  content_scripts: [
    {
      matches: ['https://extensionpay.com/*'],
      js: ['src/payments/extpay-content.ts'],
      run_at: 'document_start',
    },
  ],
})
