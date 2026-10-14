/** Everything a player can roll, with the names they might type for it, and the matcher. */
import { ABILITIES, ABILITY_NAMES, SKILLS, type Ability, type Character, type SkillId } from './character'
import { formatDiceExpr } from './dice'

export type Target =
  | { kind: 'ability'; ability: Ability }
  | { kind: 'skill'; id: SkillId }
  | { kind: 'save'; ability: Ability }
  | { kind: 'initiative' }
  | { kind: 'death-save' }
  | { kind: 'attack'; index: number }
  | { kind: 'custom'; index: number }

export interface Candidate {
  key: string
  /** Short display name: "Stealth", "Dexterity save". */
  name: string
  /** What the announcement calls it: "Stealth check", "Dexterity save". */
  label: string
  /** Button text: "Stealth +10", "Flail +7 to hit". */
  buttonLabel: string
  /** Attacks only: the damage button, "Flail damage 1d8+4 bludgeoning". */
  damageLabel?: string
  /** Everything a player might type for it, lowercased. */
  names: string[]
  target: Target
}

export const fmtMod = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

export const isSaveTarget = (c: Candidate): boolean => c.target.kind === 'save' || c.target.kind === 'death-save'

export function allCandidates(ch: Character): Candidate[] {
  const out: Candidate[] = []
  for (const a of ABILITIES) {
    const name = ABILITY_NAMES[a]
    out.push({
      key: `ability:${a}`,
      name,
      label: `${name} check`,
      buttonLabel: `${name} ${fmtMod(ch.abilities[a].checkModifier)}`,
      names: [name.toLowerCase(), a],
      target: { kind: 'ability', ability: a },
    })
  }
  for (const s of ch.skills) {
    const def = SKILLS.find((d) => d.id === s.id)
    out.push({
      key: `skill:${s.id}`,
      name: s.name,
      label: `${s.name} check`,
      buttonLabel: `${s.name} ${fmtMod(s.modifier)}`,
      names: [s.name.toLowerCase(), ...(def?.aliases ?? [])],
      target: { kind: 'skill', id: s.id },
    })
  }
  for (const s of ch.saves) {
    out.push({
      key: `save:${s.ability}`,
      name: `${s.name} save`,
      label: `${s.name} save`,
      buttonLabel: `${s.name} save ${fmtMod(s.modifier)}`,
      names: [s.name.toLowerCase(), s.ability],
      target: { kind: 'save', ability: s.ability },
    })
  }
  out.push({
    key: 'initiative',
    name: 'Initiative',
    label: 'Initiative',
    buttonLabel: `Initiative ${fmtMod(ch.initiative)}`,
    names: ['initiative', 'init'],
    target: { kind: 'initiative' },
  })
  out.push({
    key: 'death-save',
    name: 'Death save',
    label: 'Death save',
    buttonLabel: 'Death save',
    names: ['death save', 'death', 'ds', 'death saving throw'],
    target: { kind: 'death-save' },
  })
  ch.attacks.forEach((a, index) => {
    const type = a.damageType ? ` ${a.damageType}` : ''
    out.push({
      key: `attack:${index}`,
      name: a.name,
      label: a.name,
      buttonLabel: `${a.name} ${fmtMod(a.toHit)} to hit`,
      damageLabel: `${a.name} damage ${formatDiceExpr(a.damage)}${type}`,
      names: [a.name.toLowerCase(), ...a.aliases],
      target: { kind: 'attack', index },
    })
  })
  ch.custom.forEach((c, index) => {
    out.push({
      key: `custom:${index}`,
      name: c.name,
      label: c.name,
      buttonLabel: `${c.name} ${formatDiceExpr(c.dice)}`,
      names: [c.name.toLowerCase(), ...c.aliases],
      target: { kind: 'custom', index },
    })
  })
  return out
}

export type Match =
  | { kind: 'match'; candidate: Candidate }
  | { kind: 'ambiguous'; candidates: Candidate[] }
  | { kind: 'none' }

export interface Named {
  /** Everything a player might type for it, lowercased. */
  names: string[]
}

export type NamedMatch<T> = { kind: 'match'; item: T } | { kind: 'ambiguous'; items: T[] } | { kind: 'none' }

export const norm = (s: string): string => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Exact name or alias beats prefix beats substring. Ties are reported, never guessed. */
export function matchNamed<T extends Named>(rawQuery: string, pool: T[], aliases: Record<string, string> = {}): NamedMatch<T> {
  let q = norm(rawQuery)
  if (aliases[q]) q = norm(aliases[q])
  if (!q) return { kind: 'none' }
  const score = (c: T): number => {
    let best = 0
    for (const raw of c.names) {
      const n = norm(raw)
      if (n === q) best = Math.max(best, 3)
      else if (n.startsWith(q)) best = Math.max(best, 2)
      else if (n.includes(q)) best = Math.max(best, 1)
    }
    return best
  }
  let top = 0
  let hits: T[] = []
  for (const c of pool) {
    const s = score(c)
    if (s === 0) continue
    if (s > top) {
      top = s
      hits = [c]
    } else if (s === top) {
      hits.push(c)
    }
  }
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'match', item: hits[0] }
  return { kind: 'ambiguous', items: hits }
}

export function matchQuery(rawQuery: string, pool: Candidate[], aliases: Record<string, string> = {}): Match {
  const m = matchNamed(rawQuery, pool, aliases)
  if (m.kind === 'match') return { kind: 'match', candidate: m.item }
  if (m.kind === 'ambiguous') return { kind: 'ambiguous', candidates: m.items }
  return m
}

/** "Perception, Performance, or Persuasion". */
export function listOr(names: string[]): string {
  if (names.length <= 2) return names.join(' or ')
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
}
