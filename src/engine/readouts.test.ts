import { describe, expect, it } from 'vitest'
import { deriveCharacter, parseCharacterFile } from './character'
import { freshHitPoints } from './hitpoints'
import { NO_AC, NO_HP, answerQuery, type StatusContext } from './readouts'
import { SAMPLE_CHARACTER_JSON } from './sample'

const persi = deriveCharacter({
  name: 'Persi',
  level: 5,
  abilities: { str: 18, dex: 14, con: 18, int: 8, wis: 10, cha: 10 },
  proficiencies: {
    skills: ['intimidation', 'medicine', 'perception', 'religion', 'stealth', 'survival'],
    saves: ['str', 'con'],
  },
  attacks: [
    { name: 'Flail', damage: '1d8', damageType: 'bludgeoning' },
    { name: 'Bite', damage: '1d8', damageType: 'piercing' },
  ],
  toggles: [
    { name: 'Rage', damageBonus: 2 },
    { name: 'Shield', acBonus: 2, on: true },
    { name: 'Shield spell', acBonus: 5 },
  ],
  hitPoints: { max: 60 },
  armorClass: {
    parts: [
      { name: 'unarmored defense', value: 10 },
      { name: 'Dexterity', value: 2 },
      { name: 'Constitution', value: 4 },
    ],
  },
})

const ctx = (over: Partial<StatusContext> = {}): StatusContext => ({
  hp: null,
  activeToggles: ['Shield'],
  stickyMode: 'normal',
  pendingCrit: null,
  ...over,
})

const ask = (topic: string, c: StatusContext = ctx()) => answerQuery(topic, persi, c)

describe('armor class', () => {
  it('adds up the parts and the toggles that are on, and names the ones that are off', () => {
    expect(ask('ac')).toBe(
      'Armor class 18: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield. Shield spell is off.',
    )
    expect(ask('armor class', ctx({ activeToggles: ['Shield', 'Shield spell'] }))).toBe(
      'Armor class 23: unarmored defense 10, Dexterity plus 2, Constitution plus 4, plus 2 from Shield, plus 5 from Shield spell.',
    )
    expect(ask('ac', ctx({ activeToggles: [] }))).toBe(
      'Armor class 16: unarmored defense 10, Dexterity plus 2, Constitution plus 4. Shield and Shield spell are off.',
    )
    expect(answerQuery('ac', deriveCharacter({}), ctx())).toBe(NO_AC)
  })
})

describe('stats', () => {
  it('passives, one skill, one ability', () => {
    expect(ask('passive')).toBe('Passive Perception 13, Investigation 9, Insight 10.')
    expect(ask('stealth')).toBe('Stealth plus 5, proficient.')
    expect(ask('athletics')).toBe('Athletics plus 4, not proficient.')
    expect(ask('str')).toBe('Strength 18, modifier plus 4. Saving throw plus 7, proficient.')
    expect(ask('dex')).toBe('Dexterity 14, modifier plus 2. Saving throw plus 2, not proficient.')
    expect(ask('init')).toBe('Initiative plus 2.')
    expect(ask('flail')).toBe('Flail plus 7 to hit, 1d8+4 bludgeoning.')
  })

  it('lists: skills, saves, attacks, toggles', () => {
    expect(ask('skills')).toBe(
      'Proficient: Intimidation plus 3, Medicine plus 3, Perception plus 3, Religion plus 2, Stealth plus 5, Survival plus 3.',
    )
    expect(answerQuery('skills', parseCharacterFile(SAMPLE_CHARACTER_JSON), ctx())).toBe(
      'Proficient: Acrobatics plus 7, Investigation plus 4, Perception plus 7 with expertise, Sleight of Hand plus 7, Stealth plus 10 with expertise.',
    )
    expect(answerQuery('skills', deriveCharacter({}), ctx())).toBe('No skill proficiencies.')
    expect(ask('saves')).toBe('Proficient saving throws: Strength plus 7, Constitution plus 7.')
    expect(ask('attacks')).toBe('Attacks: Flail plus 7 to hit, 1d8+4 bludgeoning; Bite plus 7 to hit, 1d8+4 piercing.')
    expect(ask('toggles')).toBe('Rage off, Shield on, Shield spell off.')
  })

  it('hit points and status', () => {
    expect(ask('hp')).toBe(NO_HP)
    expect(ask('hp', ctx({ hp: freshHitPoints(60) }))).toBe('60 of 60 hit points.')
    expect(ask('status', ctx({ hp: freshHitPoints(60) }))).toBe('60 of 60 hit points. Shield on.')
    expect(
      ask('status', ctx({ hp: null, activeToggles: ['Rage', 'Shield'], stickyMode: 'advantage', pendingCrit: 'Flail' })),
    ).toBe('Rage and Shield on. Rolling everything with advantage. Critical damage pending for Flail.')
    expect(ask('status', ctx({ activeToggles: [] }))).toBe('No toggles on.')
  })

  it('ambiguity and unknown topics are said plainly', () => {
    expect(ask('per')).toBe('Ambiguous: Perception, Performance, or Persuasion. Type more letters.')
    expect(ask('xyz')).toBe(
      'Nothing called xyz. Try /ac, /passive, /skills, /saves, /attacks, /hp, /status, or the name of a skill, ability, or attack.',
    )
  })
})
