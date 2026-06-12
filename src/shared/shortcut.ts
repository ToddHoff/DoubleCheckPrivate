// Chrome displays Mac shortcuts as bare symbols (⇧⌘Space) — spell them out,
// because not everyone knows ⇧ is the Shift key.
export function spellOutShortcut(display: string): string {
  const parts: string[] = []
  if (/⌃/.test(display)) parts.push('Control')
  if (/⌥/.test(display)) parts.push('Option')
  if (/⇧/.test(display)) parts.push('Shift')
  if (/⌘/.test(display)) parts.push('Command')
  const key = display.replace(/[⌃⌥⇧⌘]/g, '').split('+').filter(Boolean).pop()?.trim()
  if (key) parts.push(key)
  return parts.join(' + ')
}

/** the user's current binding for a command, with a spelled-out form when it uses Mac symbols */
export async function getShortcut(command: string): Promise<{ display: string; spelled: string | null } | null> {
  const commands = await chrome.commands.getAll()
  const shortcut = commands.find((c) => c.name === command)?.shortcut
  if (!shortcut) return null
  return {
    display: shortcut,
    spelled: /[⌃⌥⇧⌘]/.test(shortcut) ? spellOutShortcut(shortcut) : null,
  }
}
