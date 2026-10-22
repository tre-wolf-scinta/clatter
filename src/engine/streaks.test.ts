import { afterEach, describe, expect, it } from 'vitest'
import { parseDiceExpr, queueRng, rollDie, rollExpr, setAvoidRepeats } from './dice'
import { rollD20 } from './roll'

describe('streak protection', () => {
  afterEach(() => setAvoidRepeats(false))

  it('a die never shows the face it showed last time; it draws from the other faces instead', () => {
    setAvoidRepeats(true)
    const rng = queueRng([0.55, 0.55, 0.0, 0.55, 0.999])
    expect(rollDie(20, rng)).toBe(12)
    expect(rollDie(20, rng)).toBe(1)
    expect(rollDie(20, rng)).toBe(12)
    expect(rollDie(20, rng)).toBe(20)
  })

  it('each die size has its own memory', () => {
    setAvoidRepeats(true)
    expect(rollDie(8, queueRng([0.5]))).toBe(5)
    expect(rollDie(20, queueRng([0.2]))).toBe(5)
    expect(rollDie(8, queueRng([0.5, 0.0]))).toBe(1)
  })

  it('only the first die of a term is held back, so 2d6 can still roll doubles', () => {
    setAvoidRepeats(true)
    expect(rollExpr(parseDiceExpr('2d6')!, queueRng([0.5, 0.5])).terms[0].values).toEqual([4, 4])
    expect(rollExpr(parseDiceExpr('2d6')!, queueRng([0.5, 0.0, 0.5])).terms[0].values).toEqual([1, 4])
  })

  it('with advantage, the die that counted is the one the next roll avoids', () => {
    setAvoidRepeats(true)
    expect(rollD20('advantage', queueRng([0.3, 0.7])).kept).toBe(15)
    expect(rollD20('normal', queueRng([0.7, 0.0])).kept).toBe(1)
  })

  it('off, the dice are plain and remember nothing', () => {
    const rng = queueRng([0.55, 0.55])
    expect(rollDie(20, rng)).toBe(12)
    expect(rollDie(20, rng)).toBe(12)
  })

  it('with real randomness: no back-to-back repeats, and every face still comes up about equally', () => {
    setAvoidRepeats(true)
    const counts = new Array<number>(21).fill(0)
    let previous = 0
    let repeats = 0
    for (let i = 0; i < 20000; i++) {
      const face = rollDie(20)
      if (face === previous) repeats++
      previous = face
      counts[face]++
    }
    expect(repeats).toBe(0)
    for (let face = 1; face <= 20; face++) {
      expect(counts[face]).toBeGreaterThan(800)
      expect(counts[face]).toBeLessThan(1200)
    }
  })
})
