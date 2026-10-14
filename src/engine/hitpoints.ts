/**
 * Hit points, temporary hit points, and death saves, with the sentences that
 * announce each change. Pure: every function returns a new state and the text.
 */
import type { DeathSaveOutcome } from './roll'

export interface DeathSaves {
  successes: number
  failures: number
}

export interface HitPoints {
  max: number
  current: number
  temp: number
  deathSaves: DeathSaves
}

export interface HpChange {
  hp: HitPoints
  text: string
}

const NO_SAVES: DeathSaves = { successes: 0, failures: 0 }
const COUNT = ['zero', 'one', 'two', 'three']

export const freshHitPoints = (max: number): HitPoints => ({ max, current: max, temp: 0, deathSaves: NO_SAVES })

const ofMax = (hp: HitPoints): string => `${hp.current} of ${hp.max} hit points`

/** "43 of 45 hit points, 3 temporary." plus "You are down." and any death save tally. */
export function describeHp(hp: HitPoints): string {
  let s = ofMax(hp)
  if (hp.temp > 0) s += `, ${hp.temp} temporary`
  s += '.'
  if (hp.current === 0) s += ' You are down.'
  const tally = describeTally(hp.deathSaves)
  if (tally) s += ` ${tally}`
  return s
}

/** "That is two failures." / "That is one success and one failure." or "" when nothing is tallied. */
export function describeTally(ds: DeathSaves): string {
  const parts: string[] = []
  if (ds.successes) parts.push(`${COUNT[ds.successes]} ${ds.successes === 1 ? 'success' : 'successes'}`)
  if (ds.failures) parts.push(`${COUNT[ds.failures]} ${ds.failures === 1 ? 'failure' : 'failures'}`)
  return parts.length ? `That is ${parts.join(' and ')}.` : ''
}

/** Temporary hit points go first; what is left comes off the real pool. */
export function takeDamage(hp: HitPoints, amount: number): HpChange {
  if (!Number.isInteger(amount) || amount <= 0) return { hp, text: 'Say how much damage, like minus 5.' }
  if (hp.current === 0) {
    const ds = { ...hp.deathSaves, failures: Math.min(3, hp.deathSaves.failures + 1) }
    return { hp: { ...hp, deathSaves: ds }, text: `Took ${amount} while down. ${describeTally(ds)}` }
  }
  let remaining = amount
  let temp = hp.temp
  let tempText = ''
  if (temp > 0) {
    const fromTemp = Math.min(temp, remaining)
    temp -= fromTemp
    remaining -= fromTemp
    tempText =
      temp === 0
        ? ' Temporary hit points used up.'
        : ` ${temp} temporary ${temp === 1 ? 'hit point' : 'hit points'} left.`
  }
  const current = Math.max(0, hp.current - remaining)
  const next = { ...hp, current, temp }
  let text = `Took ${amount}.${tempText} ${ofMax(next)}.`
  if (current === 0) text += ' You are down.'
  return { hp: next, text }
}

export function heal(hp: HitPoints, amount: number): HpChange {
  if (!Number.isInteger(amount) || amount <= 0) return { hp, text: 'Say how much healing, like plus 7.' }
  const wasDown = hp.current === 0
  const next = { ...hp, current: Math.min(hp.max, hp.current + amount), deathSaves: wasDown ? NO_SAVES : hp.deathSaves }
  return { hp: next, text: `Healed ${amount}.${wasDown ? ' You are up.' : ''} ${ofMax(next)}.` }
}

/** Temporary hit points do not stack: the higher value stays. Zero clears them. */
export function setTemp(hp: HitPoints, amount: number): HpChange {
  if (!Number.isInteger(amount) || amount < 0) return { hp, text: 'Say how many, like temp 8.' }
  if (amount === 0) return { hp: { ...hp, temp: 0 }, text: 'Temporary hit points cleared.' }
  if (amount <= hp.temp) return { hp, text: `Kept ${hp.temp} temporary hit points, the higher of the two.` }
  return { hp: { ...hp, temp: amount }, text: `${amount} temporary hit points.` }
}

export function setCurrent(hp: HitPoints, value: number): HpChange {
  if (!Number.isInteger(value) || value < 0) return { hp, text: 'Say a number, like hp 30.' }
  const current = Math.min(hp.max, value)
  const next = { ...hp, current, deathSaves: current > 0 ? NO_SAVES : hp.deathSaves }
  return { hp: next, text: describeHp(next) }
}

export function longRest(hp: HitPoints): HpChange {
  const next = freshHitPoints(hp.max)
  return { hp: next, text: `Long rest. ${ofMax(next)}.` }
}

/** Keeps the running tally after a death saving throw and applies its consequences. */
export function recordDeathSave(hp: HitPoints, outcome: DeathSaveOutcome): HpChange {
  switch (outcome) {
    case 'critical-success': {
      const next = { ...hp, current: Math.max(1, hp.current), deathSaves: NO_SAVES }
      return { hp: next, text: `You are up. ${ofMax(next)}.` }
    }
    case 'critical-failure': {
      const ds = { ...hp.deathSaves, failures: Math.min(3, hp.deathSaves.failures + 2) }
      return { hp: { ...hp, deathSaves: ds }, text: describeTally(ds) }
    }
    case 'failure': {
      const ds = { ...hp.deathSaves, failures: Math.min(3, hp.deathSaves.failures + 1) }
      return { hp: { ...hp, deathSaves: ds }, text: describeTally(ds) }
    }
    case 'success': {
      const ds = { ...hp.deathSaves, successes: Math.min(3, hp.deathSaves.successes + 1) }
      if (ds.successes === 3) return { hp: { ...hp, deathSaves: NO_SAVES }, text: `${describeTally(ds)} You are stable.` }
      return { hp: { ...hp, deathSaves: ds }, text: describeTally(ds) }
    }
  }
}
