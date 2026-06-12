import { h } from '../shared/dom'
import { renderDocsTab } from './tabs/docs'
import { renderFormatsTab } from './tabs/formats'
import { renderLogTab } from './tabs/log'
import { renderSettingsTab } from './tabs/settings'

const TABS = [
  ['settings', 'Settings'],
  ['formats', 'Formats'],
  ['log', 'Log'],
  ['docs', 'How it works'],
] as const

type TabId = (typeof TABS)[number][0]

const app = document.getElementById('app')!
const shell = h('div', { class: 'shell' })
const header = h('header', { class: 'top' },
  h('div', { class: 'logo' }, '✓✓'),
  h('h1', {}, 'Double Check'),
)
const nav = h('nav', { class: 'tabs' })
const content = h('div', {})
shell.append(header, nav, content)
app.appendChild(shell)

const buttons = new Map<TabId, HTMLButtonElement>()

async function show(tab: TabId): Promise<void> {
  for (const [id, btn] of buttons) btn.classList.toggle('active', id === tab)
  history.replaceState(null, '', `#${tab}`)
  content.textContent = ''
  switch (tab) {
    case 'settings': await renderSettingsTab(content); break
    case 'formats': await renderFormatsTab(content); break
    case 'log': await renderLogTab(content); break
    case 'docs': renderDocsTab(content); break
  }
}

for (const [id, label] of TABS) {
  const btn = h('button', {}, label)
  btn.addEventListener('click', () => void show(id))
  buttons.set(id, btn)
  nav.appendChild(btn)
}

const initial = (location.hash.slice(1) || 'settings') as TabId
void show(TABS.some(([id]) => id === initial) ? initial : 'settings')
