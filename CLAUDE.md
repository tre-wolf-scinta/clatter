# Rollcall

Accessible dice-rolling companion for online tabletop RPG play (D&D 5e). The player types what the DM asked for — `stealth`, `dex save`, `rapier` — presses Enter, and hears the result at once. Static single-page app: no backend, no accounts; the character lives in localStorage.

## Who it is for, and how to talk to them

The owner and primary user is blind and works with NVDA. Every UI string, and every summary you write for them: result first, reasoning after; no tables, no ASCII diagrams, no emoji; describe visuals in words. They are an experienced developer: skip basics, explain the non-obvious decisions.

## Commands

- `npm install`, then once: `npx playwright install chromium`
- `npm run dev` — Vite on http://localhost:5173 (`.claude/launch.json` config `rollcall-dev`)
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
- Typing rules: flags start with `/` (`/a` to hit, `/d` damage); a bare signed number is hit points (`-5` damage, `+7` healing); a slash word is a question that never rolls (`/ac`, `/passive`, `/skills`, `/stealth`, `/str`, `/hp`, `/status`).
- Hit point sentences: "Took 5. Temporary hit points used up. 43 of 45 hit points." "Healed 7. You are up. 7 of 45 hit points." "Took 12. 0 of 45 hit points. You are down." Death saves append the tally: "That is two failures." Undo says what it restored.
- Readouts: number first, status second. "Stealth plus 5, proficient." "Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield. Shield spell is off." `/skills` lists proficient skills only (the owner's call: non-proficient ones carry no information).
- Ambiguity is reported, never guessed: "Ambiguous: Perception, Performance, or Persuasion. Type more letters."
- No metadata (timestamps, ids, dice notation) unless the user rolled raw dice.

## Architecture

- `src/engine/` is pure TypeScript with no DOM: `dice.ts` (expressions, RNG), `character.ts` (forgiving JSON schema to derived modifiers, including hit point max, armor class parts, and toggles with `acBonus` and `on`), `candidates.ts` (everything rollable plus the matcher), `roll.ts` (d20 mechanics), `hitpoints.ts` (damage, healing, temporary hit points, death save tally, with their sentences), `readouts.ts` (slash answers), `commands.ts` (parser, state, execution), `announce.ts` (roll phrasing), `sample.ts`. Every behavior change here gets a Vitest test; dice are scripted with `queueRng`.
- Session state (`RollerState` in `commands.ts`): sticky mode, active toggles, last roll, pending critical, hit points with an undo history. The app persists hit points per character name in localStorage and seeds active toggles from the character's `on` toggles.
- `src/App.tsx` and `src/ui/` are a thin React layer over the engine: native HTML, plain CSS with custom properties (`src/styles.css`), no component library, no CSS framework. The UI surface is small enough that native elements cover it; add React Aria only for a widget the platform lacks (combobox, listbox).
- `tests/e2e/` is Playwright + axe; `playwright.config.ts` starts the dev server.
- `scripts/import-ddb.mjs` converts a public D&D Beyond character (`npm run import -- <sheet url> public/characters/name.json`) into the JSON schema, including class toggles (Rage, Sneak Attack). `public/characters/` holds the owner's imported characters and is published with the site; a `?character=characters/name.json` link loads one on arrival.
- Deployment: GitHub Pages at https://tre-wolf-scinta.github.io/rollcall/ via `.github/workflows/deploy.yml`, which runs `npm run check` before publishing. Vite `base` is `./` so the build works under the `/rollcall/` sub-path. Toggles are attack modifiers that are sticky buttons, standalone words (`rage`), or one-roll words (`flail rage`); the announcement names them: "Flail with Rage: 22 to hit."
- Randomness: `secureRng` (crypto.getRandomValues) in production; every rolling function takes an injectable `Rng`.

## Verification loop

1. `npm run check` must pass.
2. Start the app (`preview_start` with `rollcall-dev`) and drive it: type a command, press Enter, then read the accessibility tree (`read_page`), which is roughly what NVDA consumes. Confirm the Result region text, which element has focus, and the heading and landmark map. Screenshot only to check the visual layer.
3. Tell the user what the accessibility tree says, not just that tests passed. Real NVDA checks are theirs to run; say which ones you could not do.

## Conventions

- TypeScript strict, no `any`. Small pure functions in the engine; no classes except `CharacterError`.
- No new dependency without saying why in the commit message.
- Commit messages: one-line summary, then what changed for a screen-reader user, if anything did.
- The character JSON schema is typed in `character.ts` (`CharacterFile`) and documented in README.md. Keep it forgiving: unknown keys ignored, names case-insensitive, both raw scores and explicit overrides accepted.
- Windows note: the Bash tool truncates commands over about 8 KB. Write large files with the Write tool.
