# Roadmap

What is agreed but not built, in the order it is likely to happen. Each entry records the design decisions already made, so building it later starts from the owner's intent rather than from scratch. Built features move out of here and into README.md.

## The Roll20 bridge: what is left

The extension shipped on 2026-10-22 (see README, "Roll20"). Still to come, when the owner asks:

- Let Roll20 roll: send the formula instead of the result and read Roll20's own dice back into Clatter's live region, so the DM sees Roll20's dice. The markup to read is known from the live tabletop: a `div.message.rollresult` holds `.formula` ("rolling 1d20+5"), one `.diceroll.d20` per die with the face, and `.rolled` with the total.
- Speak as the character: Roll20's "As" dropdown next to the chat box can post the card under a character's name once that character exists in the game.
- Publish to the Chrome Web Store, unlisted, so other players skip the developer-mode step. One-time registration fee and a review of a few days.
- Foundry with a content script for its page or a tiny module (Foundry has a proper chat API), Discord with a webhook address pasted into Settings.
- A one-time Roll20 nuisance to watch for: Chrome may show a "Disable developer mode extensions" bubble at launch while the extension is loaded unpacked.

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
