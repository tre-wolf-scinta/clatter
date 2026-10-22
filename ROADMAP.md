# Roadmap

What is agreed but not built, in the order it is likely to happen. Each entry records the design decisions already made, so building it later starts from the owner's intent rather than from scratch. Built features move out of here and into README.md.

## Next: the Roll20 bridge, a Chrome extension

Decided 2026-10-22. The owner plays on Roll20 with Beyond20 in Chrome and wants each result in Roll20's chat the moment it is announced, without leaving Clatter. Copy and paste was offered and declined for their own use; it may come later for other players.

- A small Manifest V3 extension in an `extension/` folder of this repo, no bundler, plain JavaScript. Permissions only for Clatter's two addresses, localhost for development, and `app.roll20.net`.
- Clatter posts each result to the page with `window.postMessage`; the extension's content script on the Clatter tab relays it to the service worker, which finds the open Roll20 game tab and hands it to the content script there. That script types a message into Roll20's chat box and presses send, which is how Beyond20 does it. Roll20 needs no account change, no API, no Pro subscription.
- The message is a Roll20 template so sighted players see a card: the character's name, what was rolled, the total, the breakdown. Pre-rolled numbers are the norm at Beyond20 tables already.
- Clatter announces the bridge's state once when it connects ("Roll20 bridge connected"), never per roll, and a Settings checkbox turns sending off.
- A second mode, later if the table wants it: send the formula instead and let Roll20 roll, with the content script reading the result back from the chat log into Clatter's live region, so the DM sees Roll20's own dice.
- Testing: Playwright can launch Chromium with the unpacked extension and a local page that mimics Roll20's chat box and send button. The real Roll20 chat markup is checked against a live game when building, since Roll20 changes it now and then; that is the maintenance risk of this route.
- Installing for the owner: load the folder unpacked with Developer mode on in `chrome://extensions`. Publishing to the Chrome Web Store, unlisted, is optional and only needed to share it with other players without the developer-mode step; it costs a one-time registration fee and a review of a few days.
- Foundry later with a content script for its page or a tiny module (Foundry has a proper chat API), Discord later with a webhook address pasted into Settings.

## Dice fairness HUD

Asked for 2026-10-22, after the owner felt the dice repeated and ran low and a 400,000-roll check of the generator showed it fair. The idea: let players see the math behind their own rolls before sending the dice to dice jail.

- Every raw die result Clatter rolls is recorded as it happens: the die size and the face, for every d20 and every damage, healing, and hit die, from typed rolls, buttons, and the HUDs alike. The engine gets a die listener so nothing is missed; the record lives per device in localStorage, with a button to clear it.
- A fourth HUD on the same pattern as the others, opened by `/dice` or `/fairness` (the owner may prefer `/jail`), with one section per die size that has data, d20 first. Each section says: how many rolls, the average against the fair average, the share at or under the midpoint, back-to-back repeats against the fair rate (one in the number of sides), the most and least frequent faces with how far they sit from expected, and for the d20 the natural 20 and natural 1 rates. The numbers recompute from the record every time the screen opens, so they are always current as of the last roll.
- One plain-language verdict per die, driven by sample size and a chi-square test: "Too few rolls to say yet", "Fair so far", or "Unusual: 3 is coming up twice as often as it should". Say the threshold in words, never the statistic.
- The spoken form, the bare word `dice`, reads the d20 summary in two sentences. For sighted players at the table the screen also holds a real HTML table with row and column headers, which NVDA can walk with table navigation.
- Optional: a button that rolls a d20 one thousand times into the record, so a player can see fairness without waiting a season for the sample.

## Progressive web app

Carefully, and only after a VoiceOver or TalkBack pass on a phone: a manifest, a service worker for offline, icons, and a device-aware map sentence in the HUDs (the current one names NVDA's H and B keys). The owner has decided against native app wrappers for now; the engine is pure TypeScript and would carry over if that changes.

## Smaller items, when asked for

- Copy to clipboard for players who use a VTT the bridge does not reach: a `copy` command and a setting to copy every result, formatted for Roll20 chat.
- Typo tolerance: a corrected "steath" still announces "Stealth check: 22", so a one-letter slip can be forgiven; ambiguity stays reported, never guessed.
- Earcons: short sounds on a natural 20, a natural 1, and a critical hit. The owner will supply the sounds.
- Quest notes and NPC screens on the HUD pattern, read-only.
- Ammunition counting, off-hand weapons, upcasting from the Spells screen (today upcasting is typed: `fireball 4`).
