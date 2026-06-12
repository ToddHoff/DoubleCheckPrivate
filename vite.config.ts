import { defineConfig } from 'vitest/config'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    include: ['tests/unit/**/*.test.ts'], // e2e specs run under Playwright, not vitest
  },
  build: {
    target: 'chrome116',
    rollupOptions: {
      // pages reached only via runtime.getURL, so crxjs can't discover them
      // from the manifest — declare them explicitly
      input: {
        onboarding: 'src/onboarding/index.html',
        offscreen: 'src/offscreen/index.html',
        mic: 'src/mic/index.html',
      },
    },
  },
})
