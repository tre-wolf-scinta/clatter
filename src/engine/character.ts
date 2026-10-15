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
  /** Maximum hit points. Current hit points are tracked in the app, per device. */
  hitPoints?: { max: number }
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
  /** Starts switched on, for an equipped item. Default off. */
  on?: boolean
  /** Attack names or aliases this applies to. Leave out for every attack. */
  appliesTo?: string[]
  /** Extra words that switch it: "raging", "sneak". */
  aliases?: string[]
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
  /** Starts switched on. */
  on: boolean
  /** Normalized attack names or aliases; null means every attack. */
  appliesTo: string[] | null
  aliases: string[]
}

/** True when the toggle changes attack rolls or damage (as opposed to only armor class). */
export const affectsAttacks = (t: DerivedToggle): boolean =>
  t.attackBonus !== 0 || t.damageBonus !== 0 || t.damageDice !== null

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
  /** Null when the file gives no hit points. */
  hitPointsMax: number | null
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
        { name, attackBonus: 0, damageBonus: 0, damageDice: null, acBonus, on: equipped, appliesTo: null, aliases: item.aliases },
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
    hitPointsMax,
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
