/**
 * The command box: parse what the player typed, match it against the character,
 * roll, and produce the sentence to announce. Also builds the button lists.
 */
import { ABILITIES, ABILITY_NAMES, SKILLS, toggleApplies, type Ability, type Character, type SkillId } from './character'
import { type DiceExpr, type Rng, addExpr, formatDiceExpr, parseDiceExpr, secureRng } from './dice'
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

export type Target =
  | { kind: 'ability'; ability: Ability }
  | { kind: 'skill'; id: SkillId }
  | { kind: 'save'; ability: Ability }
  | { kind: 'initiative' }
  | { kind: 'death-save' }
  | { kind: 'attack'; index: number }
  | { kind: 'custom'; index: number }

export interface Candidate {
  key: string
  /** Short display name: "Stealth", "Dexterity save". */
  name: string
  /** What the announcement calls it: "Stealth check", "Dexterity save". */
  label: string
  /** Button text: "Stealth +10", "Flail +7 to hit". */
  buttonLabel: string
  /** Attacks only: the damage button, "Flail damage 1d8+4 bludgeoning". */
  damageLabel?: string
  /** Everything a player might type for it, lowercased. */
  names: string[]
  target: Target
}

export const fmtMod = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)

export const isSaveTarget = (c: Candidate): boolean => c.target.kind === 'save' || c.target.kind === 'death-save'

export function allCandidates(ch: Character): Candidate[] {
  const out: Candidate[] = []
  for (const a of ABILITIES) {
    const name = ABILITY_NAMES[a]
    out.push({
      key: `ability:${a}`,
      name,
      label: `${name} check`,
      buttonLabel: `${name} ${fmtMod(ch.abilities[a].checkModifier)}`,
      names: [name.toLowerCase(), a],
      target: { kind: 'ability', ability: a },
    })
  }
  for (const s of ch.skills) {
    const def = SKILLS.find((d) => d.id === s.id)
    out.push({
      key: `skill:${s.id}`,
      name: s.name,
      label: `${s.name} check`,
      buttonLabel: `${s.name} ${fmtMod(s.modifier)}`,
      names: [s.name.toLowerCase(), ...(def?.aliases ?? [])],
      target: { kind: 'skill', id: s.id },
    })
  }
  for (const s of ch.saves) {
    out.push({
      key: `save:${s.ability}`,
      name: `${s.name} save`,
      label: `${s.name} save`,
      buttonLabel: `${s.name} save ${fmtMod(s.modifier)}`,
      names: [s.name.toLowerCase(), s.ability],
      target: { kind: 'save', ability: s.ability },
    })
  }
  out.push({
    key: 'initiative',
    name: 'Initiative',
    label: 'Initiative',
    buttonLabel: `Initiative ${fmtMod(ch.initiative)}`,
    names: ['initiative', 'init'],
    target: { kind: 'initiative' },
  })
  out.push({
    key: 'death-save',
    name: 'Death save',
    label: 'Death save',
    buttonLabel: 'Death save',
    names: ['death save', 'death', 'ds', 'death saving throw'],
    target: { kind: 'death-save' },
  })
  ch.attacks.forEach((a, index) => {
    const type = a.damageType ? ` ${a.damageType}` : ''
    out.push({
      key: `attack:${index}`,
      name: a.name,
      label: a.name,
      buttonLabel: `${a.name} ${fmtMod(a.toHit)} to hit`,
      damageLabel: `${a.name} damage ${formatDiceExpr(a.damage)}${type}`,
      names: [a.name.toLowerCase(), ...a.aliases],
      target: { kind: 'attack', index },
    })
  })
  ch.custom.forEach((c, index) => {
    out.push({
      key: `custom:${index}`,
      name: c.name,
      label: c.name,
      buttonLabel: `${c.name} ${formatDiceExpr(c.dice)}`,
      names: [c.name.toLowerCase(), ...c.aliases],
      target: { kind: 'custom', index },
    })
  })
  return out
}

export type Match =
  | { kind: 'match'; candidate: Candidate }
  | { kind: 'ambiguous'; candidates: Candidate[] }
  | { kind: 'none' }

const norm = (s: string): string => s.toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Exact name or alias beats prefix beats substring. Ties are reported, never guessed. */
export function matchQuery(rawQuery: string, pool: Candidate[], aliases: Record<string, string> = {}): Match {
  let q = norm(rawQuery)
  if (aliases[q]) q = norm(aliases[q])
  if (!q) return { kind: 'none' }
  const score = (c: Candidate): number => {
    let best = 0
    for (const raw of c.names) {
      const n = norm(raw)
      if (n === q) best = Math.max(best, 3)
      else if (n.startsWith(q)) best = Math.max(best, 2)
      else if (n.includes(q)) best = Math.max(best, 1)
    }
    return best
  }
  let top = 0
  let hits: Candidate[] = []
  for (const c of pool) {
    const s = score(c)
    if (s === 0) continue
    if (s > top) {
      top = s
      hits = [c]
    } else if (s === top) {
      hits.push(c)
    }
  }
  if (hits.length === 0) return { kind: 'none' }
  if (hits.length === 1) return { kind: 'match', candidate: hits[0] }
  return { kind: 'ambiguous', candidates: hits }
}

/** Which half of an attack: the roll to hit, or the damage. */
export type AttackPart = 'attack' | 'damage'

export type Command =
  | { kind: 'empty' }
  | { kind: 'help' }
  | { kind: 'last' }
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
const DAMAGE_WORDS = new Set(['dmg', 'damage', '-d'])
const ATTACK_WORDS = new Set(['attack', 'hit', '-a'])
const CRIT_WORDS = new Set(['crit', 'critical'])
const AGAIN_WORDS = new Set(['again', 'redo', 'reroll'])
const LAST_WORDS = new Set(['last', 'repeat', 'result'])
/** Filler a player might type when echoing the DM: "give me a stealth check", "flail with rage". */
const FILLER = new Set(['check', 'throw', 'roll', 'the', 'a', 'an', 'my', 'me', 'give', 'make', 'for', 'please', 'to', 'with'])

export function parseCommand(input: string): Command {
  const tokens = input.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { kind: 'empty' }
  if (tokens.length === 1 && (tokens[0] === 'help' || tokens[0] === '?')) return { kind: 'help' }
  if (tokens.length === 1 && LAST_WORDS.has(tokens[0])) return { kind: 'last' }
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
        .filter((tg) => r.toggles.includes(tg.name) && toggleApplies(tg, attack))
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
  /** Toggles switched on until switched off: Rage, Sneak Attack. */
  activeToggles: string[]
  last: Resolved | null
  /** Last announced roll, for "say that again". */
  lastText: string | null
  /** Attack whose last roll to hit was a natural 20 and whose damage has not been rolled yet. */
  pendingCrit: string | null
}

export const initialRollerState = (): RollerState => ({
  stickyMode: 'normal',
  activeToggles: [],
  last: null,
  lastText: null,
  pendingCrit: null,
})

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
 * roll (for Enter and again), the last text (for last), and a pending critical,
 * so damage rolled after a natural 20 is critical without the player saying so.
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
  let pendingCrit = state.pendingCrit
  if (outcome.result.kind === 'attack') pendingCrit = outcome.result.d20.natural20 ? outcome.result.label : null
  else if (outcome.result.kind === 'damage') pendingCrit = null
  return { state: { ...state, last: resolved, lastText: outcome.text, pendingCrit }, outcome }
}

export const HELP_TEXT =
  'Type what to roll and press Enter. Examples: stealth. dex save. rapier. 2d6+3. ' +
  'Attacks roll to hit; then type dmg for the damage. A natural 20 makes that damage critical on its own. ' +
  'Add adv or dis for advantage or disadvantage. Add +2 or +1d4 for bonuses. ' +
  'Press Enter on the empty box to roll the last thing again. Type last to hear the last result again.'

function listOr(names: string[]): string {
  if (names.length <= 2) return names.join(' or ')
  return `${names.slice(0, -1).join(', ')}, or ${names[names.length - 1]}`
}

export function runCommand(
  input: string,
  ch: Character,
  state: RollerState,
  opts: AnnounceOptions,
  rng: Rng = secureRng,
): { state: RollerState; outcome: Outcome } {
  const cmd = parseCommand(input)
  const message = (text: string) => ({ state, outcome: { text, result: null } })
  switch (cmd.kind) {
    case 'empty':
      if (!state.last) return message('Nothing rolled yet. Type a skill, ability, or attack and press Enter.')
      return performRoll(state, state.last, ch, opts, rng)
    case 'help':
      return message(HELP_TEXT)
    case 'last':
      return message(state.lastText ?? 'Nothing rolled yet.')
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
