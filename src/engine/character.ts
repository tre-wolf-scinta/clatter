/**
 * Character model: the forgiving JSON a player writes (CharacterFile) and the
 * fully derived numbers the roller uses (Character). D&D 5e rules.
 */
import { type DiceExpr, parseDiceExpr } from './dice'

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof ABILITIES)[number]

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

export type SkillId =
  | 'acrobatics'
  | 'animal-handling'
  | 'arcana'
  | 'athletics'
  | 'deception'
  | 'history'
  | 'insight'
  | 'intimidation'
  | 'investigation'
  | 'medicine'
  | 'nature'
  | 'perception'
  | 'performance'
  | 'persuasion'
  | 'religion'
  | 'sleight-of-hand'
  | 'stealth'
  | 'survival'

export interface SkillDef {
  id: SkillId
  name: string
  ability: Ability
  /** Short forms a player is likely to type. Must not collide with other names. */
  aliases: string[]
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'acrobatics', name: 'Acrobatics', ability: 'dex', aliases: ['acro'] },
  { id: 'animal-handling', name: 'Animal Handling', ability: 'wis', aliases: ['animal', 'handling', 'ah'] },
  { id: 'arcana', name: 'Arcana', ability: 'int', aliases: ['arc'] },
  { id: 'athletics', name: 'Athletics', ability: 'str', aliases: ['ath'] },
  { id: 'deception', name: 'Deception', ability: 'cha', aliases: ['dec'] },
  { id: 'history', name: 'History', ability: 'int', aliases: ['hist'] },
  { id: 'insight', name: 'Insight', ability: 'wis', aliases: ['ins'] },
  { id: 'intimidation', name: 'Intimidation', ability: 'cha', aliases: ['intim'] },
  { id: 'investigation', name: 'Investigation', ability: 'int', aliases: ['inv', 'invest'] },
  { id: 'medicine', name: 'Medicine', ability: 'wis', aliases: ['med'] },
  { id: 'nature', name: 'Nature', ability: 'int', aliases: ['nat'] },
  { id: 'perception', name: 'Perception', ability: 'wis', aliases: ['perc'] },
  { id: 'performance', name: 'Performance', ability: 'cha', aliases: ['perf'] },
  { id: 'persuasion', name: 'Persuasion', ability: 'cha', aliases: ['pers'] },
  { id: 'religion', name: 'Religion', ability: 'int', aliases: ['rel'] },
  { id: 'sleight-of-hand', name: 'Sleight of Hand', ability: 'dex', aliases: ['sleight', 'soh', 'slight'] },
  { id: 'stealth', name: 'Stealth', ability: 'dex', aliases: ['ste'] },
  { id: 'survival', name: 'Survival', ability: 'wis', aliases: ['surv'] },
]

export type Proficiency = 'none' | 'half' | 'proficient' | 'expertise'

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'potion' | 'utility' | 'quest'
export const ITEM_KINDS: readonly ItemKind[] = ['weapon', 'armor', 'shield', 'potion', 'utility', 'quest']

/** The sections of the Feats and abilities screen, in the order they are read. */
export type FeatureSection = 'class' | 'species' | 'feat' | 'other'
export const FEATURE_SECTIONS: readonly FeatureSection[] = ['class', 'species', 'feat', 'other']
export const FEATURE_SECTION_NAMES: Record<FeatureSection, string> = {
  class: 'Class features',
  species: 'Species traits',
  feat: 'Feats',
  other: 'Other',
}

/** When limited uses come back. */
export type RestKind = 'short rest' | 'long rest'

export interface LimitedUses {
  max: number
  per: RestKind
}

/**
 * What casting a spell does: a spell attack then damage (attack), a save
 * against the DC with optional damage (save), healing dice (heal), damage
 * that just hits (damage), dice with no damage type (dice: Sleep), or nothing
 * to roll (utility).
 */
export type SpellKind = 'attack' | 'save' | 'heal' | 'damage' | 'dice' | 'utility'
export const SPELL_KINDS: readonly SpellKind[] = ['attack', 'save', 'heal', 'damage', 'dice', 'utility']

/**
 * The JSON a player writes or imports. Everything is optional and forgiving:
 * names are case-insensitive, "Sleight of Hand" / "sleight_of_hand" / "soh" all work,
 * unknown keys are ignored. Give raw ability scores and the app derives every modifier,
 * or give final numbers in overrides when copying from a sheet.
 */
export interface CharacterFile {
  name?: string
  level?: number
  abilities?: Record<string, number>
  proficiencies?: {
    skills?: string[]
    expertise?: string[]
    saves?: string[]
  }
  /** Bard feature: half proficiency on non-proficient ability checks. */
  jackOfAllTrades?: boolean
  /** Added on top of the derived modifier (magic items, feats). */
  bonuses?: {
    initiative?: number
    skills?: Record<string, number>
    saves?: Record<string, number>
    abilityChecks?: Record<string, number>
  }
  /** Replaces the derived modifier entirely. */
  overrides?: {
    initiative?: number
    skills?: Record<string, number>
    saves?: Record<string, number>
    abilityChecks?: Record<string, number>
  }
  attacks?: AttackFile[]
  /** Named dice expressions: Healing Word 1d4+3, Fireball 8d6, Surprise Attack 2d6. */
  custom?: { name: string; dice: string; aliases?: string[] }[]
  /** Switchable modifiers: Rage +2 damage, Sneak Attack +3d6, the Shield spell +5 AC. */
  toggles?: ToggleFile[]
  /** Potions and other things with a count, used by name: drink healing. Inventory items can do the same. */
  consumables?: ConsumableFile[]
  /** Everything carried: weapons, armor, shields, potions, utility, quest items. */
  inventory?: ItemFile[]
  /** Class features, species traits, and feats: what they do and how many uses they have. */
  features?: FeatureFile[]
  /** The spellcasting ability, slots, and pact magic. Spells can live here or at the top level. */
  spellcasting?: SpellcastingFile
  spells?: SpellFile[]
  /** Maximum hit points. Current hit points are tracked in the app, per device. */
  hitPoints?: { max: number }
  /** Hit dice for short rests: { "die": "d12", "count": 5 }. Count defaults to the level. */
  hitDice?: HitDiceFile
  /**
   * Armor class while wearing no armor, in the order it is spoken:
   * [{ "name": "unarmored defense", "value": 10 }, { "name": "Dexterity", "value": 2 }].
   * Worn armor from the inventory replaces these parts; bonuses apply either way.
   */
  armorClass?: { parts: { name: string; value: number }[]; bonuses?: { name: string; value: number }[] }
  /** Your own shortcuts, for example { "hide": "stealth" }. */
  aliases?: Record<string, string>
}

export interface AttackFile {
  name: string
  /** Ability used for attack and damage. Default str. Finesse or ranged: dex. */
  ability?: string
  /** Default true. */
  proficient?: boolean
  /** Damage dice like "1d8". Do not include the ability modifier; it is added. */
  damage: string
  damageType?: string
  /** Magic weapon or feat bonus to hit. */
  attackBonus?: number
  /** Magic weapon or feat bonus to damage. */
  damageBonus?: number
  /** Default true. Set false for an off-hand attack. */
  addAbilityToDamage?: boolean
  /** Replaces the derived to-hit modifier entirely. */
  toHit?: number
  /** Starts in hand on a new device, so a bare attack uses it. */
  equipped?: boolean
  aliases?: string[]
}

export interface ConsumableFile {
  name: string
  /** How many you carry. Default 1. The app counts down per device. */
  count?: number
  /** Healing when used, like "2d4+2". */
  heal?: string
  /** A toggle switched on when used, by name. */
  toggle?: string
  /** Extra words that name it: "healing", "potion". */
  aliases?: string[]
}

export interface ItemFile {
  name: string
  /** weapon, armor, shield, potion, utility, or quest. Default utility. */
  kind?: string
  /** How many you carry. Default 1. */
  count?: number
  /** Read after the name in the inventory, and on request. */
  description?: string
  aliases?: string[]
  /** Weapon: the attack it makes. Default: the attack with the same name. */
  attack?: string
  /** Armor: base armor class, and the most Dexterity it allows. Leave dexCap out for no limit, 0 for heavy armor. */
  baseAc?: number
  dexCap?: number
  /** Shield, or any worn item: added to armor class while equipped. */
  acBonus?: number
  /** Potion or utility: healing dice, or a toggle switched on, when used. */
  heal?: string
  toggle?: string
  /** Utility: counts down when used even without an effect. Torches, rations, arrows. */
  consumable?: boolean
  /** Starts in hand, worn, or equipped on a new device. */
  equipped?: boolean
}

export interface ToggleFile {
  name: string
  /** Added to the attack roll while on. */
  attackBonus?: number
  /** Added to damage while on. */
  damageBonus?: number
  /** Extra damage dice while on, like "3d6". Doubled on a critical hit like any damage dice. */
  damageDice?: string
  /** Added to armor class while on: a shield, the Shield spell, a potion. */
  acBonus?: number
  /** Advantage on the roll to hit while on: Reckless Attack, Steady Aim. */
  advantage?: boolean
  /** Starts switched on, for an equipped item. Default off. */
  on?: boolean
  /** Attack names or aliases this applies to. Leave out for every attack. */
  appliesTo?: string[]
  /** Extra words that switch it: "raging", "sneak". */
  aliases?: string[]
}

export interface FeatureFile {
  name: string
  /** class, species, feat, or other. Default class. */
  section?: string
  /** Read after the name in the Feats and abilities screen, and on request with /rage. */
  description?: string
  aliases?: string[]
  /** Limited uses and when they come back: { "max": 3, "per": "long rest" }. Default per: long rest. */
  uses?: { max: number; per?: string }
  /**
   * The toggle this feature switches on and off, by name. Default: the toggle with the
   * same name, if there is one. Switching it on spends a use.
   */
  toggle?: string
  /** Healing when used: Second Wind "1d10+5". */
  heal?: string
}

export interface HitDiceFile {
  /** "d12" or 12. */
  die: string | number
  /** How many you have. Default: the level. */
  count?: number
}

export interface SpellcastingFile {
  /** Ability behind the save DC and spell attack: int, wis, cha. */
  ability?: string
  /** Replace the derived numbers when copying from a sheet. */
  saveDc?: number
  attackBonus?: number
  /** Slots by level: [4, 3, 2] (levels 1, 2, 3) or { "1": 4, "2": 3 }. */
  slots?: Record<string, number> | number[]
  /** Warlock pact slots, back on a short rest: { "level": 3, "count": 2 }. */
  pact?: { level: number; count: number }
  spells?: SpellFile[]
}

export interface SpellFile {
  name: string
  /** 0 for a cantrip. Default 0. */
  level?: number
  /**
   * attack, save, heal, damage, dice, or utility. Default: save when there is a
   * save ability, else attack when there are damage dice, else heal when there
   * are heal dice, else utility.
   */
  kind?: string
  /** Damage dice at the spell's level (cantrips: at the character's level), like "2d10". */
  damage?: string
  damageType?: string
  /** Ability the target saves with: dex, wis. */
  save?: string
  /** "half" when a successful save halves the damage (the default for leveled spells), "none" for no damage (the default for cantrips). */
  saveEffect?: string
  /** Healing dice with the modifier written in, like "1d8+3". */
  heal?: string
  /** Extra dice for each slot level above the spell's: "1d6" for Fireball, "1d8" for Cure Wounds. */
  upcast?: string
  /** A toggle switched on when cast, by name: the Shield spell, Bless. */
  toggle?: string
  concentration?: boolean
  ritual?: boolean
  description?: string
  aliases?: string[]
  /** Default true. An unprepared spell is listed but cannot be cast. */
  prepared?: boolean
  /** Free castings that need no slot: { "max": 1, "per": "long rest" } for a racial spell or Magic Initiate. */
  uses?: { max: number; per?: string }
}

export interface ArmorClassPart {
  name: string
  value: number
}

export interface AbilityBlock {
  score: number
  modifier: number
  /** Modifier for a raw ability check (includes any check bonus or override). */
  checkModifier: number
}

export interface DerivedSkill {
  id: SkillId
  name: string
  ability: Ability
  modifier: number
  proficiency: Proficiency
}

export interface DerivedSave {
  ability: Ability
  name: string
  modifier: number
  proficient: boolean
}

export interface DerivedAttack {
  name: string
  ability: Ability
  toHit: number
  /** Damage dice with the ability modifier and bonuses folded into flat. */
  damage: DiceExpr
  damageType?: string
  /** Starts in hand on a new device. */
  equipped: boolean
  aliases: string[]
}

export interface DerivedConsumable {
  name: string
  /** Starting count; the app tracks what is left. */
  count: number
  heal: DiceExpr | null
  /** Name of a toggle switched on when used. */
  toggle: string | null
  aliases: string[]
}

export interface DerivedItem {
  name: string
  kind: ItemKind
  count: number
  /** Counts down when used: potions, and utility items marked consumable or with an effect. */
  consumable: boolean
  description: string | null
  aliases: string[]
  /** Weapon: the attack name. */
  attack: string | null
  /** Armor: base armor class and Dexterity cap (null: no cap). */
  baseAc: number | null
  dexCap: number | null
  /** Shield or worn item: armor class while equipped; it is also a toggle of the same name. */
  acBonus: number
  /** Consumable effects: healing dice, or a toggle switched on. */
  heal: DiceExpr | null
  toggle: string | null
  /** Starts in hand, worn, or equipped. */
  equipped: boolean
}

export interface DerivedCustom {
  name: string
  dice: DiceExpr
  aliases: string[]
}

export interface DerivedToggle {
  name: string
  attackBonus: number
  damageBonus: number
  damageDice: DiceExpr | null
  acBonus: number
  /** Advantage on the roll to hit while on. */
  advantage: boolean
  /** Starts switched on. */
  on: boolean
  /** Normalized attack names or aliases; null means every attack. */
  appliesTo: string[] | null
  aliases: string[]
}

export interface DerivedFeature {
  name: string
  section: FeatureSection
  description: string | null
  aliases: string[]
  /** Limited uses per rest; null when it can be used at will or is always on. */
  uses: LimitedUses | null
  /** The toggle this feature switches, by name; null when it is not a toggle. */
  toggle: string | null
  /** Healing when used. */
  heal: DiceExpr | null
}

export interface DerivedHitDice {
  sides: number
  count: number
}

export interface DerivedSpell {
  name: string
  /** 0 for a cantrip. */
  level: number
  kind: SpellKind
  damage: DiceExpr | null
  damageType?: string
  save: Ability | null
  saveEffect: 'half' | 'none'
  heal: DiceExpr | null
  /** Extra dice per slot level above the spell's. */
  upcast: DiceExpr | null
  toggle: string | null
  concentration: boolean
  ritual: boolean
  description: string | null
  aliases: string[]
  prepared: boolean
  /** Free castings per rest; null when every casting takes a slot (or none, for a cantrip). */
  uses: LimitedUses | null
}

export interface DerivedSpellcasting {
  ability: Ability | null
  /** Null when the file gives neither an ability nor the number. */
  saveDc: number | null
  attackBonus: number | null
  /** Slots by level 1 to 9; a level with no slots is absent. */
  slots: Record<number, number>
  pact: { level: number; count: number } | null
}

/** True when the toggle changes attack rolls or damage (as opposed to only armor class). */
export const affectsAttacks = (t: DerivedToggle): boolean =>
  t.attackBonus !== 0 || t.damageBonus !== 0 || t.damageDice !== null || t.advantage

export interface Character {
  name: string
  level: number
  proficiencyBonus: number
  abilities: Record<Ability, AbilityBlock>
  skills: DerivedSkill[]
  saves: DerivedSave[]
  initiative: number
  attacks: DerivedAttack[]
  custom: DerivedCustom[]
  /** File toggles plus one per shield or worn armor-class item in the inventory. */
  toggles: DerivedToggle[]
  /** File consumables plus every potion and consumable utility item in the inventory. */
  consumables: DerivedConsumable[]
  items: DerivedItem[]
  /** Class features, species traits, feats, in file order. */
  features: DerivedFeature[]
  /** Spells in file order; cantrips are level 0. */
  spells: DerivedSpell[]
  /** Null when the file has no spellcasting block and no spells. */
  spellcasting: DerivedSpellcasting | null
  /** Null when the file gives no hit points. */
  hitPointsMax: number | null
  /** Null when the file gives no hit dice. */
  hitDice: DerivedHitDice | null
  /** Armor class parts while wearing no armor; null when the file gives none. */
  armorClass: ArmorClassPart[] | null
  /** Flat armor class bonuses that apply with or without armor. */
  armorBonuses: ArmorClassPart[]
  aliases: Record<string, string>
}

export class CharacterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CharacterError'
  }
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function proficiencyBonus(level: number): number {
  const lvl = Math.min(20, Math.max(1, Math.floor(level)))
  return 2 + Math.floor((lvl - 1) / 4)
}

const ABILITY_LOOKUP: Record<string, Ability> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha',
}

const normKey = (s: string): string => s.trim().toLowerCase().replace(/[\s_]+/g, '-')
export const normName = (s: string): string => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

/** What a file may call a feature's section. */
const SECTION_WORDS: Record<string, FeatureSection> = {
  class: 'class',
  'class feature': 'class',
  'class features': 'class',
  species: 'species',
  'species trait': 'species',
  'species traits': 'species',
  race: 'species',
  racial: 'species',
  'racial trait': 'species',
  'racial traits': 'species',
  lineage: 'species',
  feat: 'feat',
  feats: 'feat',
  other: 'other',
  background: 'other',
  misc: 'other',
}

/** What a file may call a rest. */
const REST_WORDS: Record<string, RestKind> = {
  'long rest': 'long rest',
  long: 'long rest',
  lr: 'long rest',
  day: 'long rest',
  daily: 'long rest',
  'short rest': 'short rest',
  short: 'short rest',
  sr: 'short rest',
}

function toAbility(raw: string, context: string): Ability {
  const a = ABILITY_LOOKUP[normKey(raw)]
  if (!a) throw new CharacterError(`${context}: unknown ability "${raw}". Use str, dex, con, int, wis, or cha.`)
  return a
}

function toSkill(raw: string, context: string): SkillId {
  const key = normKey(raw)
  const def = SKILLS.find((d) => d.id === key || normKey(d.name) === key || d.aliases.includes(key))
  if (!def) {
    const valid = SKILLS.map((d) => d.name).join(', ')
    throw new CharacterError(`${context}: unknown skill "${raw}". Valid skills: ${valid}.`)
  }
  return def.id
}

function numberOr(value: unknown, fallback: number, context: string): number {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CharacterError(`${context}: expected a number, got ${JSON.stringify(value)}.`)
  }
  return value
}

function numberMap<K extends string>(
  raw: Record<string, number> | undefined,
  toKey: (k: string, context: string) => K,
  context: string,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {}
  for (const [k, v] of Object.entries(raw ?? {})) {
    out[toKey(k, context)] = numberOr(v, 0, `${context}.${k}`)
  }
  return out
}

function stringList(raw: unknown, context: string): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== 'string')) {
    throw new CharacterError(`${context}: expected a list of names.`)
  }
  return raw as string[]
}

function requireName(raw: unknown, context: string, what: string): string {
  if (!raw || typeof raw !== 'object' || typeof (raw as { name?: unknown }).name !== 'string') {
    throw new CharacterError(`${context}: every ${what} needs a name.`)
  }
  const name = ((raw as { name: string }).name ?? '').trim()
  if (!name) throw new CharacterError(`${context}: every ${what} needs a name.`)
  return name
}

/** Parses an optional dice field; the error names the field: "toggles[1] (Bless): damageDice must be dice like 3d6." */
function optionalDice(raw: unknown, context: string, field: string, example: string): DiceExpr | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const dice = parseDiceExpr(String(raw))
  if (!dice) throw new CharacterError(`${context}: ${field} must be dice like ${example}.`)
  return dice
}

/** Parses { "max": 3, "per": "long rest" }; the error names the feature or spell. */
function parseUses(raw: unknown, context: string, ctx: string): LimitedUses | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw !== 'object') throw new CharacterError(`${ctx}: uses must look like { "max": 3, "per": "long rest" }.`)
  const u = raw as { max?: unknown; per?: unknown }
  const max = numberOr(u.max, NaN, `${context}.uses.max`)
  if (!Number.isInteger(max) || max < 1) throw new CharacterError(`${ctx}: uses.max must be a whole number of 1 or more.`)
  const perRaw = u.per === undefined || u.per === null ? 'long rest' : normName(String(u.per))
  const per = REST_WORDS[perRaw]
  if (!per) throw new CharacterError(`${ctx}: uses.per must be "long rest" or "short rest".`)
  return { max, per }
}

/** A toggle named in a feature or spell, by name or alias; the error names the owner. */
function findToggle(raw: unknown, toggles: DerivedToggle[], ctx: string): string | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null
  const wanted = normName(String(raw))
  const found = toggles.find((t) => normName(t.name) === wanted || t.aliases.includes(wanted))
  if (!found) throw new CharacterError(`${ctx}: toggle "${String(raw)}" is not one of this character's toggles.`)
  return found.name
}

function acParts(raw: unknown, context: string): ArmorClassPart[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CharacterError(`${context}: expected a list like [{ "name": "unarmored defense", "value": 10 }].`)
  }
  return raw.map((p, i) => {
    const name = requireName(p, `${context}[${i + 1}]`, 'part')
    const value = numberOr((p as { value?: unknown }).value, NaN, `${context}[${i + 1}].value`)
    if (!Number.isFinite(value)) throw new CharacterError(`${context}: every part needs a value.`)
    return { name, value }
  })
}

export function deriveCharacter(file: CharacterFile): Character {
  const level = Math.min(20, Math.max(1, Math.floor(numberOr(file.level, 1, 'level'))))
  const prof = proficiencyBonus(level)

  const scores: Record<Ability, number> = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  for (const [k, v] of Object.entries(file.abilities ?? {})) {
    scores[toAbility(k, 'abilities')] = numberOr(v, 10, `abilities.${k}`)
  }

  const checkBonus = numberMap(file.bonuses?.abilityChecks, toAbility, 'bonuses.abilityChecks')
  const checkOverride = numberMap(file.overrides?.abilityChecks, toAbility, 'overrides.abilityChecks')
  const abilities = {} as Record<Ability, AbilityBlock>
  for (const a of ABILITIES) {
    const modifier = abilityModifier(scores[a])
    abilities[a] = {
      score: scores[a],
      modifier,
      checkModifier: checkOverride[a] ?? modifier + (checkBonus[a] ?? 0),
    }
  }

  const profSkills = new Set(
    stringList(file.proficiencies?.skills, 'proficiencies.skills').map((s) => toSkill(s, 'proficiencies.skills')),
  )
  const expSkills = new Set(
    stringList(file.proficiencies?.expertise, 'proficiencies.expertise').map((s) =>
      toSkill(s, 'proficiencies.expertise'),
    ),
  )
  const skillBonus = numberMap(file.bonuses?.skills, toSkill, 'bonuses.skills')
  const skillOverride = numberMap(file.overrides?.skills, toSkill, 'overrides.skills')
  const skills: DerivedSkill[] = SKILLS.map((def) => {
    const proficiency: Proficiency = expSkills.has(def.id)
      ? 'expertise'
      : profSkills.has(def.id)
        ? 'proficient'
        : file.jackOfAllTrades
          ? 'half'
          : 'none'
    const profPart =
      proficiency === 'expertise'
        ? prof * 2
        : proficiency === 'proficient'
          ? prof
          : proficiency === 'half'
            ? Math.floor(prof / 2)
            : 0
    const computed = abilities[def.ability].modifier + profPart + (skillBonus[def.id] ?? 0)
    return {
      id: def.id,
      name: def.name,
      ability: def.ability,
      modifier: skillOverride[def.id] ?? computed,
      proficiency,
    }
  })

  const profSaves = new Set(
    stringList(file.proficiencies?.saves, 'proficiencies.saves').map((s) => toAbility(s, 'proficiencies.saves')),
  )
  const saveBonus = numberMap(file.bonuses?.saves, toAbility, 'bonuses.saves')
  const saveOverride = numberMap(file.overrides?.saves, toAbility, 'overrides.saves')
  const saves: DerivedSave[] = ABILITIES.map((a) => {
    const proficient = profSaves.has(a)
    const computed = abilities[a].modifier + (proficient ? prof : 0) + (saveBonus[a] ?? 0)
    return { ability: a, name: ABILITY_NAMES[a], modifier: saveOverride[a] ?? computed, proficient }
  })

  const initiative =
    file.overrides?.initiative !== undefined
      ? numberOr(file.overrides.initiative, 0, 'overrides.initiative')
      : abilities.dex.modifier + numberOr(file.bonuses?.initiative, 0, 'bonuses.initiative')

  const attacks: DerivedAttack[] = (file.attacks ?? []).map((a, i) => {
    const context = `attacks[${i + 1}]`
    const name = requireName(a, context, 'attack')
    const ability = a.ability ? toAbility(a.ability, `${context} (${name})`) : 'str'
    const dmg = parseDiceExpr(String(a.damage ?? ''))
    if (!dmg || dmg.terms.length === 0) {
      throw new CharacterError(`${context} (${name}): damage must be dice like 1d8 or 2d6.`)
    }
    const abilityMod = abilities[ability].modifier
    const toHit =
      a.toHit !== undefined
        ? numberOr(a.toHit, 0, `${context}.toHit`)
        : abilityMod + (a.proficient === false ? 0 : prof) + numberOr(a.attackBonus, 0, `${context}.attackBonus`)
    const flat =
      dmg.flat +
      (a.addAbilityToDamage === false ? 0 : abilityMod) +
      numberOr(a.damageBonus, 0, `${context}.damageBonus`)
    return {
      name,
      ability,
      toHit,
      damage: { terms: dmg.terms, flat },
      damageType: typeof a.damageType === 'string' && a.damageType.trim() ? a.damageType.trim() : undefined,
      equipped: a.equipped === true,
      aliases: stringList(a.aliases, `${context}.aliases`).map(normName),
    }
  })

  const custom: DerivedCustom[] = (file.custom ?? []).map((c, i) => {
    const context = `custom[${i + 1}]`
    const name = requireName(c, context, 'custom roll')
    const dice = parseDiceExpr(String(c.dice ?? ''))
    if (!dice || dice.terms.length === 0) {
      throw new CharacterError(`${context} (${name}): dice must be an expression like 3d6 or 1d4+3.`)
    }
    return { name, dice, aliases: stringList(c.aliases, `${context}.aliases`).map(normName) }
  })

  const toggles: DerivedToggle[] = (file.toggles ?? []).map((t, i) => {
    const context = `toggles[${i + 1}]`
    const name = requireName(t, context, 'toggle')
    const damageDice = optionalDice(t.damageDice, `${context} (${name})`, 'damageDice', '3d6')
    if (damageDice && damageDice.terms.length === 0) {
      throw new CharacterError(`${context} (${name}): damageDice must be dice like 3d6.`)
    }
    return {
      name,
      attackBonus: numberOr(t.attackBonus, 0, `${context}.attackBonus`),
      damageBonus: numberOr(t.damageBonus, 0, `${context}.damageBonus`),
      damageDice,
      acBonus: numberOr(t.acBonus, 0, `${context}.acBonus`),
      advantage: t.advantage === true,
      on: t.on === true,
      appliesTo:
        t.appliesTo === undefined || t.appliesTo === null
          ? null
          : stringList(t.appliesTo, `${context}.appliesTo`).map(normName),
      aliases: stringList(t.aliases, `${context}.aliases`).map(normName),
    }
  })
  const addToggle = (t: DerivedToggle, context: string) => {
    if (toggles.some((x) => normName(x.name) === normName(t.name))) {
      throw new CharacterError(`${context}: there is already a toggle called "${t.name}".`)
    }
    toggles.push(t)
  }

  const items: DerivedItem[] = (file.inventory ?? []).map((it, i) => {
    const context = `inventory[${i + 1}]`
    const name = requireName(it, context, 'item')
    const kindRaw = it.kind === undefined || it.kind === null ? 'utility' : String(it.kind).trim().toLowerCase()
    const kind = ITEM_KINDS.find((k) => k === kindRaw)
    if (!kind) throw new CharacterError(`${context} (${name}): kind must be one of ${ITEM_KINDS.join(', ')}.`)
    const count = numberOr(it.count, 1, `${context}.count`)
    if (!Number.isInteger(count) || count < 0) throw new CharacterError(`${context} (${name}): count must be a whole number.`)
    const heal = optionalDice(it.heal, `${context} (${name})`, 'heal', '2d4+2')
    let toggle: string | null = null
    if (it.toggle !== undefined && it.toggle !== null && String(it.toggle).trim() !== '') {
      const wanted = normName(String(it.toggle))
      const found = toggles.find((t) => normName(t.name) === wanted || t.aliases.includes(wanted))
      if (!found) throw new CharacterError(`${context} (${name}): toggle "${it.toggle}" is not one of this character's toggles.`)
      toggle = found.name
    }
    let attack: string | null = null
    if (kind === 'weapon') {
      const wanted = normName(String(it.attack ?? name))
      const found = attacks.find((a) => normName(a.name) === wanted || a.aliases.includes(wanted))
      if (!found) {
        throw new CharacterError(`${context} (${name}): no attack called "${it.attack ?? name}". Add it to attacks.`)
      }
      attack = found.name
    }
    let baseAc: number | null = null
    let dexCap: number | null = null
    if (kind === 'armor') {
      baseAc = numberOr(it.baseAc, NaN, `${context}.baseAc`)
      if (!Number.isFinite(baseAc)) throw new CharacterError(`${context} (${name}): armor needs a baseAc, like 13 for a chain shirt.`)
      dexCap = it.dexCap === undefined || it.dexCap === null ? null : numberOr(it.dexCap, 0, `${context}.dexCap`)
    }
    const acBonus = numberOr(it.acBonus, kind === 'shield' ? 2 : 0, `${context}.acBonus`)
    const equipped = it.equipped === true
    const consumable = kind === 'potion' || it.consumable === true || heal !== null || toggle !== null
    const description =
      typeof it.description === 'string' && it.description.trim() ? it.description.trim() : null
    const item: DerivedItem = {
      name,
      kind,
      count,
      consumable,
      description,
      aliases: stringList(it.aliases, `${context}.aliases`).map(normName),
      attack,
      baseAc,
      dexCap,
      acBonus,
      heal,
      toggle,
      equipped,
    }
    if (kind !== 'armor' && acBonus !== 0) {
      addToggle(
        {
          name,
          attackBonus: 0,
          damageBonus: 0,
          damageDice: null,
          acBonus,
          advantage: false,
          on: equipped,
          appliesTo: null,
          aliases: item.aliases,
        },
        `${context} (${name})`,
      )
    }
    return item
  })
  const itemNames = new Set<string>()
  for (const it of items) {
    const key = normName(it.name)
    if (itemNames.has(key)) throw new CharacterError(`inventory: there are two items called "${it.name}".`)
    itemNames.add(key)
  }

  const consumables: DerivedConsumable[] = (file.consumables ?? []).map((c, i) => {
    const context = `consumables[${i + 1}]`
    const name = requireName(c, context, 'consumable')
    const count = numberOr(c.count, 1, `${context}.count`)
    if (!Number.isInteger(count) || count < 0) {
      throw new CharacterError(`${context} (${name}): count must be a whole number.`)
    }
    const heal = optionalDice(c.heal, `${context} (${name})`, 'heal', '2d4+2')
    let toggle: string | null = null
    if (c.toggle !== undefined && c.toggle !== null && String(c.toggle).trim() !== '') {
      const wanted = normName(String(c.toggle))
      const found = toggles.find((t) => normName(t.name) === wanted || t.aliases.includes(wanted))
      if (!found) {
        throw new CharacterError(`${context} (${name}): toggle "${c.toggle}" is not one of this character's toggles.`)
      }
      toggle = found.name
    }
    return { name, count, heal, toggle, aliases: stringList(c.aliases, `${context}.aliases`).map(normName) }
  })
  for (const it of items) {
    if (!it.consumable) continue
    if (consumables.some((c) => normName(c.name) === normName(it.name))) {
      throw new CharacterError(`inventory (${it.name}): it is already listed under consumables.`)
    }
    consumables.push({ name: it.name, count: it.count, heal: it.heal, toggle: it.toggle, aliases: it.aliases })
  }

  const features: DerivedFeature[] = (file.features ?? []).map((f, i) => {
    const context = `features[${i + 1}]`
    const name = requireName(f, context, 'feature')
    const ctx = `${context} (${name})`
    const sectionRaw = f.section === undefined || f.section === null ? 'class' : normName(String(f.section))
    const section = SECTION_WORDS[sectionRaw]
    if (!section) throw new CharacterError(`${ctx}: section must be one of ${FEATURE_SECTIONS.join(', ')}.`)
    const uses = parseUses(f.uses, context, ctx)
    const heal = optionalDice(f.heal, ctx, 'heal', '1d10+5')
    const toggle = findToggle(f.toggle, toggles, ctx) ?? toggles.find((t) => normName(t.name) === normName(name))?.name ?? null
    if (toggle && heal) throw new CharacterError(`${ctx}: a feature cannot both heal and switch a toggle.`)
    const description = typeof f.description === 'string' && f.description.trim() ? f.description.trim() : null
    return { name, section, description, aliases: stringList(f.aliases, `${context}.aliases`).map(normName), uses, toggle, heal }
  })
  const featureNames = new Set<string>()
  const featureToggles = new Map<string, string>()
  for (const f of features) {
    const key = normName(f.name)
    if (featureNames.has(key)) throw new CharacterError(`features: there are two features called "${f.name}".`)
    featureNames.add(key)
    if (f.toggle) {
      const other = featureToggles.get(f.toggle)
      if (other) throw new CharacterError(`features (${f.name}): toggle "${f.toggle}" already belongs to ${other}.`)
      featureToggles.set(f.toggle, f.name)
    }
  }

  let hitDice: DerivedHitDice | null = null
  if (file.hitDice !== undefined && file.hitDice !== null) {
    if (typeof file.hitDice !== 'object') throw new CharacterError('hitDice: expected { "die": "d12", "count": 5 }.')
    const dieRaw = file.hitDice.die
    const sides = typeof dieRaw === 'number' ? dieRaw : Number(String(dieRaw ?? '').trim().replace(/^d/i, ''))
    if (!Number.isInteger(sides) || sides < 2) throw new CharacterError('hitDice.die: expected a die like d12.')
    const count = numberOr(file.hitDice.count, level, 'hitDice.count')
    if (!Number.isInteger(count) || count < 1) throw new CharacterError('hitDice.count: expected a whole number of 1 or more.')
    hitDice = { sides, count }
  }

  // Spellcasting: the ability behind the save DC and spell attack, the slots, the pact, and the spells.
  const sf = file.spellcasting
  if (sf !== undefined && sf !== null && typeof sf !== 'object') {
    throw new CharacterError('spellcasting: expected an object like { "ability": "int", "slots": [4, 2] }.')
  }
  const spellFiles: SpellFile[] = [...(sf?.spells ?? []), ...(file.spells ?? [])]
  let spellcasting: DerivedSpellcasting | null = null
  if ((sf !== undefined && sf !== null) || spellFiles.length) {
    const ability = sf?.ability !== undefined && sf?.ability !== null ? toAbility(String(sf.ability), 'spellcasting.ability') : null
    const mod = ability ? abilities[ability].modifier : null
    const given = (v: unknown) => v !== undefined && v !== null
    const saveDc = given(sf?.saveDc) ? numberOr(sf?.saveDc, 0, 'spellcasting.saveDc') : mod === null ? null : 8 + prof + mod
    const attackBonus = given(sf?.attackBonus) ? numberOr(sf?.attackBonus, 0, 'spellcasting.attackBonus') : mod === null ? null : prof + mod
    const slots: Record<number, number> = {}
    const rawSlots = sf?.slots
    if (given(rawSlots)) {
      if (typeof rawSlots !== 'object') {
        throw new CharacterError('spellcasting.slots: expected a list like [4, 3, 2] or an object like { "1": 4, "2": 3 }.')
      }
      const entries: [string, unknown][] = Array.isArray(rawSlots)
        ? rawSlots.map((v, i) => [String(i + 1), v])
        : Object.entries(rawSlots as Record<string, unknown>)
      for (const [k, v] of entries) {
        const lvl = Number(String(k).replace(/^level\s*/i, ''))
        if (!Number.isInteger(lvl) || lvl < 1 || lvl > 9) throw new CharacterError(`spellcasting.slots: "${k}" is not a spell level from 1 to 9.`)
        const n = numberOr(v, 0, `spellcasting.slots.${k}`)
        if (!Number.isInteger(n) || n < 0) throw new CharacterError(`spellcasting.slots.${k}: expected a whole number.`)
        if (n > 0) slots[lvl] = n
      }
    }
    let pact: DerivedSpellcasting['pact'] = null
    if (given(sf?.pact)) {
      const p = sf?.pact as { level?: unknown; count?: unknown }
      const level = numberOr(p.level, NaN, 'spellcasting.pact.level')
      const count = numberOr(p.count, NaN, 'spellcasting.pact.count')
      if (!Number.isInteger(level) || level < 1 || level > 9) throw new CharacterError('spellcasting.pact.level: expected a spell level from 1 to 9.')
      if (!Number.isInteger(count) || count < 1) throw new CharacterError('spellcasting.pact.count: expected a whole number of 1 or more.')
      pact = { level, count }
    }
    spellcasting = { ability, saveDc, attackBonus, slots, pact }
  }
  const spells: DerivedSpell[] = spellFiles.map((s, i) => {
    const context = `spells[${i + 1}]`
    const name = requireName(s, context, 'spell')
    const ctx = `${context} (${name})`
    const level = numberOr(s.level, 0, `${context}.level`)
    if (!Number.isInteger(level) || level < 0 || level > 9) throw new CharacterError(`${ctx}: level must be 0 for a cantrip or 1 to 9.`)
    const damage = optionalDice(s.damage, ctx, 'damage', '2d10')
    if (damage && damage.terms.length === 0) throw new CharacterError(`${ctx}: damage must be dice like 2d10.`)
    const heal = optionalDice(s.heal, ctx, 'heal', '1d8+3')
    const upcast = optionalDice(s.upcast, ctx, 'upcast', '1d6')
    const save = s.save !== undefined && s.save !== null && String(s.save).trim() !== '' ? toAbility(String(s.save), ctx) : null
    const kindRaw =
      s.kind === undefined || s.kind === null
        ? save
          ? 'save'
          : damage
            ? 'attack'
            : heal
              ? 'heal'
              : 'utility'
        : String(s.kind).trim().toLowerCase()
    const kind = SPELL_KINDS.find((k) => k === kindRaw)
    if (!kind) throw new CharacterError(`${ctx}: kind must be one of ${SPELL_KINDS.join(', ')}.`)
    if (kind === 'save' && !save) throw new CharacterError(`${ctx}: a save spell needs the ability the target saves with, like "save": "dex".`)
    if ((kind === 'attack' || kind === 'damage' || kind === 'dice') && !damage) {
      throw new CharacterError(`${ctx}: ${kind} spells need damage dice, like "damage": "2d10".`)
    }
    if (kind === 'heal' && !heal) throw new CharacterError(`${ctx}: a heal spell needs heal dice, like "heal": "1d8+3".`)
    if (kind === 'attack' && spellcasting?.attackBonus === null) {
      throw new CharacterError(`${ctx}: a spell attack needs spellcasting.ability (or spellcasting.attackBonus).`)
    }
    if (kind === 'save' && spellcasting?.saveDc === null) {
      throw new CharacterError(`${ctx}: a save spell needs spellcasting.ability (or spellcasting.saveDc).`)
    }
    const effectRaw =
      s.saveEffect === undefined || s.saveEffect === null ? (level > 0 ? 'half' : 'none') : String(s.saveEffect).trim().toLowerCase()
    if (effectRaw !== 'half' && effectRaw !== 'none') throw new CharacterError(`${ctx}: saveEffect must be "half" or "none".`)
    const description = typeof s.description === 'string' && s.description.trim() ? s.description.trim() : null
    return {
      name,
      level,
      kind,
      damage,
      damageType: typeof s.damageType === 'string' && s.damageType.trim() ? s.damageType.trim() : undefined,
      save,
      saveEffect: effectRaw,
      heal,
      upcast,
      toggle: findToggle(s.toggle, toggles, ctx),
      concentration: s.concentration === true,
      ritual: s.ritual === true,
      description,
      aliases: stringList(s.aliases, `${context}.aliases`).map(normName),
      prepared: s.prepared !== false,
      uses: parseUses(s.uses, context, ctx),
    }
  })
  const spellNames = new Set<string>()
  for (const s of spells) {
    const key = normName(s.name)
    if (spellNames.has(key)) throw new CharacterError(`spells: there are two spells called "${s.name}".`)
    spellNames.add(key)
  }

  const aliases: Record<string, string> = {}
  for (const [k, v] of Object.entries(file.aliases ?? {})) {
    if (typeof v !== 'string') throw new CharacterError(`aliases.${k}: expected a name to roll.`)
    aliases[normName(k)] = normName(v)
  }

  let hitPointsMax: number | null = null
  if (file.hitPoints !== undefined && file.hitPoints !== null) {
    const max = numberOr(file.hitPoints.max, NaN, 'hitPoints.max')
    if (!Number.isInteger(max) || max < 1) throw new CharacterError('hitPoints.max: expected a whole number of 1 or more.')
    hitPointsMax = max
  }

  let armorClass: ArmorClassPart[] | null = null
  let armorBonuses: ArmorClassPart[] = []
  if (file.armorClass !== undefined && file.armorClass !== null) {
    armorClass = acParts(file.armorClass.parts, 'armorClass.parts')
    if (file.armorClass.bonuses !== undefined && file.armorClass.bonuses !== null && Array.isArray(file.armorClass.bonuses) && file.armorClass.bonuses.length) {
      armorBonuses = acParts(file.armorClass.bonuses, 'armorClass.bonuses')
    }
  }

  return {
    name: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : 'Unnamed character',
    level,
    proficiencyBonus: prof,
    abilities,
    skills,
    saves,
    initiative,
    attacks,
    custom,
    toggles,
    consumables,
    items,
    features,
    spells,
    spellcasting,
    hitPointsMax,
    hitDice,
    armorClass,
    armorBonuses,
    aliases,
  }
}

/** Parses character JSON text. Throws CharacterError with a message fit to be read aloud. */
export function parseCharacterFile(text: string): Character {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new CharacterError(`That is not valid JSON: ${(err as Error).message}`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CharacterError('Character file must be a JSON object with keys like name, level, abilities.')
  }
  return deriveCharacter(data as CharacterFile)
}

/** True when the toggle names the attack (by name or alias) in appliesTo, or lists nothing. */
export function toggleApplies(toggle: DerivedToggle, attack: DerivedAttack): boolean {
  if (toggle.appliesTo === null) return true
  const names = [normName(attack.name), ...attack.aliases]
  return toggle.appliesTo.some((n) => names.includes(n))
}
