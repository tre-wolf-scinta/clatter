/**
 * Answers to slash questions: /ac, /passive, /skills, /saves, /attacks, /hp,
 * /status, or the name of a skill, ability, or attack. Nothing here rolls.
 */
import { ABILITY_NAMES, type Character, type DerivedSkill, type Proficiency } from './character'
import { allCandidates, listOr, matchQuery, type Candidate } from './candidates'
import { formatDiceExpr } from './dice'
import { describeHp, type HitPoints } from './hitpoints'
import type { Mode } from './roll'

export interface StatusContext {
  hp: HitPoints | null
  activeToggles: string[]
  stickyMode: Mode
  pendingCrit: string | null
}

export const NO_HP = 'No hit points on this character yet. Add hitPoints with a max to the character file.'
export const NO_AC = 'No armor class on this character yet. Add armorClass parts to the character file.'

const plusWord = (n: number): string => (n < 0 ? `minus ${-n}` : `plus ${n}`)

const PROFICIENCY_WORD: Record<Proficiency, string> = {
  none: 'not proficient',
  half: 'half proficiency',
  proficient: 'proficient',
  expertise: 'expertise',
}

export function answerQuery(topic: string, ch: Character, ctx: StatusContext): string {
  const t = topic.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  switch (t) {
    case 'ac':
    case 'armor':
    case 'armor class':
      return describeArmorClass(ch, ctx.activeToggles)
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
    case 'hp':
    case 'hit points':
    case 'health':
      return ctx.hp ? describeHp(ctx.hp) : NO_HP
    case 'status':
      return describeStatus(ch, ctx)
    case 'toggles':
      return describeToggles(ch, ctx.activeToggles)
  }
  const pool = allCandidates(ch).filter((c) => c.target.kind !== 'save')
  const m = matchQuery(t, pool, ch.aliases)
  if (m.kind === 'ambiguous') return `Ambiguous: ${listOr(m.candidates.map((c) => c.name))}. Type more letters.`
  if (m.kind === 'none') {
    return `Nothing called ${topic}. Try /ac, /passive, /skills, /saves, /attacks, /hp, /status, or the name of a skill, ability, or attack.`
  }
  return describeCandidate(m.candidate, ch)
}

function describeCandidate(c: Candidate, ch: Character): string {
  const t = c.target
  switch (t.kind) {
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
      return `${a.name} ${plusWord(a.toHit)} to hit, ${formatDiceExpr(a.damage)}${a.damageType ? ` ${a.damageType}` : ''}.`
    }
    case 'custom': {
      const c2 = ch.custom[t.index]
      return c2 ? `${c2.name}: ${formatDiceExpr(c2.dice)}.` : 'That roll is no longer on this character.'
    }
  }
}

const describeSkill = (s: DerivedSkill): string => `${s.name} ${plusWord(s.modifier)}, ${PROFICIENCY_WORD[s.proficiency]}.`

/** "Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield. Shield spell is off." */
export function describeArmorClass(ch: Character, activeToggles: string[]): string {
  if (!ch.armorClass) return NO_AC
  const acToggles = ch.toggles.filter((t) => t.acBonus !== 0)
  const on = acToggles.filter((t) => activeToggles.includes(t.name))
  const off = acToggles.filter((t) => !activeToggles.includes(t.name))
  const total = ch.armorClass.reduce((s, p) => s + p.value, 0) + on.reduce((s, t) => s + t.acBonus, 0)
  const parts = ch.armorClass.map((p, i) => (i === 0 ? `${p.name} ${p.value}` : `${p.name} ${plusWord(p.value)}`))
  const extras = on.map((t) => `${plusWord(t.acBonus)} from ${t.name}`)
  let s = `Armor class ${total}: ${[...parts, ...extras].join(', ')}.`
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
  const items = ch.attacks.map(
    (a) => `${a.name} ${plusWord(a.toHit)} to hit, ${formatDiceExpr(a.damage)}${a.damageType ? ` ${a.damageType}` : ''}`,
  )
  return `Attacks: ${items.join('; ')}.`
}

function describeToggles(ch: Character, activeToggles: string[]): string {
  if (!ch.toggles.length) return 'No toggles on this character.'
  return `${ch.toggles.map((t) => `${t.name} ${activeToggles.includes(t.name) ? 'on' : 'off'}`).join(', ')}.`
}

function describeStatus(ch: Character, ctx: StatusContext): string {
  const parts: string[] = []
  if (ctx.hp) parts.push(describeHp(ctx.hp))
  const on = ch.toggles.filter((t) => ctx.activeToggles.includes(t.name)).map((t) => t.name)
  parts.push(on.length ? `${on.join(' and ')} on.` : 'No toggles on.')
  if (ctx.stickyMode !== 'normal') parts.push(`Rolling everything with ${ctx.stickyMode}.`)
  if (ctx.pendingCrit) parts.push(`Critical damage pending for ${ctx.pendingCrit}.`)
  return parts.join(' ')
}
