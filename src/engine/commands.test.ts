import { describe, expect, it } from 'vitest'
import { deriveCharacter, parseCharacterFile } from './character'
import {
  HELP_TEXT,
  NOTHING_IN_HAND,
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
import { freshHitPoints } from './hitpoints'
import { NO_HP } from './readouts'
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
    expect(parseCommand('/')).toEqual({ kind: 'help' })
    expect(parseCommand('/help')).toEqual({ kind: 'help' })
    expect(parseCommand('last')).toEqual({ kind: 'last' })
    expect(parseCommand('again')).toEqual({ kind: 'again', mode: null, bonus: null, part: null })
    expect(parseCommand('adv')).toEqual({ kind: 'again', mode: 'advantage', bonus: null, part: null })
  })

  it('a part on its own means the weapon in hand', () => {
    const hand = { kind: 'hand', mode: null, bonus: null, crit: false }
    expect(parseCommand('dmg')).toEqual({ ...hand, part: 'damage' })
    expect(parseCommand('/d')).toEqual({ ...hand, part: 'damage' })
    expect(parseCommand('attack')).toEqual({ ...hand, part: 'attack' })
    expect(parseCommand('/a')).toEqual({ ...hand, part: 'attack' })
    expect(parseCommand('/a adv')).toEqual({ ...hand, part: 'attack', mode: 'advantage' })
    expect(parseCommand('crit dmg')).toEqual({ ...hand, part: 'damage', crit: true })
  })

  it('gear and item commands', () => {
    expect(parseCommand('wield flail')).toEqual({ kind: 'wield', query: 'flail' })
    expect(parseCommand('equip the shield')).toEqual({ kind: 'wield', query: 'shield' })
    expect(parseCommand('draw my sword')).toEqual({ kind: 'wield', query: 'sword' })
    expect(parseCommand('wield')).toEqual({ kind: 'wield', query: '' })
    expect(parseCommand('unequip')).toEqual({ kind: 'unequip', query: '' })
    expect(parseCommand('doff shield')).toEqual({ kind: 'unequip', query: 'shield' })
    expect(parseCommand('drink a potion of healing')).toEqual({ kind: 'use', query: 'potion of healing', verb: 'drink' })
    expect(parseCommand('use torch')).toEqual({ kind: 'use', query: 'torch', verb: 'use' })
    expect(parseCommand('take potion')).toEqual({ kind: 'use', query: 'potion', verb: 'take' })
  })

  it('hit point commands', () => {
    expect(parseCommand('-5')).toEqual({ kind: 'hp', delta: -5 })
    expect(parseCommand('+7')).toEqual({ kind: 'hp', delta: 7 })
    expect(parseCommand(' -12 ')).toEqual({ kind: 'hp', delta: -12 })
    expect(parseCommand('take 5')).toEqual({ kind: 'hp', delta: -5 })
    expect(parseCommand('take 5 damage')).toEqual({ kind: 'hp', delta: -5 })
    expect(parseCommand('heal 7')).toEqual({ kind: 'hp', delta: 7 })
    expect(parseCommand('temp 8')).toEqual({ kind: 'temp', value: 8 })
    expect(parseCommand('temp')).toEqual({ kind: 'temp', value: null })
    expect(parseCommand('hp')).toEqual({ kind: 'hp-status' })
    expect(parseCommand('hp 30')).toEqual({ kind: 'hp-set', value: 30 })
    expect(parseCommand('undo')).toEqual({ kind: 'undo' })
    expect(parseCommand('long rest')).toEqual({ kind: 'rest' })
    expect(parseCommand('rest')).toEqual({ kind: 'rest' })
  })

  it('slash questions', () => {
    expect(parseCommand('/ac')).toEqual({ kind: 'query', topic: 'ac' })
    expect(parseCommand('/AC')).toEqual({ kind: 'query', topic: 'ac' })
    expect(parseCommand('/sleight of hand')).toEqual({ kind: 'query', topic: 'sleight of hand' })
    expect(parseCommand('/hp')).toEqual({ kind: 'query', topic: 'hp' })
    expect(parseCommand('/equipped')).toEqual({ kind: 'query', topic: 'equipped' })
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
    expect(parseCommand('rapier /d')).toMatchObject({ query: 'rapier', part: 'damage' })
    expect(parseCommand('rapier /a')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('rapier attack')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('rapier to hit')).toMatchObject({ query: 'rapier', part: 'attack' })
    expect(parseCommand('flail with rage')).toMatchObject({ query: 'flail rage' })
    expect(parseCommand('stealth +2 +1d4')).toMatchObject({
      query: 'stealth',
      bonus: { terms: [{ sign: 1, count: 1, sides: 4 }], flat: 2 },
    })
    expect(parseCommand('stealth -1')).toMatchObject({ query: 'stealth', bonus: { terms: [], flat: -1 } })
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
    expect(say('rapier /d', [0.25]).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
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

  it('dmg on its own rolls damage for the weapon in hand, which the last attack set', () => {
    const hit = say('rapier', [0.7])
    expect(hit.state.inHand).toBe('Rapier')
    expect(say('dmg', [0.25], hit.state).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
    expect(say('/d', [0.25], hit.state).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
  })
})

describe('weapon in hand', () => {
  it('starts empty, and a bare attack says so', () => {
    expect(say('attack', [0.7]).outcome).toEqual({ text: NOTHING_IN_HAND, result: null })
    expect(say('wield', [0.5]).outcome.text).toBe('Wield what? You have Rapier, Shortbow and Dagger.')
    expect(say('unequip', [0.5]).outcome.text).toBe('Nothing in hand.')
  })

  it('wield puts a weapon in hand; attack, /a, and dmg use it', () => {
    const held = say('wield rapier', [0.5])
    expect(held.outcome).toEqual({ text: 'Rapier in hand: plus 7 to hit, 1d8+4 piercing.', result: null })
    expect(held.state.inHand).toBe('Rapier')
    expect(say('wield', [0.5], held.state).outcome.text).toBe('Rapier in hand.')
    expect(say('attack', [0.7], held.state).outcome.text).toBe('Rapier: 22 to hit. You rolled a 15 plus 7 from modifiers.')
    expect(say('/a adv', [0.7, 0.25], held.state).outcome.text).toBe(
      'Rapier with advantage: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
    expect(say('dmg', [0.25], held.state).outcome.text).toBe('Rapier: 7 piercing damage. You rolled a 3 plus 4 from modifiers.')
    expect(say('crit dmg', [0.25, 0.5], held.state).outcome.text).toBe(
      'Critical hit! Rapier: 12 piercing damage. You rolled 3 and 5, plus 4 from modifiers.',
    )
  })

  it('attacking by name changes the weapon in hand', () => {
    const held = say('wield rapier', [0.5])
    const bow = say('bow', [0.7], held.state)
    expect(bow.state.inHand).toBe('Shortbow')
    expect(say('/a', [0.7], bow.state).outcome.text).toBe('Shortbow: 22 to hit. You rolled a 15 plus 7 from modifiers.')
  })

  it('a natural 20 by name is still critical for a bare dmg', () => {
    const hit = say('rapier', [0.999])
    expect(say('dmg', [0.25, 0.5], hit.state).outcome.text).toBe(
      'Critical hit! Rapier: 12 piercing damage. You rolled 3 and 5, plus 4 from modifiers.',
    )
  })

  it('unequip empties the hand, by name or not', () => {
    const held = say('wield rapier', [0.5])
    const away = say('unequip', [0.5], held.state)
    expect(away.outcome.text).toBe('Rapier put away. Nothing in hand.')
    expect(away.state.inHand).toBeNull()
    expect(say('attack', [0.7], away.state).outcome.text).toBe(NOTHING_IN_HAND)
    expect(say('unequip dagger', [0.5], held.state).outcome.text).toBe('Dagger is not in hand.')
    expect(say('sheathe rapier', [0.5], held.state).outcome.text).toBe('Rapier put away. Nothing in hand.')
  })

  it('unknown and ambiguous gear', () => {
    expect(say('wield xyz', [0.5]).outcome.text).toBe('Nothing called xyz to wield. You have Rapier, Shortbow and Dagger.')
    expect(say('unequip xyz', [0.5]).outcome.text).toBe('Nothing called xyz to put away.')
  })

  it('one-shot toggles on the attack carry into the bare damage roll', () => {
    const barbarian = deriveCharacter({
      level: 5,
      abilities: { str: 18 },
      attacks: [{ name: 'Flail', damage: '1d8', damageType: 'bludgeoning' }],
      toggles: [{ name: 'Rage', damageBonus: 2 }],
    })
    const hit = runCommand('flail rage', barbarian, initialRollerState(), opts, queueRng([0.7]))
    expect(runCommand('dmg', barbarian, hit.state, opts, queueRng([0.25])).outcome.text).toBe(
      'Flail with Rage: 9 bludgeoning damage. You rolled a 3 plus 4 from modifiers, plus 2 from Rage.',
    )
  })
})

describe('equipping gear', () => {
  const fighter = deriveCharacter({
    level: 5,
    abilities: { str: 16, dex: 14 },
    attacks: [{ name: 'Longsword', damage: '1d8', damageType: 'slashing' }],
    toggles: [{ name: 'Shield', acBonus: 2 }],
    armorClass: {
      parts: [
        { name: 'chain shirt', value: 13 },
        { name: 'Dexterity', value: 2 },
      ],
    },
  })
  const run = (input: string, state: RollerState = initialRollerState()) =>
    runCommand(input, fighter, state, opts, queueRng([0.5]))

  it('equip and unequip set a toggle and say the armor class', () => {
    const on = run('equip shield')
    expect(on.outcome.text).toBe('Shield on. Armor class 17.')
    expect(on.state.activeToggles).toEqual(['Shield'])
    expect(run('equip shield', on.state).outcome.text).toBe('Shield is already on.')
    expect(run('don shield', on.state).outcome.text).toBe('Shield is already on.')
    const off = run('doff shield', on.state)
    expect(off.outcome.text).toBe('Shield off. Armor class 15.')
    expect(off.state.activeToggles).toEqual([])
    expect(run('unequip shield', off.state).outcome.text).toBe('Shield is already off.')
  })

  it('/equipped reads the hand, the gear, the armor, and what is carried', () => {
    expect(run('/equipped').outcome.text).toBe('Nothing in hand. Shield off. Armor: chain shirt.')
    const ready = run('equip shield', run('wield longsword').state)
    expect(run('/equipped', ready.state).outcome.text).toBe(
      'Longsword in hand: plus 6 to hit, 1d8+3 slashing. Shield on. Armor: chain shirt.',
    )
    expect(run('/status', ready.state).outcome.text).toBe('Longsword in hand. Shield on.')
  })
})

describe('consumables', () => {
  const healer = deriveCharacter({
    level: 3,
    abilities: { con: 14 },
    hitPoints: { max: 20 },
    toggles: [{ name: 'Giant Strength' }],
    consumables: [
      { name: 'Potion of Healing', count: 2, heal: '2d4+2', aliases: ['healing', 'potion'] },
      { name: 'Potion of Giant Strength', count: 1, toggle: 'Giant Strength' },
      { name: 'Torch', count: 3 },
    ],
  })
  const start = (): RollerState => ({
    ...initialRollerState(),
    hp: { ...freshHitPoints(20), current: 10 },
    items: { 'Potion of Healing': 2, 'Potion of Giant Strength': 1, Torch: 3 },
  })
  const run = (input: string, state: RollerState, dice: number[] = [0.5]) =>
    runCommand(input, healer, state, opts, queueRng(dice))

  it('drinking a healing potion heals, counts down, and can be undone', () => {
    const drank = run('drink healing', start(), [0.5, 0.25])
    expect(drank.outcome.text).toBe(
      'Drank a Potion of Healing: healed 7. 17 of 20 hit points. You rolled 3 and 2, plus 2. 1 left.',
    )
    expect(drank.state.items['Potion of Healing']).toBe(1)
    const again = run('use potion', drank.state, [0.5, 0.25])
    expect(again.outcome.text).toBe('Used a Potion of Healing: healed 7. 20 of 20 hit points. You rolled 3 and 2, plus 2. 0 left.')
    expect(run('drink healing', again.state).outcome.text).toBe('No Potion of Healing left.')
    const undone = run('undo', again.state)
    expect(undone.outcome.text).toBe('Undid the last change. 17 of 20 hit points. Potion of Healing: 1 left.')
    expect(undone.state.items['Potion of Healing']).toBe(1)
  })

  it('other items switch a toggle on or just count down', () => {
    const strong = run('quaff giant', start())
    expect(strong.outcome.text).toBe('Drank a Potion of Giant Strength. Giant Strength on. 0 left.')
    expect(strong.state.activeToggles).toEqual(['Giant Strength'])
    expect(run('use torch', start()).outcome.text).toBe('Used a Torch. 2 left.')
  })

  it('says what you carry when the item is missing or unnamed', () => {
    const carry = 'You carry Potion of Healing with 2 left, Potion of Giant Strength with 1 left and Torch with 3 left.'
    expect(run('drink', start()).outcome.text).toBe(`Use what? ${carry}`)
    expect(run('use xyz', start()).outcome.text).toBe(`Nothing called xyz to use. ${carry}`)
    expect(run('/potions', start()).outcome.text).toBe('Potion of Healing, 2 left. Potion of Giant Strength, 1 left. Torch, 3 left.')
    expect(say('use torch', [0.5]).outcome.text).toBe('Nothing called torch to use. You carry Potion of Healing with 2 left.')
  })

  it('a healing potion without hit points on the character still counts down', () => {
    const noHp = deriveCharacter({ consumables: [{ name: 'Potion of Healing', heal: '2d4+2' }] })
    const r = runCommand('drink potion', noHp, { ...initialRollerState(), items: { 'Potion of Healing': 1 } }, opts, queueRng([0.5]))
    expect(r.outcome.text).toBe('Drank a Potion of Healing, but this character has no hit points to heal. 0 left.')
    expect(runCommand('use torch', deriveCharacter({}), initialRollerState(), opts).outcome.text).toBe(
      'No consumables on this character.',
    )
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

  it('slash questions are answered from the character', () => {
    expect(say('/stealth', [0.5]).outcome).toEqual({ text: 'Stealth plus 10, expertise.', result: null })
    expect(say('/skills', [0.5]).outcome.text).toContain('Proficient: Acrobatics plus 7')
    expect(say('/hp', [0.5]).outcome.text).toBe(NO_HP)
    expect(say('/ac', [0.5]).outcome.text).toBe('Armor class 15: leather armor 11, Dexterity plus 4.')
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

describe('hit points through the command box', () => {
  const withHp = (): RollerState => ({ ...initialRollerState(), hp: freshHitPoints(60) })
  const run = (input: string, state: RollerState, dice: number[] = [0.5]) => runCommand(input, ch, state, opts, queueRng(dice))

  it('a bare signed number is damage or healing, with undo', () => {
    const hurt = run('-5', withHp())
    expect(hurt.outcome).toEqual({ text: 'Took 5. 55 of 60 hit points.', result: null })
    expect(hurt.state.history).toHaveLength(1)
    const undone = run('undo', hurt.state)
    expect(undone.outcome.text).toBe('Undid the last change. 60 of 60 hit points.')
    expect(undone.state.history).toHaveLength(0)
    expect(run('undo', undone.state).outcome.text).toBe('Nothing to undo.')
    expect(run('+7', hurt.state).outcome.text).toBe('Healed 7. 60 of 60 hit points.')
    expect(run('take 5', withHp()).outcome.text).toBe('Took 5. 55 of 60 hit points.')
    expect(run('heal 3', hurt.state).outcome.text).toBe('Healed 3. 58 of 60 hit points.')
  })

  it('temporary hit points, reading, setting, and resting', () => {
    let s = run('temp 8', withHp())
    expect(s.outcome.text).toBe('8 temporary hit points.')
    expect(run('temp', s.state).outcome.text).toBe('8 temporary hit points.')
    s = run('-10', s.state)
    expect(s.outcome.text).toBe('Took 10. Temporary hit points used up. 58 of 60 hit points.')
    expect(run('hp', s.state).outcome.text).toBe('58 of 60 hit points.')
    expect(run('/hp', s.state).outcome.text).toBe('58 of 60 hit points.')
    s = run('hp 30', s.state)
    expect(s.outcome.text).toBe('30 of 60 hit points.')
    expect(run('long rest', s.state).outcome.text).toBe('Long rest. 60 of 60 hit points.')
    expect(run('temp', withHp()).outcome.text).toBe('No temporary hit points.')
    expect(run('temp lots', withHp()).outcome.text).toBe('Say how many, like temp 8.')
  })

  it('without hit points on the character, every hit point command says so', () => {
    for (const cmd of ['-5', '+5', 'temp 3', 'hp', 'hp 3', 'long rest']) {
      expect(run(cmd, initialRollerState()).outcome.text).toBe(NO_HP)
    }
    expect(run('undo', initialRollerState()).outcome.text).toBe('Nothing to undo.')
  })

  it('death saves keep a tally once the character is down', () => {
    const down = run('-60', withHp())
    expect(down.outcome.text).toBe('Took 60. 0 of 60 hit points. You are down.')
    const fail = run('death save', down.state, [0.4])
    expect(fail.outcome.text).toBe('Death save: 9, failure. You rolled a 9. That is one failure.')
    const ok = run('death save', fail.state, [0.45])
    expect(ok.outcome.text).toBe('Death save: 10, success. You rolled a 10. That is one success and one failure.')
    expect(run('-3', ok.state).outcome.text).toBe('Took 3 while down. That is one success and two failures.')
    const up = run('death save', ok.state, [0.999])
    expect(up.outcome.text).toBe('Natural 20! Death save: you regain 1 hit point. You are up. 1 of 60 hit points.')
    expect(up.state.hp?.deathSaves).toEqual({ successes: 0, failures: 0 })
    expect(run('/status', up.state).outcome.text).toBe('1 of 60 hit points. No toggles on.')
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
    toggles: [
      { name: 'Rage', damageBonus: 2, appliesTo: ['Flail'], aliases: ['raging'] },
      { name: 'Shield', acBonus: 2, on: true },
    ],
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

  it('a toggle only touches the attacks it applies to, and armor toggles never touch attacks', () => {
    expect(run('javelin rage dmg', [0.25]).outcome.text).toBe(
      'Javelin: 6 piercing damage. You rolled a 2 plus 4 from modifiers.',
    )
    const shieldOn: RollerState = { ...initialRollerState(), activeToggles: ['Shield'] }
    expect(run('flail', [0.7], barbarian, shieldOn).outcome.text).toBe('Flail: 22 to hit. You rolled a 15 plus 7 from modifiers.')
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
