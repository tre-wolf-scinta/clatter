/**
 * Dice expressions and randomness.
 *
 * Everything that consumes randomness takes an Rng so tests can script
 * exact dice. Production uses the platform CSPRNG so rolls are fair.
 */

/** Returns a number in [0, 1). */
export type Rng = () => number

export const secureRng: Rng = () => {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 4294967296
}

/** Test helper: returns the given values in order, then repeats the last one. */
export function queueRng(values: number[]): Rng {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

/**
 * Streak protection. When on, a die of a given size never shows the face it
 * showed last time: the first die of each roll that would repeat is drawn again
 * from the other faces. The owner's call (2026-10-22): over a campaign the dice
 * are fair either way, but in a session of six rolls a back-to-back repeat
 * feels like a loaded die, and this is a game. Every face stays equally likely
 * overall; only immediate repeats go. Off by default so the engine's tests see
 * plain dice; the app switches it on from Settings.
 */
let avoidRepeats = false
const lastFace = new Map<number, number>()

export function setAvoidRepeats(on: boolean): void {
  avoidRepeats = on
  lastFace.clear()
}

/** A plain die: every face equally likely, no memory. */
export const rollDiePlain = (sides: number, rng: Rng = secureRng): number => Math.floor(rng() * sides) + 1

/** Records the face a roll ended on, so the next roll of that die size can avoid it. */
export function rememberFace(sides: number, face: number): void {
  if (avoidRepeats) lastFace.set(sides, face)
}

/**
 * One die, the first of a roll. With streak protection on it avoids the face
 * this die size showed last time by drawing from the other faces instead.
 */
export function rollDie(sides: number, rng: Rng = secureRng): number {
  const face = rollDiePlain(sides, rng)
  if (!avoidRepeats || sides < 2 || lastFace.get(sides) !== face) {
    rememberFace(sides, face)
    return face
  }
  const other = rollDiePlain(sides - 1, rng)
  const picked = other >= face ? other + 1 : other
  rememberFace(sides, picked)
  return picked
}

export interface DiceTerm {
  sign: 1 | -1
  count: number
  sides: number
}

/** A dice expression such as 2d6+3 or 1d8+1d6-1: dice terms plus a flat modifier. */
export interface DiceExpr {
  terms: DiceTerm[]
  flat: number
}

const MAX_COUNT = 100
const MAX_SIDES = 1000

export const emptyExpr = (): DiceExpr => ({ terms: [], flat: 0 })

export function addExpr(a: DiceExpr, b: DiceExpr): DiceExpr {
  return { terms: [...a.terms, ...b.terms], flat: a.flat + b.flat }
}

/** Parses "2d6+3", "d20", "-1d4", "+2". Returns null for anything else. */
export function parseDiceExpr(input: string): DiceExpr | null {
  const s = input.replace(/\s+/g, '').toLowerCase()
  if (!s) return null
  // "2d6+3-1d4" -> ["2d6", "+3", "-1d4"]
  const tokens = s.match(/[+-]?[^+-]+/g)
  if (!tokens || tokens.join('') !== s) return null
  const expr = emptyExpr()
  for (const tok of tokens) {
    const sign: 1 | -1 = tok.startsWith('-') ? -1 : 1
    const body = tok.replace(/^[+-]/, '')
    const dice = /^(\d*)d(\d+)$/.exec(body)
    if (dice) {
      const count = dice[1] === '' ? 1 : Number(dice[1])
      const sides = Number(dice[2])
      if (count < 1 || count > MAX_COUNT || sides < 1 || sides > MAX_SIDES) return null
      expr.terms.push({ sign, count, sides })
    } else if (/^\d+$/.test(body)) {
      expr.flat += sign * Number(body)
    } else {
      return null
    }
  }
  return expr
}

/** True when the text is a dice expression with at least one die (a bare number is not). */
export function isDiceExpr(input: string): boolean {
  const e = parseDiceExpr(input)
  return e !== null && e.terms.length > 0
}

export function formatDiceExpr(expr: DiceExpr): string {
  let out = ''
  expr.terms.forEach((t, i) => {
    const sign = t.sign < 0 ? '-' : i === 0 ? '' : '+'
    out += `${sign}${t.count}d${t.sides}`
  })
  if (expr.flat !== 0 || out === '') {
    if (out === '') out = String(expr.flat)
    else out += expr.flat < 0 ? `-${-expr.flat}` : `+${expr.flat}`
  }
  return out
}

export interface RolledTerm extends DiceTerm {
  values: number[]
}

export interface DiceResult {
  expr: DiceExpr
  terms: RolledTerm[]
  flat: number
  total: number
}

export function rollExpr(expr: DiceExpr, rng: Rng = secureRng): DiceResult {
  let total = expr.flat
  const terms = expr.terms.map((t) => {
    // Only the first die of a term is held back from repeating, so 2d6 can still roll doubles.
    const values = Array.from({ length: t.count }, (_, i) => (i === 0 ? rollDie(t.sides, rng) : rollDiePlain(t.sides, rng)))
    rememberFace(t.sides, values[values.length - 1])
    total += t.sign * values.reduce((a, b) => a + b, 0)
    return { ...t, values }
  })
  return { expr, terms, flat: expr.flat, total }
}

/** Critical hit: every die is rolled twice as many times; the flat modifier is not doubled. */
export function doubleDice(expr: DiceExpr): DiceExpr {
  return { terms: expr.terms.map((t) => ({ ...t, count: t.count * 2 })), flat: expr.flat }
}
