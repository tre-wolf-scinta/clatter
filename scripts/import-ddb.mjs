#!/usr/bin/env node
/**
 * Import a D&D Beyond character into Clatter's JSON.
 *
 *   node scripts/import-ddb.mjs <character id, sheet URL, or saved JSON file> [public/characters/name.json]
 *
 * The character must be set to Public on D&D Beyond (sheet menu > Sharing).
 * Prints the JSON, or writes it to the given file. Things this script cannot
 * work out are left out rather than guessed; check the numbers against the
 * sheet once, then edit the JSON freely. Quest items cannot be told apart
 * from other gear, so change their kind by hand. Features come across with
 * their descriptions and limited uses (Rage, 3 per long rest); a multiclass
 * character gets one hit die size, the main class's. Spells come across with
 * their dice, save, attack, concentration, and slots (the PHB multiclass table
 * when more than one class casts); a spell whose damage type is chosen on
 * casting gets no type. Not handled yet: unarmed strikes, and items whose
 * bonuses depend on being equipped and attuned in unusual ways.
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

const ENTITIES = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  hellip: '...',
  times: ' times ',
  // Dashes become commas: a screen reader reads a comma as a pause, a dash as a word or nothing.
  mdash: ', ',
  ndash: ', ',
}

/**
 * D&D Beyond descriptions are HTML; keep the words, capped so a screen reader is
 * not stuck in one. The cap falls at the end of a sentence when one is near
 * enough, else at a word.
 */
function plainText(html, max = 500) {
  if (!html || typeof html !== 'string') return undefined
  const text = html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|div|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+,/g, ',')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return undefined
  if (text.length <= max) return text
  const head = text.slice(0, max)
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '))
  if (sentence >= max / 2) return head.slice(0, sentence + 1)
  const space = head.lastIndexOf(' ')
  return `${(space > 0 ? head.slice(0, space) : head).replace(/[,;:]+$/, '')}.`
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

  // Armor class while unarmored (the unarmored formula plus Dexterity, or a class's unarmored
  // defense), with flat bonuses kept separately so they apply with armor too. Armor and shields
  // live in the inventory and the app works out the rest when they are worn.
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const acParts = []
  const unarmored = mods.find((m) => m.type === 'set' && m.subType === 'unarmored-armor-class')
  acParts.push({ name: unarmored ? 'unarmored defense' : 'unarmored', value: unarmored?.value ?? 10 })
  acParts.push({ name: 'Dexterity', value: dexMod })
  const extraAbility = unarmored?.statId ? ABILITY[unarmored.statId] : null
  if (extraAbility && extraAbility !== 'dex') {
    acParts.push({ name: capitalize(ABILITY_WORD[extraAbility]), value: abilityMod(abilities[extraAbility]) })
  }
  const acBonuses = []
  for (const m of mods) {
    if (m.type !== 'bonus' || m.subType !== 'armor-class' || !m.value) continue
    const item = (c.inventory ?? []).find((it) => it.definition.id === m.componentId)
    acBonuses.push({ name: item ? item.definition.name : 'other bonus', value: m.value })
  }

  // Everything carried, in the inventory's sections. Potions keep the standard healing dice.
  const HEALING = {
    'potion of healing': '2d4+2',
    'potion of greater healing': '4d4+4',
    'potion of superior healing': '8d4+8',
    'potion of supreme healing': '10d4+20',
  }
  const inventory = []
  for (const it of c.inventory ?? []) {
    const d = it.definition
    if (!d?.name) continue
    const key = String(d.name).toLowerCase()
    // Two rows with one name (two spell scrolls) become one item with the counts added.
    const twin = inventory.find((x) => x.name.toLowerCase() === key)
    if (twin) {
      twin.count = (twin.count ?? 1) + (it.quantity > 0 ? it.quantity : 1)
      twin.equipped = twin.equipped || (it.equipped ? true : undefined)
      continue
    }
    const base = {
      name: d.name,
      count: it.quantity > 1 ? it.quantity : undefined,
      description: plainText(d.description),
      equipped: it.equipped ? true : undefined,
    }
    if (d.filterType === 'Weapon' && d.damage?.diceString) {
      inventory.push({ ...base, kind: 'weapon' })
    } else if (d.filterType === 'Armor' && d.armorTypeId >= 1 && d.armorTypeId <= 3) {
      inventory.push({ ...base, kind: 'armor', baseAc: d.armorClass ?? 10, dexCap: d.armorTypeId === 1 ? undefined : d.armorTypeId === 2 ? 2 : 0 })
    } else if (d.armorTypeId === 4) {
      inventory.push({ ...base, kind: 'shield', acBonus: d.armorClass ?? 2 })
    } else if (d.filterType === 'Potion') {
      inventory.push({ ...base, kind: 'potion', heal: HEALING[key], aliases: key.startsWith('potion of ') ? [key.slice('potion of '.length)] : undefined })
    } else {
      inventory.push({ ...base, kind: 'utility', consumable: d.isConsumable ? true : undefined })
    }
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
  // Reckless Attack: advantage on Strength attacks while it is on. The feature of the same name links to it.
  if (barbarian && barbarian.level >= 2) {
    const strength = attacks.filter((a) => a.ability === 'str').map((a) => a.name)
    toggles.push({ name: 'Reckless Attack', advantage: true, appliesTo: strength, aliases: ['reckless'] })
  }

  // Limited uses by feature name, from the actions D&D Beyond derives: "Rage (Enter)" has 3 uses per long rest.
  const prof = 2 + Math.floor((Math.max(1, level) - 1) / 4)
  const usesByName = new Map()
  for (const list of Object.values(c.actions ?? {})) {
    for (const a of list ?? []) {
      const lu = a.limitedUse
      if (!lu) continue
      let max = lu.maxUses ?? null
      if (max === null && lu.statModifierUsesId) max = Math.max(1, abilityMod(abilities[ABILITY[lu.statModifierUsesId]] ?? 10))
      if (max === null && lu.useProficiencyBonus) max = prof
      if (!max || max < 1) continue
      const name = String(a.name).replace(/\s*\(.*\)\s*$/, '').trim()
      if (!usesByName.has(name)) usesByName.set(name, { max, per: lu.resetType === 1 ? 'short rest' : 'long rest' })
    }
  }

  // Class features, species traits, feats, and the background feature, with descriptions and uses.
  // Bookkeeping entries (score increases, languages, the subclass slot) are left out; "4: Weapon Mastery" style
  // repeats fold into one. Features above the character's level are left out too.
  const SKIP_CLASS = /^(ability score improvement|.* subclass|core .* traits|epic boon|proficiencies|hit points|equipment)$/i
  const SKIP_SPECIES = /^(ability score increases?|languages?|creature type|size|speed|age|alignment)$/i
  const features = []
  const seenFeatures = new Set()
  const addFeature = (rawName, section, description) => {
    const name = String(rawName ?? '')
      .replace(/^\d+:\s*/, '')
      .trim()
    if (!name || seenFeatures.has(name.toLowerCase())) return
    seenFeatures.add(name.toLowerCase())
    features.push({ name, section, description: plainText(description, 700), uses: usesByName.get(name) })
  }
  for (const k of c.classes ?? []) {
    const gained = (k.classFeatures ?? [])
      .map((f) => f.definition)
      .filter((d) => d && (d.requiredLevel ?? 1) <= k.level)
      .sort((a, b) => (a.requiredLevel ?? 1) - (b.requiredLevel ?? 1))
    for (const d of gained) {
      const name = String(d.name).replace(/^\d+:\s*/, '')
      if (SKIP_CLASS.test(name)) continue
      addFeature(name, 'class', d.description)
    }
  }
  for (const t of c.race?.racialTraits ?? []) {
    const d = t.definition
    if (!d || SKIP_SPECIES.test(String(d.name))) continue
    addFeature(d.name, 'species', d.description)
  }
  for (const f of c.feats ?? []) {
    const d = f.definition
    if (!d || /^(\d+:\s*)?weapon mastery$/i.test(String(d.name))) continue
    addFeature(d.name, 'feat', d.description)
  }
  const background = c.background?.definition
  if (background?.featureName) addFeature(background.featureName, 'other', background.featureDescription)

  // Hit dice: the main class's die, one per level.
  const mainClass = [...(c.classes ?? [])].sort((a, b) => b.level - a.level)[0]
  const hitDice = mainClass?.definition?.hitDice ? { die: `d${mainClass.definition.hitDice}`, count: level } : undefined

  // Spellcasting: the ability of the main caster class (or subclass, for an Arcane Trickster), slots
  // from that class's own table, or the PHB multiclass table when more than one class casts, and
  // pact magic for Warlocks. D&D Beyond's spellSlots list only says what is used; the maxes live in the rules.
  const MULTICLASS_SLOTS = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
    [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 2, 1, 1],
  ]
  const casters = (c.classes ?? [])
    .map((k) => ({ k, def: k.definition.canCastSpells ? k.definition : k.subclassDefinition?.canCastSpells ? k.subclassDefinition : null }))
    .filter((x) => x.def)
  const warlockLevel = casters.filter((x) => x.k.definition.name === 'Warlock').reduce((s, x) => s + x.k.level, 0)
  const slotCasters = casters.filter((x) => x.k.definition.name !== 'Warlock')
  const mainCaster = [...casters].sort((a, b) => b.k.level - a.k.level)[0]
  const spellAbility = mainCaster ? ABILITY[mainCaster.def.spellCastingAbilityId] : undefined
  let slotTable
  if (slotCasters.length === 1) {
    // levelSpellSlots is indexed by class level; entry 0 is an unleveled character.
    slotTable = slotCasters[0].def.spellRules?.levelSpellSlots?.[slotCasters[0].k.level]
  } else if (slotCasters.length > 1) {
    const casterLevel = slotCasters.reduce(
      (s, x) => s + Math.floor(x.k.level / (x.def.spellRules?.multiClassSpellSlotDivisor || 1)),
      0,
    )
    slotTable = MULTICLASS_SLOTS[Math.min(20, Math.max(1, casterLevel)) - 1]
  }
  const slots = slotTable ? slotTable.slice(0, 9).map((n) => n ?? 0) : undefined
  while (slots && slots.length && !slots[slots.length - 1]) slots.pop()
  const pact = warlockLevel
    ? { level: Math.min(5, Math.ceil(warlockLevel / 2)), count: warlockLevel >= 17 ? 4 : warlockLevel >= 11 ? 3 : warlockLevel >= 2 ? 2 : 1 }
    : undefined

  // Every spell once, with its dice: cantrips at the character's level, leveled spells with their
  // upcast dice. A spell that adds to armor class while it lasts (Shield, Haste) gets a toggle of its own.
  // Some lists hold null entries (a spell slot on the sheet with nothing in it yet).
  const spellEntries = [
    ...(c.classSpells ?? []).flatMap((cs) =>
      (cs.spells ?? []).filter(Boolean).map((s) => ({ s, cls: (c.classes ?? []).find((k) => k.id === cs.characterClassId) })),
    ),
    ...Object.values(c.spells ?? {})
      .flatMap((list) => (Array.isArray(list) ? list : []))
      .filter(Boolean)
      .map((s) => ({ s, cls: null })),
  ]
  const bestDice = (mod) => {
    const defs = mod?.atHigherLevels?.higherLevelDefinitions ?? []
    return defs.filter((h) => h.dice?.diceString).sort((a, b) => b.level - a.level)
  }
  const spells = []
  const seenSpells = new Set()
  for (const { s, cls } of spellEntries) {
    const d = s.definition
    if (!d?.name || seenSpells.has(d.name.toLowerCase())) continue
    seenSpells.add(d.name.toLowerCase())
    const spellLevel = d.level ?? 0
    const damageMods = (d.modifiers ?? []).filter((m) => m.type === 'damage' && m.die?.diceString)
    const healMods = (d.modifiers ?? []).filter((m) => m.type === 'bonus' && m.subType === 'hit-points' && m.die?.diceString)
    const scale = (mod, base) => {
      const defs = bestDice(mod)
      if (!defs.length) return { dice: base }
      if (d.scaleType === 'characterlevel') {
        const reached = defs.find((h) => h.level <= level)
        return { dice: reached ? reached.dice.diceString : base }
      }
      return { dice: base, upcast: defs[defs.length - 1].dice.diceString }
    }
    const dmg = damageMods[0] ? scale(damageMods[0], damageMods[0].die.diceString) : {}
    const types = new Set(damageMods.map((m) => m.subType))
    let heal
    let healUpcast
    if (healMods[0]) {
      const h = scale(healMods[0], healMods[0].die.diceString)
      const mod = healMods[0].usePrimaryStat && spellAbility ? abilityMod(abilities[spellAbility]) : 0
      heal = mod ? `${h.dice}${mod > 0 ? '+' : ''}${mod}` : h.dice
      healUpcast = h.upcast
    }
    const save = d.requiresSavingThrow && d.saveDcAbilityId ? ABILITY[d.saveDcAbilityId] : undefined
    const kind = d.requiresAttackRoll ? 'attack' : save ? 'save' : heal ? 'heal' : dmg.dice ? 'damage' : undefined
    const prepares = Boolean(cls?.definition?.spellPrepareType)
    const prepared = s.prepared || s.alwaysPrepared || !prepares ? undefined : false
    // A flat armor class bonus sits on the modifier's die as fixedValue (Shield 5, Haste 2).
    const acBonusOf = (m) => m.die?.fixedValue ?? m.fixedValue ?? m.value ?? 0
    const ac = (d.modifiers ?? []).find((m) => m.type === 'bonus' && m.subType === 'armor-class' && acBonusOf(m) > 0)
    let toggle
    if (ac && spellLevel > 0) {
      toggle = `${d.name} spell`
      if (!toggles.some((t) => t.name === toggle)) toggles.push({ name: toggle, acBonus: acBonusOf(ac) })
    }
    const lu = s.limitedUse
    const uses = lu?.maxUses ? { max: lu.maxUses, per: lu.resetType === 1 ? 'short rest' : 'long rest' } : undefined
    spells.push({
      name: d.name,
      level: spellLevel,
      kind,
      damage: dmg.dice,
      damageType: dmg.dice && types.size === 1 ? damageMods[0].subType : undefined,
      save,
      heal,
      upcast: dmg.upcast ?? healUpcast,
      toggle,
      concentration: d.concentration ? true : undefined,
      ritual: d.ritual ? true : undefined,
      prepared,
      uses,
      description: plainText(d.description, 700),
    })
  }
  const spellcasting = spells.length || slots?.length || pact ? { ability: spellAbility, slots, pact } : undefined

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
    inventory,
    features,
    spellcasting,
    spells,
    hitPoints: hitPointsMax > 0 ? { max: hitPointsMax } : undefined,
    hitDice,
    armorClass: { parts: acParts, bonuses: acBonuses.length ? acBonuses : undefined },
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
