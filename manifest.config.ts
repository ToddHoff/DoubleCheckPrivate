import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// Why: no host permissions on purpose. The keyboard shortcut / toolbar click
// is the user gesture that grants activeTab, and the service worker injects
// the card on demand. This is the privacy story AND the fast-review track.
export default defineManifest({
  manifest_version: 3,
  name: 'Double Check',
  version: pkg.version,
  description:
    'A second pair of eyes for the numbers that can’t be wrong. Verify account numbers, amounts and IDs locally — values never leave your device.',
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
  permissions: ['activeTab', 'scripting', 'storage', 'offscreen', 'alarms'],
  // Why: the ONLY host entry. ExtPay needs its relay on extensionpay.com for
  // payment/trial callbacks. No user-page host permissions exist anywhere.
  content_scripts: [
    {
      matches: ['https://extensionpay.com/*'],
      js: ['src/payments/extpay-content.ts'],
      run_at: 'document_start',
    },
  ],
  // Why: voice input runs in a hidden extension-origin iframe inside the
  // card, so the mic permission belongs to Double Check rather than the
  // page. The frame URL must be web-accessible to be embeddable.
  web_accessible_resources: [
    {
      resources: ['src/mic/index.html'],
      matches: ['http://*/*', 'https://*/*'],
    },
  ],
})
