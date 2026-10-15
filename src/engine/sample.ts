import type { CharacterFile } from './character'

/** A level 5 rogue, so the sample shows expertise, finesse attacks, a toggle, and a full inventory. */
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
    { name: 'Rapier', ability: 'dex', damage: '1d8', damageType: 'piercing' },
    { name: 'Shortbow', ability: 'dex', damage: '1d6', damageType: 'piercing', aliases: ['bow'] },
    { name: 'Dagger', ability: 'dex', damage: '1d4', damageType: 'piercing' },
  ],
  custom: [{ name: 'Sneak Attack', dice: '3d6', aliases: ['sneak', 'sa'] }],
  inventory: [
    { name: 'Rapier', kind: 'weapon', equipped: true, description: 'A slender thrusting sword. Finesse.' },
    { name: 'Shortbow', kind: 'weapon', aliases: ['bow'], description: 'Range 80 feet, 320 at disadvantage. Two-handed.' },
    { name: 'Dagger', kind: 'weapon', description: 'Finesse and light. Can be thrown 20 feet, 60 at disadvantage.' },
    {
      name: 'Leather armor',
      kind: 'armor',
      baseAc: 11,
      equipped: true,
      description: 'Light armor: armor class 11 plus your full Dexterity modifier.',
    },
    {
      name: 'Potion of Healing',
      kind: 'potion',
      count: 2,
      heal: '2d4+2',
      aliases: ['healing', 'potion'],
      description: 'Regain 2d4 plus 2 hit points when you drink it.',
    },
    {
      name: "Thieves' tools",
      kind: 'utility',
      description: 'Picks and probes for locks and traps. Proficiency lets you add your bonus to checks made with them.',
    },
    { name: 'Torch', kind: 'utility', count: 5, consumable: true, description: 'Burns for an hour, lighting 20 feet brightly.' },
    {
      name: 'Letter from the Guildmaster',
      kind: 'quest',
      description: 'Sealed with black wax. It names a warehouse on the docks and a night three days from now.',
    },
  ],
  hitPoints: { max: 38 },
  armorClass: {
    parts: [
      { name: 'unarmored', value: 10 },
      { name: 'Dexterity', value: 4 },
    ],
  },
  aliases: { hide: 'stealth' },
}

export const SAMPLE_CHARACTER_JSON = JSON.stringify(SAMPLE_CHARACTER_FILE, null, 2)
