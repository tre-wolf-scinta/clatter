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
  extractToggles,
  fmtMod,
  initialRollerState,
  isSaveTarget,
  matchQuery,
  parseCommand,
  performRoll,
  runCommand,
  type AttackPart,
  type Candidate,
  type Resolved,
  type RollerState,
} from './engine/commands'
import { formatDiceExpr } from './engine/dice'
import { freshHitPoints, type HitPoints } from './engine/hitpoints'
import type { Mode } from './engine/roll'
import { SAMPLE_CHARACTER_JSON } from './engine/sample'
import { loadJSON, loadString, saveJSON, saveString } from './storage'
import { CharacterDialog } from './ui/CharacterDialog'
import { LiveRegion } from './ui/LiveRegion'

const CHARACTER_KEY = 'dicecaller.character'
const SETTINGS_KEY = 'dicecaller.settings'
const hpKey = (name: string): string => `dicecaller.hp.${name}`
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
      return 'Enter undoes the last hit point change.'
    case 'rest':
      return 'Enter takes a long rest.'
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

/** "Rage +2 damage", "Shield +2 AC", "Great Weapon Master -5 to hit, +10 damage". */
function toggleLabel(t: DerivedToggle): string {
  const parts: string[] = []
  if (t.attackBonus) parts.push(`${fmtMod(t.attackBonus)} to hit`)
  if (t.damageBonus) parts.push(`${fmtMod(t.damageBonus)} damage`)
  if (t.damageDice) parts.push(`+${formatDiceExpr(t.damageDice)} damage`)
  if (t.acBonus) parts.push(`${fmtMod(t.acBonus)} AC`)
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const roller = useRef<RollerState>(initialRollerState())
  const inputRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(1)

  useEffect(() => {
    saveJSON(SETTINGS_KEY, settings)
  }, [settings])

  useEffect(() => {
    roller.current = { ...roller.current, stickyMode, activeToggles }
  }, [stickyMode, activeToggles])

  // A new character: its hit points for this device, its equipped toggles, and a clean slate.
  useEffect(() => {
    const defaults = character.toggles.filter((t) => t.on).map((t) => t.name)
    roller.current = {
      ...roller.current,
      hp: initialHitPoints(character),
      hpHistory: [],
      activeToggles: defaults,
      last: null,
      pendingCrit: null,
    }
    setActiveToggles(defaults)
  }, [character])

  // "/" anywhere outside a text field jumps back to the roll box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
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
    if (next.state.hp) saveJSON(hpKey(character.name), next.state.hp)
    if (next.outcome.result) {
      setHistory((h) => [{ id: nextId.current++, text: next.outcome.text }, ...h].slice(0, HISTORY_LIMIT))
    }
    say(next.outcome.text)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
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
        <h1>Dice Caller</h1>
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
          <div className="grid">
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
                onClick={() =>
                  setActiveToggles((a) => (a.includes(t.name) ? a.filter((n) => n !== t.name) : [...a, t.name]))
                }
              >
                {toggleLabel(t)}
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
              Hit points: minus 5 takes 5 (temporary hit points go first), plus 7 heals 7, temp 8 sets temporary hit
              points, hp reads them, undo reverses the last change, long rest resets. Death saves keep their own
              count.
            </li>
            <li>
              Questions start with a slash: /ac, /passive, /skills, /saves, /attacks, /hp, /status, or a name such as
              /stealth or /str.
            </li>
            <li>Short forms work: perc, soh, init, hist. If it is ambiguous you are told, never guessed.</li>
            <li>Add adv or dis for advantage or disadvantage. Add +2 or +1d4 for a bonus such as Guidance.</li>
            <li>
              Toggles such as Rage or a shield: press the button to keep it on, type rage to switch it, or add it to
              one roll: flail rage. Equipped items start on.
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
    </>
  )
}
