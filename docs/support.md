# Double Check — Support

<!-- Canonical hosted copy (keep in sync with this file):
     https://github.com/ToddHoff/DoubleCheckPublic/blob/main/support.md
     This URL goes in the Chrome Web Store listing's support field. -->

Questions, bug reports, feature requests: **tmh@possibility.com**

When reporting a problem, please include your Chrome version
(`chrome://version`), what you clicked or pressed, and what you expected to
happen — never include the actual values you were verifying. A screenshot
helps, but check it doesn't show sensitive numbers before sending.

## Quick answers

**The keyboard shortcut does nothing.**
Check it's actually bound at `chrome://extensions/shortcuts` — Chrome
silently leaves it blank if another extension claimed the combination. On a
Mac, also make sure macOS itself doesn't own it (System Settings → Keyboard
→ Keyboard Shortcuts). The shortcut can't work on Chrome's own pages
(`chrome://…`, the Web Store) — use the toolbar button or right-click menu
there. For files opened from disk, enable "Allow access to file URLs" on the
extension's card in `chrome://extensions`.

**What is ⇧⌘Space?**
That's Shift + Command + Space — Chrome shows Mac shortcuts as symbols.
⇧ is Shift, ⌘ is Command, ⌥ is Option, ⌃ is Control.

**There's no Compare button.**
An empty field opens in input mode, which is two steps: step 1 enters the
value, step 2 re-types it blind — Compare appears in step 2. A field that
already has a value opens in verify mode with Compare on the first screen.

**The field turned blue, not green.**
Blue in step 1 means "the format looks right" — the value isn't confirmed
yet. Green is reserved for an actual match between your two independent
entries.

**"Microphone access is blocked" when using Speak it.**
Chrome's microphone prompt names the website you're on — that's how browsers
attribute extension features running in a page. Allow it once per site. If
it was dismissed or blocked, click the mic icon in the address bar or check
`chrome://settings/content/microphone`. On a Mac, also confirm Chrome itself
is allowed under System Settings → Privacy & Security → Microphone.

**It's listening but says it didn't hear anything.**
Chrome is probably using a different microphone than the one you're speaking
into — common with Bluetooth earbuds. Check System Settings → Sound → Input
(does the level meter move when you speak?) and Chrome's device choice at
the top of `chrome://settings/content/microphone`. Start reading the digits
as soon as "Listening" appears, and read digit by digit.

**"Couldn't capture this page" when scanning a screen region.**
Screen scanning uses the one-time page access Chrome grants when you open
Double Check with the shortcut, the right-click menu, or the toolbar button.
Re-open it one of those ways, or paste a screenshot instead (⌘V / Ctrl+V
works in any entry step).

**The read-aloud speaker button is missing.**
It appears in verify mode and on the green match screen — not during blind
entry, where hearing the value would defeat the purpose. If it's disabled
with a "no local voice" note, your device has no on-device voice; network
voices are deliberately never used.

**Something looks stale after an update.**
Reload any tabs that were open before the update — a page keeps running the
code it loaded originally.

**Where is my license? I switched computers.**
Open the toolbar popup → "already paid?" and log in with the email you used
at purchase. Subscriptions are managed from Settings → License → Manage
subscription.

**Does Double Check see my account numbers?**
The values you verify are processed only on your device and are never
transmitted, logged, or stored — see the
[privacy policy](https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md).
The verification log records that a check happened, never the value.

## Policies

- [Privacy policy](https://github.com/ToddHoff/DoubleCheckPublic/blob/main/privacy-policy.md)
- [Terms of service](https://github.com/ToddHoff/DoubleCheckPublic/blob/main/terms.md)

Double Check is made by Possibility Outpost Inc.
