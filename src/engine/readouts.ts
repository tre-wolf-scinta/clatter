/**
 * Answers to slash questions: /ac, /passive, /skills, /saves, /attacks,
 * /equipped, /inventory, /features, /potions, /hp, /status, or the name of a
 * skill, ability, attack, feature, or toggle. Nothing here rolls.
 */
import {
  ABILITY_NAMES,
  FEATURE_SECTIONS,
  FEATURE_SECTION_NAMES,
  normName,
  type ArmorClassPart,
  type Character,
  type DerivedAttack,
  type DerivedFeature,
  type DerivedSkill,
  type DerivedSpell,
  type DerivedToggle,
  type FeatureSection,
  type Proficiency,
} from './character'
import { allCandidates, listOr, matchNamed, type Candidate } from './candidates'
import { formatDiceExpr } from './dice'
import { describeHp, type HitPoints } from './hitpoints'
import type { Mode } from './roll'
import { joinAnd } from './announce'

export interface StatusContext {
  hp: HitPoints | null
  activeToggles: string[]
  stickyMode: Mode
  pendingCrit: string | null
  /** Attack name in hand, or null. */
  inHand: string | null
  /** Armor item worn, or null. */
  wearing: string | null
  /** What is left of each consumable, by name. */
  items: Record<string, number>
  /** Uses left of each limited feature, by name (spells under "spell:name"); a missing entry means full. */
  uses: Record<string, number>
  /** Hit dice left; null means full. */
  hitDice: number | null
  /** Spell slots spent at each level; a missing level means none. */
  slotsUsed: Record<number, number>
  pactUsed: number
  /** The spell being concentrated on, or null. */
  concentration: string | null
}

export const NO_HP = 'No hit points on this character yet. Add hitPoints with a max to the character file.'
export const NO_AC = 'No armor class on this character yet. Add armorClass parts to the character file.'
export const NO_HIT_DICE = 'No hit dice on this character yet. Add hitDice with a die and a count to the character file.'
export const NO_FEATURES = 'No feats or abilities on this character yet. Add features to the character file.'
export const NO_SPELLS = 'No spells on this character yet. Add spells and spellcasting to the character file.'
export const UNKNOWN_TOPIC =
  'Try /ac, /passive, /skills, /saves, /attacks, /equipped, /inventory, /features, /spells, /slots, /potions, /hp, /status, or the name of a skill, ability, attack, feature, or spell.'

export const plusWord = (n: number): string => (n < 0 ? `minus ${-n}` : `plus ${n}`)

/** Uses left of a limited feature: what the device remembers, else the full count. */
export const usesLeft = (f: DerivedFeature, uses: Record<string, number>): number =>
  f.uses ? (uses[f.name] ?? f.uses.max) : 0

/** Free castings left of a spell, kept under "spell:name" so a feature of the same name cannot collide. */
export const spellUsesLeft = (s: DerivedSpell, uses: Record<string, number>): number =>
  s.uses ? (uses[`spell:${s.name}`] ?? s.uses.max) : 0

/** Slots left at a level: the file's count minus what this device has spent. */
export const slotsLeft = (ch: Character, slotsUsed: Record<number, number>, level: number): number =>
  Math.max(0, (ch.spellcasting?.slots[level] ?? 0) - (slotsUsed[level] ?? 0))

export const pactLeft = (ch: Character, pactUsed: number): number =>
  Math.max(0, (ch.spellcasting?.pact?.count ?? 0) - pactUsed)

/** Hit dice left: what the device remembers, else the full count; 0 when the character has none. */
export const hitDiceLeft = (ch: Character, left: number | null): number => (ch.hitDice ? (left ?? ch.hitDice.count) : 0)

export const usesWord = (n: number): string => `${n} ${n === 1 ? 'use' : 'uses'}`
export const hitDiceWord = (n: number): string => `${n} hit ${n === 1 ? 'die' : 'dice'}`

const PROFICIENCY_WORD: Record<Proficiency, string> = {
  none: 'not proficient',
  half: 'half proficiency',
  proficient: 'proficient',
  expertise: 'expertise',
}

/** "plus 7 to hit, 1d8+4 bludgeoning". */
export function describeAttackStats(a: DerivedAttack): string {
  return `${plusWord(a.toHit)} to hit, ${formatDiceExpr(a.damage)}${a.damageType ? ` ${a.damageType}` : ''}`
}

export function answerQuery(topic: string, ch: Character, ctx: StatusContext): string {
  const t = topic.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  switch (t) {
    case 'ac':
    case 'armor':
    case 'armor class':
      return describeArmorClass(ch, ctx.activeToggles, ctx.wearing)
    case 'passive':
    case 'passives':
      return describePassives(ch)
    case 'skills':
      return describeSkills(ch)
    case 'saves':
    case 'saving throws':
      return describeSaves(ch)
    case 'attacks':
    case 'weapons':
      return describeAttacks(ch)
    case 'equipped':
    case 'hand':
    case 'gear':
    case 'wielding':
      return describeEquipped(ch, ctx)
    case 'inventory':
    case 'i':
      return describeInventory(ch, ctx)
    case 'potions':
    case 'consumables':
    case 'items':
      return describeConsumables(ch, ctx.items)
    case 'features':
    case 'feats':
    case 'abilities':
    case 'f':
      return describeFeatures(ch, ctx)
    case 'hit dice':
    case 'hit die':
    case 'hd':
      return describeHitDice(ch, ctx.hitDice)
    case 'spells':
    case 's':
      return describeSpells(ch, ctx)
    case 'slots':
    case 'spell slots':
      return describeSlots(ch, ctx)
    case 'concentration':
    case 'concentrating':
    case 'conc':
      return ctx.concentration ? `Concentrating on ${ctx.concentration}.` : 'Not concentrating on anything.'
    case 'hp':
    case 'hit points':
    case 'health':
      return ctx.hp ? describeHp(ctx.hp) : NO_HP
    case 'status':
      return describeStatus(ch, ctx)
    case 'toggles':
      return describeToggles(ch, ctx.activeToggles)
  }
  const m = matchNamed(t, topics(ch), ch.aliases)
  if (m.kind === 'ambiguous') return `Ambiguous: ${listOr(m.items.map((x) => x.name))}. Type more letters.`
  if (m.kind === 'none') return `Nothing called ${topic}. ${UNKNOWN_TOPIC}`
  return describeTopic(m.item, ch, ctx)
}

/** One thing a question can be about. A roll, a feature, and a toggle with the same name are one topic. */
interface Topic {
  name: string
  names: string[]
  candidate: Candidate | null
  feature: DerivedFeature | null
  toggle: DerivedToggle | null
}

function topics(ch: Character): Topic[] {
  const out: Topic[] = allCandidates(ch)
    .filter((c) => c.target.kind !== 'save')
    .map((c) => ({ name: c.name, names: c.names, candidate: c, feature: null, toggle: null }))
  const find = (name: string) => out.find((t) => normName(t.name) === normName(name))
  for (const f of ch.features) {
    const t = find(f.name)
    if (t) {
      t.feature = f
      t.names = [...t.names, ...f.aliases]
    } else {
      out.push({ name: f.name, names: [f.name.toLowerCase(), ...f.aliases], candidate: null, feature: f, toggle: null })
    }
  }
  for (const tg of ch.toggles) {
    const t = find(tg.name)
    if (t) {
      t.toggle = tg
      t.names = [...t.names, ...tg.aliases]
    } else {
      out.push({ name: tg.name, names: [tg.name.toLowerCase(), ...tg.aliases], candidate: null, feature: null, toggle: tg })
    }
  }
  return out
}

function describeTopic(t: Topic, ch: Character, ctx: StatusContext): string {
  const parts: string[] = []
  if (t.candidate) parts.push(describeCandidate(t.candidate, ch, ctx))
  if (t.feature) {
    parts.push(t.candidate ? describeFeatureTail(t.feature, ctx) : describeFeature(t.feature, ch, ctx))
  } else if (t.toggle) {
    parts.push(describeToggleState(t.toggle, ctx))
  }
  return parts.filter(Boolean).join(' ')
}

function describeCandidate(c: Candidate, ch: Character, ctx: StatusContext): string {
  const t = c.target
  switch (t.kind) {
    case 'spell': {
      const s = ch.spells[t.index]
      return s ? describeSpell(s, ch, ctx) : 'That spell is no longer on this character.'
    }
    case 'ability': {
      const a = ch.abilities[t.ability]
      const save = ch.saves.find((s) => s.ability === t.ability)
      const saveText = save
        ? ` Saving throw ${plusWord(save.modifier)}, ${save.proficient ? 'proficient' : 'not proficient'}.`
        : ''
      return `${ABILITY_NAMES[t.ability]} ${a.score}, modifier ${plusWord(a.modifier)}.${saveText}`
    }
    case 'skill': {
      const s = ch.skills.find((x) => x.id === t.id)
      return s ? describeSkill(s) : 'That skill is not on this character.'
    }
    case 'save':
      return 'Ask about the ability instead, for example /dex.'
    case 'initiative':
      return `Initiative ${plusWord(ch.initiative)}.`
    case 'death-save':
      return 'Death save: roll a d20 with no modifier; 10 or higher is a success. Three successes and you are stable, three failures and you are dead.'
    case 'attack': {
      const a = ch.attacks[t.index]
      if (!a) return 'That attack is no longer on this character.'
      return `${a.name} ${describeAttackStats(a)}.`
    }
    case 'custom': {
      const c2 = ch.custom[t.index]
      return c2 ? `${c2.name}: ${formatDiceExpr(c2.dice)}.` : 'That roll is no longer on this character.'
    }
  }
}

const describeSkill = (s: DerivedSkill): string => `${s.name} ${plusWord(s.modifier)}, ${PROFICIENCY_WORD[s.proficiency]}.`

/** "plus 4 to hit, 2d10 fire", "Wisdom save DC 12", "Dexterity save DC 15, 8d6 fire, half on a success", "heals 1d8+3". */
export function describeSpellStats(s: DerivedSpell, ch: Character): string {
  const sc = ch.spellcasting
  const type = s.damageType ? ` ${s.damageType}` : ''
  const dice = s.damage ? formatDiceExpr(s.damage) : ''
  switch (s.kind) {
    case 'attack':
      return `${plusWord(sc?.attackBonus ?? 0)} to hit, ${dice}${type}`
    case 'save': {
      const save = `${ABILITY_NAMES[s.save ?? 'dex']} save DC ${sc?.saveDc ?? 0}`
      return s.damage ? `${save}, ${dice}${type}, ${s.saveEffect === 'half' ? 'half' : 'nothing'} on a success` : save
    }
    case 'heal':
      return `heals ${s.heal ? formatDiceExpr(s.heal) : ''}`
    case 'damage':
      return `${dice}${type}`
    case 'dice':
      return dice
    case 'utility':
      return ''
  }
}

/** "Fireball: level 3, Dexterity save DC 15, 8d6 fire, half on a success, each level higher adds 1d6. A bright streak..." */
export function describeSpell(s: DerivedSpell, ch: Character, ctx: StatusContext): string {
  const bits: string[] = [s.level === 0 ? 'cantrip' : `level ${s.level}`]
  const stats = describeSpellStats(s, ch)
  if (stats) bits.push(stats)
  if (s.upcast) bits.push(`each level higher adds ${formatDiceExpr(s.upcast)}`)
  if (s.concentration) bits.push(ctx.concentration === s.name ? 'concentrating on it now' : 'concentration')
  if (s.ritual) bits.push('ritual')
  if (s.uses) bits.push(`${spellUsesLeft(s, ctx.uses)} of ${s.uses.max} free castings`)
  if (!s.prepared) bits.push('not prepared')
  const head = `${s.name}: ${bits.join(', ')}.`
  return s.description ? `${head} ${s.description}` : head
}

/** The levels the spells screen shows: cantrips when there are any, then every level with a spell or a slot. */
export function spellLevels(ch: Character): number[] {
  const levels = new Set<number>()
  for (const s of ch.spells) levels.add(s.level)
  for (const l of Object.keys(ch.spellcasting?.slots ?? {})) levels.add(Number(l))
  return [...levels].sort((a, b) => a - b)
}

/** "Cantrips", "Level 1, 3 of 4 slots", or "Level 2" when the slots come from a pact. */
export function spellLevelHeading(ch: Character, slotsUsed: Record<number, number>, level: number): string {
  if (level === 0) return 'Cantrips'
  const max = ch.spellcasting?.slots[level]
  return max ? `Level ${level}, ${slotsLeft(ch, slotsUsed, level)} of ${max} slots` : `Level ${level}`
}

/** "Fire Bolt", "Misty Step with 1 of 1 free castings". */
export function spellEntryText(s: DerivedSpell, ctx: StatusContext): string {
  return s.uses ? `${s.name} with ${spellUsesLeft(s, ctx.uses)} of ${s.uses.max} free castings` : s.name
}

/**
 * Every spell, level by level, as the screen lays it out, with unprepared spells
 * in a sentence of their own so a list of names stays a list of names:
 * "Cantrips: Fire Bolt, Mage Hand. Level 1, 3 of 3 slots: Shield, Sleep. Not prepared: Hold Person. Pact slots: 2 of 2 at level 3. Concentrating on Bless."
 */
export function describeSpells(ch: Character, ctx: StatusContext): string {
  if (!ch.spells.length && !ch.spellcasting) return NO_SPELLS
  const parts: string[] = []
  for (const level of spellLevels(ch)) {
    const at = ch.spells.filter((s) => s.level === level)
    const ready = at.filter((s) => s.prepared).map((s) => spellEntryText(s, ctx))
    const unprepared = at.filter((s) => !s.prepared).map((s) => s.name)
    parts.push(`${spellLevelHeading(ch, ctx.slotsUsed, level)}: ${ready.length ? ready.join(', ') : 'none'}.`)
    if (unprepared.length) parts.push(`Not prepared: ${unprepared.join(', ')}.`)
  }
  const pact = ch.spellcasting?.pact
  if (pact) parts.push(`Pact slots: ${pactLeft(ch, ctx.pactUsed)} of ${pact.count} at level ${pact.level}.`)
  if (ctx.concentration) parts.push(`Concentrating on ${ctx.concentration}.`)
  return parts.length ? parts.join(' ') : NO_SPELLS
}

/** "Level 1 slots: 3 of 4. Level 2 slots: 1 of 2. Pact slots: 2 of 2 at level 3." */
export function describeSlots(ch: Character, ctx: StatusContext): string {
  const sc = ch.spellcasting
  const levels = Object.keys(sc?.slots ?? {})
    .map(Number)
    .sort((a, b) => a - b)
  if (!sc || (!levels.length && !sc.pact)) return 'No spell slots on this character.'
  const parts = levels.map((l) => `Level ${l} slots: ${slotsLeft(ch, ctx.slotsUsed, l)} of ${sc.slots[l]}.`)
  if (sc.pact) parts.push(`Pact slots: ${pactLeft(ch, ctx.pactUsed)} of ${sc.pact.count} at level ${sc.pact.level}.`)
  return parts.join(' ')
}

/** "advantage to hit, plus 2 damage, plus 3d6 damage, plus 2 armor class": what a toggle does while on. */
export function describeToggleEffects(t: DerivedToggle): string {
  const parts: string[] = []
  if (t.advantage) parts.push('advantage to hit')
  if (t.attackBonus) parts.push(`${plusWord(t.attackBonus)} to hit`)
  if (t.damageBonus) parts.push(`${plusWord(t.damageBonus)} damage`)
  if (t.damageDice) parts.push(`plus ${formatDiceExpr(t.damageDice)} damage`)
  if (t.acBonus) parts.push(`${plusWord(t.acBonus)} armor class`)
  return parts.join(', ')
}

/** "Shield spell off, plus 5 armor class." for a toggle that is not a feature. */
function describeToggleState(t: DerivedToggle, ctx: StatusContext): string {
  const effects = describeToggleEffects(t)
  return `${t.name} ${ctx.activeToggles.includes(t.name) ? 'on' : 'off'}${effects ? `, ${effects}` : ''}.`
}

/** "Rage on, 2 of 3 uses, plus 2 damage. Enter a rage as a bonus action..." */
export function describeFeature(f: DerivedFeature, ch: Character, ctx: StatusContext): string {
  const bits: string[] = []
  if (f.uses) bits.push(`${usesLeft(f, ctx.uses)} of ${f.uses.max} uses`)
  if (f.heal) bits.push(`heals ${formatDiceExpr(f.heal)}`)
  const t = f.toggle ? ch.toggles.find((x) => x.name === f.toggle) : undefined
  if (t) {
    const effects = describeToggleEffects(t)
    if (effects) bits.push(effects)
  }
  let head = f.name
  if (f.toggle) head += ctx.activeToggles.includes(f.toggle) ? ' on' : ' off'
  if (bits.length) head += `, ${bits.join(', ')}`
  return f.description ? `${head}. ${f.description}` : `${head}.`
}

/** The feature half of a topic that is also a roll: "Surprise Attack: 2d6." then this. */
function describeFeatureTail(f: DerivedFeature, ctx: StatusContext): string {
  const parts: string[] = []
  if (f.toggle) parts.push(`${f.name} is ${ctx.activeToggles.includes(f.toggle) ? 'on' : 'off'}.`)
  if (f.uses) parts.push(`${usesLeft(f, ctx.uses)} of ${f.uses.max} uses.`)
  if (f.description) parts.push(f.description)
  return parts.join(' ')
}

/**
 * The armor class parts in force: the worn armor's base plus Dexterity as it
 * allows, otherwise the file's unarmored parts (or 10 plus Dexterity when the
 * character owns armor but the file gives no unarmored formula); then the
 * flat bonuses. Null when there is nothing to go on.
 */
export function armorParts(ch: Character, wearing: string | null): ArmorClassPart[] | null {
  const dex = ch.abilities.dex.modifier
  const worn = wearing ? ch.items.find((i) => i.kind === 'armor' && i.name === wearing) : undefined
  if (worn && worn.baseAc !== null) {
    const parts: ArmorClassPart[] = [{ name: worn.name, value: worn.baseAc }]
    if (worn.dexCap !== 0) parts.push({ name: 'Dexterity', value: worn.dexCap === null ? dex : Math.min(dex, worn.dexCap) })
    return [...parts, ...ch.armorBonuses]
  }
  const base =
    ch.armorClass ??
    (ch.items.some((i) => i.kind === 'armor')
      ? [
          { name: 'unarmored', value: 10 },
          { name: 'Dexterity', value: dex },
        ]
      : null)
  return base ? [...base, ...ch.armorBonuses] : null
}

/** The name of what is worn, else the unarmored formula's name, else null. */
export function armorName(ch: Character, wearing: string | null): string | null {
  const parts = armorParts(ch, wearing)
  return parts ? parts[0].name : null
}

/** The parts plus every armor toggle that is on; null when the file gives no armor class. */
export function armorClassTotal(ch: Character, activeToggles: string[], wearing: string | null): number | null {
  const parts = armorParts(ch, wearing)
  if (!parts) return null
  const base = parts.reduce((s, p) => s + p.value, 0)
  const extra = ch.toggles.filter((t) => t.acBonus !== 0 && activeToggles.includes(t.name)).reduce((s, t) => s + t.acBonus, 0)
  return base + extra
}

/** "Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield. Shield spell is off." */
export function describeArmorClass(ch: Character, activeToggles: string[], wearing: string | null): string {
  const parts = armorParts(ch, wearing)
  const total = armorClassTotal(ch, activeToggles, wearing)
  if (!parts || total === null) return NO_AC
  const acToggles = ch.toggles.filter((t) => t.acBonus !== 0)
  const on = acToggles.filter((t) => activeToggles.includes(t.name))
  const off = acToggles.filter((t) => !activeToggles.includes(t.name))
  const spoken = parts.map((p, i) => (i === 0 ? `${p.name} ${p.value}` : `${p.name} ${plusWord(p.value)}`))
  const extras = on.map((t) => `${plusWord(t.acBonus)} from ${t.name}`)
  let s = `Armor class ${total}: ${[...spoken, ...extras].join(', ')}.`
  if (off.length) s += ` ${off.map((t) => t.name).join(' and ')} ${off.length === 1 ? 'is' : 'are'} off.`
  return s
}

function describePassives(ch: Character): string {
  const passive = (id: string) => 10 + (ch.skills.find((s) => s.id === id)?.modifier ?? 0)
  return `Passive Perception ${passive('perception')}, Investigation ${passive('investigation')}, Insight ${passive('insight')}.`
}

function describeSkills(ch: Character): string {
  const list = ch.skills.filter((s) => s.proficiency === 'proficient' || s.proficiency === 'expertise')
  if (!list.length) return 'No skill proficiencies.'
  const items = list.map((s) => `${s.name} ${plusWord(s.modifier)}${s.proficiency === 'expertise' ? ' with expertise' : ''}`)
  return `Proficient: ${items.join(', ')}.`
}

function describeSaves(ch: Character): string {
  const list = ch.saves.filter((s) => s.proficient)
  if (!list.length) return 'No saving throw proficiencies.'
  return `Proficient saving throws: ${list.map((s) => `${s.name} ${plusWord(s.modifier)}`).join(', ')}.`
}

function describeAttacks(ch: Character): string {
  if (!ch.attacks.length) return 'No attacks on this character.'
  return `Attacks: ${ch.attacks.map((a) => `${a.name} ${describeAttackStats(a)}`).join('; ')}.`
}

/** "Potion of Healing with 2 left and Torch with 5 left". */
export function carryingList(ch: Character, items: Record<string, number>): string {
  return joinAnd(ch.consumables.map((c) => `${c.name} with ${items[c.name] ?? c.count} left`))
}

/** "Flail in hand: plus 7 to hit, 1d8+4 bludgeoning. Shield on. Armor: unarmored defense. Carrying Potion of Healing with 2 left." */
export function describeEquipped(ch: Character, ctx: StatusContext): string {
  const parts: string[] = []
  const attack = ctx.inHand ? ch.attacks.find((a) => a.name === ctx.inHand) : undefined
  const spell = !attack && ctx.inHand ? ch.spells.find((s) => s.name === ctx.inHand) : undefined
  parts.push(
    attack
      ? `${attack.name} in hand: ${describeAttackStats(attack)}.`
      : spell
        ? `${spell.name} in hand: ${describeSpellStats(spell, ch)}.`
        : 'Nothing in hand.',
  )
  // Armor class toggles that are gear: a spell's toggle (the Shield spell) is not something carried.
  for (const t of ch.toggles.filter((x) => x.acBonus !== 0 && !ch.spells.some((s) => s.toggle === x.name))) {
    parts.push(`${t.name} ${ctx.activeToggles.includes(t.name) ? 'on' : 'off'}.`)
  }
  const armor = armorName(ch, ctx.wearing)
  if (armor) parts.push(`Armor: ${armor}.`)
  if (ch.consumables.length) parts.push(`Carrying ${carryingList(ch, ctx.items)}.`)
  return parts.join(' ')
}

/**
 * The whole inventory, section by section, as the HUD lays it out:
 * "Weapons: Flail in hand, Warhammer. Armor and shields: Chain shirt worn, Shield on. Potions: ..."
 */
export function describeInventory(ch: Character, ctx: StatusContext): string {
  const left = (name: string, count: number) => ctx.items[name] ?? count
  const section = (title: string, entries: string[]) => `${title}: ${entries.length ? entries.join(', ') : 'none'}.`
  const weapons = ch.items.filter((i) => i.kind === 'weapon')
  const weaponEntries = weapons.length
    ? weapons.map((i) => `${i.name}${i.attack && ctx.inHand === i.attack ? ' in hand' : ''}`)
    : ch.attacks.map((a) => `${a.name}${ctx.inHand === a.name ? ' in hand' : ''}`)
  const armorEntries = ch.items
    .filter((i) => i.kind === 'armor' || i.kind === 'shield' || (i.acBonus !== 0 && i.kind !== 'weapon'))
    .map((i) =>
      i.kind === 'armor' ? `${i.name}${ctx.wearing === i.name ? ' worn' : ''}` : `${i.name} ${ctx.activeToggles.includes(i.name) ? 'on' : 'off'}`,
    )
  const potionEntries = ch.items.filter((i) => i.kind === 'potion').map((i) => `${i.name} with ${left(i.name, i.count)} left`)
  const utilityEntries = ch.items
    .filter((i) => i.kind === 'utility' && i.acBonus === 0)
    .map((i) => (i.consumable ? `${i.name} with ${left(i.name, i.count)} left` : i.count > 1 ? `${i.count} ${i.name}` : i.name))
  const questEntries = ch.items.filter((i) => i.kind === 'quest').map((i) => i.name)
  return [
    section('Weapons', weaponEntries),
    section('Armor and shields', armorEntries),
    section('Potions', potionEntries),
    section('Utility', utilityEntries),
    section('Quest items', questEntries),
  ].join(' ')
}

/** One button of the Feats and abilities screen: a feature (with its toggle, if it has one) or a toggle on its own. */
export type FeatureEntry = { feature: DerivedFeature; toggle: DerivedToggle | null } | { feature: null; toggle: DerivedToggle }

/** Toggles that belong to no feature, spell, or inventory item. They are listed under Other so nothing switchable is hidden. */
export function looseToggles(ch: Character): DerivedToggle[] {
  return ch.toggles.filter(
    (t) =>
      !ch.features.some((f) => f.toggle === t.name) &&
      !ch.spells.some((s) => s.toggle === t.name) &&
      !ch.items.some((i) => normName(i.name) === normName(t.name)),
  )
}

/** The entries of each section, as the screen lays them out: features in file order, then loose toggles under Other. */
export function featureSections(ch: Character): Record<FeatureSection, FeatureEntry[]> {
  const out: Record<FeatureSection, FeatureEntry[]> = { class: [], species: [], feat: [], other: [] }
  for (const f of ch.features) {
    out[f.section].push({ feature: f, toggle: f.toggle ? (ch.toggles.find((t) => t.name === f.toggle) ?? null) : null })
  }
  for (const t of looseToggles(ch)) out.other.push({ feature: null, toggle: t })
  return out
}

/** "Rage off with 3 of 3 uses", "Reckless Attack on", "Danger Sense". */
export function featureEntryText(e: FeatureEntry, ctx: StatusContext): string {
  if (!e.feature) return `${e.toggle.name} ${ctx.activeToggles.includes(e.toggle.name) ? 'on' : 'off'}`
  let s = e.feature.name
  if (e.toggle) s += ctx.activeToggles.includes(e.toggle.name) ? ' on' : ' off'
  if (e.feature.uses) s += ` with ${usesLeft(e.feature, ctx.uses)} of ${e.feature.uses.max} uses`
  return s
}

/**
 * Every feature, section by section, as the screen lays it out:
 * "Class features: Rage off with 3 of 3 uses, Reckless Attack off, Danger Sense. Species traits: ... Feats: ... Hit dice: 5 of 5."
 * Other is read only when something is in it.
 */
export function describeFeatures(ch: Character, ctx: StatusContext): string {
  const sections = featureSections(ch)
  if (!ch.features.length && !sections.other.length && !ch.hitDice) return NO_FEATURES
  const parts: string[] = []
  for (const s of FEATURE_SECTIONS) {
    const list = sections[s]
    if (s === 'other' && !list.length) continue
    parts.push(`${FEATURE_SECTION_NAMES[s]}: ${list.length ? list.map((e) => featureEntryText(e, ctx)).join(', ') : 'none'}.`)
  }
  if (ch.hitDice) parts.push(`Hit dice: ${hitDiceLeft(ch, ctx.hitDice)} of ${ch.hitDice.count}.`)
  return parts.join(' ')
}

/** "Hit dice: 4 of 5, d12." */
export function describeHitDice(ch: Character, left: number | null): string {
  if (!ch.hitDice) return NO_HIT_DICE
  return `Hit dice: ${hitDiceLeft(ch, left)} of ${ch.hitDice.count}, d${ch.hitDice.sides}.`
}

/** "Potion of Healing, 2 left. Torch, 5 left." */
export function describeConsumables(ch: Character, items: Record<string, number>): string {
  if (!ch.consumables.length) return 'No consumables on this character.'
  return ch.consumables.map((c) => `${c.name}, ${items[c.name] ?? c.count} left.`).join(' ')
}

function describeToggles(ch: Character, activeToggles: string[]): string {
  if (!ch.toggles.length) return 'No toggles on this character.'
  return `${ch.toggles.map((t) => `${t.name} ${activeToggles.includes(t.name) ? 'on' : 'off'}`).join(', ')}.`
}

function describeStatus(ch: Character, ctx: StatusContext): string {
  const parts: string[] = []
  if (ctx.hp) parts.push(describeHp(ctx.hp))
  if (ctx.inHand) parts.push(`${ctx.inHand} in hand.`)
  const on = ch.toggles.filter((t) => ctx.activeToggles.includes(t.name)).map((t) => t.name)
  parts.push(on.length ? `${on.join(' and ')} on.` : 'No toggles on.')
  if (ctx.concentration) parts.push(`Concentrating on ${ctx.concentration}.`)
  if (ctx.stickyMode !== 'normal') parts.push(`Rolling everything with ${ctx.stickyMode}.`)
  if (ctx.pendingCrit) parts.push(`Critical damage pending for ${ctx.pendingCrit}.`)
  return parts.join(' ')
}
