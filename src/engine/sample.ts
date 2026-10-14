import type { CharacterFile } from './character'

/** A level 5 rogue, so the sample shows expertise, finesse attacks, a toggle, and a potion. */
export const SAMPLE_CHARACTER_FILE: CharacterFile = {
  name: 'Thalia Brightwood',
  level: 5,
  abilities: { str: 10, dex: 18, con: 14, int: 12, wis: 13, cha: 8 },
  proficiencies: {
    skills: ['acrobatics', 'investigation', 'perception', 'sleight of hand', 'stealth'],
    expertise: ['stealth', 'perception'],
    saves: ['dex', 'int'],
  },
  attacks: [
    { name: 'Rapier', ability: 'dex', damage: '1d8', damageType: 'piercing', equipped: true },
    { name: 'Shortbow', ability: 'dex', damage: '1d6', damageType: 'piercing', aliases: ['bow'] },
    { name: 'Dagger', ability: 'dex', damage: '1d4', damageType: 'piercing' },
  ],
  custom: [{ name: 'Sneak Attack', dice: '3d6', aliases: ['sneak', 'sa'] }],
  consumables: [{ name: 'Potion of Healing', count: 2, heal: '2d4+2', aliases: ['healing', 'potion'] }],
  hitPoints: { max: 38 },
  armorClass: {
    parts: [
      { name: 'leather armor', value: 11 },
      { name: 'Dexterity', value: 4 },
    ],
  },
  aliases: { hide: 'stealth' },
}

export const SAMPLE_CHARACTER_JSON = JSON.stringify(SAMPLE_CHARACTER_FILE, null, 2)
