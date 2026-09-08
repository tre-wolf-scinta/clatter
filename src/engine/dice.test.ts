import { describe, expect, it } from 'vitest'
import { addExpr, doubleDice, formatDiceExpr, isDiceExpr, parseDiceExpr, queueRng, rollDie, rollExpr } from './dice'

const d = (count: number, sides: number, sign: 1 | -1 = 1) => ({ sign, count, sides })

describe('parseDiceExpr', () => {
  it('parses dice terms and flat modifiers', () => {
    expect(parseDiceExpr('2d6+3')).toEqual({ terms: [d(2, 6)], flat: 3 })
    expect(parseDiceExpr('d20')).toEqual({ terms: [d(1, 20)], flat: 0 })
    expect(parseDiceExpr('1d8 + 1d6 - 1')).toEqual({ terms: [d(1, 8), d(1, 6)], flat: -1 })
    expect(parseDiceExpr('-1d4')).toEqual({ terms: [d(1, 4, -1)], flat: 0 })
    expect(parseDiceExpr('+2')).toEqual({ terms: [], flat: 2 })
    expect(parseDiceExpr('2D6+1+1')).toEqual({ terms: [d(2, 6)], flat: 2 })
  })

  it('rejects anything that is not dice', () => {
    for (const bad of ['', 'abc', '2d6++3', '0d6', 'd0', '101d6', '2d', 'd', 'stealth']) {
      expect(parseDiceExpr(bad), bad).toBeNull()
    }
  })

  it('isDiceExpr requires at least one die', () => {
    expect(isDiceExpr('2d6')).toBe(true)
    expect(isDiceExpr('20')).toBe(false)
    expect(isDiceExpr('+3')).toBe(false)
  })
})

describe('formatDiceExpr', () => {
  it('round-trips common expressions', () => {
    for (const s of ['2d6+3', '1d8+1d6-1', '1d20', '-1d4', '3d6']) {
      expect(formatDiceExpr(parseDiceExpr(s)!)).toBe(s)
    }
    expect(formatDiceExpr({ terms: [], flat: 2 })).toBe('2')
    expect(formatDiceExpr({ terms: [], flat: -2 })).toBe('-2')
    expect(formatDiceExpr({ terms: [], flat: 0 })).toBe('0')
  })
})

describe('rolling', () => {
  it('rollDie maps the rng range onto 1..sides', () => {
    expect(rollDie(20, () => 0)).toBe(1)
    expect(rollDie(20, () => 0.999)).toBe(20)
    expect(rollDie(6, () => 0.5)).toBe(4)
  })

  it('rollExpr sums dice and flat, honouring negative terms', () => {
    const r = rollExpr(parseDiceExpr('2d6+3')!, queueRng([0, 0.999]))
    expect(r.terms[0].values).toEqual([1, 6])
    expect(r.total).toBe(10)
    const neg = rollExpr(parseDiceExpr('1d20-1d4')!, queueRng([0.5, 0.5]))
    expect(neg.total).toBe(11 - 3)
  })

  it('doubleDice doubles dice counts and keeps the flat modifier', () => {
    expect(doubleDice(parseDiceExpr('1d8+4')!)).toEqual({ terms: [d(2, 8)], flat: 4 })
  })

  it('addExpr concatenates terms and sums flats', () => {
    expect(addExpr(parseDiceExpr('1d8')!, parseDiceExpr('+2')!)).toEqual({ terms: [d(1, 8)], flat: 2 })
  })
})
