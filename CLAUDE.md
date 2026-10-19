# Clatter

Accessible dice-rolling companion for online tabletop RPG play (D&D 5e). The player types what the DM asked for — `stealth`, `dex save`, `rapier` — presses Enter, and hears the result at once. Static single-page app: no backend, no accounts; the character lives in localStorage.

## Who it is for, and how to talk to them

The owner and primary user is blind and works with NVDA. Every UI string, and every summary you write for them: result first, reasoning after; no tables, no ASCII diagrams, no emoji; describe visuals in words. They are an experienced developer: skip basics, explain the non-obvious decisions.

## Commands

- `npm install`, then once: `npx playwright install chromium`
- `npm run dev` — Vite on http://localhost:5173 (`.claude/launch.json` config `clatter-dev`)
- `npm test` — Vitest unit tests for the engine (deterministic, no DOM)
- `npm run test:e2e` — Playwright + axe against the real page (starts the dev server itself)
- `npm run check` — typecheck, unit, e2e. Run this before saying anything works; report failures verbatim.

## Accessibility invariants (non-negotiable)

1. Interactive elements are native (`button`, `input`, `dialog`) with an accessible name that says what they do: "Stealth +10", "Dexterity save +7". Never a `div` or `span` with a click handler.
2. Keyboard is the primary input. Anything a mouse can do, Tab, Enter, Space, and Escape can do. Focus moves only on a user action and is never trapped except inside a modal `dialog`.
3. Results reach the screen reader without navigation: one `aria-live` region (`src/ui/LiveRegion.tsx`), always in the DOM, never unmounted, updated with the clear-then-fill trick so identical text is re-announced. After a roll, focus stays in the roll box.
4. Real heading hierarchy (`h1`, then one `h2` per section) and named landmarks (`section aria-labelledby`). NVDA users navigate by H and D; keep both maps meaningful. Nothing important is only visual.
5. Anything with focus management (dialogs, menus, comboboxes) is a native element or an accessible primitive (React Aria, if ever needed). Never hand-roll focus trapping or ARIA widgets.
6. Playwright locators are role + accessible name: `getByRole('button', { name: 'Stealth +10' })`. No test ids, no CSS selectors. If a test cannot find it by role and name, NVDA cannot either: fix the markup, not the test.
7. `@axe-core/playwright` runs on every page state a test reaches (load, dialog open) and must report zero violations. Do not disable rules.
8. Visual layer: hand-check contrast in both `prefers-color-scheme` themes (4.5:1 text, 3:1 borders and focus rings), support `forced-colors: active`, keep the page free of motion.
9. Announcement text is the product. Follow the phrasing rules below; a change to `announce.ts` needs a unit test asserting the exact string.

## Announcement phrasing (src/engine/announce.ts)

- Two short sentences: what was rolled and the total, then how it was made. "Stealth check: 22. You rolled a 12 plus 10 from modifiers." With advantage: "You rolled a 12 and a 7, kept the 12, plus 10 from modifiers."
- Natural 20 and natural 1 go first: "Natural 20! Stealth check: 30."
- Attacks are two separate rolls, as at the table. To hit: "Flail with Rage: 12 to hit. You rolled a 5 plus 7 from modifiers." Damage: "Flail with Rage: 13 bludgeoning damage. You rolled a 7 plus 4 from modifiers, plus 2 from Rage." A natural 20 makes the next damage roll for that attack critical automatically: "Critical hit! Flail: 22 bludgeoning damage."
- Digits for numbers, words for operators (plus, minus, and), articles before dice ("a 5", "an 8"). No symbols, no parentheses, no abbreviations NVDA would spell out.
- The first sentence must stand alone; the second is a setting. Never jam several facts into one sentence (the owner's feedback, 2026-09-08).
- Enter on the empty box rolls the last thing again (Extra Attack, repeated saves); `last` re-speaks the last result without rolling.
- Typing rules: flags start with `/` (`/a` to hit, `/d` damage); a bare signed number is hit points (`-5` damage, `+7` healing); a slash word is a question that never rolls (`/ac`, `/passive`, `/skills`, `/stealth`, `/str`, `/hp`, `/status`, `/equipped`, `/potions`, `/features`, `/rage`, `/hd`). Rests and dice: `short rest`, `long rest` (or `rest`), `hit die` (or `hd`).
- HUD screens (`src/ui/InventoryHud.tsx`, `src/ui/FeaturesHud.tsx`; Spells to follow on the same pattern): a native modal `dialog` named for the screen, focused on open so NVDA reads its name and its description sentence, one `h3` per section in a fixed order, one native button per item. Items that can be applied are toggle buttons whose `aria-pressed` state is the state after Done, never an action on press; exclusive slots (one weapon, one armor, one rest) deselect the other and say so in the dialog's `role=status`. Done applies everything as one `applyBatch` (one announcement, one undo step) and closes; Escape and Cancel discard. Plain buttons read a description into the status region. Opened by `/i` or `/f`, the Inventory or Feats and abilities button, or that button's `accesskey` (Alt+I and Alt+A in Chrome, Alt+Shift in Firefox) backed by a window keydown handler; never a bare-letter shortcut, which NVDA's browse mode would swallow. The bare words `inventory` and `feats` read the screen aloud instead of opening it; the slash forms only open. The Feats screen ends with a Rest section (hit die, short rest, long rest) because that is where uses come back; its Other section appears only when a toggle has no feature entry.
- The weapon in hand: `attack`, `/a`, `dmg`, `/d` on their own act on the weapon in hand; attacking by name sets it (the owner's call), as does `wield X`; `unequip` empties it. `equip X` / `unequip X` (also `don`, `doff`) set a toggle on or off, never flip, and say the new armor class: "Shield on. Armor class 18." `drink X` / `use X` consume an item: "Drank a Potion of Healing: healed 7. 50 of 60 hit points. 2 left." Readouts: "Flail in hand: plus 7 to hit, 1d8+4 bludgeoning. Shield on. Armor: unarmored defense. Carrying Potion of Healing with 2 left."
- Features and uses: switching a limited toggle on spends a use and says what is left, "Rage on. 2 uses left."; at zero it refuses, "No uses of Rage left until a long rest." The one-roll word (`flail rage`) never spends. `use second wind` spends a limited feature: "Used Second Wind: healed 9. 49 of 60 hit points. You rolled a 4 plus 5. 0 uses left." Rests: "Short rest. Second Wind recovered. 4 hit dice left. Type hit die to spend one." "Spent a hit die: healed 9. 49 of 60 hit points. You rolled a 5 plus 4 from Constitution. 4 hit dice left." "Long rest. 60 of 60 hit points. Rage recovered. Hit dice: 5 of 5." (half the hit dice come back, as the rules say). An advantage toggle names itself in the label and cancels disadvantage: "Flail with advantage and Reckless Attack: 22 to hit." Toggles that only touch the roll to hit stay out of the damage sentence. Pressing a toggle button on the page goes through the engine too, so the live region says "Rage on. 2 uses left." as the button changes.
- Hit point sentences: "Took 5. Temporary hit points used up. 43 of 45 hit points." "Healed 7. You are up. 7 of 45 hit points." "Took 12. 0 of 45 hit points. You are down." Death saves append the tally: "That is two failures." Undo says what it restored.
- Readouts: number first, status second. "Stealth plus 5, proficient." "Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield. Shield spell is off." `/skills` lists proficient skills only (the owner's call: non-proficient ones carry no information).
- Ambiguity is reported, never guessed: "Ambiguous: Perception, Performance, or Persuasion. Type more letters."
- No metadata (timestamps, ids, dice notation) unless the user rolled raw dice.

## Architecture

- `src/engine/` is pure TypeScript with no DOM: `dice.ts` (expressions, RNG), `character.ts` (forgiving JSON schema to derived modifiers, including hit point max, armor class parts, and toggles with `acBonus` and `on`), `candidates.ts` (everything rollable plus the matcher), `roll.ts` (d20 mechanics), `hitpoints.ts` (damage, healing, temporary hit points, death save tally, with their sentences), `readouts.ts` (slash answers), `commands.ts` (parser, state, execution), `announce.ts` (roll phrasing), `sample.ts`. Every behavior change here gets a Vitest test; dice are scripted with `queueRng`.
- Session state (`RollerState` in `commands.ts`): sticky mode, active toggles, last roll, pending critical, the weapon in hand, the armor worn, item counts, feature uses left, hit dice left, and hit points, with an undo history. Every undo entry keeps the resources; a HUD batch also keeps the gear and a spent toggle keeps the toggles, so undo says only what moved. The app persists hit points, hand, armor, item counts, uses, and hit dice per character name in localStorage (`clatter.*.<name>`), and seeds toggles, hand, and armor from the file's `on` and `equipped` flags. A missing entry in `uses` or a null `hitDice` means full.
- Inventory model (`inventory` in the file, `DerivedItem`): kinds weapon (names an attack), armor (`baseAc`, `dexCap`; worn armor replaces the file's unarmored `armorClass.parts`, `armorClass.bonuses` always apply), shield or any `acBonus` item (becomes a toggle of the same name), potion and consumable utility (become consumables), utility, quest. `readouts.ts` computes armor class from what is worn; `describeInventory` is the spoken form of the HUD.
- Features model (`features` in the file, `DerivedFeature`): sections class, species, feat, other; optional `uses` (`max`, `per` short or long rest), a `toggle` it switches (default: the toggle with the same name; switching on spends a use), `heal` dice for Second Wind. Toggles gain `advantage`. `hitDice` (`die`, `count`). `readouts.ts` has `featureSections` (the HUD layout, with toggles that have no feature under Other), `describeFeatures` (its spoken form), and `answerQuery` merges a roll, a feature, and a toggle of the same name into one topic so `/surprise attack` reads the dice and the description.
- `src/App.tsx` and `src/ui/` are a thin React layer over the engine: native HTML, plain CSS with custom properties (`src/styles.css`), no component library, no CSS framework. The UI surface is small enough that native elements cover it; add React Aria only for a widget the platform lacks (combobox, listbox).
- `tests/e2e/` is Playwright + axe; `playwright.config.ts` starts the dev server.
- `scripts/import-ddb.mjs` converts a public D&D Beyond character (`npm run import -- <sheet url> public/characters/name.json`) into the JSON schema, including class toggles (Rage, Sneak Attack). `public/characters/` holds the owner's imported characters and is published with the site; a `?character=characters/name.json` link loads one on arrival.
- Deployment: Render static site `clatter` (srv-db7ucqm7bikc73cln5og) at https://clatter.onrender.com/, built from the `release` branch. `.github/workflows/deploy.yml` runs `npm run check` on every push to `main` and, only on success, force-pushes that commit to `release`, which Render auto-deploys; the same run publishes the GitHub Pages mirror at https://tre-wolf-scinta.github.io/clatter/. The GitHub repo is `tre-wolf-scinta/clatter` (renamed from `rollcall`, briefly `dicecaller`, on 2026-10-14; the local folder is still `C:\Users\tre_s\rollcall`). Never push to `release` by hand. `render.yaml` mirrors the service config (`render blueprints validate render.yaml`); the logged-in Render CLI (`render services`, `render deploys list <id>`, `render logs`) is the way to inspect it. `.node-version` pins Node 22 for Render and CI. Vite `base` is `./` so the build works at a root or under a sub-path.
- Toggles are attack modifiers that are sticky buttons, standalone words (`rage`), or one-roll words (`flail rage`); the announcement names them: "Flail with Rage: 22 to hit."
- Randomness: `secureRng` (crypto.getRandomValues) in production; every rolling function takes an injectable `Rng`.

## Verification loop

1. `npm run check` must pass.
2. Start the app (`preview_start` with `clatter-dev`) and drive it: type a command, press Enter, then read the accessibility tree (`read_page`), which is roughly what NVDA consumes. Confirm the Result region text, which element has focus, and the heading and landmark map. Screenshot only to check the visual layer.
3. Tell the user what the accessibility tree says, not just that tests passed. Real NVDA checks are theirs to run; say which ones you could not do.

## Conventions

- TypeScript strict, no `any`. Small pure functions in the engine; no classes except `CharacterError`.
- No new dependency without saying why in the commit message.
- Commit messages: one-line summary, then what changed for a screen-reader user, if anything did.
- The character JSON schema is typed in `character.ts` (`CharacterFile`) and documented in README.md. Keep it forgiving: unknown keys ignored, names case-insensitive, both raw scores and explicit overrides accepted.
- Windows note: the Bash tool truncates commands over about 8 KB. Write large files with the Write tool.
