/**
 * The command box: parse what the player typed, roll or answer, and produce the
 * sentence to announce. Rolling lives in roll.ts, matching in candidates.ts,
 * hit points in hitpoints.ts, slash answers in readouts.ts.
 */
import { affectsAttacks, toggleApplies, type Character } from './character'
import { allCandidates, isSaveTarget, listOr, matchQuery, norm, type Candidate } from './candidates'
import { type DiceExpr, type Rng, addExpr, parseDiceExpr, secureRng } from './dice'
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
import { NO_HP, answerQuery } from './readouts'
import {
  type AttackEffect,
  type Mode,
  type RollResult,
  rollAttack,
  rollCheck,
  rollDamage,
  rollDeathSave,
  rollDice,
} from './roll'
import { type AnnounceOptions, announce } from './announce'

export { allCandidates, fmtMod, isSaveTarget, matchQuery } from './candidates'
export type { Candidate, Match, Target } from './candidates'

/** Which half of an attack: the roll to hit, or the damage. */
export type AttackPart = 'attack' | 'damage'

export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'last' }
  | { kind: 'undo' }
  | { kind: 'rest' }
  /** A bare signed number: -5 takes damage, +7 heals. */
  | { kind: 'hp'; delta: number }
  | { kind: 'hp-set'; value: number }
  | { kind: 'hp-status' }
  | { kind: 'temp'; value: number | null }
  /** A slash question: /ac, /passive, /stealth. */
  | { kind: 'query'; topic: string }
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
const ATTACK_WORDS = new Set(['attack', 'hit', '/a'])
const FLAGS = new Set(['/a', '/d'])
const CRIT_WORDS = new Set(['crit', 'critical'])
const AGAIN_WORDS = new Set(['again', 'redo', 'reroll'])
const LAST_WORDS = new Set(['last', 'repeat', 'result'])
/** Filler a player might type when echoing the DM: "give me a stealth check", "flail with rage". */
const FILLER = new Set(['check', 'throw', 'roll', 'the', 'a', 'an', 'my', 'me', 'give', 'make', 'for', 'please', 'to', 'with'])

export function parseCommand(input: string): Command {
  const raw = input.trim()
  if (/^[+-]\d+$/.test(raw)) return { kind: 'hp', delta: Number(raw) }
  const tokens = raw.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { kind: 'empty' }
  const [first, ...rest] = tokens
  if (first.startsWith('/') && !FLAGS.has(first)) {
    const topic = [first.slice(1), ...rest].join(' ').trim()
    return topic === '' || topic === 'help' ? { kind: 'help' } : { kind: 'query', topic }
  }
  if (tokens.length === 1 && (first === 'help' || first === '?')) return { kind: 'help' }
  if (tokens.length === 1 && LAST_WORDS.has(first)) return { kind: 'last' }
  if (tokens.length === 1 && first === 'undo') return { kind: 'undo' }
  if ((tokens.length === 1 && first === 'rest') || (tokens.length === 2 && first === 'long' && rest[0] === 'rest')) {
    return { kind: 'rest' }
  }
  if (first === 'temp' && tokens.length <= 2) return { kind: 'temp', value: rest.length ? Number(rest[0]) : null }
  if (first === 'hp' && tokens.length <= 2) return rest.length ? { kind: 'hp-set', value: Number(rest[0]) } : { kind: 'hp-status' }

  let mode: Mode | null = null
  let bonus: DiceExpr | null = null
  let part: AttackPart | null = null
  let save = false
  let crit = false
  let again = false
  const words: string[] = []
  for (const t of tokens) {
    if (t in MODE_WORDS) mode = MODE_WORDS[t]
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
    if ((mode || bonus || part) && !save && !crit) return { kind: 'again', mode, bonus, part }
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
    }
  | { kind: 'dice'; expr: DiceExpr }

export interface Outcome {
  text: string
  /** Null when the text is a message (help, ambiguity, error) rather than a roll. */
  result: RollResult | null
}

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
      const effects: AttackEffect[] = ch.toggles
        .filter((tg) => affectsAttacks(tg) && r.toggles.includes(tg.name) && toggleApplies(tg, attack))
        .map((tg) => ({ name: tg.name, attackBonus: tg.attackBonus, damageBonus: tg.damageBonus, damageDice: tg.damageDice }))
      result =
        r.part === 'damage'
          ? rollDamage(attack, { critical: r.crit, effects }, rng)
          : rollAttack(attack, { mode, bonus, effects }, rng)
      break
    }
    case 'custom': {
      const custom = ch.custom[t.index]
      if (!custom) return { text: 'That roll is no longer on this character.', result: null }
      result = rollDice(custom.dice, rng, candidate.label)
      break
    }
  }
  return { text: announce(result, opts), result }
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
  /** Previous hit point states, newest first, for undo. */
  hpHistory: HitPoints[]
}

export const initialRollerState = (): RollerState => ({
  stickyMode: 'normal',
  activeToggles: [],
  last: null,
  lastText: null,
  pendingCrit: null,
  hp: null,
  hpHistory: [],
})

const HP_HISTORY_LIMIT = 20

function withHp(state: RollerState, hp: HitPoints): RollerState {
  if (hp === state.hp) return state
  const history = state.hp ? [state.hp, ...state.hpHistory].slice(0, HP_HISTORY_LIMIT) : state.hpHistory
  return { ...state, hp, hpHistory: history }
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
 * roll (for Enter and again), the last text (for last), a pending critical so
 * damage after a natural 20 is critical on its own, and the death save tally.
 */
export function performRoll(
  state: RollerState,
  r: Resolved,
  ch: Character,
  opts: AnnounceOptions,
  rng: Rng = secureRng,
): { state: RollerState; outcome: Outcome } {
  let resolved = r
  if (
    r.kind === 'target' &&
    r.candidate.target.kind === 'attack' &&
    r.part === 'damage' &&
    !r.crit &&
    state.pendingCrit === r.candidate.label
  ) {
    resolved = { ...r, crit: true }
  }
  const outcome = executeResolved(resolved, ch, opts, rng)
  if (!outcome.result) return { state, outcome }
  let next: RollerState = { ...state, last: resolved }
  let text = outcome.text
  if (outcome.result.kind === 'attack') next.pendingCrit = outcome.result.d20.natural20 ? outcome.result.label : null
  else if (outcome.result.kind === 'damage') next.pendingCrit = null
  else if (outcome.result.kind === 'death-save' && state.hp) {
    const change = recordDeathSave(state.hp, outcome.result.outcome)
    if (change.text) text = `${text} ${change.text}`
    next = withHp(next, change.hp)
  }
  next = { ...next, lastText: text }
  return { state: next, outcome: { text, result: outcome.result } }
}

export const HELP_TEXT =
  'Type what to roll and press Enter. Examples: stealth. dex save. rapier. 2d6+3. ' +
  'Attacks roll to hit; then type dmg or slash d for the damage. A natural 20 makes that damage critical on its own. ' +
  'Add adv or dis for advantage or disadvantage, +2 or +1d4 for bonuses. ' +
  'Hit points: minus 5 takes 5, plus 7 heals 7, temp 8 sets temporary hit points, undo reverses, long rest resets. ' +
  'Questions start with a slash: /ac, /passive, /skills, /saves, /attacks, /hp, /status, or /stealth for one skill. ' +
  'Enter on the empty box rolls the last thing again; last repeats the result.'

export function runCommand(
  input: string,
  ch: Character,
  state: RollerState,
  opts: AnnounceOptions,
  rng: Rng = secureRng,
): { state: RollerState; outcome: Outcome } {
  const cmd = parseCommand(input)
  const message = (text: string) => ({ state, outcome: { text, result: null } })
  const applyHp = (change: HpChange) => ({ state: withHp(state, change.hp), outcome: { text: change.text, result: null } })
  switch (cmd.kind) {
    case 'empty':
      if (!state.last) return message('Nothing rolled yet. Type a skill, ability, or attack and press Enter.')
      return performRoll(state, state.last, ch, opts, rng)
    case 'help':
      return message(HELP_TEXT)
    case 'last':
      return message(state.lastText ?? 'Nothing rolled yet.')
    case 'hp':
      if (!state.hp) return message(NO_HP)
      return applyHp(cmd.delta < 0 ? takeDamage(state.hp, -cmd.delta) : heal(state.hp, cmd.delta))
    case 'hp-set':
      if (!state.hp) return message(NO_HP)
      return applyHp(setCurrent(state.hp, cmd.value))
    case 'hp-status':
      return message(state.hp ? describeHp(state.hp) : NO_HP)
    case 'temp':
      if (!state.hp) return message(NO_HP)
      if (cmd.value === null) {
        return message(state.hp.temp ? `${state.hp.temp} temporary hit points.` : 'No temporary hit points.')
      }
      return applyHp(setTemp(state.hp, cmd.value))
    case 'undo': {
      if (!state.hp) return message(NO_HP)
      const [previous, ...older] = state.hpHistory
      if (!previous) return message('Nothing to undo.')
      return {
        state: { ...state, hp: previous, hpHistory: older },
        outcome: { text: `Undid the last change. ${describeHp(previous)}`, result: null },
      }
    }
    case 'rest':
      if (!state.hp) return message(NO_HP)
      return applyHp(longRest(state.hp))
    case 'query':
      return message(
        answerQuery(cmd.topic, ch, {
          hp: state.hp,
          activeToggles: state.activeToggles,
          stickyMode: state.stickyMode,
          pendingCrit: state.pendingCrit,
        }),
      )
    case 'again': {
      if (!state.last) return message('Nothing to repeat yet.')
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
        let active = state.activeToggles
        const texts: string[] = []
        for (const name of toggles) {
          const on = !active.includes(name)
          active = on ? [...active, name] : active.filter((n) => n !== name)
          texts.push(`${name} ${on ? 'on' : 'off'}.`)
        }
        return { state: { ...state, activeToggles: active }, outcome: { text: texts.join(' '), result: null } }
      }
      if (!query) return message('Which saving throw? Try dex save or wis save.')
      const pool = allCandidates(ch).filter((c) => (cmd.save ? isSaveTarget(c) : c.target.kind !== 'save'))
      const m = matchQuery(query, pool, ch.aliases)
      if (m.kind === 'none') {
        return message(`No ${cmd.save ? 'saving throw' : 'roll'} matches ${query}. Type help for examples.`)
      }
      if (m.kind === 'ambiguous') {
        return message(`Ambiguous: ${listOr(m.candidates.map((c) => c.name))}. Type more letters.`)
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
        },
        ch,
        opts,
        rng,
      )
    }
  }
}
