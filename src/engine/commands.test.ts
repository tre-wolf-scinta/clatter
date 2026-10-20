import { describe, expect, it } from 'vitest'
import { deriveCharacter, parseCharacterFile } from './character'
import {
  HELP_TEXT,
  NOTHING_IN_HAND,
  allCandidates,
  applyBatch,
  extractToggles,
  initialRollerState,
  matchQuery,
  parseCommand,
  runCommand,
  type BatchOp,
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
    expect(parseCommand('wear chain shirt')).toEqual({ kind: 'wield', query: 'chain shirt' })
    expect(parseCommand('doff armor')).toEqual({ kind: 'unequip', query: 'armor' })
  })

  it('HUD screens: a slash opens one, the bare word reads it', () => {
    expect(parseCommand('/i')).toEqual({ kind: 'hud', screen: 'inventory', open: true })
    expect(parseCommand('/inventory')).toEqual({ kind: 'hud', screen: 'inventory', open: true })
    expect(parseCommand('/s')).toEqual({ kind: 'hud', screen: 'spells', open: true })
    expect(parseCommand('/f')).toEqual({ kind: 'hud', screen: 'abilities', open: true })
    expect(parseCommand('/feats')).toEqual({ kind: 'hud', screen: 'abilities', open: true })
    expect(parseCommand('inventory')).toEqual({ kind: 'hud', screen: 'inventory', open: false })
    expect(parseCommand('feats')).toEqual({ kind: 'hud', screen: 'abilities', open: false })
    expect(parseCommand('/int')).toEqual({ kind: 'query', topic: 'int' })
    expect(parseCommand('/constructor')).toEqual({ kind: 'query', topic: 'constructor' })
  })

  it('rests and hit dice', () => {
    expect(parseCommand('long rest')).toEqual({ kind: 'rest', rest: 'long rest' })
    expect(parseCommand('rest')).toEqual({ kind: 'rest', rest: 'long rest' })
    expect(parseCommand('short rest')).toEqual({ kind: 'rest', rest: 'short rest' })
    expect(parseCommand('hit die')).toEqual({ kind: 'hit-die' })
    expect(parseCommand('hd')).toEqual({ kind: 'hit-die' })
    expect(parseCommand('spend a hit die')).toEqual({ kind: 'hit-die' })
    expect(parseCommand('hit dice')).toEqual({ kind: 'hit-die' })
    expect(parseCommand('hit')).toMatchObject({ kind: 'hand', part: 'attack' })
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
    expect(key('fire')).toBe('spell:0')
    expect(key('shield')).toBe('spell:3')
    expect(key('sle')).toBe('ambiguous')
  })

  it('spells are candidates with labels that say what they do', () => {
    const labels = pool.map((c) => c.buttonLabel)
    expect(labels).toContain('Fire Bolt +4 to hit')
    expect(labels).toContain('Charm Person Wisdom save DC 12')
    expect(labels).toContain('Sleep 5d8')
    expect(labels).toContain('Mage Hand')
    expect(pool.find((c) => c.key === 'spell:0')?.damageLabel).toBe('Fire Bolt damage 2d10 fire')
    expect(pool.find((c) => c.key === 'spell:1')?.damageLabel).toBeUndefined()
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
    expect(say('use torch', [0.5]).outcome.text).toBe('Used a Torch. 4 left.')
    expect(say('use xyz', [0.5]).outcome.text).toBe(
      'Nothing called xyz to use. You carry Potion of Healing with 2 left and Torch with 5 left. You can also use Steady Aim and Lucky.',
    )
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
    expect(say('/ac', [0.5]).outcome.text).toBe('Armor class 14: unarmored 10, Dexterity plus 4. Shield spell is off.')
    expect(say('/ac', [0.5], { ...initialRollerState(), wearing: 'Leather armor' }).outcome.text).toBe(
      'Armor class 15: Leather armor 11, Dexterity plus 4. Shield spell is off.',
    )
  })
})

describe('spells', () => {
  const sampleSpells = 'Cantrips: Fire Bolt, Mage Hand, Minor Illusion. Level 1, 3 of 3 slots: Shield, Sleep, Charm Person, Disguise Self.'

  it('a cantrip attack is two rolls, like a weapon, sets the hand, and Enter repeats it', () => {
    const hit = say('fire bolt', [0.7])
    expect(hit.outcome.text).toBe('Fire Bolt: 19 to hit. You rolled a 15 plus 4 from modifiers.')
    expect(hit.state.inHand).toBe('Fire Bolt')
    expect(hit.state.history).toHaveLength(0)
    expect(say('dmg', [0.5, 0.5], hit.state).outcome.text).toBe('Fire Bolt: 12 fire damage. You rolled 6 and 6.')
    expect(say('', [0.7], hit.state).outcome.text).toBe('Fire Bolt: 19 to hit. You rolled a 15 plus 4 from modifiers.')
    const crit = say('cast fire bolt', [0.999])
    expect(crit.outcome.text).toBe('Natural 20! Fire Bolt: 24 to hit. You rolled a 20 plus 4 from modifiers.')
    expect(say('/d', [0.5, 0.5, 0.5, 0.5], crit.state).outcome.text).toBe('Critical hit! Fire Bolt: 24 fire damage. You rolled 6, 6, 6 and 6.')
    expect(say('/equipped', [0.5], hit.state).outcome.text).toContain('Fire Bolt in hand: plus 4 to hit, 2d10 fire.')
  })

  it('a leveled spell pays first, then rolls, and never repeats on Enter', () => {
    const charm = say('charm person', [0.5])
    expect(charm.outcome.text).toBe('Charm Person: Wisdom save DC 12. Level 1 slots: 2 of 3 left.')
    expect(charm.state).toMatchObject({ slotsUsed: { 1: 1 }, last: null })
    expect(charm.state.history).toHaveLength(1)
    expect(say('/slots', [0.5], charm.state).outcome.text).toBe('Level 1 slots: 2 of 3.')
    const sleep = say('sleep', [0.5, 0.5, 0.5, 0.5, 0.5], charm.state)
    expect(sleep.outcome.text).toBe('Sleep: 25. You rolled 5, 5, 5, 5 and 5. Level 1 slots: 1 of 3 left.')
    expect(say('sleep 2', [0.5], charm.state).outcome.text).toBe('No level 2 slots left. Long rest to recover.')
    const shield = say('cast shield', [0.5], sleep.state)
    expect(shield.outcome.text).toBe('Cast Shield. Level 1 slots: 0 of 3 left. Shield spell on. Armor class 19.')
    expect(shield.state.activeToggles).toEqual(['Shield spell'])
    expect(say('shield', [0.5], shield.state).outcome.text).toBe('No level 1 slots left. Long rest to recover.')
    expect(say('undo', [0.5], shield.state).outcome.text).toBe('Undid the last change. Level 1 slots: 1 of 3. Shield spell off. Armor class 14.')
    expect(say('long rest', [0.5], shield.state).outcome.text).toBe('Long rest. Spell slots recovered.')
  })

  it('reads the screen, one spell, and the slots', () => {
    expect(say('spells', [0.5]).outcome.text).toBe(sampleSpells)
    expect(say('/s', [0.5]).outcome.text).toBe(sampleSpells)
    expect(say('/fire bolt', [0.5]).outcome.text).toBe(
      'Fire Bolt: cantrip, plus 4 to hit, 2d10 fire. Hurl a mote of fire at a creature or object within 120 feet. A flammable object you hit catches fire.',
    )
    expect(say('/sleep', [0.5]).outcome.text).toContain('Sleep: level 1, 5d8, each level higher adds 2d8. Creatures within 20 feet')
    expect(say('/charm person', [0.5]).outcome.text).toContain('Charm Person: level 1, Wisdom save DC 12. A humanoid')
    expect(say('/mage hand', [0.5]).outcome.text).toContain('Mage Hand: cantrip. A spectral hand')
    expect(say('sle', [0.5]).outcome.text).toBe('Ambiguous: Sleight of Hand or Sleep. Type more letters.')
  })

  const cleric = deriveCharacter({
    level: 5,
    abilities: { wis: 16, con: 14 },
    hitPoints: { max: 38 },
    spellcasting: { ability: 'wis', slots: [4, 3, 2] },
    spells: [
      { name: 'Sacred Flame', damage: '2d8', damageType: 'radiant', save: 'dex' },
      { name: 'Cure Wounds', level: 1, heal: '1d8+3', upcast: '1d8' },
      { name: 'Bless', level: 1, concentration: true },
      { name: 'Guiding Bolt', level: 1, damage: '4d6', damageType: 'radiant', upcast: '1d6' },
      { name: 'Spiritual Weapon', level: 2 },
      { name: 'Hold Person', level: 2, save: 'wis', concentration: true, prepared: false },
      { name: 'Misty Step', level: 2, uses: { max: 1, per: 'long rest' } },
    ],
  })
  const withHp = (): RollerState => ({ ...initialRollerState(), hp: freshHitPoints(38) })
  const run = (input: string, state: RollerState = withHp(), dice: number[] = [0.5]) =>
    runCommand(input, cleric, state, opts, queueRng(dice))

  it('save, heal, attack, and upcast spells', () => {
    expect(run('sacred flame', withHp(), [0.5, 0.5]).outcome.text).toBe(
      'Sacred Flame: 10 radiant damage. Dexterity save DC 14 to avoid it. You rolled 5 and 5.',
    )
    const cure = run('cure wounds')
    expect(cure.outcome.text).toBe('Cure Wounds: heals 8. You rolled a 5 plus 3 from modifiers. Level 1 slots: 3 of 4 left.')
    expect(cure.state.history).toHaveLength(1)
    expect(run('cure wounds 3', withHp(), [0.5, 0.5, 0.5]).outcome.text).toBe(
      'Cure Wounds: heals 18. You rolled 5, 5 and 5, plus 3 from modifiers. Level 3 slots: 1 of 2 left.',
    )
    const bolt = run('guiding bolt 2', withHp(), [0.7])
    expect(bolt.outcome.text).toBe('Guiding Bolt: 21 to hit. You rolled a 15 plus 6 from modifiers. Level 2 slots: 2 of 3 left.')
    expect(bolt.state.castLevels).toEqual({ 'Guiding Bolt': 2 })
    const dmg = run('dmg', bolt.state, [0.5, 0.5, 0.5, 0.5, 0.5])
    expect(dmg.outcome.text).toBe('Guiding Bolt: 20 radiant damage. You rolled 4, 4, 4, 4 and 4.')
    expect(dmg.state.history).toHaveLength(1)
    expect(run('guiding bolt 1', withHp(), [0.7]).outcome.text).toBe(
      'Guiding Bolt: 21 to hit. You rolled a 15 plus 6 from modifiers. Level 1 slots: 3 of 4 left.',
    )
  })

  it('concentration is taken up, checked on damage, dropped, undone, and ended by going down', () => {
    const bless = run('bless')
    expect(bless.outcome.text).toBe('Cast Bless. Level 1 slots: 3 of 4 left. Concentrating on Bless.')
    expect(bless.state.concentration).toBe('Bless')
    expect(run('concentration', bless.state).outcome.text).toBe('Concentrating on Bless.')
    expect(run('/status', bless.state).outcome.text).toBe('38 of 38 hit points. No toggles on. Concentrating on Bless.')
    expect(run('-7', bless.state).outcome.text).toBe('Took 7. 31 of 38 hit points. Constitution save DC 10 to keep Bless.')
    expect(run('-24', bless.state).outcome.text).toBe('Took 24. 14 of 38 hit points. Constitution save DC 12 to keep Bless.')
    expect(run('hold person', bless.state).outcome.text).toBe('Hold Person is not prepared.')
    expect(run('undo', bless.state).outcome.text).toBe('Undid the last change. 38 of 38 hit points. Level 1 slots: 4 of 4. Concentration ended.')
    const dropped = run('drop', bless.state)
    expect(dropped.outcome.text).toBe('Bless ends.')
    expect(dropped.state.concentration).toBeNull()
    expect(run('undo', dropped.state).outcome.text).toBe('Undid the last change. 38 of 38 hit points. Concentrating on Bless.')
    const down = run('-38', bless.state)
    expect(down.outcome.text).toBe('Took 38. 0 of 38 hit points. You are down. Bless ends.')
    expect(down.state.concentration).toBeNull()
    expect(run('drop').outcome.text).toBe('Not concentrating on anything.')
    expect(run('long rest', bless.state).outcome.text).toBe('Long rest. 38 of 38 hit points. Spell slots recovered. Bless ends.')
  })

  it('free castings, the hint for a higher slot, and the listing with unprepared spells', () => {
    const step = run('misty step')
    expect(step.outcome.text).toBe('Cast Misty Step. 0 free castings left.')
    expect(run('misty step', step.state).outcome.text).toBe('Cast Misty Step. Level 2 slots: 2 of 3 left.')
    let s = withHp()
    for (let i = 0; i < 4; i++) s = run('cure wounds', s).state
    expect(run('cure wounds', s).outcome.text).toBe('No level 1 slots left. Level 2 slots: 3 left. Type cure wounds 2 to use one.')
    expect(run('spells', s).outcome.text).toBe(
      'Cantrips: Sacred Flame. Level 1, 0 of 4 slots: Cure Wounds, Bless, Guiding Bolt. Level 2, 3 of 3 slots: Spiritual Weapon, Misty Step with 1 of 1 free castings. Not prepared: Hold Person. Level 3, 2 of 2 slots: none.',
    )
    expect(run('/hold person').outcome.text).toBe('Hold Person: level 2, Wisdom save DC 14, concentration, not prepared.')
  })

  it('ending concentration switches off the toggle the spell kept on', () => {
    const wizard = deriveCharacter({
      level: 5,
      abilities: { int: 16, dex: 10 },
      toggles: [{ name: 'Haste spell', acBonus: 2 }],
      spellcasting: { ability: 'int', slots: [4, 3, 2] },
      spells: [
        { name: 'Haste', level: 3, toggle: 'Haste spell', concentration: true },
        { name: 'Hold Person', level: 2, save: 'wis', concentration: true },
      ],
      armorClass: { parts: [{ name: 'unarmored', value: 10 }] },
    })
    const w = (input: string, state: RollerState = initialRollerState()) => runCommand(input, wizard, state, opts, queueRng([0.5]))
    const haste = w('haste')
    expect(haste.outcome.text).toBe('Cast Haste. Level 3 slots: 1 of 2 left. Haste spell on. Armor class 12. Concentrating on Haste.')
    expect(w('drop', haste.state).outcome.text).toBe('Haste ends. Haste spell off. Armor class 10.')
    expect(w('drop', haste.state).state.activeToggles).toEqual([])
    expect(w('hold person', haste.state).outcome.text).toBe(
      'Hold Person: Wisdom save DC 14. Level 2 slots: 2 of 3 left. Concentrating on Hold Person. Haste ends. Haste spell off. Armor class 10.',
    )
    expect(w('undo', w('drop', haste.state).state).outcome.text).toBe('Undid the last change. Concentrating on Haste. Haste spell on. Armor class 12.')
  })

  it('pact slots pay for warlock spells and come back on a short rest', () => {
    const warlock = deriveCharacter({
      level: 5,
      abilities: { cha: 16 },
      spellcasting: { ability: 'cha', pact: { level: 3, count: 2 } },
      spells: [
        { name: 'Eldritch Blast', damage: '1d10', damageType: 'force' },
        { name: 'Hex', level: 1, concentration: true },
        { name: 'Fireball', level: 3, damage: '8d6', damageType: 'fire', save: 'dex', upcast: '1d6' },
      ],
    })
    const w = (input: string, state: RollerState = initialRollerState(), dice: number[] = [0.5]) =>
      runCommand(input, warlock, state, opts, queueRng(dice))
    const hex = w('hex')
    expect(hex.outcome.text).toBe('Cast Hex. Pact slots: 1 of 2 left. Concentrating on Hex.')
    const fire = w('fireball', hex.state, Array<number>(8).fill(0.5))
    expect(fire.outcome.text).toBe(
      'Fireball: 32 fire damage. Dexterity save DC 14 for half. You rolled 4, 4, 4, 4, 4, 4, 4 and 4. Pact slots: 0 of 2 left.',
    )
    expect(w('fireball', fire.state).outcome.text).toBe('No level 3 slots left. Short rest to recover.')
    expect(w('fireball 4', hex.state).outcome.text).toBe('No level 4 slots left. Short rest to recover.')
    expect(w('/slots', fire.state).outcome.text).toBe('Pact slots: 0 of 2 at level 3.')
    expect(w('short rest', fire.state).outcome.text).toBe('Short rest. Pact slots recovered.')
    expect(w('undo', hex.state).outcome.text).toBe('Undid the last change. Pact slots: 2 of 2. Concentration ended.')
  })
})

describe('armor, the inventory readout, and batches', () => {
  const knight = deriveCharacter({
    level: 5,
    abilities: { str: 16, dex: 14 },
    attacks: [{ name: 'Longsword', damage: '1d8', damageType: 'slashing' }],
    inventory: [
      { name: 'Longsword', kind: 'weapon', equipped: true },
      { name: 'Chain shirt', kind: 'armor', baseAc: 13, dexCap: 2, equipped: true },
      { name: 'Plate', kind: 'armor', baseAc: 18, dexCap: 0 },
      { name: 'Shield', kind: 'shield', equipped: true },
      { name: 'Potion of Healing', kind: 'potion', count: 1, heal: '2d4+2', aliases: ['healing'] },
      { name: 'Rope', kind: 'utility', description: 'Fifty feet of hempen rope.' },
      { name: 'Torch', kind: 'utility', count: 3, consumable: true },
      { name: 'Signet ring', kind: 'quest' },
    ],
    hitPoints: { max: 44 },
  })
  // As the app seeds it: equipped gear in place, 30 of 44 hit points.
  const ready = (): RollerState => ({
    ...initialRollerState(),
    inHand: 'Longsword',
    wearing: 'Chain shirt',
    activeToggles: ['Shield'],
    hp: { ...freshHitPoints(44), current: 30 },
    items: { 'Potion of Healing': 1, Torch: 3 },
  })
  const run = (input: string, state: RollerState = ready(), dice: number[] = [0.5]) =>
    runCommand(input, knight, state, opts, queueRng(dice))

  it('armor class follows the armor worn, and wear and doff change it', () => {
    expect(run('/ac').outcome.text).toBe('Armor class 17: Chain shirt 13, Dexterity plus 2, plus 2 from Shield.')
    const plate = run('wear plate')
    expect(plate.outcome.text).toBe('Plate on. Armor class 20.')
    expect(plate.state.wearing).toBe('Plate')
    expect(run('/ac', plate.state).outcome.text).toBe('Armor class 20: Plate 18, plus 2 from Shield.')
    const bare = run('doff armor', plate.state)
    expect(bare.outcome.text).toBe('Plate off. Armor class 14.')
    expect(run('/ac', bare.state).outcome.text).toBe('Armor class 14: unarmored 10, Dexterity plus 2, plus 2 from Shield.')
    expect(run('doff shield', bare.state).outcome.text).toBe('Shield off. Armor class 12.')
    expect(run('wear chain shirt').outcome.text).toBe('Chain shirt is already on.')
    expect(run('unequip plate').outcome.text).toBe('Plate is not worn.')
    expect(run('doff armor', bare.state).outcome.text).toBe('No armor on.')
  })

  it('/equipped and /inventory read the whole picture', () => {
    expect(run('/equipped').outcome.text).toBe(
      'Longsword in hand: plus 6 to hit, 1d8+3 slashing. Shield on. Armor: Chain shirt. Carrying Potion of Healing with 1 left and Torch with 3 left.',
    )
    const inventory =
      'Weapons: Longsword in hand. Armor and shields: Chain shirt worn, Plate, Shield on. Potions: Potion of Healing with 1 left. Utility: Rope, Torch with 3 left. Quest items: Signet ring.'
    expect(run('/inventory').outcome.text).toBe(inventory)
    expect(run('/i').outcome.text).toBe(inventory)
  })

  it('a batch from the HUD applies in order, speaks once, and undoes as one', () => {
    const ops: BatchOp[] = [
      { op: 'wield', name: null },
      { op: 'wear', name: 'Plate' },
      { op: 'toggle', name: 'Shield', on: false },
      { op: 'use', name: 'Potion of Healing' },
    ]
    const done = applyBatch(ready(), ops, knight, opts, queueRng([0.5, 0.25]))
    expect(done.outcome.text).toBe(
      'Nothing in hand. Plate on. Armor class 20. Shield off. Armor class 18. Used a Potion of Healing: healed 7. 37 of 44 hit points. You rolled 3 and 2, plus 2. 0 left.',
    )
    expect(done.state).toMatchObject({ inHand: null, wearing: 'Plate', activeToggles: [], items: { 'Potion of Healing': 0, Torch: 3 } })
    expect(done.state.history).toHaveLength(1)
    const undone = run('undo', done.state)
    expect(undone.outcome.text).toBe(
      'Undid the last change. 30 of 44 hit points. Potion of Healing: 1 left. Longsword in hand. Shield on. Armor class 17.',
    )
    expect(undone.state).toMatchObject({ inHand: 'Longsword', wearing: 'Chain shirt', activeToggles: ['Shield'], history: [] })
    expect(applyBatch(ready(), [], knight, opts).outcome.text).toBe('No changes.')
    expect(applyBatch(ready(), [{ op: 'wield', name: 'Longsword' }], knight, opts).outcome.text).toBe('No changes.')
    expect(applyBatch(ready(), [{ op: 'wield', name: 'Longsword' }], knight, opts).state.history).toHaveLength(0)
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
    for (const cmd of ['-5', '+5', 'temp 3', 'hp', 'hp 3', 'hit die']) {
      expect(run(cmd, initialRollerState()).outcome.text).toBe(NO_HP)
    }
    expect(run('undo', initialRollerState()).outcome.text).toBe('Nothing to undo.')
    // The sample has features and hit dice, so a rest still means something without hit points; a bare character has nothing to rest.
    expect(run('long rest', initialRollerState()).outcome.text).toBe('Long rest. Nothing to recover.')
    expect(runCommand('long rest', deriveCharacter({}), initialRollerState(), opts).outcome.text).toBe(NO_HP)
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

describe('features, uses, and rests', () => {
  const barbarian = deriveCharacter({
    level: 5,
    abilities: { str: 18, con: 18 },
    attacks: [
      { name: 'Flail', damage: '1d8', damageType: 'bludgeoning' },
      { name: 'Javelin', damage: '1d6', damageType: 'piercing' },
    ],
    toggles: [
      { name: 'Rage', damageBonus: 2, aliases: ['raging'] },
      { name: 'Reckless Attack', advantage: true, appliesTo: ['Flail'], aliases: ['reckless'] },
    ],
    features: [
      { name: 'Rage', uses: { max: 3 }, description: 'Enter a rage as a bonus action.' },
      { name: 'Reckless Attack', description: 'Advantage on Strength attacks until your next turn.' },
      { name: 'Danger Sense' },
    ],
    hitPoints: { max: 60 },
    hitDice: { die: 'd12' },
  })
  const fighter = deriveCharacter({
    level: 5,
    abilities: { str: 16, con: 14 },
    features: [
      { name: 'Second Wind', uses: { max: 1, per: 'short rest' }, heal: '1d10+5' },
      { name: 'Action Surge', uses: { max: 1, per: 'short rest' } },
    ],
    hitPoints: { max: 44 },
    hitDice: { die: 'd10' },
  })
  const fresh = (): RollerState => ({ ...initialRollerState(), hp: freshHitPoints(60) })
  const run = (input: string, who = barbarian, state: RollerState = fresh(), dice: number[] = [0.5]) =>
    runCommand(input, who, state, opts, queueRng(dice))

  it('switching Rage on spends a use, refuses at zero, and undo gives the use back', () => {
    const on = run('rage')
    expect(on.outcome.text).toBe('Rage on. 2 uses left.')
    expect(on.state).toMatchObject({ activeToggles: ['Rage'], uses: { Rage: 2 } })
    expect(on.state.history).toHaveLength(1)
    const off = run('rage', barbarian, on.state)
    expect(off.outcome.text).toBe('Rage off.')
    expect(off.state.uses).toEqual({ Rage: 2 })
    expect(off.state.history).toHaveLength(1)
    const two = run('equip rage', barbarian, off.state)
    expect(two.outcome.text).toBe('Rage on. 1 use left.')
    const three = run('rage', barbarian, run('rage', barbarian, two.state).state)
    expect(three.outcome.text).toBe('Rage on. 0 uses left.')
    const spent = run('rage', barbarian, three.state).state
    expect(run('rage', barbarian, spent).outcome.text).toBe('No uses of Rage left until a long rest.')
    expect(run('rage', barbarian, spent).state).toBe(spent)
    expect(run('use rage', barbarian, spent).outcome.text).toBe('No uses of Rage left until a long rest.')
    // The one-roll word never spends anything: it only names what is in force for that roll.
    expect(run('flail rage dmg', barbarian, spent, [0.25]).outcome.text).toBe(
      'Flail with Rage: 9 bludgeoning damage. You rolled a 3 plus 4 from modifiers, plus 2 from Rage.',
    )
    const undone = run('undo', barbarian, on.state)
    expect(undone.outcome.text).toBe('Undid the last change. 60 of 60 hit points. Rage: 3 of 3 uses. Rage off.')
    expect(undone.state).toMatchObject({ activeToggles: [], uses: {}, history: [] })
  })

  it('an advantage toggle gives the roll to hit advantage, cancels disadvantage, and stays out of damage', () => {
    expect(run('flail reckless', barbarian, fresh(), [0.7, 0.25]).outcome.text).toBe(
      'Flail with advantage and Reckless Attack: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
    expect(run('flail reckless dis', barbarian, fresh(), [0.7]).outcome.text).toBe(
      'Flail with Reckless Attack: 22 to hit. You rolled a 15 plus 7 from modifiers.',
    )
    const on = run('reckless')
    expect(on.outcome.text).toBe('Reckless Attack on.')
    const hit = run('flail', barbarian, on.state, [0.7, 0.25])
    expect(hit.outcome.text).toBe(
      'Flail with advantage and Reckless Attack: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
    expect(run('dmg', barbarian, hit.state, [0.25]).outcome.text).toBe('Flail: 7 bludgeoning damage. You rolled a 3 plus 4 from modifiers.')
    expect(run('javelin', barbarian, on.state, [0.7]).outcome.text).toBe('Javelin: 22 to hit. You rolled a 15 plus 7 from modifiers.')
    expect(say('rapier steady', [0.7, 0.25]).outcome.text).toBe(
      'Rapier with advantage and Steady Aim: 22 to hit. You rolled a 15 and a 6, kept the 15, plus 7 from modifiers.',
    )
  })

  it('use spends a limited feature, a short rest brings it back, and hit dice heal', () => {
    const hurt: RollerState = { ...initialRollerState(), hp: { ...freshHitPoints(44), current: 20 } }
    const wind = run('use second wind', fighter, hurt, [0.35])
    expect(wind.outcome.text).toBe('Used Second Wind: healed 9. 29 of 44 hit points. You rolled a 4 plus 5. 0 uses left.')
    expect(wind.state.uses).toEqual({ 'Second Wind': 0 })
    expect(run('use second wind', fighter, wind.state).outcome.text).toBe('No uses of Second Wind left until a short rest.')
    expect(run('use action surge', fighter, wind.state).outcome.text).toBe('Used Action Surge. 0 uses left.')
    expect(run('use danger sense').outcome.text).toBe('Danger Sense has no uses to spend.')
    expect(run('use', fighter, hurt).outcome.text).toBe('Use what? You can use Second Wind and Action Surge.')
    expect(say('use lucky', [0.5]).outcome.text).toBe('Used Lucky. 2 uses left.')
    const rested = run('short rest', fighter, wind.state)
    expect(rested.outcome.text).toBe('Short rest. Second Wind recovered. 5 hit dice left. Type hit die to spend one.')
    expect(rested.state.uses).toEqual({})
    const die = run('hit die', fighter, rested.state, [0.5])
    expect(die.outcome.text).toBe(
      'Spent a hit die: healed 8. 37 of 44 hit points. You rolled a 6 plus 2 from Constitution. 4 hit dice left.',
    )
    expect(die.state.hitDice).toBe(4)
    expect(run('undo', fighter, die.state).outcome.text).toBe('Undid the last change. 29 of 44 hit points. Hit dice: 5 of 5.')
    let s = die.state
    for (let i = 0; i < 4; i++) s = run('hd', fighter, s, [0.5]).state
    expect(s.hitDice).toBe(0)
    expect(run('hit die', fighter, s).outcome.text).toBe('No hit dice left until a long rest.')
    expect(run('short rest', fighter, s).outcome.text).toBe('Short rest. No hit dice left.')
    expect(run('long rest', fighter, { ...s, hp: { ...freshHitPoints(44), current: 10 } }).outcome.text).toBe(
      'Long rest. 44 of 44 hit points. Hit dice: 2 of 5.',
    )
    const raged = run('rage').state
    expect(run('long rest', barbarian, raged).outcome.text).toBe('Long rest. 60 of 60 hit points. Rage recovered.')
    expect(run('/f', barbarian, raged).outcome.text).toBe(
      'Class features: Rage on with 2 of 3 uses, Reckless Attack off, Danger Sense. Species traits: none. Feats: none. Hit dice: 5 of 5.',
    )
    expect(run('feats', barbarian, raged).outcome.text).toBe(run('/f', barbarian, raged).outcome.text)
    expect(run('/rage', barbarian, raged).outcome.text).toBe('Rage on, 2 of 3 uses, plus 2 damage. Enter a rage as a bonus action.')
    expect(run('/hd', barbarian, raged).outcome.text).toBe('Hit dice: 5 of 5, d12.')
  })

  it('a batch can rest, spend a hit die, and switch Rage, and says why a spent one is refused', () => {
    const start: RollerState = { ...initialRollerState(), hp: { ...freshHitPoints(60), current: 30 }, uses: { Rage: 0 }, hitDice: 1 }
    const ops: BatchOp[] = [{ op: 'rest', rest: 'short rest' }, { op: 'hit-die' }, { op: 'toggle', name: 'Rage', on: true }]
    const done = applyBatch(start, ops, barbarian, opts, queueRng([0.5]))
    expect(done.outcome.text).toBe(
      'Short rest. 1 hit die left. Type hit die to spend one. Spent a hit die: healed 11. 41 of 60 hit points. You rolled a 7 plus 4 from Constitution. No hit dice left. No uses of Rage left until a long rest.',
    )
    expect(done.state).toMatchObject({ activeToggles: [], uses: { Rage: 0 }, hitDice: 0 })
    expect(done.state.history).toHaveLength(1)
    const rested = applyBatch(done.state, [{ op: 'rest', rest: 'long rest' }, { op: 'toggle', name: 'Rage', on: true }], barbarian, opts)
    expect(rested.outcome.text).toBe('Long rest. 60 of 60 hit points. Rage recovered. Hit dice: 2 of 5. Rage on. 2 uses left.')
    expect(rested.state).toMatchObject({ activeToggles: ['Rage'], uses: { Rage: 2 }, hitDice: 2 })
    const undone = run('undo', barbarian, rested.state)
    expect(undone.outcome.text).toBe('Undid the last change. 41 of 60 hit points. Rage: 0 of 3 uses. Hit dice: 0 of 5. Rage off.')
    expect(undone.state).toMatchObject({ activeToggles: [], uses: { Rage: 0 }, hitDice: 0 })
    expect(applyBatch(fresh(), [{ op: 'use', name: 'Danger Sense' }], barbarian, opts).outcome.text).toBe('No changes.')
  })
})
