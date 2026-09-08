/** d20 mechanics: checks, saves, attack rolls, damage rolls, death saves, raw dice. */
import {
  type DiceExpr,
  type DiceResult,
  type Rng,
  doubleDice,
  formatDiceExpr,
  rollDie,
  rollExpr,
  secureRng,
} from './dice'
import type { DerivedAttack } from './character'

export type Mode = 'normal' | 'advantage' | 'disadvantage'

export interface D20Roll {
  mode: Mode
  /** One die for normal, two for advantage or disadvantage. */
  dice: number[]
  kept: number
  natural20: boolean
  natural1: boolean
}

export function rollD20(mode: Mode, rng: Rng = secureRng): D20Roll {
  const dice = mode === 'normal' ? [rollDie(20, rng)] : [rollDie(20, rng), rollDie(20, rng)]
  const kept = mode === 'disadvantage' ? Math.min(...dice) : Math.max(...dice)
  return { mode, dice, kept, natural20: kept === 20, natural1: kept === 1 }
}

export interface CheckResult {
  kind: 'check' | 'save' | 'initiative'
  label: string
  d20: D20Roll
  modifier: number
  bonus: DiceResult | null
  total: number
}

export function rollCheck(
  kind: CheckResult['kind'],
  label: string,
  modifier: number,
  mode: Mode,
  bonus: DiceExpr | null,
  rng: Rng = secureRng,
): CheckResult {
  const d20 = rollD20(mode, rng)
  const b = bonus ? rollExpr(bonus, rng) : null
  return { kind, label, d20, modifier, bonus: b, total: d20.kept + modifier + (b?.total ?? 0) }
}

export type DeathSaveOutcome = 'success' | 'failure' | 'critical-success' | 'critical-failure'

export interface DeathSaveResult {
  kind: 'death-save'
  label: string
  d20: D20Roll
  bonus: DiceResult | null
  total: number
  outcome: DeathSaveOutcome
}

export function rollDeathSave(mode: Mode, bonus: DiceExpr | null, rng: Rng = secureRng): DeathSaveResult {
  const d20 = rollD20(mode, rng)
  const b = bonus ? rollExpr(bonus, rng) : null
  const total = d20.kept + (b?.total ?? 0)
  const outcome: DeathSaveOutcome = d20.natural20
    ? 'critical-success'
    : d20.natural1
      ? 'critical-failure'
      : total >= 10
        ? 'success'
        : 'failure'
  return { kind: 'death-save', label: 'Death save', d20, bonus: b, total, outcome }
}

/** A toggle in force for an attack: Rage, Sneak Attack, Great Weapon Master. */
export interface AttackEffect {
  name: string
  attackBonus: number
  damageBonus: number
  damageDice: DiceExpr | null
}

/** The roll to hit. Damage is a separate roll, as at the table. */
export interface AttackRollResult {
  kind: 'attack'
  label: string
  d20: D20Roll
  /** The attack's to-hit modifier. */
  modifier: number
  bonus: DiceResult | null
  /** Every toggle in force, for the label. */
  effectNames: string[]
  /** Toggles that changed this roll. */
  effectBonuses: { name: string; bonus: number }[]
  total: number
}

export interface AttackRollOptions {
  mode: Mode
  bonus: DiceExpr | null
  effects?: AttackEffect[]
}

export function rollAttack(attack: DerivedAttack, opts: AttackRollOptions, rng: Rng = secureRng): AttackRollResult {
  const d20 = rollD20(opts.mode, rng)
  const b = opts.bonus ? rollExpr(opts.bonus, rng) : null
  const effects = opts.effects ?? []
  const effectBonuses = effects.filter((e) => e.attackBonus !== 0).map((e) => ({ name: e.name, bonus: e.attackBonus }))
  const total = d20.kept + attack.toHit + (b?.total ?? 0) + effectBonuses.reduce((s, e) => s + e.bonus, 0)
  return {
    kind: 'attack',
    label: attack.name,
    d20,
    modifier: attack.toHit,
    bonus: b,
    effectNames: effects.map((e) => e.name),
    effectBonuses,
    total,
  }
}

export interface DamageEffectRoll {
  name: string
  bonus: number
  dice: DiceResult | null
  /** bonus plus the dice total. */
  total: number
}

export interface DamageRollResult {
  kind: 'damage'
  label: string
  damage: DiceResult
  effectNames: string[]
  effects: DamageEffectRoll[]
  /** Weapon damage plus every effect. */
  total: number
  damageType?: string
  critical: boolean
}

export interface DamageRollOptions {
  critical: boolean
  effects?: AttackEffect[]
}

/**
 * Damage for a hit. A critical hit doubles every damage die, including effect dice.
 * Dice are consumed in order: weapon dice, then each effect's dice.
 */
export function rollDamage(attack: DerivedAttack, opts: DamageRollOptions, rng: Rng = secureRng): DamageRollResult {
  const damage = rollExpr(opts.critical ? doubleDice(attack.damage) : attack.damage, rng)
  const all = opts.effects ?? []
  const effects: DamageEffectRoll[] = all
    .filter((e) => e.damageBonus !== 0 || e.damageDice)
    .map((e) => {
      const dice = e.damageDice ? rollExpr(opts.critical ? doubleDice(e.damageDice) : e.damageDice, rng) : null
      return { name: e.name, bonus: e.damageBonus, dice, total: e.damageBonus + (dice?.total ?? 0) }
    })
  return {
    kind: 'damage',
    label: attack.name,
    damage,
    effectNames: all.map((e) => e.name),
    effects,
    total: damage.total + effects.reduce((s, e) => s + e.total, 0),
    damageType: attack.damageType,
    critical: opts.critical,
  }
}

export interface DiceOnlyResult {
  kind: 'dice'
  label: string
  result: DiceResult
  total: number
}

export function rollDice(expr: DiceExpr, rng: Rng = secureRng, label?: string): DiceOnlyResult {
  const result = rollExpr(expr, rng)
  return { kind: 'dice', label: label ?? formatDiceExpr(expr), result, total: result.total }
}

export type RollResult = CheckResult | DeathSaveResult | AttackRollResult | DamageRollResult | DiceOnlyResult
