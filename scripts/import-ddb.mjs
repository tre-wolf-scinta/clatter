#!/usr/bin/env node
/**
 * Import a D&D Beyond character into Dice Caller's JSON.
 *
 *   node scripts/import-ddb.mjs <character id, sheet URL, or saved JSON file> [public/characters/name.json]
 *
 * The character must be set to Public on D&D Beyond (sheet menu > Sharing).
 * Prints the JSON, or writes it to the given file. Things this script cannot
 * work out are left out rather than guessed; check the numbers against the
 * sheet once, then edit the JSON freely. Not handled yet: spells, unarmed
 * strikes, and items whose bonuses depend on being equipped and attuned in
 * unusual ways.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const ABILITY = { 1: 'str', 2: 'dex', 3: 'con', 4: 'int', 5: 'wis', 6: 'cha' }
const ABILITY_WORD = {
  str: 'strength',
  dex: 'dexterity',
  con: 'constitution',
  int: 'intelligence',
  wis: 'wisdom',
  cha: 'charisma',
}
const DAMAGE_TYPE = {
  1: 'bludgeoning',
  2: 'piercing',
  3: 'slashing',
  4: 'acid',
  5: 'cold',
  6: 'fire',
  7: 'force',
  8: 'lightning',
  9: 'necrotic',
  10: 'poison',
  11: 'psychic',
  12: 'radiant',
  13: 'thunder',
}
const SKILLS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
]

const abilityMod = (score) => Math.floor((score - 10) / 2)

/** Every modifier that currently applies: item modifiers only from equipped (and attuned, when required) items. */
function activeModifiers(c) {
  const equipped = (c.inventory ?? []).filter((it) => it.equipped && (!it.definition.canAttune || it.isAttuned))
  const equippedIds = new Set(equipped.map((it) => it.definition.id))
  const grantIds = new Set(equipped.flatMap((it) => (it.definition.grantedModifiers ?? []).map((g) => g.id)))
  const out = []
  for (const [group, mods] of Object.entries(c.modifiers ?? {})) {
    for (const m of mods ?? []) {
      if (group === 'item' && !equippedIds.has(m.componentId) && !grantIds.has(m.id)) continue
      out.push(m)
    }
  }
  return out
}

/** Drops undefined values, empty arrays, and empty objects so the JSON stays readable. */
function prune(value) {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined)
    return arr.length ? arr : undefined
  }
  if (value && typeof value === 'object') {
    const obj = {}
    for (const [k, v] of Object.entries(value)) {
      const p = prune(v)
      if (p !== undefined) obj[k] = p
    }
    return Object.keys(obj).length ? obj : undefined
  }
  return value
}

export function convert(c) {
  const mods = activeModifiers(c)
  const has = (type, subType) => mods.some((m) => m.type === type && m.subType === subType)
  const sum = (type, subType) =>
    mods.filter((m) => m.type === type && m.subType === subType).reduce((s, m) => s + (m.value ?? 0), 0)

  const level = (c.classes ?? []).reduce((s, k) => s + k.level, 0)

  const abilities = {}
  for (const s of c.stats ?? []) {
    const a = ABILITY[s.id]
    const override = (c.overrideStats ?? []).find((o) => o.id === s.id)?.value
    const bonus = (c.bonusStats ?? []).find((o) => o.id === s.id)?.value ?? 0
    let total = s.value + bonus + sum('bonus', `${ABILITY_WORD[a]}-score`)
    for (const m of mods) {
      if (m.type === 'set' && m.subType === `${ABILITY_WORD[a]}-score` && (m.value ?? 0) > total) total = m.value
    }
    abilities[a] = override ?? Math.min(20, total)
  }
  const strMod = abilityMod(abilities.str)
  const dexMod = abilityMod(abilities.dex)
  const conMod = abilityMod(abilities.con)

  const hitPointsMax =
    c.overrideHitPoints ??
    (c.baseHitPoints ?? 0) +
      (c.bonusHitPoints ?? 0) +
      conMod * level +
      sum('bonus', 'hit-points-per-level') * level +
      sum('bonus', 'hit-points')

  // Armor class: the equipped armor (or the unarmored formula) plus Dexterity as the armor allows,
  // plus flat bonuses. Shields become toggles that start on when equipped.
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const acParts = []
  const wornArmor = (c.inventory ?? []).find(
    (it) => it.equipped && it.definition.filterType === 'Armor' && it.definition.armorTypeId >= 1 && it.definition.armorTypeId <= 3,
  )
  if (wornArmor) {
    const d = wornArmor.definition
    acParts.push({ name: d.name, value: d.armorClass ?? 10 })
    if (d.armorTypeId === 1) acParts.push({ name: 'Dexterity', value: dexMod })
    else if (d.armorTypeId === 2) acParts.push({ name: 'Dexterity', value: Math.min(2, dexMod) })
  } else {
    const unarmored = mods.find((m) => m.type === 'set' && m.subType === 'unarmored-armor-class')
    acParts.push({ name: unarmored ? 'unarmored defense' : 'unarmored', value: unarmored?.value ?? 10 })
    acParts.push({ name: 'Dexterity', value: dexMod })
    const extraAbility = unarmored?.statId ? ABILITY[unarmored.statId] : null
    if (extraAbility && extraAbility !== 'dex') {
      acParts.push({ name: capitalize(ABILITY_WORD[extraAbility]), value: abilityMod(abilities[extraAbility]) })
    }
  }
  for (const m of mods) {
    if (m.type !== 'bonus' || m.subType !== 'armor-class' || !m.value) continue
    const item = (c.inventory ?? []).find((it) => it.definition.id === m.componentId)
    acParts.push({ name: item ? item.definition.name : 'other bonus', value: m.value })
  }

  const skills = SKILLS.filter((s) => has('proficiency', s))
  const expertise = SKILLS.filter((s) => has('expertise', s))
  const saves = Object.keys(ABILITY_WORD).filter((a) => has('proficiency', `${ABILITY_WORD[a]}-saving-throws`))
  const jackOfAllTrades = has('half-proficiency', 'ability-checks') || undefined

  const bonuses = { initiative: sum('bonus', 'initiative') || undefined, skills: {}, saves: {}, abilityChecks: {} }
  const allChecks = sum('bonus', 'ability-checks')
  for (const s of SKILLS) {
    const b = sum('bonus', s) + allChecks
    if (b) bonuses.skills[s] = b
  }
  const allSaves = sum('bonus', 'saving-throws')
  for (const a of Object.keys(ABILITY_WORD)) {
    const bs = sum('bonus', `${ABILITY_WORD[a]}-saving-throws`) + allSaves
    if (bs) bonuses.saves[a] = bs
    const bc = sum('bonus', `${ABILITY_WORD[a]}-ability-checks`) + allChecks
    if (bc) bonuses.abilityChecks[a] = bc
  }

  const attacks = []
  const ranged = new Set()
  const simple = has('proficiency', 'simple-weapons')
  const martial = has('proficiency', 'martial-weapons')
  for (const it of c.inventory ?? []) {
    const d = it.definition
    if (d.filterType !== 'Weapon' || !d.damage?.diceString) continue
    const props = (d.properties ?? []).map((p) => p.name)
    const isRanged = d.attackType === 2
    const finesse = props.includes('Finesse')
    const ability = isRanged ? 'dex' : finesse && dexMod > strMod ? 'dex' : 'str'
    const magic = (d.grantedModifiers ?? [])
      .filter((g) => g.type === 'bonus' && g.subType === 'magic')
      .reduce((s, g) => s + (g.value ?? 0), 0)
    const typeKey = String(d.type ?? d.name)
      .toLowerCase()
      .replace(/\s+/g, '-')
    // categoryId 1 is simple, 2 is martial on D&D Beyond weapon definitions.
    const proficient = has('proficiency', typeKey) || martial || (simple && d.categoryId !== 2)
    const base = {
      ability,
      proficient: proficient ? undefined : false,
      damageType: d.damageType ? String(d.damageType).toLowerCase() : undefined,
      attackBonus: magic || undefined,
      damageBonus: magic || undefined,
    }
    attacks.push({ name: d.name, damage: d.damage.diceString, ...base })
    if (isRanged) ranged.add(d.name)
    const versatile = (d.properties ?? []).find((p) => p.name === 'Versatile')
    if (versatile?.notes && /\d*d\d+/.test(versatile.notes)) {
      const name = `${d.name} (two-handed)`
      attacks.push({ name, damage: versatile.notes.match(/\d*d\d+/)[0], ...base, aliases: [`${d.name.toLowerCase()} 2h`] })
    }
  }

  const custom = []
  for (const list of Object.values(c.actions ?? {})) {
    for (const a of list ?? []) {
      if (!a.dice?.diceString) continue
      const shortName = a.name.includes(':') ? a.name.split(':').pop().trim() : a.name
      if (a.attackTypeRange) {
        attacks.push({
          name: shortName,
          ability: ABILITY[a.abilityModifierStatId] ?? 'str',
          proficient: a.isProficient === false ? false : undefined,
          damage: a.dice.diceString,
          damageType: DAMAGE_TYPE[a.damageTypeId],
          aliases: shortName === a.name ? undefined : [a.name.toLowerCase().replace(/[^a-z0-9 ]/g, '')],
        })
        if (a.attackTypeRange === 2) ranged.add(shortName)
      } else {
        custom.push({ name: shortName, dice: a.dice.diceString })
      }
    }
  }

  const toggles = []
  const barbarian = (c.classes ?? []).find((k) => k.definition.name === 'Barbarian')
  if (barbarian) {
    const meleeStrength = attacks.filter((a) => a.ability === 'str' && !ranged.has(a.name)).map((a) => a.name)
    const rage = barbarian.level >= 16 ? 4 : barbarian.level >= 9 ? 3 : 2
    toggles.push({ name: 'Rage', damageBonus: rage, appliesTo: meleeStrength, aliases: ['raging'] })
  }
  const rogue = (c.classes ?? []).find((k) => k.definition.name === 'Rogue')
  if (rogue) {
    toggles.push({ name: 'Sneak Attack', damageDice: `${Math.ceil(rogue.level / 2)}d6`, aliases: ['sneak', 'sa'] })
  }
  for (const it of c.inventory ?? []) {
    const d = it.definition
    if (d.armorTypeId === 4) toggles.push({ name: d.name, acBonus: d.armorClass ?? 2, on: it.equipped || undefined })
  }

  return prune({
    name: c.name,
    level,
    abilities,
    proficiencies: { skills, expertise, saves },
    jackOfAllTrades,
    bonuses,
    attacks,
    custom,
    toggles,
    hitPoints: hitPointsMax > 0 ? { max: hitPointsMax } : undefined,
    armorClass: { parts: acParts },
    source: {
      dndBeyond: c.readonlyUrl ?? `https://www.dndbeyond.com/characters/${c.id}`,
      race: c.race?.fullName,
      classes: (c.classes ?? []).map(
        (k) => `${k.definition.name} ${k.level}${k.subclassDefinition ? ` (${k.subclassDefinition.name})` : ''}`,
      ),
      importedAt: new Date().toISOString().slice(0, 10),
    },
  })
}

async function load(arg) {
  if (existsSync(arg)) return JSON.parse(readFileSync(arg, 'utf8'))
  const id = (String(arg).match(/(\d{6,})/) ?? [])[1]
  if (!id) throw new Error('Give a D&D Beyond character id, sheet URL, or a saved JSON file.')
  const res = await fetch(`https://character-service.dndbeyond.com/character/v5/character/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`D&D Beyond answered ${res.status}. Is the character set to Public?`)
  return res.json()
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\//, ''))
if (isMain) {
  const [, , arg, outFile] = process.argv
  if (!arg) {
    console.error('Usage: node scripts/import-ddb.mjs <character id, sheet URL, or JSON file> [public/characters/name.json]')
    process.exit(1)
  }
  try {
    const raw = await load(arg)
    const data = raw.data ?? raw
    if (!data.stats) throw new Error('That does not look like D&D Beyond character data.')
    const json = JSON.stringify(convert(data), null, 2) + '\n'
    if (outFile) {
      writeFileSync(outFile, json)
      console.error(`Wrote ${outFile}`)
    } else {
      process.stdout.write(json)
    }
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
