# Clatter

An accessible dice-rolling companion for online tabletop RPG play, built for a blind player using NVDA. The DM says "give me a Dexterity check"; you type `dex`, press Enter, and hear "Dexterity check: 17. Rolled 13 plus 4." No navigating a character sheet, no hunting for the result.

D&D 5e rules. Runs entirely in the browser; your character is kept in the browser's local storage.

Live site: https://clatter.onrender.com/ — open it with `?character=characters/persi-obsidian.json` on the end to load Persi on any device, then bookmark it. A mirror runs at https://tre-wolf-scinta.github.io/clatter/. The browser keeps your character and hit points per site, so pick one address and stay with it.

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
- Attacks are two rolls, as at the table: `rapier` rolls to hit ("Rapier: 22 to hit. You rolled a 15 plus 7 from modifiers."), then `dmg` (or `/d`, or `rapier /d`) rolls its damage. A natural 20 makes that damage roll critical on its own; `rapier crit dmg` forces it. `/a` means the roll to hit.
- The inventory HUD: type `/i` or `/inventory`, press the Inventory button, or press its shortcut (Alt+I in Chrome and Edge, Alt+Shift+I in Firefox; it works even while you are typing). A dialog opens with one heading per section, Weapons, Armor and shields, Potions, Utility, Quest items, and one button per item. H moves between sections, B between items. Items you can equip or use are toggle buttons whose pressed state is what will be true after Done: press the shield to put it on, the axe to put it in hand, a potion to drink one. Weapons and armor are exclusive, so choosing the axe deselects the flail and says so. Done applies everything, closes, puts you back where you were, and reads one summary: "Axe in hand. Shield on. Armor class 18. Used a Potion of Healing: healed 7. 33 of 38 hit points. 1 left." Escape or Cancel discards. One `undo` reverses the whole batch. Plain buttons, such as quest items, read their description instead. The bare word `inventory` reads the same sections aloud without opening anything.
- The feats and abilities HUD: type `/f` or `/feats`, press the Feats and abilities button, or press Alt+A (Alt+Shift+A in Firefox). Same layout: Class features, Species traits, Feats, then Rest. A feature that is a toggle, such as Rage or Reckless Attack, is a toggle button that says its uses and whether it is on: "Rage, 2 of 3 uses, plus 2 damage, on". A feature with limited uses, such as Second Wind or Lucky, is a toggle button that spends one use on Done. Everything else is a plain button that reads its description. The Rest section holds "Hit die, 4 of 5 left, d12", Short rest, and Long rest; pick one and Done takes it first, so you can rest and switch Rage back on in one go. The bare word `feats` reads it aloud.
- Features by typing: `rage` switches Rage on and spends a use ("Rage on. 2 uses left."); at zero you hear "No uses of Rage left until a long rest." `use second wind` spends a limited feature and heals if it heals. `/rage` reads one feature with its state and description. `short rest` recovers short-rest features and says how many hit dice you have; `hit die` spends one ("Spent a hit die: healed 9. 49 of 60 hit points. You rolled a 5 plus 4 from Constitution. 4 hit dice left."); `long rest` recovers hit points, every use, and half your hit dice. `undo` covers all of it.
- The spells HUD: type `/s` or `/spells`, press the Spells button, or press Alt+S (Alt+Shift+S in Firefox). One heading per level with the slots left in it, "Level 1, 3 of 4 slots", and one button per spell that says what it does: "Fire Bolt, plus 4 to hit, 2d10 fire", "Fireball, Dexterity save DC 15, 8d6 fire, half on a success, concentration". This screen acts on press: Enter on a spell casts it at its own level, pays for it, announces the result, and closes, because a cast is one roll rather than a selection to stage. Unprepared spells say so and only read their description. The bare word `spells` reads the screen aloud.
- Spells by typing: an attack cantrip is two rolls like a weapon, `fire bolt` then `dmg`, and a natural 20 makes the damage critical. A leveled spell pays first and never rolls when it cannot: `fireball` says "Fireball: 28 fire damage. Dexterity save DC 15 for half. You rolled ... Level 3 slots: 1 of 2 left."; with no slot left you hear "No level 3 slots left. Level 4 slots: 1 left. Type fireball 4 to use one." `fireball 4` casts at level 4 with the extra dice; `cure wounds` rolls healing; `bless` says "Concentrating on Bless." and damage while concentrating adds "Constitution save DC 12 to keep Bless." `drop` ends concentration; `concentration` reads it; `/slots` reads your slots; `/fireball` reads one spell. Enter on the empty box repeats a cantrip but never a slot. A short rest brings pact slots back, a long rest everything.
- The weapon in hand: attacking by name puts that weapon in hand, and so does `wield flail` (also `equip`, `draw`, `hold`). After that, bare `attack` or `/a` rolls to hit with it and `dmg` rolls its damage. `unequip` or `sheathe` puts it away. The character file's `"equipped": true` picks the weapon you start with.
- Gear and items: `equip shield` and `unequip shield` (also `don`, `doff`) switch a toggle such as a shield and say the new armor class. `drink healing`, `use torch`, or `quaff giant` uses a consumable: "Drank a Potion of Healing: healed 7. 50 of 60 hit points. 2 left." `/equipped` reads what you hold, your shield, your armor, and what you carry; `/potions` reads what is left. `undo` covers items too.
- Hit points: `-5` takes 5 damage (temporary hit points go first), `take 5` and `heal 7` work too, `+7` heals 7, `temp 8` sets temporary hit points, `hp` reads them, `hp 30` sets them, `undo` reverses the last change, `long rest` resets. At 0 hit points, death saves keep their own count and damage counts as a failure. "Took 5. Temporary hit points used up. 43 of 45 hit points."
- Questions start with a slash and never roll: `/ac` ("Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield."), `/passive`, `/skills` (proficient ones only), `/saves`, `/attacks`, `/features`, `/hd`, `/hp`, `/status`, `/toggles`, or a name: `/stealth` ("Stealth plus 5, proficient."), `/str` ("Strength 18, modifier plus 4. Saving throw plus 7, proficient."), `/flail`, `/rage` ("Rage on, 2 of 3 uses, plus 2 damage. Enter a rage as a bonus action...").
- Advantage or disadvantage: `stealth adv`, `stealth dis`. Or press the Advantage or Disadvantage toggle to apply it to every roll until you turn it off.
- Bonuses: `history +2`, `stealth +1d4` (Guidance), `wis save +1d4` (Bless), `-1d4` (Bane).
- Raw dice: `2d6+3`, `d20`, `8d6`.
- Custom rolls from your character file: `sneak` (Sneak Attack).
- Enter on the empty box rolls the last thing again (handy for Extra Attack); so does `again`, and `adv` or `again +2` repeats it with a change. `last` speaks the last result again without rolling.
- `help` lists all of this.

If what you typed matches more than one thing, you hear the options instead of a guess: "Ambiguous: Perception, Performance, or Persuasion. Type more letters."

Every roll is also a large button under a heading (Ability checks, Saving throws, Skills, Attacks, Other rolls), labeled with its modifier; each attack has a to-hit button and a damage button. A checkbox above the skills narrows them to the ones you are proficient in. Shift+Enter on a button rolls with advantage, Ctrl+Enter with disadvantage. Press slash anywhere to jump back to the roll box.

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

It reads ability scores, proficiencies, expertise, saves, initiative bonuses, weapons (including two-handed versatile damage and magic bonuses), class attacks such as a Beast Barbarian's claws, extra-damage features as custom rolls, every class feature, species trait, and feat with its description and limited uses, hit dice, spells with their dice, saves, concentration, slots, and pact magic, and adds Rage and Reckless Attack toggles for Barbarians and a Sneak Attack toggle for Rogues. Unarmed strikes are not imported yet. Check the numbers against the sheet once, then load the file in the app.

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

### Hit points and armor class

```json
"hitPoints": { "max": 60 },
"armorClass": { "parts": [{ "name": "unarmored defense", "value": 10 }, { "name": "Dexterity", "value": 2 }, { "name": "Constitution", "value": 4 }] }
```

Current hit points are tracked in the app, per device. Anything that changes armor class while it is on is a toggle with `acBonus`: a shield (`"on": true` because it starts equipped), the Shield spell, a potion. `/ac` adds up the parts and whichever of those are on, and says which are off. The importer fills all of this in from D&D Beyond.

### Inventory

```json
"inventory": [
  { "name": "Flail", "kind": "weapon", "equipped": true, "description": "A spiked ball on a chain." },
  { "name": "Chain shirt", "kind": "armor", "baseAc": 13, "dexCap": 2, "equipped": true },
  { "name": "Shield", "kind": "shield", "equipped": true },
  { "name": "Potion of Healing", "kind": "potion", "count": 2, "heal": "2d4+2", "aliases": ["healing"] },
  { "name": "Torch", "kind": "utility", "count": 5, "consumable": true },
  { "name": "Rope", "kind": "utility", "description": "Fifty feet of hempen rope." },
  { "name": "Signet ring", "kind": "quest", "description": "The seal of House Varen." }
]
```

Kinds are `weapon`, `armor`, `shield`, `potion`, `utility` (the default), and `quest`. A weapon names an attack (by default, the attack with the same name). Armor gives its `baseAc` and `dexCap`: leave the cap out for light armor, 2 for medium, 0 for heavy; `armorClass.parts` is then the unarmored formula, and `wear chain shirt`, `doff armor`, or the HUD swap what is worn. A shield (or any item with `acBonus`) becomes a toggle you `equip` and `unequip`. Potions, and utility items marked `consumable` or given `heal` or `toggle`, count down when used; counts are tracked per device. `description` is read after the item's name in the HUD. The importer brings all of this in from D&D Beyond, including descriptions; mark quest items yourself. The older top-level `consumables` list still works.

### Features and hit dice

```json
"toggles": [
  { "name": "Rage", "damageBonus": 2, "aliases": ["raging"] },
  { "name": "Reckless Attack", "advantage": true, "appliesTo": ["Flail", "Warhammer"], "aliases": ["reckless"] }
],
"features": [
  { "name": "Rage", "section": "class", "uses": { "max": 3, "per": "long rest" }, "description": "Enter a rage as a bonus action." },
  { "name": "Reckless Attack", "section": "class", "description": "Advantage on Strength attack rolls until your next turn." },
  { "name": "Danger Sense", "section": "class", "description": "Advantage on Dexterity saving throws against effects you can see." },
  { "name": "Second Wind", "section": "class", "uses": { "max": 1, "per": "short rest" }, "heal": "1d10+5" },
  { "name": "Surprise Attack", "section": "species", "description": "Extra 2d6 damage on the first hit of a fight." },
  { "name": "Grappler", "section": "feat", "description": "..." }
],
"hitDice": { "die": "d12", "count": 5 }
```

Sections are `class` (the default), `species` (also `race`), `feat`, and `other`. A feature with the same name as a toggle switches that toggle, and switching it on spends one of the feature's `uses`; name a different toggle with `"toggle"`. A feature with `uses` and no toggle is spent with `use second wind`, healing by its `heal` dice if it has them; `per` is `long rest` (the default) or `short rest`. A toggle with `"advantage": true` gives the roll to hit advantage while it is on, and cancels disadvantage as the rules do. `hitDice` gives the die and how many (the default is the level); `hit die` spends one and adds your Constitution modifier. Uses and hit dice are tracked per device. The importer fills all of it in from D&D Beyond, with the uses D&D Beyond shows on the sheet.

### Spells

```json
"spellcasting": { "ability": "wis", "slots": [4, 3, 2] },
"spells": [
  { "name": "Sacred Flame", "level": 0, "damage": "2d8", "damageType": "radiant", "save": "dex" },
  { "name": "Fire Bolt", "level": 0, "damage": "2d10", "damageType": "fire" },
  { "name": "Cure Wounds", "level": 1, "heal": "1d8+3", "upcast": "1d8" },
  { "name": "Bless", "level": 1, "concentration": true },
  { "name": "Shield", "level": 1, "toggle": "Shield spell" },
  { "name": "Magic Missile", "level": 1, "kind": "damage", "damage": "3d4+3", "damageType": "force", "upcast": "1d4+1" },
  { "name": "Fireball", "level": 3, "damage": "8d6", "damageType": "fire", "save": "dex", "upcast": "1d6", "description": "..." },
  { "name": "Hold Person", "level": 2, "save": "wis", "concentration": true, "prepared": false },
  { "name": "Misty Step", "level": 2, "uses": { "max": 1, "per": "long rest" } }
]
```

`spellcasting.ability` gives the save DC (8 plus proficiency plus the modifier) and the spell attack bonus; `saveDc` and `attackBonus` replace them when copying from a sheet. `slots` is a list by level, `[4, 3, 2]`, or an object, `{ "1": 4, "2": 3 }`; Warlocks give `"pact": { "level": 3, "count": 2 }` instead, and pact slots come back on a short rest. A spell's `kind` is worked out from its fields: `save` makes a save spell (half damage on a success for a leveled spell, none for a cantrip, or set `saveEffect`), `damage` without a save makes a spell attack, `heal` makes a healing spell, nothing makes a utility spell that only announces itself; say `"kind": "damage"` for Magic Missile and `"kind": "dice"` for Sleep. Write cantrip damage at the character's level. `upcast` is the extra dice for each slot level above the spell's. `toggle` switches a toggle on when cast; `concentration` tracks it; `prepared: false` lists the spell without letting you cast it; `uses` gives free castings that need no slot (a racial spell), after which slots are used. Slots and concentration are tracked per device. The importer brings spells, dice, saves, slots, and pact magic in from D&D Beyond; a spell whose damage type you choose when casting comes in without a type, and Shield and Haste get a toggle of their own.

Extra keys when you need them:

- `"jackOfAllTrades": true` gives half proficiency on untrained checks.
- `"bonuses"` adds to derived numbers: `{ "initiative": 2, "skills": { "perception": 5 }, "saves": { "wis": 1 }, "abilityChecks": { "str": 2 } }`.
- `"overrides"` replaces derived numbers entirely, handy when copying from a sheet: `{ "skills": { "stealth": 11 }, "initiative": 5 }`.
- Attack options: `"proficient": false`, `"attackBonus"`, `"damageBonus"`, `"addAbilityToDamage": false` for an off-hand attack, `"toHit"` to set the to-hit number directly.

## Development

- `npm test` runs the unit tests for the rolling engine.
- `npm run test:e2e` runs the Playwright and axe accessibility tests (first time: `npx playwright install chromium`).
- `npm run check` runs everything.
- Every push to `main` runs the whole suite in GitHub Actions (`.github/workflows/deploy.yml`). Only if it passes does the workflow move the `release` branch to that commit; Render builds the site from `release` and publishes it at the address above, so a build that fails the accessibility checks never goes live. The same run publishes the GitHub Pages mirror.
- The Render service was created once from the CLI, with no dashboard: `render services create --name clatter --type static_site --repo https://github.com/tre-wolf-scinta/clatter --branch release --build-command "npm ci && npm run build" --publish-directory dist`. `render.yaml` describes the same service; `render blueprints validate render.yaml` checks it. `.node-version` pins Node for Render and for CI.

CLAUDE.md holds the accessibility rules the code is held to.
