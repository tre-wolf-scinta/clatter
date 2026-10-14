import { describe, expect, it } from 'vitest'
import {
  CharacterError,
  abilityModifier,
  deriveCharacter,
  parseCharacterFile,
  proficiencyBonus,
  toggleApplies,
  type Character,
} from './character'
import { SAMPLE_CHARACTER_FILE, SAMPLE_CHARACTER_JSON } from './sample'

const skill = (ch: Character, id: string) => ch.skills.find((s) => s.id === id)!
const save = (ch: Character, ability: string) => ch.saves.find((s) => s.ability === ability)!

describe('5e arithmetic', () => {
  it('ability modifiers round down', () => {
    expect([18, 11, 10, 9, 8, 1].map(abilityModifier)).toEqual([4, 0, 0, -1, -1, -5])
  })

  it('proficiency bonus steps every four levels and clamps', () => {
    expect([1, 4, 5, 8, 9, 12, 13, 16, 17, 20].map(proficiencyBonus)).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6])
    expect(proficiencyBonus(0)).toBe(2)
    expect(proficiencyBonus(25)).toBe(6)
  })
})

describe('deriveCharacter with the sample rogue', () => {
  const ch = parseCharacterFile(SAMPLE_CHARACTER_JSON)

  it('derives skills from ability, proficiency, and expertise', () => {
    expect(ch.proficiencyBonus).toBe(3)
    expect(skill(ch, 'stealth')).toMatchObject({ modifier: 10, proficiency: 'expertise' })
    expect(skill(ch, 'perception')).toMatchObject({ modifier: 7, proficiency: 'expertise' })
    expect(skill(ch, 'acrobatics')).toMatchObject({ modifier: 7, proficiency: 'proficient' })
    expect(skill(ch, 'investigation')).toMatchObject({ modifier: 4, proficiency: 'proficient' })
    expect(skill(ch, 'sleight-of-hand')).toMatchObject({ modifier: 7, proficiency: 'proficient' })
    expect(skill(ch, 'athletics')).toMatchObject({ modifier: 0, proficiency: 'none' })
    expect(skill(ch, 'deception')).toMatchObject({ modifier: -1, proficiency: 'none' })
  })

  it('derives saves and initiative', () => {
    expect(save(ch, 'dex')).toMatchObject({ modifier: 7, proficient: true })
    expect(save(ch, 'int')).toMatchObject({ modifier: 4, proficient: true })
    expect(save(ch, 'cha')).toMatchObject({ modifier: -1, proficient: false })
    expect(ch.initiative).toBe(4)
  })

  it('derives attacks with the ability modifier folded into damage', () => {
    expect(ch.attacks[0]).toMatchObject({ name: 'Rapier', toHit: 7, damageType: 'piercing' })
    expect(ch.attacks[0].damage).toEqual({ terms: [{ sign: 1, count: 1, sides: 8 }], flat: 4 })
    expect(ch.attacks[1].aliases).toEqual(['bow'])
  })

  it('keeps custom rolls and aliases', () => {
    expect(ch.custom[0]).toMatchObject({ name: 'Sneak Attack', aliases: ['sneak', 'sa'] })
    expect(ch.aliases).toEqual({ hide: 'stealth' })
  })
})

describe('deriveCharacter options', () => {
  it('jack of all trades gives half proficiency to untrained skills', () => {
    const ch = deriveCharacter({ level: 5, abilities: { dex: 10 }, jackOfAllTrades: true })
    expect(skill(ch, 'stealth')).toMatchObject({ modifier: 1, proficiency: 'half' })
  })

  it('bonuses add and overrides replace', () => {
    const ch = deriveCharacter({
      ...SAMPLE_CHARACTER_FILE,
      bonuses: { initiative: 2, skills: { Perception: 5 }, saves: { wisdom: 1 }, abilityChecks: { str: 2 } },
      overrides: { skills: { stealth: 11 }, saves: { con: 9 } },
    })
    expect(skill(ch, 'perception').modifier).toBe(12)
    expect(skill(ch, 'stealth').modifier).toBe(11)
    expect(save(ch, 'wis').modifier).toBe(2)
    expect(save(ch, 'con').modifier).toBe(9)
    expect(ch.initiative).toBe(6)
    expect(ch.abilities.str.checkModifier).toBe(2)
    expect(ch.abilities.str.modifier).toBe(0)
  })

  it('attack flags: not proficient, no ability to damage, explicit to-hit', () => {
    const ch = deriveCharacter({
      level: 5,
      abilities: { dex: 18 },
      attacks: [
        { name: 'Off-hand dagger', ability: 'dex', damage: '1d4', proficient: false, addAbilityToDamage: false, attackBonus: 1 },
        { name: 'Wand', damage: '2d6', toHit: 9, damageBonus: 2 },
      ],
    })
    expect(ch.attacks[0]).toMatchObject({ toHit: 5, damage: { flat: 0 } })
    expect(ch.attacks[1]).toMatchObject({ toHit: 9, damage: { flat: 2 } })
  })

  it('accepts long names, mixed case, and underscores', () => {
    const ch = deriveCharacter({
      abilities: { Dexterity: 14 },
      proficiencies: { skills: ['Sleight_of_Hand', 'ANIMAL HANDLING'], saves: ['Wisdom'] },
    })
    expect(skill(ch, 'sleight-of-hand').proficiency).toBe('proficient')
    expect(skill(ch, 'animal-handling').proficiency).toBe('proficient')
    expect(save(ch, 'wis').proficient).toBe(true)
    expect(ch.abilities.dex.modifier).toBe(2)
  })

  it('defaults to an unnamed level 1 character with all 10s', () => {
    const ch = deriveCharacter({})
    expect(ch.name).toBe('Unnamed character')
    expect(ch.level).toBe(1)
    expect(ch.abilities.wis.score).toBe(10)
    expect(ch.attacks).toEqual([])
  })
})

describe('parseCharacterFile errors read well aloud', () => {
  const expectError = (text: string, pattern: RegExp) => {
    expect(() => parseCharacterFile(text)).toThrowError(CharacterError)
    expect(() => parseCharacterFile(text)).toThrowError(pattern)
  }

  it('flags bad JSON, wrong shapes, and unknown names', () => {
    expectError('not json', /not valid JSON/)
    expectError('[]', /JSON object/)
    expectError('{"proficiencies":{"skills":["Stealthy"]}}', /unknown skill "Stealthy"/)
    expectError('{"abilities":{"luck":10}}', /unknown ability "luck"/)
    expectError('{"abilities":{"dex":"high"}}', /abilities.dex: expected a number/)
    expectError('{"attacks":[{"name":"Club"}]}', /Club.*damage must be dice/)
    expectError('{"attacks":[{"damage":"1d6"}]}', /attacks\[1\]: every attack needs a name/)
    expectError('{"custom":[{"name":"Boom","dice":"lots"}]}', /Boom.*dice must be an expression/)
  })
})

describe('toggles', () => {
  it('derives toggles with normalized appliesTo and aliases', () => {
    const ch = deriveCharacter({
      attacks: [{ name: 'Flail', damage: '1d8' }],
      toggles: [
        { name: 'Rage', damageBonus: 2, appliesTo: ['Flail'], aliases: ['Raging'] },
        { name: 'Sneak Attack', damageDice: '3d6' },
        { name: 'Great Weapon Master', attackBonus: -5, damageBonus: 10 },
      ],
    })
    expect(ch.toggles[0]).toEqual({
      name: 'Rage',
      attackBonus: 0,
      damageBonus: 2,
      damageDice: null,
      acBonus: 0,
      on: false,
      appliesTo: ['flail'],
      aliases: ['raging'],
    })
    expect(ch.toggles[1]).toMatchObject({ damageDice: { terms: [{ sign: 1, count: 3, sides: 6 }], flat: 0 }, appliesTo: null })
    expect(ch.toggles[2]).toMatchObject({ attackBonus: -5, damageBonus: 10 })
    expect(toggleApplies(ch.toggles[0], ch.attacks[0])).toBe(true)
    expect(toggleApplies(ch.toggles[1], ch.attacks[0])).toBe(true)
    expect(toggleApplies({ ...ch.toggles[0], appliesTo: ['bow'] }, ch.attacks[0])).toBe(false)
  })

  it('rejects toggles without a name or with bad dice', () => {
    expect(() => parseCharacterFile('{"toggles":[{"damageBonus":2}]}')).toThrowError(/toggles\[1\]: every toggle needs a name/)
    expect(() => parseCharacterFile('{"toggles":[{"name":"Bless","damageDice":"lots"}]}')).toThrowError(/Bless.*damageDice must be dice/)
  })
})

describe('hit points, armor class, and equipped toggles', () => {
  it('reads the max, the armor class parts, and which toggles start on', () => {
    const ch = deriveCharacter({
      hitPoints: { max: 60 },
      armorClass: { parts: [{ name: 'unarmored defense', value: 10 }, { name: 'Dexterity', value: 2 }] },
      toggles: [{ name: 'Shield', acBonus: 2, on: true }, { name: 'Rage', damageBonus: 2 }],
    })
    expect(ch.hitPointsMax).toBe(60)
    expect(ch.armorClass).toEqual([{ name: 'unarmored defense', value: 10 }, { name: 'Dexterity', value: 2 }])
    expect(ch.toggles[0]).toMatchObject({ acBonus: 2, on: true })
    expect(ch.toggles[1]).toMatchObject({ acBonus: 0, on: false })
    expect(deriveCharacter({}).hitPointsMax).toBeNull()
    expect(deriveCharacter({}).armorClass).toBeNull()
  })

  it('rejects bad hit points and armor class', () => {
    expect(() => parseCharacterFile('{"hitPoints":{"max":0}}')).toThrowError(/hitPoints.max/)
    expect(() => parseCharacterFile('{"armorClass":{"parts":[]}}')).toThrowError(/armorClass.parts/)
    expect(() => parseCharacterFile('{"armorClass":{"parts":[{"value":10}]}}')).toThrowError(/parts\[1\]: every part needs a name/)
  })
})
