/**
 * Turns a roll result into the sentences a screen reader speaks.
 *
 * Shape: what was rolled and the total in one short sentence, then one
 * sentence saying how it was made: "Flail with Rage: 12 to hit. You rolled
 * a 5 plus 7 from modifiers." Natural 20 and natural 1 come first. Digits
 * for numbers, words for operators. No symbols or parentheses: NVDA either
 * spells them out or skips them.
 */
import type { DiceResult } from './dice'
import type {
  AttackRollResult,
  CheckResult,
  D20Roll,
  DamageRollResult,
  DeathSaveResult,
  DiceOnlyResult,
  RollResult,
} from './roll'

export interface AnnounceOptions {
  /** Include the "You rolled ..." sentence after the total. */
  breakdown: boolean
}

export function announce(r: RollResult, opts: AnnounceOptions): string {
  switch (r.kind) {
    case 'check':
    case 'save':
    case 'initiative':
      return announceCheck(r, opts)
    case 'death-save':
      return announceDeathSave(r, opts)
    case 'attack':
      return announceAttack(r, opts)
    case 'damage':
      return announceDamage(r, opts)
    case 'dice':
      return announceDice(r, opts)
  }
}

/** "3", "3 and 5", "3, 5 and 2". */
export function joinAnd(values: (number | string)[]): string {
  if (values.length <= 1) return values.join('')
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

/** "a 5", "an 8", "an 11", "a 20": the article speech expects before a number. */
export function withArticle(n: number): string {
  return `${/^(8|11|18|8\d)$/.test(String(n)) ? 'an' : 'a'} ${n}`
}

/** "plus 3 from Rage", "minus 5 from Sharpshooter", "plus 3". */
function plusMinus(n: number, from?: string): string {
  return `${n > 0 ? 'plus' : 'minus'} ${Math.abs(n)}${from ? ` from ${from}` : ''}`
}

const dieName = (count: number, sides: number): string => (count === 1 ? `a d${sides}` : `${count}d${sides}`)

function modeText(d20: D20Roll): string {
  if (d20.mode === 'advantage') return ' with advantage'
  if (d20.mode === 'disadvantage') return ' with disadvantage'
  return ''
}

/** " with advantage and Rage": the mode and every effect in force, in one phrase. */
function withText(d20: D20Roll | null, effectNames: string[]): string {
  const parts: string[] = []
  if (d20?.mode === 'advantage') parts.push('advantage')
  if (d20?.mode === 'disadvantage') parts.push('disadvantage')
  parts.push(...effectNames)
  return parts.length ? ` with ${joinAnd(parts)}` : ''
}

function natPrefix(d20: D20Roll): string {
  if (d20.natural20) return 'Natural 20! '
  if (d20.natural1) return 'Natural 1. '
  return ''
}

/**
 * "You rolled a 12 plus 5 from modifiers" or
 * "You rolled a 12 and a 7, kept the 12, plus 5 from modifiers", then bonus dice and effects.
 */
function describeD20(
  d20: D20Roll,
  modifier: number,
  bonus: DiceResult | null,
  effects: { name: string; bonus: number }[] = [],
): string {
  let s: string
  if (d20.mode === 'normal') {
    s = `You rolled ${withArticle(d20.kept)}`
    if (modifier !== 0) s += ` ${plusMinus(modifier, 'modifiers')}`
  } else {
    s = `You rolled ${withArticle(d20.dice[0])} and ${withArticle(d20.dice[1])}, kept the ${d20.kept}`
    if (modifier !== 0) s += `, ${plusMinus(modifier, 'modifiers')}`
  }
  if (bonus) s += describeBonus(bonus)
  for (const e of effects) s += `, ${plusMinus(e.bonus, e.name)}`
  return s
}

/** ", plus 3 from a d4, plus 2 from your bonus": what the player typed after the roll name. */
function describeBonus(b: DiceResult): string {
  let s = ''
  for (const t of b.terms) {
    const sum = t.values.reduce((a, v) => a + v, 0)
    s += `, ${plusMinus(t.sign * sum, dieName(t.count, t.sides))}`
  }
  if (b.flat !== 0) s += `, ${plusMinus(b.flat, 'your bonus')}`
  return s
}

/**
 * "a 3 plus 4 from modifiers", "3 and 5, plus 4 from modifiers",
 * "5 from a d8, plus 3 from a d6, plus 4 from modifiers", or for raw dice "4 and 6, plus 3".
 */
function describeDice(r: DiceResult, flatFrom?: string): string {
  if (r.terms.length === 0) return String(r.flat)
  const single = r.terms.length === 1 && r.terms[0].values.length === 1
  let s: string
  if (r.terms.length === 1) {
    const t = r.terms[0]
    s = `${t.sign < 0 ? 'minus ' : ''}${single ? withArticle(t.values[0]) : joinAnd(t.values)}`
  } else {
    s = r.terms
      .map((t, i) => {
        const values = t.values.length === 1 ? String(t.values[0]) : joinAnd(t.values)
        const text = `${values} from ${dieName(t.count, t.sides)}`
        return i === 0 ? `${t.sign < 0 ? 'minus ' : ''}${text}` : `, ${t.sign < 0 ? 'minus' : 'plus'} ${text}`
      })
      .join('')
  }
  if (r.flat !== 0) s += `${single ? ' ' : ', '}${plusMinus(r.flat, flatFrom)}`
  return s
}

function announceCheck(r: CheckResult, opts: AnnounceOptions): string {
  let s = `${natPrefix(r.d20)}${r.label}${modeText(r.d20)}: ${r.total}.`
  if (opts.breakdown) s += ` ${describeD20(r.d20, r.modifier, r.bonus)}.`
  return s
}

function announceDeathSave(r: DeathSaveResult, opts: AnnounceOptions): string {
  const label = `Death save${modeText(r.d20)}`
  switch (r.outcome) {
    case 'critical-success':
      return `Natural 20! ${label}: you regain 1 hit point.`
    case 'critical-failure':
      return `Natural 1. ${label}: two failures.`
    case 'success':
    case 'failure': {
      let s = `${label}: ${r.total}, ${r.outcome}.`
      if (opts.breakdown) s += ` ${describeD20(r.d20, 0, r.bonus)}.`
      return s
    }
  }
}

function announceAttack(r: AttackRollResult, opts: AnnounceOptions): string {
  let s = `${natPrefix(r.d20)}${r.label}${withText(r.d20, r.effectNames)}: ${r.total} to hit.`
  if (opts.breakdown) s += ` ${describeD20(r.d20, r.modifier, r.bonus, r.effectBonuses)}.`
  return s
}

function announceDamage(r: DamageRollResult, opts: AnnounceOptions): string {
  const type = r.damageType ? ` ${r.damageType}` : ''
  let s = `${r.critical ? 'Critical hit! ' : ''}${r.label}${withText(null, r.effectNames)}: ${r.total}${type} damage.`
  if (opts.breakdown) {
    let extra = ''
    for (const e of r.effects) {
      if (e.bonus !== 0) extra += `, ${plusMinus(e.bonus, e.name)}`
      if (e.dice) extra += `, plus ${e.dice.total} from ${e.name}`
    }
    s += ` You rolled ${describeDice(r.damage, 'modifiers')}${extra}.`
  }
  return s
}

function announceDice(r: DiceOnlyResult, opts: AnnounceOptions): string {
  let s = `${r.label}: ${r.total}.`
  if (opts.breakdown) s += ` You rolled ${describeDice(r.result)}.`
  return s
}
