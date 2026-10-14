import { describe, expect, it } from 'vitest'
import {
  describeHp,
  freshHitPoints,
  heal,
  longRest,
  recordDeathSave,
  setCurrent,
  setTemp,
  takeDamage,
  type HitPoints,
} from './hitpoints'

const hp = (current: number, temp = 0, max = 45): HitPoints => ({ ...freshHitPoints(max), current, temp })

describe('damage', () => {
  it('comes off temporary hit points first', () => {
    expect(takeDamage(hp(45, 3), 5)).toEqual({
      hp: hp(43, 0),
      text: 'Took 5. Temporary hit points used up. 43 of 45 hit points.',
    })
    expect(takeDamage(hp(45, 3), 2)).toEqual({ hp: hp(45, 1), text: 'Took 2. 1 temporary hit point left. 45 of 45 hit points.' })
    expect(takeDamage(hp(45, 5), 2).text).toBe('Took 2. 3 temporary hit points left. 45 of 45 hit points.')
    expect(takeDamage(hp(45), 5).text).toBe('Took 5. 40 of 45 hit points.')
  })

  it('dropping to zero says so, and damage while down is a failed death save', () => {
    const down = takeDamage(hp(10), 50)
    expect(down.text).toBe('Took 50. 0 of 45 hit points. You are down.')
    expect(down.hp.current).toBe(0)
    const more = takeDamage(down.hp, 3)
    expect(more.text).toBe('Took 3 while down. That is one failure.')
    expect(more.hp.deathSaves).toEqual({ successes: 0, failures: 1 })
  })
})

describe('healing and temporary hit points', () => {
  it('healing caps at max and clears death saves when you get up', () => {
    expect(heal(hp(40), 7).text).toBe('Healed 7. 45 of 45 hit points.')
    const up = heal({ ...hp(0), deathSaves: { successes: 1, failures: 2 } }, 7)
    expect(up.text).toBe('Healed 7. You are up. 7 of 45 hit points.')
    expect(up.hp.deathSaves).toEqual({ successes: 0, failures: 0 })
  })

  it('temporary hit points keep the higher value and zero clears them', () => {
    expect(setTemp(hp(45), 8)).toEqual({ hp: hp(45, 8), text: '8 temporary hit points.' })
    expect(setTemp(hp(45, 8), 5).text).toBe('Kept 8 temporary hit points, the higher of the two.')
    expect(setTemp(hp(45, 8), 0).text).toBe('Temporary hit points cleared.')
  })

  it('set, describe, rest, and bad input', () => {
    expect(setCurrent(hp(45), 30).text).toBe('30 of 45 hit points.')
    expect(setCurrent(hp(45), 99).hp.current).toBe(45)
    expect(describeHp(hp(43, 3))).toBe('43 of 45 hit points, 3 temporary.')
    expect(describeHp({ ...hp(0), deathSaves: { successes: 1, failures: 0 } })).toBe(
      '0 of 45 hit points. You are down. That is one success.',
    )
    expect(longRest(hp(3, 2)).text).toBe('Long rest. 45 of 45 hit points.')
    expect(takeDamage(hp(45), 0).text).toBe('Say how much damage, like minus 5.')
    expect(setTemp(hp(45), NaN).text).toBe('Say how many, like temp 8.')
    expect(setCurrent(hp(45), NaN).text).toBe('Say a number, like hp 30.')
  })
})

describe('death saves', () => {
  it('tally to stable, to three failures, or back up', () => {
    let h = recordDeathSave(hp(0), 'success').hp
    expect(recordDeathSave(h, 'success').text).toBe('That is two successes.')
    h = recordDeathSave(h, 'success').hp
    const stable = recordDeathSave(h, 'success')
    expect(stable.text).toBe('That is three successes. You are stable.')
    expect(stable.hp.deathSaves).toEqual({ successes: 0, failures: 0 })

    const f1 = recordDeathSave(hp(0), 'failure')
    expect(f1.text).toBe('That is one failure.')
    expect(recordDeathSave(f1.hp, 'critical-failure').text).toBe('That is three failures.')
    expect(recordDeathSave({ ...hp(0), deathSaves: { successes: 1, failures: 1 } }, 'failure').text).toBe(
      'That is one success and two failures.',
    )

    const up = recordDeathSave(f1.hp, 'critical-success')
    expect(up.text).toBe('You are up. 1 of 45 hit points.')
    expect(up.hp.deathSaves).toEqual({ successes: 0, failures: 0 })
  })
})
