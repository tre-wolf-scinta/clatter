import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { CharacterError, parseCharacterFile, type Character, type DerivedToggle } from './engine/character'
import {
  allCandidates,
  applyBatch,
  extractToggles,
  flipToggle,
  fmtMod,
  initialRollerState,
  isSaveTarget,
  matchQuery,
  parseCommand,
  performRoll,
  runCommand,
  type AttackPart,
  type BatchOp,
  type Candidate,
  type Resolved,
  type RollerState,
} from './engine/commands'
import { formatDiceExpr } from './engine/dice'
import { freshHitPoints, type HitPoints } from './engine/hitpoints'
import { usesLeft } from './engine/readouts'
import type { Mode } from './engine/roll'
import { SAMPLE_CHARACTER_JSON } from './engine/sample'
import { loadJSON, loadString, saveJSON, saveString } from './storage'
import { CharacterDialog } from './ui/CharacterDialog'
import { FeaturesHud } from './ui/FeaturesHud'
import { InventoryHud } from './ui/InventoryHud'
import { LiveRegion } from './ui/LiveRegion'

const CHARACTER_KEY = 'clatter.character'
const SETTINGS_KEY = 'clatter.settings'
const hpKey = (name: string): string => `clatter.hp.${name}`
const handKey = (name: string): string => `clatter.hand.${name}`
const armorKey = (name: string): string => `clatter.armor.${name}`
const itemsKey = (name: string): string => `clatter.items.${name}`
const usesKey = (name: string): string => `clatter.uses.${name}`
const hitDiceKey = (name: string): string => `clatter.hitdice.${name}`
const HISTORY_LIMIT = 100
const QUICK_DICE = [4, 6, 8, 10, 12, 20, 100]

interface Settings {
  breakdown: boolean
  assertive: boolean
  proficientOnly: boolean
}
const DEFAULT_SETTINGS: Settings = { breakdown: true, assertive: true, proficientOnly: false }

interface HistoryEntry {
  id: number
  text: string
}

function loadCharacterText(): string {
  const stored = loadString(CHARACTER_KEY)
  if (stored) {
    try {
      parseCharacterFile(stored)
      return stored
    } catch {
      // Corrupt or outdated: fall back to the sample rather than a blank page.
    }
  }
  return SAMPLE_CHARACTER_JSON
}

/** Hit points for this character on this device: what was saved, if it still matches the file's max. */
function initialHitPoints(ch: Character): HitPoints | null {
  if (ch.hitPointsMax === null) return null
  const raw = loadString(hpKey(ch.name))
  if (raw) {
    try {
      const stored = JSON.parse(raw) as HitPoints
      if (stored && stored.max === ch.hitPointsMax && Number.isInteger(stored.current)) return stored
    } catch {
      // Unreadable: start fresh.
    }
  }
  return freshHitPoints(ch.hitPointsMax)
}

/** The weapon in hand on this device: what was saved, else the file's equipped weapon, else nothing. */
function initialHand(ch: Character): string | null {
  const stored = loadString(handKey(ch.name))
  if (stored === '') return null
  if (stored && ch.attacks.some((a) => a.name === stored)) return stored
  const attack = ch.attacks.find((a) => a.equipped)
  if (attack) return attack.name
  const item = ch.items.find((i) => i.kind === 'weapon' && i.equipped && i.attack)
  return item?.attack ?? null
}

/** The armor worn on this device: what was saved, else the file's equipped armor, else none. */
function initialArmor(ch: Character): string | null {
  const stored = loadString(armorKey(ch.name))
  if (stored === '') return null
  if (stored && ch.items.some((i) => i.kind === 'armor' && i.name === stored)) return stored
  return ch.items.find((i) => i.kind === 'armor' && i.equipped)?.name ?? null
}

/** What is left of each consumable on this device, with the file's count for anything new. */
function initialItems(ch: Character): Record<string, number> {
  const stored = loadJSON<Record<string, number>>(itemsKey(ch.name), {})
  const out: Record<string, number> = {}
  for (const c of ch.consumables) out[c.name] = Number.isInteger(stored[c.name]) ? stored[c.name] : c.count
  return out
}

/** Uses left of each limited feature on this device, full for anything new. */
function initialUses(ch: Character): Record<string, number> {
  const stored = loadJSON<Record<string, number>>(usesKey(ch.name), {})
  const out: Record<string, number> = {}
  for (const f of ch.features) {
    if (!f.uses) continue
    const n = stored[f.name]
    out[f.name] = Number.isInteger(n) && n >= 0 && n <= f.uses.max ? n : f.uses.max
  }
  return out
}

/** Hit dice left on this device; null when the character has none. */
function initialHitDice(ch: Character): number | null {
  if (!ch.hitDice) return null
  const raw = loadString(hitDiceKey(ch.name))
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n >= 0 && n <= ch.hitDice.count ? n : ch.hitDice.count
}

/** Visual-only hint under the roll box; never announced, so typing stays quiet. */
function describeSuggestion(input: string, candidates: Candidate[], ch: Character): string {
  const cmd = parseCommand(input)
  switch (cmd.kind) {
    case 'empty':
      return ''
    case 'help':
      return 'Enter shows help.'
    case 'last':
      return 'Enter repeats the last result.'
    case 'undo':
      return 'Enter undoes the last change.'
    case 'rest':
      return cmd.rest === 'long rest' ? 'Enter takes a long rest.' : 'Enter takes a short rest.'
    case 'hit-die':
      return 'Enter spends a hit die.'
    case 'hp':
      return cmd.delta < 0 ? `Enter takes ${-cmd.delta} damage.` : `Enter heals ${cmd.delta}.`
    case 'hp-set':
      return 'Enter sets hit points.'
    case 'hp-status':
      return 'Enter reads hit points.'
    case 'temp':
      return 'Enter sets temporary hit points.'
    case 'query':
      return `Enter answers /${cmd.topic}.`
    case 'hud':
      if (cmd.screen === 'spells') return 'Enter: spells are not built yet.'
      if (cmd.screen === 'inventory') return cmd.open ? 'Enter opens the inventory.' : 'Enter reads the inventory.'
      return cmd.open ? 'Enter opens feats and abilities.' : 'Enter reads your feats and abilities.'
    case 'wield':
      return cmd.query ? `Enter wields ${cmd.query}.` : 'Enter says what is in hand.'
    case 'unequip':
      return cmd.query ? `Enter puts away ${cmd.query}.` : 'Enter empties your hand.'
    case 'use':
      return cmd.query ? `Enter uses ${cmd.query}.` : 'Enter lists what you carry.'
    case 'hand':
      return cmd.part === 'damage' ? 'Enter rolls damage for the weapon in hand.' : 'Enter attacks with the weapon in hand.'
    case 'again':
      return 'Enter rolls the last thing again.'
    case 'dice':
      return `Enter rolls ${formatDiceExpr(cmd.expr)}.`
    case 'roll': {
      const { query, toggles } = extractToggles(cmd.query, ch)
      if (!query) return toggles.length ? `Enter switches ${toggles.join(' and ')}.` : ''
      const pool = candidates.filter((c) => (cmd.save ? isSaveTarget(c) : c.target.kind !== 'save'))
      const m = matchQuery(query, pool, ch.aliases)
      const withs = [...(cmd.mode ? [cmd.mode] : []), ...toggles]
      if (m.kind === 'match') {
        const part = m.candidate.target.kind === 'attack' ? (cmd.part === 'damage' ? ' damage' : ' to hit') : ''
        return `Enter rolls ${m.candidate.name}${part}${withs.length ? ` with ${withs.join(' and ')}` : ''}.`
      }
      if (m.kind === 'ambiguous') return `Matches: ${m.candidates.map((c) => c.name).join(', ')}.`
      return 'No match.'
    }
  }
}

/** "Rage +2 damage, 2 of 3 uses", "Shield +2 AC", "Reckless Attack advantage to hit". */
function toggleLabel(t: DerivedToggle, ch: Character, uses: Record<string, number>): string {
  const parts: string[] = []
  if (t.advantage) parts.push('advantage to hit')
  if (t.attackBonus) parts.push(`${fmtMod(t.attackBonus)} to hit`)
  if (t.damageBonus) parts.push(`${fmtMod(t.damageBonus)} damage`)
  if (t.damageDice) parts.push(`+${formatDiceExpr(t.damageDice)} damage`)
  if (t.acBonus) parts.push(`${fmtMod(t.acBonus)} AC`)
  const f = ch.features.find((x) => x.toggle === t.name && x.uses)
  if (f?.uses) parts.push(`${usesLeft(f, uses)} of ${f.uses.max} uses`)
  return parts.length ? `${t.name} ${parts.join(', ')}` : t.name
}

interface GroupProps {
  id: string
  title: string
  items: Candidate[]
  onRoll: (c: Candidate, e: MouseEvent<HTMLButtonElement>, part: AttackPart | null) => void
  before?: ReactNode
  children?: ReactNode
}

function ButtonGroup({ id, title, items, onRoll, before, children }: GroupProps) {
  return (
    <section aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {before}
      <div className="grid">
        {items.map((c) => (
          <Fragment key={c.key}>
            <button type="button" onClick={(e) => onRoll(c, e, c.damageLabel ? 'attack' : null)}>
              {c.buttonLabel}
            </button>
            {c.damageLabel && (
              <button type="button" onClick={(e) => onRoll(c, e, 'damage')}>
                {c.damageLabel}
              </button>
            )}
          </Fragment>
        ))}
        {children}
      </div>
    </section>
  )
}

export default function App() {
  const [characterText, setCharacterText] = useState(loadCharacterText)
  const character = useMemo(() => parseCharacterFile(characterText), [characterText])
  const [settings, setSettings] = useState<Settings>(() => loadJSON(SETTINGS_KEY, DEFAULT_SETTINGS))
  const [input, setInput] = useState('')
  const [announcement, setAnnouncement] = useState({ text: '', nonce: 0 })
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [stickyMode, setStickyMode] = useState<Mode>('normal')
  const [activeToggles, setActiveToggles] = useState<string[]>([])
  const [inHand, setInHand] = useState<string | null>(null)
  const [wearing, setWearing] = useState<string | null>(null)
  const [items, setItems] = useState<Record<string, number>>({})
  const [uses, setUses] = useState<Record<string, number>>({})
  const [hitDice, setHitDice] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [hudOpen, setHudOpen] = useState(false)
  const [featsOpen, setFeatsOpen] = useState(false)
  const roller = useRef<RollerState>(initialRollerState())
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  useEffect(() => {
    saveJSON(SETTINGS_KEY, settings)
  }, [settings])

  useEffect(() => {
    roller.current = { ...roller.current, stickyMode, activeToggles }
  }, [stickyMode, activeToggles])

  // A new character: its hit points, weapon in hand, armor, items, uses, and hit dice for
  // this device, its equipped toggles, and a clean slate.
  useEffect(() => {
    const defaults = character.toggles.filter((t) => t.on).map((t) => t.name)
    const hand = initialHand(character)
    const armor = initialArmor(character)
    const stock = initialItems(character)
    const spent = initialUses(character)
    const dice = initialHitDice(character)
    roller.current = {
      ...roller.current,
      hp: initialHitPoints(character),
      history: [],
      activeToggles: defaults,
      inHand: hand,
      wearing: armor,
      items: stock,
      uses: spent,
      hitDice: dice,
      last: null,
      pendingCrit: null,
    }
    setActiveToggles(defaults)
    setInHand(hand)
    setWearing(armor)
    setItems(stock)
    setUses(spent)
    setHitDice(dice)
  }, [character])

  // "/" anywhere outside a text field jumps back to the roll box. Alt+I opens the
  // inventory and Alt+A the feats and abilities from anywhere, text box included; the
  // buttons' accesskeys say the same thing to NVDA, and this handler makes them work
  // even where accesskeys differ.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setHudOpen(true)
        return
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setFeatsOpen(true)
        return
      }
      if (e.key !== '/' || e.ctrlKey || e.altKey || e.metaKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const say = useCallback((text: string) => {
    setAnnouncement((a) => ({ text, nonce: a.nonce + 1 }))
  }, [])

  // A link such as ?character=characters/persi-obsidian.json loads that file on
  // arrival, so one bookmark sets up a new device without pasting anything.
  const loadedFromUrl = useRef(false)
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('character')
    if (!param || loadedFromUrl.current) return
    loadedFromUrl.current = true
    let url: string
    try {
      url = new URL(param, window.location.href).toString()
    } catch {
      say('The character link is not a valid address.')
      return
    }
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const text = await res.text()
        // A dev server answers unknown paths with the page itself; say so plainly.
        if (!text.trim().startsWith('{')) throw new Error('that address did not return a character file')
        const err = loadCharacter(text)
        if (err) say(`Could not load the character from the link: ${err}`)
      })
      .catch((err: Error) => say(`Could not load the character from the link: ${err.message}.`))
    // Runs once on arrival; loadCharacter and say only touch stable refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const announceOptions = { breakdown: settings.breakdown }

  function finish(next: { state: RollerState; outcome: { text: string; result: unknown } }) {
    roller.current = next.state
    setActiveToggles(next.state.activeToggles)
    setInHand(next.state.inHand)
    setWearing(next.state.wearing)
    setItems(next.state.items)
    setUses(next.state.uses)
    setHitDice(next.state.hitDice)
    if (next.state.hp) saveJSON(hpKey(character.name), next.state.hp)
    saveString(handKey(character.name), next.state.inHand ?? '')
    saveString(armorKey(character.name), next.state.wearing ?? '')
    saveJSON(itemsKey(character.name), next.state.items)
    saveJSON(usesKey(character.name), next.state.uses)
    saveString(hitDiceKey(character.name), next.state.hitDice === null ? '' : String(next.state.hitDice))
    if (next.outcome.result) {
      setHistory((h) => [{ id: nextId.current++, text: next.outcome.text }, ...h].slice(0, HISTORY_LIMIT))
    }
    say(next.outcome.text)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const cmd = parseCommand(input)
    if (cmd.kind === 'hud' && cmd.open && cmd.screen !== 'spells') {
      setInput('')
      if (cmd.screen === 'inventory') setHudOpen(true)
      else setFeatsOpen(true)
      return
    }
    finish(runCommand(input, character, roller.current, announceOptions))
    setInput('')
  }

  function rollCandidate(c: Candidate, e: MouseEvent<HTMLButtonElement>, part: AttackPart | null) {
    const mode: Mode = e.shiftKey ? 'advantage' : e.ctrlKey ? 'disadvantage' : stickyMode
    const resolved: Resolved = {
      kind: 'target',
      candidate: c,
      mode,
      bonus: null,
      part,
      crit: false,
      toggles: activeToggles,
    }
    finish(performRoll(roller.current, resolved, character, announceOptions))
  }

  function rollQuick(sides: number) {
    const resolved: Resolved = { kind: 'dice', expr: { terms: [{ sign: 1, count: 1, sides }], flat: 0 } }
    finish(performRoll(roller.current, resolved, character, announceOptions))
  }

  function applyOps(ops: BatchOp[]) {
    setHudOpen(false)
    setFeatsOpen(false)
    finish(applyBatch(roller.current, ops, character, announceOptions))
  }

  function loadCharacter(text: string): string | null {
    try {
      const ch = parseCharacterFile(text)
      setCharacterText(text)
      saveString(CHARACTER_KEY, text)
      setDialogOpen(false)
      say(`Loaded ${ch.name}, level ${ch.level}.`)
      return null
    } catch (err) {
      return err instanceof CharacterError ? err.message : `Could not load: ${(err as Error).message}`
    }
  }

  function toggleMode(mode: Mode) {
    setStickyMode((current) => (current === mode ? 'normal' : mode))
  }

  const candidates = useMemo(() => allCandidates(character), [character])
  const groups = useMemo(
    () => ({
      abilities: candidates.filter((c) => c.target.kind === 'ability'),
      saves: candidates.filter((c) => isSaveTarget(c)),
      skills: candidates.filter((c) => c.target.kind === 'skill'),
      attacks: candidates.filter((c) => c.target.kind === 'attack'),
      other: candidates.filter((c) => c.target.kind === 'initiative' || c.target.kind === 'custom'),
    }),
    [candidates],
  )
  const proficientSkills = useMemo(
    () =>
      groups.skills.filter((c) => {
        if (c.target.kind !== 'skill') return false
        const id = c.target.id
        const s = character.skills.find((x) => x.id === id)
        return s?.proficiency === 'proficient' || s?.proficiency === 'expertise'
      }),
    [groups.skills, character],
  )
  const suggestion = describeSuggestion(input, candidates, character)

  return (
    <>
      <header>
        <h1>Clatter</h1>
        <p className="muted">
          {character.name}, level {character.level}. Proficiency bonus {fmtMod(character.proficiencyBonus)}.
        </p>
      </header>
      <main>
        <section aria-labelledby="roll-h">
          <h2 id="roll-h">Roll</h2>
          <form onSubmit={onSubmit}>
            <label htmlFor="cmd">What are you rolling?</label>
            <input
              id="cmd"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setInput('')
                // Explicit submit: implicit form submission needs a trusted key event,
                // and some assistive tools dispatch synthetic ones.
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
              autoFocus
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby="cmd-help"
            />
            <p id="cmd-help" className="muted">
              Type a skill, ability, save, or attack, then press Enter. Type help for options.
            </p>
            <p className="muted suggestion">{suggestion}</p>
          </form>
          <p className="muted">{inHand ? `${inHand} in hand.` : 'Nothing in hand.'}</p>
          <div className="grid">
            <button type="button" accessKey="i" onClick={() => setHudOpen(true)}>
              Inventory
            </button>
            <button type="button" accessKey="a" onClick={() => setFeatsOpen(true)}>
              Feats and abilities
            </button>
            <button type="button" aria-pressed={stickyMode === 'advantage'} onClick={() => toggleMode('advantage')}>
              Advantage
            </button>
            <button
              type="button"
              aria-pressed={stickyMode === 'disadvantage'}
              onClick={() => toggleMode('disadvantage')}
            >
              Disadvantage
            </button>
            {character.toggles.map((t) => (
              <button
                key={t.name}
                type="button"
                aria-pressed={activeToggles.includes(t.name)}
                onClick={() => finish(flipToggle(roller.current, t, character))}
              >
                {toggleLabel(t, character, uses)}
              </button>
            ))}
            <button type="button" onClick={() => say(roller.current.lastText ?? 'Nothing rolled yet.')}>
              Repeat last result
            </button>
          </div>
        </section>

        <section aria-labelledby="result-h">
          <h2 id="result-h">Result</h2>
          <LiveRegion text={announcement.text} nonce={announcement.nonce} assertive={settings.assertive} />
        </section>

        <ButtonGroup id="abilities" title="Ability checks" items={groups.abilities} onRoll={rollCandidate} />
        <ButtonGroup id="saves" title="Saving throws" items={groups.saves} onRoll={rollCandidate} />
        <ButtonGroup
          id="skills"
          title="Skills"
          items={settings.proficientOnly ? proficientSkills : groups.skills}
          onRoll={rollCandidate}
          before={
            <div className="field">
              <input
                id="skills-proficient"
                type="checkbox"
                checked={settings.proficientOnly}
                onChange={(e) => setSettings({ ...settings, proficientOnly: e.target.checked })}
              />
              <label htmlFor="skills-proficient">Show only proficient skills</label>
            </div>
          }
        />
        {groups.attacks.length > 0 && (
          <ButtonGroup id="attacks" title="Attacks" items={groups.attacks} onRoll={rollCandidate} />
        )}
        <ButtonGroup id="other" title="Other rolls" items={groups.other} onRoll={rollCandidate}>
          {QUICK_DICE.map((n) => (
            <button key={n} type="button" onClick={() => rollQuick(n)}>
              d{n}
            </button>
          ))}
        </ButtonGroup>

        {character.consumables.length > 0 && (
          <section aria-labelledby="items-h">
            <h2 id="items-h">Items</h2>
            <div className="grid">
              {character.consumables.map((c) => {
                const left = items[c.name] ?? c.count
                return (
                  <button
                    key={c.name}
                    type="button"
                    disabled={left <= 0}
                    onClick={() => finish(runCommand(`use ${c.name}`, character, roller.current, announceOptions))}
                  >
                    {`${c.name}, ${left} left`}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <section aria-labelledby="history-h">
          <h2 id="history-h">Roll history</h2>
          {history.length === 0 ? (
            <p className="muted">No rolls yet.</p>
          ) : (
            <ol className="history">
              {history.map((h) => (
                <li key={h.id}>{h.text}</li>
              ))}
            </ol>
          )}
          <button
            type="button"
            disabled={history.length === 0}
            onClick={() => {
              setHistory([])
              say('History cleared.')
            }}
          >
            Clear history
          </button>
        </section>

        <section aria-labelledby="character-h">
          <h2 id="character-h">Character</h2>
          <p>
            {character.name}, level {character.level}. {character.attacks.length} attacks, {character.custom.length}{' '}
            custom rolls. Saved in this browser.
          </p>
          <div className="grid">
            <button type="button" className="primary" onClick={() => setDialogOpen(true)}>
              Load or edit character
            </button>
            <button type="button" onClick={() => loadCharacter(SAMPLE_CHARACTER_JSON)}>
              Load sample character
            </button>
          </div>
        </section>

        <section aria-labelledby="settings-h">
          <h2 id="settings-h">Settings</h2>
          <div className="field">
            <input
              id="set-breakdown"
              type="checkbox"
              checked={settings.breakdown}
              onChange={(e) => setSettings({ ...settings, breakdown: e.target.checked })}
            />
            <label htmlFor="set-breakdown">Say how each roll was made after the total</label>
          </div>
          <div className="field">
            <input
              id="set-assertive"
              type="checkbox"
              checked={settings.assertive}
              onChange={(e) => setSettings({ ...settings, assertive: e.target.checked })}
            />
            <label htmlFor="set-assertive">Interrupt speech to announce results</label>
          </div>
        </section>

        <section aria-labelledby="help-h">
          <h2 id="help-h">Help</h2>
          <ul>
            <li>Type what the DM asked for and press Enter: stealth, dex save, rapier, initiative, 2d6+3.</li>
            <li>
              Attacks: rapier rolls to hit. Then dmg or /d rolls its damage. A natural 20 makes that damage critical
              on its own; add crit to force it.
            </li>
            <li>
              Weapon in hand: attacking by name puts that weapon in hand, and wield flail does too. After that,
              attack or /a rolls to hit with it and dmg rolls its damage. unequip puts it away.
            </li>
            <li>
              Inventory: type /i, press the Inventory button, or press its shortcut, Alt+I in Chrome and Edge,
              Alt+Shift+I in Firefox. Inside, H moves between sections, B between items, Enter selects, Done applies
              everything at once, Escape cancels. One undo reverses the whole batch. The bare word inventory reads it
              aloud instead.
            </li>
            <li>
              Feats and abilities: type /f, press the Feats and abilities button, or press Alt+A (Alt+Shift+A in
              Firefox). Same layout: Class features, Species traits, Feats, then Rest with the hit die and both rests.
              Features with uses say how many are left; Rage spends one when it switches on. The bare word feats reads
              it aloud.
            </li>
            <li>
              Gear and items by typing: equip shield and unequip shield, wear chain shirt and doff armor, drink healing
              or use torch, use second wind. /equipped reads what you hold, your armor, your shield, and what you
              carry; /potions reads what is left.
            </li>
            <li>
              Hit points: minus 5 takes 5 (temporary hit points go first), plus 7 heals 7, temp 8 sets temporary hit
              points, hp reads them, undo reverses the last change. Death saves keep their own count.
            </li>
            <li>
              Rests: short rest recovers short-rest features and says how many hit dice you have; hit die spends one;
              long rest recovers hit points, every use, and half your hit dice.
            </li>
            <li>
              Questions start with a slash: /ac, /passive, /skills, /saves, /attacks, /equipped, /inventory, /features,
              /potions, /hp, /status, or a name such as /stealth, /str, or /rage.
            </li>
            <li>Short forms work: perc, soh, init, hist. If it is ambiguous you are told, never guessed.</li>
            <li>Add adv or dis for advantage or disadvantage. Add +2 or +1d4 for a bonus such as Guidance.</li>
            <li>
              Toggles such as Rage: press the button to keep it on, type rage to switch it, or add it to one roll:
              flail rage. Equipped items start on.
            </li>
            <li>Press Enter on the empty box to roll the last thing again. Type last to hear the last result again.</li>
            <li>Press slash anywhere to jump back to the roll box. Escape clears it.</li>
            <li>On any roll button, Shift+Enter rolls with advantage and Ctrl+Enter with disadvantage.</li>
          </ul>
        </section>
      </main>
      <CharacterDialog
        open={dialogOpen}
        initialText={characterText}
        onClose={() => setDialogOpen(false)}
        onLoad={loadCharacter}
      />
      <InventoryHud
        open={hudOpen}
        character={character}
        inHand={inHand}
        wearing={wearing}
        activeToggles={activeToggles}
        items={items}
        onCancel={() => setHudOpen(false)}
        onApply={applyOps}
      />
      <FeaturesHud
        open={featsOpen}
        character={character}
        activeToggles={activeToggles}
        uses={uses}
        hitDice={hitDice}
        onCancel={() => setFeatsOpen(false)}
        onApply={applyOps}
      />
    </>
  )
}
