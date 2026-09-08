# Rollcall

An accessible dice-rolling companion for online tabletop RPG play, built for a blind player using NVDA. The DM says "give me a Dexterity check"; you type `dex`, press Enter, and hear "Dexterity check: 17. Rolled 13 plus 4." No navigating a character sheet, no hunting for the result.

D&D 5e rules. Runs entirely in the browser; your character is kept in the browser's local storage.

Live site: https://tre-wolf-scinta.github.io/rollcall/ — open it with `?character=characters/persi-obsidian.json` on the end to load Persi on any device, then bookmark it.

## Run it

```
npm install
npm run dev
```

Open http://localhost:5173. The roll box has focus when the page loads.

## Rolling

Type what the DM asked for and press Enter. Focus stays in the box; the result is announced by your screen reader and shown in large text.

- Skills and abilities: `stealth`, `perception`, `dex`, `wisdom`. Short forms: `perc`, `soh`, `hist`, `ath`, `init`.
- Saving throws: `dex save`, `wis saving throw`, `death save`.
- Attacks are two rolls, as at the table: `rapier` rolls to hit ("Rapier: 22 to hit. You rolled a 15 plus 7 from modifiers."), then `dmg` (or `rapier dmg`, `rapier -d`) rolls its damage. A natural 20 makes that damage roll critical on its own; `rapier crit dmg` forces it.
- Advantage or disadvantage: `stealth adv`, `stealth dis`. Or press the Advantage or Disadvantage toggle to apply it to every roll until you turn it off.
- Bonuses: `history +2`, `stealth +1d4` (Guidance), `wis save +1d4` (Bless), `-1d4` (Bane).
- Raw dice: `2d6+3`, `d20`, `8d6`.
- Custom rolls from your character file: `sneak` (Sneak Attack).
- Enter on the empty box rolls the last thing again (handy for Extra Attack); so does `again`, and `adv` or `again +2` repeats it with a change. `last` speaks the last result again without rolling.
- `help` lists all of this.

If what you typed matches more than one thing, you hear the options instead of a guess: "Ambiguous: Perception, Performance, or Persuasion. Type more letters."

Every roll is also a large button under a heading (Ability checks, Saving throws, Skills, Attacks, Other rolls), labeled with its modifier; each attack has a to-hit button and a damage button. Shift+Enter on a button rolls with advantage, Ctrl+Enter with disadvantage. Press slash anywhere to jump back to the roll box.

## Your character

Choose "Load or edit character", then paste JSON into the box (or use "Browse for a character file") and press Load. The format:

```json
{
  "name": "Thalia Brightwood",
  "level": 5,
  "abilities": { "str": 10, "dex": 18, "con": 14, "int": 12, "wis": 13, "cha": 8 },
  "proficiencies": {
    "skills": ["acrobatics", "investigation", "perception", "sleight of hand", "stealth"],
    "expertise": ["stealth", "perception"],
    "saves": ["dex", "int"]
  },
  "attacks": [
    { "name": "Rapier", "ability": "dex", "damage": "1d8", "damageType": "piercing" },
    { "name": "Shortbow", "ability": "dex", "damage": "1d6", "damageType": "piercing", "aliases": ["bow"] }
  ],
  "custom": [{ "name": "Sneak Attack", "dice": "3d6", "aliases": ["sneak", "sa"] }],
  "aliases": { "hide": "stealth" }
}
```

Everything is optional. The app derives ability modifiers, proficiency bonus, skill and save modifiers, initiative, and attack numbers from this. Names are case-insensitive and forgiving: `Sleight_of_Hand`, `sleight of hand`, and `soh` all work.

### Import from D&D Beyond

Set the character to Public on D&D Beyond (sheet menu, Sharing), then:

```
npm run import -- https://www.dndbeyond.com/characters/123456789 public/characters/my-hero.json
```

Files under `public/characters/` are published with the site, so a link such as `?character=characters/my-hero.json` loads one on any device. Anyone with the link can read them.

It reads ability scores, proficiencies, expertise, saves, initiative bonuses, weapons (including two-handed versatile damage and magic bonuses), class attacks such as a Beast Barbarian's claws, extra-damage features as custom rolls, and adds a Rage toggle for Barbarians and a Sneak Attack toggle for Rogues. Spells and unarmed strikes are not imported yet. Check the numbers against the sheet once, then load the file in the app.

### Toggles

Things that change an attack while they are on: Rage, Sneak Attack, Bless, Great Weapon Master.

```json
"toggles": [
  { "name": "Rage", "damageBonus": 2, "appliesTo": ["Flail", "Warhammer"], "aliases": ["raging"] },
  { "name": "Sneak Attack", "damageDice": "3d6", "aliases": ["sneak"] },
  { "name": "Great Weapon Master", "attackBonus": -5, "damageBonus": 10 }
]
```

Each toggle is a button next to Advantage (press it to keep it on), a word you can type on its own to switch it (`rage`), or a word you add to one roll (`flail rage`). The announcement names it: "Flail with Rage: 22 to hit." and "Flail with Rage: 9 bludgeoning damage. You rolled a 3 plus 4 from modifiers, plus 2 from Rage." Leave out `appliesTo` to apply it to every attack. Effect dice are doubled on a critical hit.

Extra keys when you need them:

- `"jackOfAllTrades": true` gives half proficiency on untrained checks.
- `"bonuses"` adds to derived numbers: `{ "initiative": 2, "skills": { "perception": 5 }, "saves": { "wis": 1 }, "abilityChecks": { "str": 2 } }`.
- `"overrides"` replaces derived numbers entirely, handy when copying from a sheet: `{ "skills": { "stealth": 11 }, "initiative": 5 }`.
- Attack options: `"proficient": false`, `"attackBonus"`, `"damageBonus"`, `"addAbilityToDamage": false` for an off-hand attack, `"toHit"` to set the to-hit number directly.

## Development

- `npm test` runs the unit tests for the rolling engine.
- `npm run test:e2e` runs the Playwright and axe accessibility tests (first time: `npx playwright install chromium`).
- `npm run check` runs everything.
- Every push to `main` runs the whole suite in GitHub Actions and, only if it passes, publishes the site to GitHub Pages (`.github/workflows/deploy.yml`).

CLAUDE.md holds the accessibility rules the code is held to.
