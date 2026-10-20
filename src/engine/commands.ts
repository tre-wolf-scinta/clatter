/**
 * The command box: parse what the player typed, roll or answer, and produce the
 * sentence to announce. Rolling lives in roll.ts, matching in candidates.ts,
 * hit points in hitpoints.ts, slash answers in readouts.ts.
 */
import {
  ABILITY_NAMES,
  affectsAttacks,
  toggleApplies,
  type Character,
  type DerivedConsumable,
  type DerivedFeature,
  type DerivedItem,
  type DerivedSpell,
  type DerivedToggle,
  type RestKind,
} from './character'
import { allCandidates, isSaveTarget, listOr, matchNamed, matchQuery, norm, type Candidate } from './candidates'
import { type DiceExpr, type Rng, addExpr, parseDiceExpr, rollDie, rollExpr, secureRng } from './dice'
import {
  describeHp,
  heal,
  longRest,
  recordDeathSave,
  setCurrent,
  setTemp,
  takeDamage,
  type HitPoints,
  type HpChange,
} from './hitpoints'
import {
  NO_HIT_DICE,
  NO_HP,
  answerQuery,
  armorClassTotal,
  carryingList,
  describeAttackStats,
  describeFeatures,
  describeInventory,
  describeSpellStats,
  describeSpells,
  hitDiceLeft,
  hitDiceWord,
  pactLeft,
  plusWord,
  slotsLeft,
  spellUsesLeft,
  usesLeft,
  usesWord,
} from './readouts'
import {
  type AttackEffect,
  type Mode,
  type RollResult,
  rollAttack,
  rollCheck,
  rollDamage,
  rollDeathSave,
  rollDice,
  rollHeal,
} from './roll'
import { type AnnounceOptions, announce, describeDice, joinAnd, withArticle } from './announce'

export { allCandidates, fmtMod, isSaveTarget, matchQuery } from './candidates'
export type { Candidate, Match, Target } from './candidates'

/** Which half of an attack: the roll to hit, or the damage. */
export type AttackPart = 'attack' | 'damage'

export type HudScreen = 'inventory' | 'spells' | 'abilities'

export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'last' }
  | { kind: 'undo' }
  /** long rest (or rest), short rest. */
  | { kind: 'rest'; rest: RestKind }
  /** hit die, hd: spend one hit die. */
  | { kind: 'hit-die' }
  /** A bare signed number: -5 takes damage, +7 heals. Also take 5, heal 7. */
  | { kind: 'hp'; delta: number }
  | { kind: 'hp-set'; value: number }
  | { kind: 'hp-status' }
  | { kind: 'temp'; value: number | null }
  /** A slash question: /ac, /passive, /stealth. */
  | { kind: 'query'; topic: string }
  /** /i or /f: the app opens a HUD screen. The bare word inventory or feats: the engine reads it. */
  | { kind: 'hud'; screen: HudScreen; open: boolean }
  /** wield flail, equip shield, don armor. */
  | { kind: 'wield'; query: string }
  /** unequip, sheathe, doff shield. */
  | { kind: 'unequip'; query: string }
  /** drink healing, use torch, use second wind. */
  | { kind: 'use'; query: string; verb: string }
  /** attack, /a, dmg, /d on their own: the weapon in hand. */
  | { kind: 'hand'; part: AttackPart; mode: Mode | null; bonus: DiceExpr | null; crit: boolean }
  /** concentration reads what you hold; drop, stop concentrating, end concentration lets it go. */
  | { kind: 'concentration'; end: boolean }
  | { kind: 'again'; mode: Mode | null; bonus: DiceExpr | null; part: AttackPart | null }
  | { kind: 'dice'; expr: DiceExpr }
  | {
      kind: 'roll'
      query: string
      mode: Mode | null
      bonus: DiceExpr | null
      save: boolean
      part: AttackPart | null
      crit: boolean
    }

const MODE_WORDS: Record<string, Mode> = {
  adv: 'advantage',
  advantage: 'advantage',
  dis: 'disadvantage',
  disadv: 'disadvantage',
  disadvantage: 'disadvantage',
}
const SAVE_WORDS = new Set(['save', 'saving', 'saves'])
const DAMAGE_WORDS = new Set(['dmg', 'damage', '/d'])
const ATTACK_WORDS = new Set(['attack', 'hit', 'swing', '/a'])
const FLAGS = new Set(['/a', '/d'])
const HUD_WORDS: Record<string, HudScreen> = {
  i: 'inventory',
  inventory: 'inventory',
  inv: 'inventory',
  s: 'spells',
  spells: 'spells',
  f: 'abilities',
  feats: 'abilities',
  abilities: 'abilities',
  features: 'abilities',
}
/** The same screens read aloud instead of opened: the full word with no slash. */
const HUD_READ_WORDS: Record<string, HudScreen> = {
  inventory: 'inventory',
  spells: 'spells',
  feats: 'abilities',
  features: 'abilities',
  abilities: 'abilities',
}
const CRIT_WORDS = new Set(['crit', 'critical'])
const AGAIN_WORDS = new Set(['again', 'redo', 'reroll'])
const LAST_WORDS = new Set(['last', 'repeat', 'result'])
// Not "hold": Hold Person and Hold Monster are spells.
const WIELD_WORDS = new Set(['wield', 'equip', 'draw', 'ready', 'don', 'wear'])
const UNWIELD_WORDS = new Set(['unequip', 'unwield', 'sheathe', 'stow', 'doff'])
const USE_WORDS = new Set(['use', 'drink', 'quaff', 'take'])
const HIT_DIE_WORDS = new Set(['hit die', 'hit dice', 'hd', 'hitdie', 'hitdice'])
const HIT_DIE_FILLER = new Set(['spend', 'roll', 'use', 'a', 'an', 'one', 'my'])
const ARTICLES = new Set(['a', 'an', 'the', 'my', 'some'])
/** Filler a player might type when echoing the DM: "give me a stealth check", "flail with rage", "cast fireball at level 4". */
const FILLER = new Set([
  'check',
  'throw',
  'roll',
  'the',
  'a',
  'an',
  'my',
  'me',
  'give',
  'make',
  'for',
  'please',
  'to',
  'with',
  'cast',
  'at',
  'level',
])
const CONCENTRATION_WORDS = new Set(['concentration', 'concentrating', 'conc'])
const DROP_WORDS = new Set(['drop', 'stop', 'end', 'release'])

/** Own-key lookup: "constructor" is not a mode word. */
const own = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined

/** The words after a verb, minus leading articles: "drink a potion of healing" gives "potion of healing". */
function objectOf(rest: string[]): string {
  let i = 0
  while (i < rest.length && ARTICLES.has(rest[i])) i++
  return rest.slice(i).join(' ')
}

export function parseCommand(input: string): Command {
  const raw = input.trim()
  if (/^[+-]\d+$/.test(raw)) return { kind: 'hp', delta: Number(raw) }
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { kind: 'empty' }
  const [first, ...rest] = tokens
  if (first.startsWith('/') && !FLAGS.has(first)) {
    const word = first.slice(1)
    const screen = own(HUD_WORDS, word)
    if (tokens.length === 1 && screen) return { kind: 'hud', screen, open: true }
    const topic = [word, ...rest].join(' ').trim()
    return topic === '' || topic === 'help' ? { kind: 'help' } : { kind: 'query', topic }
  }
  if (tokens.length === 1 && (first === 'help' || first === '?')) return { kind: 'help' }
  if (tokens.length === 1 && LAST_WORDS.has(first)) return { kind: 'last' }
  if (tokens.length === 1 && first === 'undo') return { kind: 'undo' }
  const read = tokens.length === 1 ? own(HUD_READ_WORDS, first) : undefined
  if (read) return { kind: 'hud', screen: read, open: false }
  if ((tokens.length === 1 && first === 'rest') || (tokens.length === 2 && first === 'long' && rest[0] === 'rest')) {
    return { kind: 'rest', rest: 'long rest' }
  }
  if (tokens.length === 2 && first === 'short' && rest[0] === 'rest') return { kind: 'rest', rest: 'short rest' }
  if (HIT_DIE_WORDS.has(tokens.filter((t) => !HIT_DIE_FILLER.has(t)).join(' '))) return { kind: 'hit-die' }
  if (tokens.length === 1 && CONCENTRATION_WORDS.has(first)) return { kind: 'concentration', end: false }
  if (DROP_WORDS.has(first) && (tokens.length === 1 || rest.some((t) => CONCENTRATION_WORDS.has(t)))) {
    return { kind: 'concentration', end: true }
  }
  if (first === 'temp' && tokens.length <= 2) return { kind: 'temp', value: rest.length ? Number(rest[0]) : null }
  if (first === 'hp' && tokens.length <= 2) return rest.length ? { kind: 'hp-set', value: Number(rest[0]) } : { kind: 'hp-status' }
  // "take 5", "take 5 fire damage", "heal 7"
  if ((first === 'take' || first === 'heal') && rest.length >= 1 && /^\d+$/.test(rest[0])) {
    return { kind: 'hp', delta: first === 'take' ? -Number(rest[0]) : Number(rest[0]) }
  }
  if (WIELD_WORDS.has(first)) return { kind: 'wield', query: objectOf(rest) }
  if (UNWIELD_WORDS.has(first)) return { kind: 'unequip', query: objectOf(rest) }
  if (USE_WORDS.has(first)) return { kind: 'use', query: objectOf(rest), verb: first }

  let mode: Mode | null = null
  let bonus: DiceExpr | null = null
  let part: AttackPart | null = null
  let save = false
  let crit = false
  let again = false
  const words: string[] = []
  for (const t of tokens) {
    const asMode = own(MODE_WORDS, t)
    if (asMode) mode = asMode
    else if (SAVE_WORDS.has(t)) save = true
    else if (DAMAGE_WORDS.has(t)) part = 'damage'
    else if (ATTACK_WORDS.has(t)) part = 'attack'
    else if (CRIT_WORDS.has(t)) crit = true
    else if (AGAIN_WORDS.has(t)) again = true
    else if (/^[+-]/.test(t)) {
      const e = parseDiceExpr(t)
      if (e) bonus = bonus ? addExpr(bonus, e) : e
      else words.push(t)
    } else if (FILLER.has(t)) continue
    else words.push(t)
  }
  const query = words.join(' ')
  if (again) return { kind: 'again', mode, bonus, part }
  if (!query) {
    if (part && !save) return { kind: 'hand', part, mode, bonus, crit }
    if ((mode || bonus) && !save && !crit) return { kind: 'again', mode, bonus, part: null }
    if (save) return { kind: 'roll', query: '', mode, bonus, save, part, crit }
    return { kind: 'empty' }
  }
  const asDice = parseDiceExpr(query)
  if (asDice && asDice.terms.length > 0) return { kind: 'dice', expr: bonus ? addExpr(asDice, bonus) : asDice }
  return { kind: 'roll', query, mode, bonus, save, part, crit }
}

export type Resolved =
  | {
      kind: 'target'
      candidate: Candidate
      mode: Mode
      bonus: DiceExpr | null
      /** Attacks only; null means the roll to hit. */
      part: AttackPart | null
      crit: boolean
      /** Toggle names in force for this roll: one-shot words plus the sticky ones. */
      toggles: string[]
      /** Spells only: the slot level to cast at; null means the spell's own level. */
      level: number | null
    }
  | { kind: 'dice'; expr: DiceExpr }

export interface Outcome {
  text: string
  /** Null when the text is a message (help, ambiguity, error) rather than a roll. */
  result: RollResult | null
}

const toEffect = (tg: DerivedToggle): AttackEffect => ({
  name: tg.name,
  attackBonus: tg.attackBonus,
  damageBonus: tg.damageBonus,
  damageDice: tg.damageDice,
  advantage: tg.advantage,
})

export function executeResolved(r: Resolved, ch: Character, opts: AnnounceOptions, rng: Rng = secureRng): Outcome {
  if (r.kind === 'dice') {
    const res = rollDice(r.expr, rng)
    return { text: announce(res, opts), result: res }
  }
  const { candidate, mode, bonus } = r
  const t = candidate.target
  let result: RollResult
  switch (t.kind) {
    case 'ability':
      result = rollCheck('check', candidate.label, ch.abilities[t.ability].checkModifier, mode, bonus, rng)
      break
    case 'skill': {
      const skill = ch.skills.find((s) => s.id === t.id)
      if (!skill) return { text: 'That skill is not on this character.', result: null }
      result = rollCheck('check', candidate.label, skill.modifier, mode, bonus, rng)
      break
    }
    case 'save': {
      const save = ch.saves.find((s) => s.ability === t.ability)
      if (!save) return { text: 'That saving throw is not on this character.', result: null }
      result = rollCheck('save', candidate.label, save.modifier, mode, bonus, rng)
      break
    }
    case 'initiative':
      result = rollCheck('initiative', candidate.label, ch.initiative, mode, bonus, rng)
      break
    case 'death-save':
      result = rollDeathSave(mode, bonus, rng)
      break
    case 'attack': {
      const attack = ch.attacks[t.index]
      if (!attack) return { text: 'That attack is no longer on this character.', result: null }
      const inForce = ch.toggles.filter((tg) => affectsAttacks(tg) && r.toggles.includes(tg.name) && toggleApplies(tg, attack))
      if (r.part === 'damage') {
        // Only toggles that change damage belong in the damage sentence; advantage and to-hit bonuses do not.
        const effects = inForce.filter((tg) => tg.damageBonus !== 0 || tg.damageDice !== null).map(toEffect)
        result = rollDamage(attack, { critical: r.crit, effects }, rng)
      } else {
        result = rollAttack(attack, { mode, bonus, effects: inForce.map(toEffect) }, rng)
      }
      break
    }
    case 'custom': {
      const custom = ch.custom[t.index]
      if (!custom) return { text: 'That roll is no longer on this character.', result: null }
      result = rollDice(custom.dice, rng, candidate.label)
      break
    }
    case 'spell':
      // Spells spend slots and change state; performRoll sends them to castSpell instead.
      return { text: 'Spells are cast through performRoll.', result: null }
  }
  return { text: announce(result, opts), result }
}

/**
 * What undo restores. Resources are always kept; the gear fields only when the
 * change touched them (a HUD batch, a spent toggle), so undo says only what moved.
 */
export interface Snapshot {
  hp: HitPoints | null
  items: Record<string, number>
  uses: Record<string, number>
  hitDice: number | null
  slotsUsed: Record<number, number>
  pactUsed: number
  inHand?: string | null
  wearing?: string | null
  activeToggles?: string[]
  concentration?: string | null
}

export interface RollerState {
  /** Mode applied when the command does not say adv or dis. */
  stickyMode: Mode
  /** Toggles switched on until switched off: Rage, Sneak Attack, an equipped shield. */
  activeToggles: string[]
  last: Resolved | null
  /** Last announced roll, for "say that again". */
  lastText: string | null
  /** Attack whose last roll to hit was a natural 20 and whose damage has not been rolled yet. */
  pendingCrit: string | null
  /** Null when the character file gives no hit points. */
  hp: HitPoints | null
  /** Attack name in hand; null when empty-handed. Attacking by name sets it. */
  inHand: string | null
  /** Armor item worn; null when unarmored. */
  wearing: string | null
  /** What is left of each consumable, by name. */
  items: Record<string, number>
  /** Uses left of each limited feature, by name (spells under "spell:name"); a missing entry means full. */
  uses: Record<string, number>
  /** Hit dice left; null means full. */
  hitDice: number | null
  /** Spell slots spent at each level; a missing level means none spent. */
  slotsUsed: Record<number, number>
  /** Pact slots spent. */
  pactUsed: number
  /** The spell being concentrated on, or null. */
  concentration: string | null
  /** The slot level each leveled spell was last cast at, so its damage roll matches. */
  castLevels: Record<string, number>
  /** Previous states, newest first, for undo. */
  history: Snapshot[]
}

export const initialRollerState = (): RollerState => ({
  stickyMode: 'normal',
  activeToggles: [],
  last: null,
  lastText: null,
  pendingCrit: null,
  hp: null,
  inHand: null,
  wearing: null,
  items: {},
  uses: {},
  hitDice: null,
  slotsUsed: {},
  pactUsed: 0,
  concentration: null,
  castLevels: {},
  history: [],
})

const HISTORY_LIMIT = 20

type Step = { state: RollerState; outcome: Outcome }

/** A change and its sentence. The state is the very object passed in when nothing changed. */
interface Change {
  state: RollerState
  text: string
}

const message = (state: RollerState, text: string): Step => ({ state, outcome: { text, result: null } })
const spoken = (c: Change): Step => ({ state: c.state, outcome: { text: c.text, result: null } })

interface Keep {
  /** Keep the hand, armor, and toggles too (a HUD batch). */
  gear?: boolean
  /** Keep the toggles too (a toggle that spent a use, a spell that switched one on). */
  toggles?: boolean
  /** Keep what was being concentrated on (a concentration spell, dropping it, going down). */
  concentration?: boolean
}

/** Attaches an undo entry: hit points, counts, uses, hit dice, slots, and the gear, toggles, or concentration when asked. */
function commit(before: RollerState, after: RollerState, keep: Keep = {}): RollerState {
  if (after === before) return before
  const snapshot: Snapshot = {
    hp: before.hp,
    items: before.items,
    uses: before.uses,
    hitDice: before.hitDice,
    slotsUsed: before.slotsUsed,
    pactUsed: before.pactUsed,
  }
  if (keep.gear) {
    snapshot.inHand = before.inHand
    snapshot.wearing = before.wearing
  }
  if (keep.gear || keep.toggles) snapshot.activeToggles = before.activeToggles
  if (keep.concentration) snapshot.concentration = before.concentration
  return { ...after, history: [snapshot, ...before.history].slice(0, HISTORY_LIMIT) }
}

/** A change that moved something becomes a step with an undo entry; one that moved nothing is just a message. */
function step(before: RollerState, c: Change, keep: Keep = {}): Step {
  return c.state === before ? message(before, c.text) : spoken({ state: commit(before, c.state, keep), text: c.text })
}

/** " Armor class 15." or "" when the character has no armor class. */
function acSuffix(ch: Character, activeToggles: string[], wearing: string | null): string {
  const total = armorClassTotal(ch, activeToggles, wearing)
  return total === null ? '' : ` Armor class ${total}.`
}

/** Pulls toggle words out of a query: "flail rage" becomes query "flail" with toggles ["Rage"]. */
export function extractToggles(query: string, ch: Character): { query: string; toggles: string[] } {
  let words = norm(query).split(' ').filter(Boolean)
  const toggles: string[] = []
  for (const t of ch.toggles) {
    for (const raw of [t.name, ...t.aliases]) {
      const needle = norm(raw).split(' ').filter(Boolean)
      const at = needle.length ? indexOfRun(words, needle) : -1
      if (at < 0) continue
      words = [...words.slice(0, at), ...words.slice(at + needle.length)]
      if (!toggles.includes(t.name)) toggles.push(t.name)
      break
    }
  }
  return { query: words.join(' '), toggles }
}

function indexOfRun(words: string[], needle: string[]): number {
  for (let i = 0; i + needle.length <= words.length; i++) {
    if (needle.every((w, j) => words[i + j] === w)) return i
  }
  return -1
}

/**
 * Rolls a resolved command and carries its consequences into the state: the last
 * roll (for Enter and again), the last text (for last), the weapon in hand, a
 * pending critical so damage after a natural 20 is critical on its own, and the
 * death save tally.
 */
export function performRoll(
  state: RollerState,
  r: Resolved,
  ch: Character,
  opts: AnnounceOptions,
  rng: Rng = secureRng,
): Step {
  let resolved = r
  if (
    r.kind === 'target' &&
    (r.candidate.target.kind === 'attack' || r.candidate.target.kind === 'spell') &&
    r.part === 'damage' &&
    !r.crit &&
    state.pendingCrit === r.candidate.label
  ) {
    resolved = { ...r, crit: true }
  }
  if (resolved.kind === 'target' && resolved.candidate.target.kind === 'spell') {
    const spell = ch.spells[resolved.candidate.target.index]
    if (!spell) return message(state, 'That spell is no longer on this character.')
    return castSpell(state, resolved, spell, ch, opts, rng)
  }
  const outcome = executeResolved(resolved, ch, opts, rng)
  if (!outcome.result) return { state, outcome }
  let next: RollerState = { ...state, last: resolved }
  let text = outcome.text
  if (outcome.result.kind === 'attack') {
    next.pendingCrit = outcome.result.d20.natural20 ? outcome.result.label : null
    next.inHand = outcome.result.label
  } else if (outcome.result.kind === 'damage') {
    next.pendingCrit = null
    next.inHand = outcome.result.label
  } else if (outcome.result.kind === 'death-save' && state.hp) {
    const change = recordDeathSave(state.hp, outcome.result.outcome)
    if (change.text) text = `${text} ${change.text}`
    next = commit(next, { ...next, hp: change.hp })
  }
  next = { ...next, lastText: text }
  return { state: next, outcome: { text, result: outcome.result } }
}

export const NOTHING_IN_HAND = 'Nothing in hand. Type a weapon name, or wield and a weapon, like wield flail.'

type TargetResolved = Extract<Resolved, { kind: 'target' }>

/** Every term's count and the flat part, times n: the extra dice of an upcast. */
const scaleExpr = (e: DiceExpr, n: number): DiceExpr => ({
  terms: e.terms.map((t) => ({ ...t, count: t.count * n })),
  flat: e.flat * n,
})

/** 1d8 plus 2d8 becomes 3d8, so an upcast reads as one roll. */
function mergeExpr(e: DiceExpr): DiceExpr {
  const terms: DiceExpr['terms'] = []
  for (const t of e.terms) {
    const same = terms.find((x) => x.sides === t.sides && x.sign === t.sign)
    if (same) same.count += t.count
    else terms.push({ ...t })
  }
  return { terms, flat: e.flat }
}

/** What pays for a leveled spell: a free casting, a slot of a level, or a pact slot. */
type Payment = { kind: 'free' } | { kind: 'slot'; level: number } | { kind: 'pact' }

function choosePayment(state: RollerState, spell: DerivedSpell, level: number, ch: Character): Payment | null {
  if (spell.uses && spellUsesLeft(spell, state.uses) > 0) return { kind: 'free' }
  if (slotsLeft(ch, state.slotsUsed, level) > 0) return { kind: 'slot', level }
  const pact = ch.spellcasting?.pact
  if (pact && pact.level >= level && pactLeft(ch, state.pactUsed) > 0) return { kind: 'pact' }
  return null
}

/** "No level 3 slots left. Level 4 slots: 1 left. Type fireball 4 to use one." */
function noSlotsText(state: RollerState, spell: DerivedSpell, level: number, ch: Character): string {
  const sc = ch.spellcasting
  const higher = Object.keys(sc?.slots ?? {})
    .map(Number)
    .filter((l) => l > level && slotsLeft(ch, state.slotsUsed, l) > 0)
    .sort((a, b) => a - b)
  let s = `No level ${level} slots left.`
  if (higher.length) {
    s += ` Level ${higher[0]} slots: ${slotsLeft(ch, state.slotsUsed, higher[0])} left. Type ${spell.name.toLowerCase()} ${higher[0]} to use one.`
  } else {
    s += sc?.pact && !Object.keys(sc.slots).length ? ' Short rest to recover.' : ' Long rest to recover.'
  }
  return s
}

function pay(state: RollerState, p: Payment, spell: DerivedSpell, ch: Character): Change {
  const sc = ch.spellcasting
  switch (p.kind) {
    case 'free': {
      const left = spellUsesLeft(spell, state.uses) - 1
      return {
        state: { ...state, uses: { ...state.uses, [`spell:${spell.name}`]: left } },
        text: `${left} free ${left === 1 ? 'casting' : 'castings'} left.`,
      }
    }
    case 'slot': {
      const used = (state.slotsUsed[p.level] ?? 0) + 1
      const max = sc?.slots[p.level] ?? 0
      return {
        state: { ...state, slotsUsed: { ...state.slotsUsed, [p.level]: used } },
        text: `Level ${p.level} slots: ${max - used} of ${max} left.`,
      }
    }
    case 'pact': {
      const used = state.pactUsed + 1
      const count = sc?.pact?.count ?? 0
      return { state: { ...state, pactUsed: used }, text: `Pact slots: ${count - used} of ${count} left.` }
    }
  }
}

/** Ends concentration, switching off the toggle the spell kept on: "Haste ends. Haste spell off. Armor class 18." */
function endConcentration(state: RollerState, ch: Character): { state: RollerState; texts: string[] } {
  const name = state.concentration
  if (!name) return { state, texts: [] }
  let s: RollerState = { ...state, concentration: null }
  const texts = [`${name} ends.`]
  const spell = ch.spells.find((x) => x.name === name)
  const t = spell?.toggle ? ch.toggles.find((x) => x.name === spell.toggle) : undefined
  if (t && s.activeToggles.includes(t.name)) {
    const c = setToggle(s, t, false, ch)
    s = c.state
    texts.push(c.text)
  }
  return { state: s, texts }
}

/**
 * Casts a spell: pays for it first (a cast with nothing to spend never rolls),
 * rolls what the spell rolls, then switches its toggle on and takes up
 * concentration. A cantrip's attack and damage behave like a weapon's: the
 * damage half of an attack spell uses the level it was cast at and spends
 * nothing. Enter repeats a cantrip, never a slot.
 */
function castSpell(state: RollerState, r: TargetResolved, spell: DerivedSpell, ch: Character, opts: AnnounceOptions, rng: Rng): Step {
  const sc = ch.spellcasting
  const damagePart = r.part === 'damage' && spell.kind === 'attack'
  if (!spell.prepared && !damagePart) return message(state, `${spell.name} is not prepared.`)
  if (!damagePart && r.level !== null && spell.level > 0 && r.level < spell.level) {
    return message(state, `${spell.name} is a level ${spell.level} spell. Cast it at level ${spell.level} or higher.`)
  }
  const level = spell.level === 0 ? 0 : damagePart ? (state.castLevels[spell.name] ?? spell.level) : (r.level ?? spell.level)
  let s: RollerState = state
  const texts: string[] = []
  let paidText = ''
  if (!damagePart && spell.level > 0) {
    const p = choosePayment(s, spell, level, ch)
    if (!p) return message(state, noSlotsText(state, spell, level, ch))
    const paid = pay(s, p, spell, ch)
    s = paid.state
    paidText = paid.text
  }
  const extra = spell.upcast && level > spell.level ? scaleExpr(spell.upcast, level - spell.level) : null
  const scaled = (base: DiceExpr): DiceExpr => (extra ? mergeExpr(addExpr(base, extra)) : base)
  let result: RollResult | null = null
  let text: string
  switch (spell.kind) {
    case 'attack': {
      const target = { name: spell.name, toHit: sc?.attackBonus ?? 0, damage: scaled(spell.damage ?? { terms: [], flat: 0 }), damageType: spell.damageType }
      result = damagePart
        ? rollDamage(target, { critical: r.crit, flatFrom: null }, rng)
        : rollAttack(target, { mode: r.mode, bonus: r.bonus }, rng)
      text = announce(result, opts)
      break
    }
    case 'save': {
      const save = { ability: ABILITY_NAMES[spell.save ?? 'dex'], dc: sc?.saveDc ?? 0, effect: spell.saveEffect }
      if (spell.damage) {
        result = rollDamage({ name: spell.name, damage: scaled(spell.damage), damageType: spell.damageType }, { critical: false, save, flatFrom: null }, rng)
        text = announce(result, opts)
      } else {
        text = `${spell.name}: ${save.ability} save DC ${save.dc}.`
      }
      break
    }
    case 'heal':
      result = rollHeal(scaled(spell.heal ?? { terms: [], flat: 0 }), spell.name, rng)
      text = announce(result, opts)
      break
    case 'damage':
      result = rollDamage({ name: spell.name, damage: scaled(spell.damage ?? { terms: [], flat: 0 }), damageType: spell.damageType }, { critical: false, flatFrom: null }, rng)
      text = announce(result, opts)
      break
    case 'dice':
      result = rollDice(scaled(spell.damage ?? { terms: [], flat: 0 }), rng, spell.name)
      text = announce(result, opts)
      break
    case 'utility':
      text = `Cast ${spell.name}.`
      break
  }
  texts.push(text)
  if (paidText) texts.push(paidText)
  let keepToggles = false
  if (!damagePart) {
    if (spell.toggle) {
      const t = ch.toggles.find((x) => x.name === spell.toggle)
      if (t) {
        const c = setToggle(s, t, true, ch)
        if (c.state !== s) {
          s = c.state
          keepToggles = true
          texts.push(c.text)
        }
      }
    }
    if (spell.concentration) {
      const was = s.concentration
      const ended = was && was !== spell.name ? endConcentration(s, ch) : { state: s, texts: [] }
      if (ended.state.activeToggles !== s.activeToggles) keepToggles = true
      s = { ...ended.state, concentration: spell.name }
      texts.push(`Concentrating on ${spell.name}.`, ...ended.texts)
    }
    if (spell.level > 0) s = { ...s, castLevels: { ...s.castLevels, [spell.name]: level } }
  }
  if (result?.kind === 'attack') s = { ...s, pendingCrit: result.d20.natural20 ? spell.name : null, inHand: spell.name }
  else if (result?.kind === 'damage' && spell.kind === 'attack') s = { ...s, pendingCrit: null, inHand: spell.name }
  const full = texts.join(' ')
  if (spell.level === 0 || damagePart) s = { ...s, last: r }
  s = { ...s, lastText: full }
  const concentrationChanged = s.concentration !== state.concentration
  const spent = s.slotsUsed !== state.slotsUsed || s.pactUsed !== state.pactUsed || s.uses !== state.uses
  const next = spent || keepToggles || concentrationChanged ? commit(state, s, { toggles: keepToggles, concentration: concentrationChanged }) : s
  return { state: next, outcome: { text: full, result } }
}

export const HELP_TEXT =
  'Type what to roll and press Enter. Examples: stealth. dex save. rapier. 2d6+3. ' +
  'Attacks roll to hit; then dmg or slash d rolls the damage. A natural 20 makes that damage critical on its own. ' +
  'Attacking by name puts that weapon in hand; after that, attack or slash a rolls with it. wield flail changes it, unequip puts it away. ' +
  'equip shield and unequip shield switch gear, wear chain shirt and doff armor change armor. drink healing or use torch uses an item. ' +
  'Slash i opens the inventory and slash f opens feats and abilities: every item is a button, Enter selects, Done applies. The bare words inventory and feats read them instead. ' +
  'Slash s opens your spells; Enter on one casts it. By typing: fire bolt rolls to hit and dmg its damage, fireball spends a slot and rolls, fireball 4 casts it at level 4, cure wounds rolls healing. ' +
  'slash slots reads your slots. concentration reads what you hold; drop lets it go. ' +
  'Toggles such as Rage switch on by name and spend a use when they have one. use second wind spends a feature. short rest recovers short-rest features, hit die spends a hit die, long rest recovers everything. ' +
  'Add adv or dis for advantage or disadvantage, +2 or +1d4 for bonuses. ' +
  'Hit points: minus 5 takes 5, plus 7 heals 7, temp 8 sets temporary hit points, undo reverses. ' +
  'Questions start with a slash: /ac, /passive, /skills, /saves, /attacks, /equipped, /inventory, /features, /potions, /hp, /status, or /stealth for one skill and /rage for one feature. ' +
  'Enter on the empty box rolls the last thing again; last repeats the result.'

/** Everything with a roll to hit and a damage roll: weapons and attack spells. */
const attackCandidates = (ch: Character): Candidate[] => allCandidates(ch).filter((c) => c.damageLabel !== undefined)

/** "You have Flail, Warhammer and Bite." */
function attackList(ch: Character): string {
  return ch.attacks.length ? `You have ${joinAnd(ch.attacks.map((a) => a.name))}.` : 'This character has no attacks.'
}

/** The start of every refusal for want of uses, so a batch can tell it from "already on". */
export const NO_USES = 'No uses of '
const noUsesLeft = (f: DerivedFeature): string => `${NO_USES}${f.name} left until a ${f.uses?.per ?? 'long rest'}.`

/** The limited-use feature a toggle belongs to, if any. */
const featureOf = (ch: Character, t: DerivedToggle): DerivedFeature | undefined =>
  ch.features.find((f) => f.toggle === t.name && f.uses !== null)

/** Switches a toggle, spending a use when its feature has them: "Rage on. 2 uses left." No history. */
function setToggle(state: RollerState, t: DerivedToggle, on: boolean, ch: Character): Change {
  const isOn = state.activeToggles.includes(t.name)
  if (isOn === on) return { state, text: `${t.name} is already ${on ? 'on' : 'off'}.` }
  let uses = state.uses
  let usesText = ''
  if (on) {
    const f = featureOf(ch, t)
    if (f?.uses) {
      const left = usesLeft(f, state.uses)
      if (left <= 0) return { state, text: noUsesLeft(f) }
      uses = { ...state.uses, [f.name]: left - 1 }
      usesText = ` ${usesWord(left - 1)} left.`
    }
  }
  const active = on ? [...state.activeToggles, t.name] : state.activeToggles.filter((n) => n !== t.name)
  let text = `${t.name} ${on ? 'on' : 'off'}.`
  if (t.acBonus !== 0) text += acSuffix(ch, active, state.wearing)
  return { state: { ...state, activeToggles: active, uses }, text: text + usesText }
}

/** Switches a toggle from the command box or a button. Spending a use is kept for undo; a plain flip is its own undo. */
function switchToggle(state: RollerState, t: DerivedToggle, on: boolean, ch: Character): Step {
  const c = setToggle(state, t, on, ch)
  if (c.state === state) return message(state, c.text)
  return spoken(c.state.uses !== state.uses ? { ...c, state: commit(state, c.state, { toggles: true }) } : c)
}

/** The toggle button on the page: on becomes off and off becomes on. */
export function flipToggle(state: RollerState, t: DerivedToggle, ch: Character): Step {
  return switchToggle(state, t, !state.activeToggles.includes(t.name), ch)
}

function wearArmor(state: RollerState, item: DerivedItem, ch: Character): Step {
  if (state.wearing === item.name) return message(state, `${item.name} is already on.`)
  const next = { ...state, wearing: item.name }
  return { state: next, outcome: { text: `${item.name} on.${acSuffix(ch, next.activeToggles, next.wearing)}`, result: null } }
}

function removeArmor(state: RollerState, ch: Character): Step {
  if (!state.wearing) return message(state, 'No armor on.')
  const was = state.wearing
  const next = { ...state, wearing: null }
  return { state: next, outcome: { text: `${was} off.${acSuffix(ch, next.activeToggles, null)}`, result: null } }
}

/** Things that can be equipped: toggles such as a shield, attacks, and armor. */
type Gear =
  | { names: string[]; kind: 'toggle'; toggle: DerivedToggle }
  | { names: string[]; kind: 'attack'; candidate: Candidate }
  | { names: string[]; kind: 'armor'; item: DerivedItem }

function gearPool(ch: Character): Gear[] {
  return [
    ...ch.toggles.map((t) => ({ names: [t.name.toLowerCase(), ...t.aliases], kind: 'toggle' as const, toggle: t })),
    ...attackCandidates(ch).map((c) => ({ names: c.names, kind: 'attack' as const, candidate: c })),
    ...ch.items
      .filter((i) => i.kind === 'armor')
      .map((i) => ({ names: [i.name.toLowerCase(), ...i.aliases], kind: 'armor' as const, item: i })),
  ]
}

const gearName = (g: Gear): string =>
  g.kind === 'toggle' ? g.toggle.name : g.kind === 'attack' ? g.candidate.name : g.item.name

function wield(query: string, ch: Character, state: RollerState): Step {
  if (!query) return message(state, state.inHand ? `${state.inHand} in hand.` : `Wield what? ${attackList(ch)}`)
  const m = matchNamed(query, gearPool(ch), ch.aliases)
  if (m.kind === 'ambiguous') return message(state, `Ambiguous: ${listOr(m.items.map(gearName))}. Type more letters.`)
  if (m.kind === 'none') return message(state, `Nothing called ${query} to wield. ${attackList(ch)}`)
  if (m.item.kind === 'toggle') return switchToggle(state, m.item.toggle, true, ch)
  if (m.item.kind === 'armor') return wearArmor(state, m.item.item, ch)
  const c = m.item.candidate
  if (c.target.kind === 'spell') {
    const spell = ch.spells[c.target.index]
    if (!spell) return message(state, 'That spell is no longer on this character.')
    return { state: { ...state, inHand: spell.name }, outcome: { text: `${spell.name} in hand: ${describeSpellStats(spell, ch)}.`, result: null } }
  }
  const attack = c.target.kind === 'attack' ? ch.attacks[c.target.index] : undefined
  if (!attack) return message(state, 'That attack is no longer on this character.')
  return {
    state: { ...state, inHand: attack.name },
    outcome: { text: `${attack.name} in hand: ${describeAttackStats(attack)}.`, result: null },
  }
}

function unequip(query: string, ch: Character, state: RollerState): Step {
  if (!query) {
    if (!state.inHand) return message(state, 'Nothing in hand.')
    return { state: { ...state, inHand: null }, outcome: { text: `${state.inHand} put away. Nothing in hand.`, result: null } }
  }
  if (query === 'armor' || query === 'armour') return removeArmor(state, ch)
  const m = matchNamed(query, gearPool(ch), ch.aliases)
  if (m.kind === 'ambiguous') return message(state, `Ambiguous: ${listOr(m.items.map(gearName))}. Type more letters.`)
  if (m.kind === 'none') return message(state, `Nothing called ${query} to put away.`)
  if (m.item.kind === 'toggle') return switchToggle(state, m.item.toggle, false, ch)
  if (m.item.kind === 'armor') {
    if (state.wearing !== m.item.item.name) return message(state, `${m.item.item.name} is not worn.`)
    return removeArmor(state, ch)
  }
  const name = m.item.candidate.name
  if (state.inHand !== name) return message(state, `${name} is not in hand.`)
  return { state: { ...state, inHand: null }, outcome: { text: `${name} put away. Nothing in hand.`, result: null } }
}

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)
const article = (name: string): string => (/^[aeiou]/i.test(name) ? 'an' : 'a')

/** Uses one of a consumable: the new hit points, counts, toggles, and the sentence. No history. */
function consume(state: RollerState, c: DerivedConsumable, verb: string, opts: AnnounceOptions, rng: Rng): Change {
  const left = state.items[c.name] ?? c.count
  if (left <= 0) return { state, text: `No ${c.name} left.` }
  const past = verb === 'drink' || verb === 'quaff' ? 'Drank' : 'Used'
  const items = { ...state.items, [c.name]: left - 1 }
  let hp = state.hp
  let activeToggles = state.activeToggles
  let text = `${past} ${article(c.name)} ${c.name}`
  if (c.heal) {
    if (!hp) {
      text += ', but this character has no hit points to heal.'
    } else {
      const rolled = rollExpr(c.heal, rng)
      if (rolled.total > 0) {
        const change = heal(hp, rolled.total)
        hp = change.hp
        text += `: ${lowerFirst(change.text)}`
      } else {
        text += ': healed 0.'
      }
      if (opts.breakdown && rolled.terms.length) text += ` You rolled ${describeDice(rolled)}.`
    }
  } else if (c.toggle) {
    if (!activeToggles.includes(c.toggle)) activeToggles = [...activeToggles, c.toggle]
    text += `. ${c.toggle} on.`
  } else {
    text += '.'
  }
  text += ` ${left - 1} left.`
  return { state: { ...state, hp, items, activeToggles }, text }
}

/**
 * Uses a feature: a toggle feature switches on (spending a use), a limited one
 * spends a use and heals if it heals, anything else has nothing to spend. No history.
 */
function spendFeature(state: RollerState, f: DerivedFeature, ch: Character, opts: AnnounceOptions, rng: Rng): Change {
  if (f.toggle) {
    const t = ch.toggles.find((x) => x.name === f.toggle)
    return t ? setToggle(state, t, true, ch) : { state, text: `${f.name} has no toggle any more.` }
  }
  if (!f.uses) return { state, text: `${f.name} has no uses to spend.` }
  const left = usesLeft(f, state.uses)
  if (left <= 0) return { state, text: noUsesLeft(f) }
  const uses = { ...state.uses, [f.name]: left - 1 }
  let hp = state.hp
  let text = `Used ${f.name}`
  if (f.heal) {
    if (!hp) {
      text += ', but this character has no hit points to heal.'
    } else {
      const rolled = rollExpr(f.heal, rng)
      if (rolled.total > 0) {
        const change = heal(hp, rolled.total)
        hp = change.hp
        text += `: ${lowerFirst(change.text)}`
      } else {
        text += ': healed 0.'
      }
      if (opts.breakdown && rolled.terms.length) text += ` You rolled ${describeDice(rolled)}.`
    }
  } else {
    text += '.'
  }
  text += ` ${usesWord(left - 1)} left.`
  return { state: { ...state, hp, uses }, text }
}

/** Everything "use" can take: consumables, and features that switch or spend something. */
type Usable =
  | { names: string[]; kind: 'item'; c: DerivedConsumable }
  | { names: string[]; kind: 'feature'; f: DerivedFeature }

const usableFeatures = (ch: Character): DerivedFeature[] => ch.features.filter((f) => f.toggle !== null || f.uses !== null)

/** Every feature is matched, so "use danger sense" can explain that it has nothing to spend. */
function usablePool(ch: Character): Usable[] {
  return [
    ...ch.consumables.map((c) => ({ names: [c.name.toLowerCase(), ...c.aliases], kind: 'item' as const, c })),
    ...ch.features.map((f) => ({ names: [f.name.toLowerCase(), ...f.aliases], kind: 'feature' as const, f })),
  ]
}

const usableName = (u: Usable): string => (u.kind === 'item' ? u.c.name : u.f.name)

/** "You carry Potion of Healing with 2 left. You can also use Rage and Lucky." */
function haveList(ch: Character, state: RollerState): string {
  const parts: string[] = []
  if (ch.consumables.length) parts.push(`You carry ${carryingList(ch, state.items)}.`)
  const features = usableFeatures(ch).map((f) => f.name)
  if (features.length) parts.push(`You can ${parts.length ? 'also ' : ''}use ${joinAnd(features)}.`)
  return parts.join(' ')
}

function useItem(query: string, verb: string, ch: Character, state: RollerState, opts: AnnounceOptions, rng: Rng): Step {
  const pool = usablePool(ch)
  if (!pool.length) return message(state, 'No consumables on this character.')
  if (!query) return message(state, `Use what? ${haveList(ch, state)}`)
  const m = matchNamed(query, pool)
  if (m.kind === 'ambiguous') return message(state, `Ambiguous: ${listOr(m.items.map(usableName))}. Type more letters.`)
  if (m.kind === 'none') return message(state, `Nothing called ${query} to use. ${haveList(ch, state)}`)
  const c = m.item.kind === 'item' ? consume(state, m.item.c, verb, opts, rng) : spendFeature(state, m.item.f, ch, opts, rng)
  return step(state, c, { toggles: c.state.activeToggles !== state.activeToggles })
}

const NOTHING_TO_RECOVER = 'Nothing to recover.'

/**
 * A rest. A long rest refills hit points, every limited use, and half the hit
 * dice; a short rest refills short-rest uses and says how many hit dice are
 * there to spend. No history.
 */
function takeRest(state: RollerState, kind: RestKind, ch: Character): Change {
  let s = state
  const texts: string[] = []
  let said = false
  if (kind === 'long rest' && state.hp) {
    const r = longRest(state.hp)
    s = { ...s, hp: r.hp }
    texts.push(r.text)
    said = true
  } else {
    texts.push(kind === 'long rest' ? 'Long rest.' : 'Short rest.')
  }
  const slotsSpent = Object.values(s.slotsUsed).some((n) => n > 0)
  if (kind === 'long rest' && (slotsSpent || s.pactUsed > 0)) {
    s = { ...s, slotsUsed: {}, pactUsed: 0 }
    texts.push('Spell slots recovered.')
    said = true
  } else if (kind === 'short rest' && s.pactUsed > 0) {
    s = { ...s, pactUsed: 0 }
    texts.push('Pact slots recovered.')
    said = true
  }
  if (kind === 'long rest' && s.concentration) {
    const ended = endConcentration(s, ch)
    s = ended.state
    texts.push(...ended.texts)
    said = true
  }
  const recovered: string[] = []
  const uses = { ...s.uses }
  for (const f of ch.features) {
    if (!f.uses || (kind === 'short rest' && f.uses.per !== 'short rest')) continue
    if (usesLeft(f, s.uses) < f.uses.max) {
      recovered.push(f.name)
      delete uses[f.name]
    }
  }
  if (recovered.length) {
    s = { ...s, uses }
    texts.push(`${joinAnd(recovered)} recovered.`)
    said = true
  }
  if (ch.hitDice) {
    const left = hitDiceLeft(ch, s.hitDice)
    if (kind === 'long rest') {
      const regained = Math.min(ch.hitDice.count, left + Math.max(1, Math.floor(ch.hitDice.count / 2)))
      if (regained !== left) {
        s = { ...s, hitDice: regained }
        texts.push(`Hit dice: ${regained} of ${ch.hitDice.count}.`)
        said = true
      }
    } else {
      texts.push(left > 0 ? `${hitDiceWord(left)} left. Type hit die to spend one.` : 'No hit dice left.')
      said = true
    }
  }
  if (!said) texts.push(NOTHING_TO_RECOVER)
  return { state: s, text: texts.join(' ') }
}

/** Spends one hit die: "Spent a hit die: healed 9. 49 of 60 hit points. You rolled a 5 plus 4 from Constitution. 4 hit dice left." */
function spendHitDie(state: RollerState, ch: Character, opts: AnnounceOptions, rng: Rng): Change {
  if (!ch.hitDice) return { state, text: NO_HIT_DICE }
  const left = hitDiceLeft(ch, state.hitDice)
  if (left <= 0) return { state, text: 'No hit dice left until a long rest.' }
  if (!state.hp) return { state, text: NO_HP }
  const roll = rollDie(ch.hitDice.sides, rng)
  const con = ch.abilities.con.modifier
  const amount = Math.max(0, roll + con)
  let hp = state.hp
  let text = 'Spent a hit die'
  if (amount > 0) {
    const change = heal(hp, amount)
    hp = change.hp
    text += `: ${lowerFirst(change.text)}`
  } else {
    text += ': healed 0.'
  }
  if (opts.breakdown) text += ` You rolled ${withArticle(roll)}${con !== 0 ? ` ${plusWord(con)} from Constitution` : ''}.`
  const remaining = left - 1
  text += remaining > 0 ? ` ${hitDiceWord(remaining)} left.` : ' No hit dice left.'
  return { state: { ...state, hp, hitDice: remaining }, text }
}

/** One change chosen in a HUD screen. */
export type BatchOp =
  | { op: 'wield'; name: string | null }
  | { op: 'wear'; name: string | null }
  | { op: 'toggle'; name: string; on: boolean }
  /** A consumable or a feature, by name. */
  | { op: 'use'; name: string }
  | { op: 'hit-die' }
  | { op: 'rest'; rest: RestKind }

/**
 * Applies a HUD screen's selections in order, as one change. One sentence per
 * change that moved something (and for a refusal worth hearing), and one undo
 * step for the lot.
 */
export function applyBatch(state: RollerState, ops: BatchOp[], ch: Character, opts: AnnounceOptions, rng: Rng = secureRng): Step {
  let s: RollerState = state
  const texts: string[] = []
  const apply = (c: Change, sayAnyway = false) => {
    if (c.state !== s) {
      s = c.state
      texts.push(c.text)
    } else if (sayAnyway || c.text.startsWith(NO_USES)) {
      texts.push(c.text)
    }
  }
  for (const op of ops) {
    switch (op.op) {
      case 'wield':
        if (op.name === null) {
          if (s.inHand) {
            s = { ...s, inHand: null }
            texts.push('Nothing in hand.')
          }
        } else if (s.inHand !== op.name) {
          s = { ...s, inHand: op.name }
          texts.push(`${op.name} in hand.`)
        }
        break
      case 'wear':
        if (op.name === null) {
          if (s.wearing) {
            const r = removeArmor(s, ch)
            s = r.state
            texts.push(r.outcome.text)
          }
        } else if (s.wearing !== op.name) {
          const item = ch.items.find((i) => i.kind === 'armor' && i.name === op.name)
          if (!item) break
          const r = wearArmor(s, item, ch)
          s = r.state
          texts.push(r.outcome.text)
        }
        break
      case 'toggle': {
        const t = ch.toggles.find((x) => x.name === op.name)
        if (t) apply(setToggle(s, t, op.on, ch))
        break
      }
      case 'use': {
        const c = ch.consumables.find((x) => x.name === op.name)
        if (c) {
          apply(consume(s, c, 'use', opts, rng))
          break
        }
        const f = ch.features.find((x) => x.name === op.name)
        if (f) apply(spendFeature(s, f, ch, opts, rng))
        break
      }
      case 'hit-die':
        apply(spendHitDie(s, ch, opts, rng), true)
        break
      case 'rest':
        apply(takeRest(s, op.rest, ch), true)
        break
    }
  }
  if (!texts.length) return message(state, 'No changes.')
  return spoken({ state: commit(state, s, { gear: true, concentration: s.concentration !== state.concentration }), text: texts.join(' ') })
}

function statusContext(state: RollerState) {
  return {
    hp: state.hp,
    activeToggles: state.activeToggles,
    stickyMode: state.stickyMode,
    pendingCrit: state.pendingCrit,
    inHand: state.inHand,
    wearing: state.wearing,
    items: state.items,
    uses: state.uses,
    hitDice: state.hitDice,
    slotsUsed: state.slotsUsed,
    pactUsed: state.pactUsed,
    concentration: state.concentration,
  }
}

export function runCommand(
  input: string,
  ch: Character,
  state: RollerState,
  opts: AnnounceOptions,
  rng: Rng = secureRng,
): Step {
  const cmd = parseCommand(input)
  const applyHp = (change: HpChange): Step => step(state, { state: change.hp === state.hp ? state : { ...state, hp: change.hp }, text: change.text })
  switch (cmd.kind) {
    case 'empty':
      if (!state.last) return message(state, 'Nothing rolled yet. Type a skill, ability, or attack and press Enter.')
      return performRoll(state, state.last, ch, opts, rng)
    case 'help':
      return message(state, HELP_TEXT)
    case 'last':
      return message(state, state.lastText ?? 'Nothing rolled yet.')
    case 'hp': {
      if (!state.hp) return message(state, NO_HP)
      const change = cmd.delta < 0 ? takeDamage(state.hp, -cmd.delta) : heal(state.hp, cmd.delta)
      let next: RollerState = change.hp === state.hp ? state : { ...state, hp: change.hp }
      let text = change.text
      // Damage while concentrating: the save to keep the spell, or the spell ending when you go down.
      if (cmd.delta < 0 && state.concentration && change.hp !== state.hp && state.hp.current > 0) {
        if (change.hp.current === 0) {
          const ended = endConcentration(next, ch)
          next = ended.state
          text += ` ${ended.texts.join(' ')}`
        } else {
          text += ` Constitution save DC ${Math.max(10, Math.floor(-cmd.delta / 2))} to keep ${state.concentration}.`
        }
      }
      return step(
        state,
        { state: next, text },
        { concentration: next.concentration !== state.concentration, toggles: next.activeToggles !== state.activeToggles },
      )
    }
    case 'concentration': {
      if (!state.concentration) return message(state, 'Not concentrating on anything.')
      if (!cmd.end) return message(state, `Concentrating on ${state.concentration}.`)
      const ended = endConcentration(state, ch)
      return step(state, { state: ended.state, text: ended.texts.join(' ') }, { concentration: true, toggles: ended.state.activeToggles !== state.activeToggles })
    }
    case 'hp-set':
      if (!state.hp) return message(state, NO_HP)
      return applyHp(setCurrent(state.hp, cmd.value))
    case 'hp-status':
      return message(state, state.hp ? describeHp(state.hp) : NO_HP)
    case 'temp':
      if (!state.hp) return message(state, NO_HP)
      if (cmd.value === null) {
        return message(state, state.hp.temp ? `${state.hp.temp} temporary hit points.` : 'No temporary hit points.')
      }
      return applyHp(setTemp(state.hp, cmd.value))
    case 'undo': {
      const [previous, ...older] = state.history
      if (!previous) return message(state, 'Nothing to undo.')
      const parts = ['Undid the last change.']
      if (previous.hp) parts.push(describeHp(previous.hp))
      for (const [name, n] of Object.entries(previous.items)) {
        if (state.items[name] !== n) parts.push(`${name}: ${n} left.`)
      }
      for (const f of ch.features) {
        if (!f.uses) continue
        const was = usesLeft(f, previous.uses)
        if (was !== usesLeft(f, state.uses)) parts.push(`${f.name}: ${was} of ${f.uses.max} uses.`)
      }
      if (ch.hitDice && hitDiceLeft(ch, previous.hitDice) !== hitDiceLeft(ch, state.hitDice)) {
        parts.push(`Hit dice: ${hitDiceLeft(ch, previous.hitDice)} of ${ch.hitDice.count}.`)
      }
      for (const f of ch.spells) {
        if (!f.uses) continue
        const was = spellUsesLeft(f, previous.uses)
        if (was !== spellUsesLeft(f, state.uses)) parts.push(`${f.name}: ${was} of ${f.uses.max} free castings.`)
      }
      const sc = ch.spellcasting
      for (const l of Object.keys(sc?.slots ?? {}).map(Number)) {
        const was = slotsLeft(ch, previous.slotsUsed, l)
        if (was !== slotsLeft(ch, state.slotsUsed, l)) parts.push(`Level ${l} slots: ${was} of ${sc?.slots[l]}.`)
      }
      if (sc?.pact && previous.pactUsed !== state.pactUsed) parts.push(`Pact slots: ${pactLeft(ch, previous.pactUsed)} of ${sc.pact.count}.`)
      const next: RollerState = {
        ...state,
        hp: previous.hp,
        items: previous.items,
        uses: previous.uses,
        hitDice: previous.hitDice,
        slotsUsed: previous.slotsUsed,
        pactUsed: previous.pactUsed,
        history: older,
      }
      if (previous.concentration !== undefined && previous.concentration !== state.concentration) {
        next.concentration = previous.concentration
        parts.push(previous.concentration ? `Concentrating on ${previous.concentration}.` : 'Concentration ended.')
      }
      let acChanged = false
      if (previous.inHand !== undefined) {
        next.inHand = previous.inHand
        if (previous.inHand !== state.inHand) parts.push(previous.inHand ? `${previous.inHand} in hand.` : 'Nothing in hand.')
      }
      if (previous.wearing !== undefined) {
        next.wearing = previous.wearing
        acChanged = previous.wearing !== state.wearing
      }
      if (previous.activeToggles !== undefined) {
        for (const t of ch.toggles) {
          const was = previous.activeToggles.includes(t.name)
          if (was === state.activeToggles.includes(t.name)) continue
          parts.push(`${t.name} ${was ? 'on' : 'off'}.`)
          if (t.acBonus !== 0) acChanged = true
        }
        next.activeToggles = previous.activeToggles
      }
      if (acChanged) {
        const ac = acSuffix(ch, next.activeToggles, next.wearing)
        if (ac) parts.push(ac.trim())
      }
      return { state: next, outcome: { text: parts.join(' '), result: null } }
    }
    case 'rest': {
      const canRest = state.hp || ch.hitDice || ch.spellcasting || ch.features.some((f) => f.uses) || ch.spells.some((s) => s.uses)
      if (!canRest) return message(state, NO_HP)
      return step(state, takeRest(state, cmd.rest, ch))
    }
    case 'hit-die':
      return step(state, spendHitDie(state, ch, opts, rng))
    case 'query':
      return message(state, answerQuery(cmd.topic, ch, statusContext(state)))
    case 'hud':
      if (cmd.screen === 'inventory') return message(state, describeInventory(ch, statusContext(state)))
      if (cmd.screen === 'spells') return message(state, describeSpells(ch, statusContext(state)))
      return message(state, describeFeatures(ch, statusContext(state)))
    case 'wield':
      return wield(cmd.query, ch, state)
    case 'unequip':
      return unequip(cmd.query, ch, state)
    case 'use':
      return useItem(cmd.query, cmd.verb, ch, state, opts, rng)
    case 'hand': {
      const candidate = state.inHand ? attackCandidates(ch).find((c) => c.name === state.inHand) : undefined
      if (!candidate) return message(state, NOTHING_IN_HAND)
      // Toggles applied to the last roll of this weapon (flail rage, then dmg) carry over.
      const carried = state.last?.kind === 'target' && state.last.candidate.key === candidate.key ? state.last.toggles : []
      return performRoll(
        state,
        {
          kind: 'target',
          candidate,
          mode: cmd.mode ?? state.stickyMode,
          bonus: cmd.bonus,
          part: cmd.part,
          crit: cmd.crit,
          toggles: Array.from(new Set([...carried, ...state.activeToggles])),
          level: null,
        },
        ch,
        opts,
        rng,
      )
    }
    case 'again': {
      if (!state.last) return message(state, 'Nothing to repeat yet.')
      const r: Resolved =
        state.last.kind === 'target'
          ? {
              ...state.last,
              mode: cmd.mode ?? state.last.mode,
              bonus: cmd.bonus ?? state.last.bonus,
              part: cmd.part ?? state.last.part,
            }
          : state.last
      return performRoll(state, r, ch, opts, rng)
    }
    case 'dice':
      return performRoll(state, { kind: 'dice', expr: cmd.expr }, ch, opts, rng)
    case 'roll': {
      const { query, toggles } = extractToggles(cmd.query, ch)
      if (!query && toggles.length > 0 && !cmd.save) {
        // A toggle word on its own switches it on or off until switched again.
        let s = state
        const texts: string[] = []
        for (const name of toggles) {
          const t = ch.toggles.find((x) => x.name === name)
          if (!t) continue
          const r = flipToggle(s, t, ch)
          s = r.state
          texts.push(r.outcome.text)
        }
        return { state: s, outcome: { text: texts.join(' '), result: null } }
      }
      if (!query) return message(state, 'Which saving throw? Try dex save or wis save.')
      const pool = allCandidates(ch).filter((c) => (cmd.save ? isSaveTarget(c) : c.target.kind !== 'save'))
      let m = matchQuery(query, pool, ch.aliases)
      let level: number | null = null
      // "fireball 4": a trailing digit is the slot level when the rest names a spell.
      const upcast = /^(.*\S)\s+([1-9])$/.exec(query)
      if (m.kind === 'none' && upcast) {
        const again = matchQuery(upcast[1], pool, ch.aliases)
        if (again.kind === 'match' && again.candidate.target.kind === 'spell') {
          m = again
          level = Number(upcast[2])
        }
      }
      if (m.kind === 'none') {
        return message(state, `No ${cmd.save ? 'saving throw' : 'roll'} matches ${query}. Type help for examples.`)
      }
      if (m.kind === 'ambiguous') {
        return message(state, `Ambiguous: ${listOr(m.candidates.map((c) => c.name))}. Type more letters.`)
      }
      return performRoll(
        state,
        {
          kind: 'target',
          candidate: m.candidate,
          mode: cmd.mode ?? state.stickyMode,
          bonus: cmd.bonus,
          part: cmd.part,
          crit: cmd.crit,
          toggles: Array.from(new Set([...toggles, ...state.activeToggles])),
          level,
        },
        ch,
        opts,
        rng,
      )
    }
  }
}
