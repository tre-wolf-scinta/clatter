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
  /** Switchable attack modifiers: Rage +2 damage, Sneak Attack +3d6, Great Weapon Master -5 to hit +10 damage. */
  toggles?: ToggleFile[]
  /** Your own shortcuts, for example { "hide": "stealth" }. */
  aliases?: Record<string, string>
}

export interface ToggleFile {
  name: string
  /** Added to the attack roll while on. */
  attackBonus?: number
  /** Added to damage while on. */
  damageBonus?: number
  /** Extra damage dice while on, like "3d6". Doubled on a critical hit like any damage dice. */
  damageDice?: string
  /** Attack names or aliases this applies to. Leave out for every attack. */
  appliesTo?: string[]
  /** Extra words that switch it: "raging", "sneak". */
  aliases?: string[]
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
  aliases?: string[]
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
  aliases: string[]
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
  /** Normalized attack names or aliases; null means every attack. */
  appliesTo: string[] | null
  aliases: string[]
}

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
  toggles: DerivedToggle[]
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
const normName = (s: string): string => s.trim().toLowerCase().replace(/[\s_-]+/g, ' ')

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
    if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !a.name.trim()) {
      throw new CharacterError(`${context}: every attack needs a name.`)
    }
    const ability = a.ability ? toAbility(a.ability, `${context} (${a.name})`) : 'str'
    const dmg = parseDiceExpr(String(a.damage ?? ''))
    if (!dmg || dmg.terms.length === 0) {
      throw new CharacterError(`${context} (${a.name}): damage must be dice like 1d8 or 2d6.`)
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
      name: a.name.trim(),
      ability,
      toHit,
      damage: { terms: dmg.terms, flat },
      damageType: typeof a.damageType === 'string' && a.damageType.trim() ? a.damageType.trim() : undefined,
      aliases: stringList(a.aliases, `${context}.aliases`).map(normName),
    }
  })

  const custom: DerivedCustom[] = (file.custom ?? []).map((c, i) => {
    const context = `custom[${i + 1}]`
    if (!c || typeof c !== 'object' || typeof c.name !== 'string' || !c.name.trim()) {
      throw new CharacterError(`${context}: every custom roll needs a name.`)
    }
    const dice = parseDiceExpr(String(c.dice ?? ''))
    if (!dice || dice.terms.length === 0) {
      throw new CharacterError(`${context} (${c.name}): dice must be an expression like 3d6 or 1d4+3.`)
    }
    return { name: c.name.trim(), dice, aliases: stringList(c.aliases, `${context}.aliases`).map(normName) }
  })

  const toggles: DerivedToggle[] = (file.toggles ?? []).map((t, i) => {
    const context = `toggles[${i + 1}]`
    if (!t || typeof t !== 'object' || typeof t.name !== 'string' || !t.name.trim()) {
      throw new CharacterError(`${context}: every toggle needs a name.`)
    }
    let damageDice: DiceExpr | null = null
    if (t.damageDice !== undefined && t.damageDice !== null && String(t.damageDice).trim() !== '') {
      damageDice = parseDiceExpr(String(t.damageDice))
      if (!damageDice || damageDice.terms.length === 0) {
        throw new CharacterError(`${context} (${t.name}): damageDice must be dice like 3d6.`)
      }
    }
    return {
      name: t.name.trim(),
      attackBonus: numberOr(t.attackBonus, 0, `${context}.attackBonus`),
      damageBonus: numberOr(t.damageBonus, 0, `${context}.damageBonus`),
      damageDice,
      appliesTo:
        t.appliesTo === undefined || t.appliesTo === null
          ? null
          : stringList(t.appliesTo, `${context}.appliesTo`).map(normName),
      aliases: stringList(t.aliases, `${context}.aliases`).map(normName),
    }
  })

  const aliases: Record<string, string> = {}
  for (const [k, v] of Object.entries(file.aliases ?? {})) {
    if (typeof v !== 'string') throw new CharacterError(`aliases.${k}: expected a name to roll.`)
    aliases[normName(k)] = normName(v)
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
    aliases,
  }
}

/** True when the toggle names the attack (by name or alias) in appliesTo, or lists nothing. */
export function toggleApplies(toggle: DerivedToggle, attack: DerivedAttack): boolean {
  if (toggle.appliesTo === null) return true
  const names = [normName(attack.name), ...attack.aliases]
  return toggle.appliesTo.some((n) => names.includes(n))
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
