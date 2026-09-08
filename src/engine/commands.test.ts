import { describe, expect, it } from 'vitest'
import { deriveCharacter, parseCharacterFile } from './character'
import {
  HELP_TEXT,
  allCandidates,
  extractToggles,
  initialRollerState,
  matchQuery,
  parseCommand,
  runCommand,
  type Candidate,
  type RollerState,
} from './commands'
import { queueRng } from './dice'
import { SAMPLE_CHARACTER_JSON } from './sample'

const ch = parseCharacterFile(SAMPLE_CHARACTER_JSON)
const opts = { breakdown: true }

/** Runs one command with scripted dice. Dice are consumed in order: d20s, then bonus dice, then damage dice. */
function say(input: string, dice: number[], state: RollerState = initialRollerState()) {
  return runCommand(input, ch, state, opts, queueRng(dice))
}

describe('parseCommand', () => {
  it('recognises the special commands', () => {
    expect(parseCommand('')).toEqual({ kind: 'empty' })
    expect(parseCommand('   ')).toEqual({ kind: 'empty' })
    expect(parseCommand('help')).toEqual({ kind: 'help' })
    expect(parseCommand('?')).toEqual({ kind: 'help' })
    expect(parseCommand('last')).toEqual({ kind: 'last' })
    expect(parseCommand('again')).toEqual({ kind: 'again', mode: null, bonus: null, part: null })
    expect(parseCommand('adv')).toEqual({ kind: 'again', mode: 'advantage', bonus: null, part: null })
    expect(parseCommand('dmg')).toEqual({ kind: 'again', mode: null, bonus: null, part: 'damage' })
  })

  it('splits a roll into query, mode, bonus, part, and flags', () => {
    expect(parseCommand('stealth')).toMatchObject({
      kind: 'roll',
      query: 'stealth',
      mode: null,
      bonus: null,
      save: false,
      part: null,
      crit: false,
    })
    expect(parseCommand('Stealth ADV')).toMatchObject({ query: 'stealth', mode: 'advantage' })
    expect(parseCommand('dex save dis')).toMatchObject({ query: 'dex', save: true, mode: 'disadvantage' })
    expect(parseCommand('wis saving throw')).toMatchObject({ query: 'wis', save: true })
    expect(parseCommand('rapier dmg crit')).toMatchObject({ query: 'rapier', part: 'damage', crit: true })
    expect(parseCommand('rapier -d')).toMatchObject({ query: 'rapier', part: 'damage' })
    expect(parseCommand('rapier -a')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('rapier attack')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('rapier to hit')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('flail with rage')).toMatchObject({ query: 'flail rage' })
    expect(parseCommand('stealth +2 +1d4')).toMatchObject({
      query: 'stealth',
      bonus: { terms: [{ sign: 1, count: 1, sides: 4 }], flat: 2 },
    })
    expect(parseCommand('give me a stealth check')).toMatchObject({ query: 'stealth' })
    expect(parseCommand('roll for initiative')).toMatchObject({ query: 'initiative' })
    expect(parseCommand('sleight of hand')).toMatchObject({ query: 'sleight of hand' })
  })

  it('treats dice notation as a raw roll, folding in bonuses', () => {
    const twoD6plus3 = { terms: [{ sign: 1, count: 2, sides: 6 }], flat: 3 }
    expect(parseCommand('2d6+3')).toEqual({ kind: 'dice', expr: twoD6plus3 })
    expect(parseCommand('2d6 +3')).toEqual({ kind: 'dice', expr: twoD6plus3 })
    expect(parseCommand('d20')).toMatchObject({ kind: 'dice' })
    expect(parseCommand('20')).toMatchObject({ kind: 'roll', query: '20' })
  })

  it('a bare save keyword asks which save', () => {
    expect(parseCommand('save')).toMatchObject({ kind: 'roll', query: '', save: true })
  })
})

describe('matchQuery', () => {
  const pool = allCandidates(ch)
  const checks = pool.filter((c) => c.target.kind !== 'save')
  const key = (q: string, p: Candidate[] = checks) => {
    const m = matchQuery(q, p, ch.aliases)
    return m.kind === 'match' ? m.candidate.key : m.kind
  }

  it('matches exact names and aliases before prefixes', () => {
    expect(key('dex')).toBe('ability:dex')
    expect(key('dexterity')).toBe('ability:dex')
    expect(key('int')).toBe('ability:int')
    expect(key('stealth')).toBe('skill:stealth')
    expect(key('ste')).toBe('skill:stealth')
    expect(key('soh')).toBe('skill:sleight-of-hand')
    expect(key('sleight of hand')).toBe('skill:sleight-of-hand')
    expect(key('perc')).toBe('skill:perception')
    expect(key('init')).toBe('initiative')
    expect(key('death')).toBe('death-save')
    expect(key('rapier')).toBe('attack:0')
    expect(key('bow')).toBe('attack:1')
    expect(key('sneak')).toBe('custom:0')
    expect(key('hide')).toBe('skill:stealth')
  })

  it('reports ambiguity instead of guessing', () => {
    const m = matchQuery('per', checks)
    expect(m.kind).toBe('ambiguous')
    if (m.kind === 'ambiguous') {
      expect(m.candidates.map((c) => c.name)).toEqual(['Perception', 'Performance', 'Persuasion'])
    }
    expect(key('in')).toBe('ambiguous')
    expect(key('xyz')).toBe('none')
  })

  it('the save pool matches abilities as saves', () => {
    const saves = pool.filter((c) => c.target.kind === 'save' || c.target.kind === 'death-save')
    expect(key('dex', saves)).toBe('save:dex')
    expect(key('wisdom', saves)).toBe('save:wis')
    expect(key('d', saves)).toBe('ambiguous')
  })

  it('button labels carry the modifier, and attacks get a damage button', () => {
    const labels = pool.map((c) => c.buttonLabel)
    expect(labels).toContain('Stealth +10')
    expect(labels).toContain('Dexterity save +7')
    expect(labels).toContain('Charisma -1')
    expect(labels).toContain('Rapier +7 to hit')
    expect(labels).toContain('Sneak Attack 3d6')
    expect(labels).toContain('Initiative +4')
    expect(pool.find((c) => c.key === 'attack:0')?.damageLabel).toBe('Rapier damage 1d8+4 piercing')
    expect(pool.find((c) => c.key === 'skill:stealth')?.damageLabel).toBeUndefined()
  })
})

describe('runCommand speaks checks and saves', () => {
  it('total first, then how it was made', () => {
    expect(say('stealth', [0.55]).outcome.text).toBe('Stealth check: 22. You rolled a 12 plus 10 from modifiers.')
    expect(say('cha', [0.5]).outcome.text).toBe('Charisma check: 10. You rolled an 11 minus 1 from modifiers.')
    expect(say('dex save', [0.5]).outcome.text).toBe('Dexterity save: 18. You rolled an 11 plus 7 from modifiers.')
    expect(say('init', [0.5]).outcome.text).toBe('Initiative: 15. You rolled an 11 plus 4 from modifiers.')
    expect(say('athletics', [0.5]).outcome.text).toBe('Athletics check: 11. You rolled an 11.')
  })

  it('advantage and disadvantage name both dice', () => {
    expect(say('stealth adv', [0.55, 0.3]).outcome.text).toBe(
      'Stealth check with advantage: 22. You rolled a 12 and a 7, kept the 12, plus 10 from modifiers.',
    )
    expect(say('stealth dis', [0.55, 0.3]).outcome.text).toBe(
      'Stealth check with disadvantage: 17. You rolled a 12 and a 7, kept the 7, plus 10 from modifiers.',
    )
  })

  it('natural 20 and natural 1 come first', () => {
    expect(say('stealth', [0.999]).outcome.text).toBe('Natural 20! Stealth check: 30. You rolled a 20 plus 10 from modifiers.')
    expect(say('stealth', [0]).outcome.text).toBe('Natural 1. Stealth check: 11. You rolled a 1 plus 10 from modifiers.')
  })

  it('bonuses say where they came from', () => {
    expect(say('history +1d4', [0.5, 0.5]).outcome.text).toBe(
      'History check: 15. You rolled an 11 plus 1 from modifiers, plus 3 from a d4.',
    )
    expect(say('stealth +2', [0.5]).outcome.text).toBe(
      'Stealth check: 23. You rolled an 11 plus 10 from modifiers, plus 2 from your bonus.',
    )
    expect(say('stealth -1d4', [0.5, 0.5]).outcome.text).toBe(
      'Stealth check: 18. You rolled an 11 plus 10 from modifiers, minus 3 from a d4.',
    )
  })

  it('death saves say success or failure', () => {
    expect(say('death save', [0.45]).outcome.text).toBe('Death save: 10, success. You rolled a 10.')
    expect(say('death save', [0.4]).outcome.text).toBe('Death save: 9, failure. You rolled a 9.')
    expect(say('death save', [0.999]).outcome.text).toBe('Natural 20! Death save: you regain 1 hit point.')
    expect(say('death save', [0]).outcome.text).toBe('Natural 1. Death save: two failures.')
  })

  it('custom rolls and raw dice', () => {
    expect(say('sneak', [0.5, 0.5, 0.5]).outcome.text).toBe('Sneak Attack: 12. You rolled 4, 4 and 4.')
    expect(say('2d6+3', [0.5, 0.999]).outcome.text).toBe('2d6+3: 13. You rolled 4 and 6, plus 3.')
    expect(say('d20', [0.55]).outcome.text).toBe('1d20: 12. You rolled a 12.')
    expect(say('1d8+1d6+2', [0.5, 0.5]).outcome.text).toBe('1d8+1d6+2: 11. You rolled 5 from a d8, plus 4 from a d6, plus 2.')
  })

  it('the breakdown can be turned off', () => {
    const quiet = { breakdown: false }
    expect(runCommand('stealth', ch, initialRollerState(), quiet, queueRng([0.55])).outcome.text).toBe('Stealth check: 22.')
    expect(runCommand('rapier', ch, initialRollerState(), quiet, queueRng([0.7])).outcome.text).toBe('Rapier: 22 to hit.')
    expect(runCommand('rapier dmg', ch, initialRollerState(), quiet, queueRng([0.25])).outcome.text).toBe(
      'Rapier: 7 piercing damage.',
    )
  })
})

describe('runCommand speaks attacks as two rolls', () => {
  it('the attack roll is to hit only', () => {
    expect(say('rapier', [0.7]).outcome.text).toBe('Rapier: 22 to hit. You rolled a 15 plus 7 from modifiers.')
    expect(say('rapier', [0.999]).outcome.text).toBe('Natural 20! Rapier: 27 to hit. You rolled a 20 plus 7 from modifiers.')
    expect(say('rapier adv', [0.7, 0.25]).outcome.text).toBe(
      'Rapier with advantage: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
    expect(say('rapier +1d4', [0.7, 0.5]).outcome.text).toBe(
      'Rapier: 25 to hit. You rolled a 15 plus 7 from modifiers, plus 3 from a d4.',
    )
    expect(say('bow', [0.7]).outcome.text).toBe('Shortbow: 22 to hit. You rolled a 15 plus 7 from modifiers.')
  })

  it('damage is its own roll', () => {
    expect(say('rapier dmg', [0.25]).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
    expect(say('rapier -d', [0.25]).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
    expect(say('rapier crit dmg', [0.25, 0.5]).outcome.text).toBe(
      'Critical hit! Rapier: 12 piercing damage. You rolled 3 and 5, plus 4 from modifiers.',
    )
  })

  it('a natural 20 makes the next damage roll for that attack critical on its own', () => {
    const hit = say('rapier', [0.999])
    expect(hit.state.pendingCrit).toBe('Rapier')
    const dmg = say('rapier dmg', [0.25, 0.5], hit.state)
    expect(dmg.outcome.text).toBe('Critical hit! Rapier: 12 piercing damage. You rolled 3 and 5, plus 4 from modifiers.')
    expect(dmg.state.pendingCrit).toBeNull()
    expect(say('rapier dmg', [0.25], dmg.state).outcome.text).toBe(
      'Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.',
    )
    expect(say('bow dmg', [0.5], hit.state).outcome.text).toBe('Shortbow: 8 piercing damage. You rolled a 4 plus 4 from modifiers.')
    expect(say('rapier', [0.7], hit.state).state.pendingCrit).toBeNull()
  })

  it('dmg on its own rolls damage for the last attack', () => {
    const hit = say('rapier', [0.7])
    expect(say('dmg', [0.25], hit.state).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
  })
})

describe('runCommand messages', () => {
  it('ambiguous, unknown, help, and empty', () => {
    expect(say('per', [0.5]).outcome).toEqual({
      text: 'Ambiguous: Perception, Performance, or Persuasion. Type more letters.',
      result: null,
    })
    expect(say('xyz', [0.5]).outcome.text).toBe('No roll matches xyz. Type help for examples.')
    expect(say('stealth save', [0.5]).outcome.text).toBe('No saving throw matches stealth. Type help for examples.')
    expect(say('save', [0.5]).outcome.text).toBe('Which saving throw? Try dex save or wis save.')
    expect(say('help', [0.5]).outcome.text).toBe(HELP_TEXT)
    expect(say('', [0.5]).outcome.text).toBe('Nothing rolled yet. Type a skill, ability, or attack and press Enter.')
    expect(say('again', [0.5]).outcome.text).toBe('Nothing to repeat yet.')
    expect(say('last', [0.5]).outcome.text).toBe('Nothing rolled yet.')
  })
})

describe('runCommand state', () => {
  it('Enter on the empty box rolls the last thing again', () => {
    const first = say('stealth', [0.55])
    const second = say('', [0.999], first.state)
    expect(second.outcome.text).toBe('Natural 20! Stealth check: 30. You rolled a 20 plus 10 from modifiers.')
    expect(second.outcome.result).not.toBeNull()
  })

  it('last repeats the text without rolling', () => {
    const first = say('stealth', [0.55])
    const again = say('last', [0.999], first.state)
    expect(again.outcome.text).toBe('Stealth check: 22. You rolled a 12 plus 10 from modifiers.')
    expect(again.outcome.result).toBeNull()
  })

  it('again re-rolls the last thing, with an optional new mode or bonus', () => {
    const first = say('stealth', [0.55])
    expect(say('again', [0.999], first.state).outcome.text).toBe(
      'Natural 20! Stealth check: 30. You rolled a 20 plus 10 from modifiers.',
    )
    expect(say('adv', [0.55, 0.3], first.state).outcome.text).toBe(
      'Stealth check with advantage: 22. You rolled a 12 and a 7, kept the 12, plus 10 from modifiers.',
    )
    expect(say('again +2', [0.55], first.state).outcome.text).toBe(
      'Stealth check: 24. You rolled a 12 plus 10 from modifiers, plus 2 from your bonus.',
    )
  })

  it('sticky mode applies unless the command says otherwise', () => {
    const state: RollerState = { ...initialRollerState(), stickyMode: 'disadvantage' }
    expect(say('stealth', [0.55, 0.3], state).outcome.text).toBe(
      'Stealth check with disadvantage: 17. You rolled a 12 and a 7, kept the 7, plus 10 from modifiers.',
    )
    expect(say('stealth adv', [0.55, 0.3], state).outcome.text).toBe(
      'Stealth check with advantage: 22. You rolled a 12 and a 7, kept the 12, plus 10 from modifiers.',
    )
  })

  it('messages do not overwrite the last roll', () => {
    const first = say('stealth', [0.55])
    const after = say('per', [0.5], first.state)
    expect(after.state.lastText).toBe('Stealth check: 22. You rolled a 12 plus 10 from modifiers.')
  })
})

describe('toggles', () => {
  const barbarian = deriveCharacter({
    name: 'Persi',
    level: 5,
    abilities: { str: 18, dex: 14 },
    attacks: [
      { name: 'Flail', damage: '1d8', damageType: 'bludgeoning' },
      { name: 'Javelin', damage: '1d6', damageType: 'piercing' },
    ],
    toggles: [{ name: 'Rage', damageBonus: 2, appliesTo: ['Flail'], aliases: ['raging'] }],
  })
  const rogue = deriveCharacter({
    level: 5,
    abilities: { dex: 18 },
    attacks: [{ name: 'Rapier', ability: 'dex', damage: '1d8', damageType: 'piercing' }],
    toggles: [
      { name: 'Sneak Attack', damageDice: '3d6', aliases: ['sneak'] },
      { name: 'Sharpshooter', attackBonus: -5, damageBonus: 10 },
    ],
  })
  const run = (input: string, dice: number[], who = barbarian, state: RollerState = initialRollerState()) =>
    runCommand(input, who, state, opts, queueRng(dice))

  it('a toggle word applies to one roll, in any position, by name or alias', () => {
    const toHit = 'Flail with Rage: 22 to hit. You rolled a 15 plus 7 from modifiers.'
    expect(run('flail rage', [0.7]).outcome.text).toBe(toHit)
    expect(run('raging flail', [0.7]).outcome.text).toBe(toHit)
    expect(run('flail with rage', [0.7]).outcome.text).toBe(toHit)
    expect(run('flail rage dmg', [0.25]).outcome.text).toBe(
      'Flail with Rage: 9 bludgeoning damage. You rolled a 3 plus 4 from modifiers, plus 2 from Rage.',
    )
    expect(run('flail rage adv', [0.7, 0.25]).outcome.text).toBe(
      'Flail with advantage and Rage: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
  })

  it('a toggle only touches the attacks it applies to', () => {
    expect(run('javelin rage dmg', [0.25]).outcome.text).toBe(
      'Javelin: 6 piercing damage. You rolled a 2 plus 4 from modifiers.',
    )
  })

  it('the toggle word alone switches it on and off, and it sticks', () => {
    const on = run('rage', [0.5])
    expect(on.outcome).toEqual({ text: 'Rage on.', result: null })
    expect(on.state.activeToggles).toEqual(['Rage'])
    expect(run('flail', [0.7], barbarian, on.state).outcome.text).toBe(
      'Flail with Rage: 22 to hit. You rolled a 15 plus 7 from modifiers.',
    )
    expect(run('flail dmg', [0.25], barbarian, on.state).outcome.text).toBe(
      'Flail with Rage: 9 bludgeoning damage. You rolled a 3 plus 4 from modifiers, plus 2 from Rage.',
    )
    const off = run('rage', [0.5], barbarian, on.state)
    expect(off.outcome.text).toBe('Rage off.')
    expect(off.state.activeToggles).toEqual([])
  })

  it('again keeps the toggles of the repeated roll', () => {
    const first = run('flail rage', [0.7])
    expect(run('again', [0.7], barbarian, first.state).outcome.text).toContain('Flail with Rage:')
  })

  it('effect dice are doubled on a critical hit and to-hit penalties are spoken', () => {
    const hit = run('rapier sneak', [0.999], rogue)
    expect(hit.outcome.text).toBe(
      'Natural 20! Rapier with Sneak Attack: 27 to hit. You rolled a 20 plus 7 from modifiers.',
    )
    expect(run('rapier sneak dmg', [0.25, 0.5], rogue, hit.state).outcome.text).toBe(
      'Critical hit! Rapier with Sneak Attack: 36 piercing damage. You rolled 3 and 5, plus 4 from modifiers, plus 24 from Sneak Attack.',
    )
    expect(run('rapier sharpshooter', [0.7], rogue).outcome.text).toBe(
      'Rapier with Sharpshooter: 17 to hit. You rolled a 15 plus 7 from modifiers, minus 5 from Sharpshooter.',
    )
    expect(run('rapier sharpshooter dmg', [0.25], rogue).outcome.text).toBe(
      'Rapier with Sharpshooter: 17 piercing damage. You rolled a 3 plus 4 from modifiers, plus 10 from Sharpshooter.',
    )
  })

  it('toggle words are pulled out of the query', () => {
    expect(rogue.toggles.map((t) => t.name)).toEqual(['Sneak Attack', 'Sharpshooter'])
    expect(extractToggles('rapier sneak attack adv', rogue)).toEqual({ query: 'rapier adv', toggles: ['Sneak Attack'] })
    expect(extractToggles('stealth', rogue)).toEqual({ query: 'stealth', toggles: [] })
  })
})
