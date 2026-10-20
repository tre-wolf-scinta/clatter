import { useEffect, useRef, useState } from 'react'
import type { Character, DerivedSpell } from '../engine/character'
import { NO_SPELLS, describeSpellStats, pactLeft, spellLevelHeading, spellLevels, spellUsesLeft } from '../engine/readouts'

interface Props {
  open: boolean
  character: Character
  /** Spell slots spent at each level. */
  slotsUsed: Record<number, number>
  pactUsed: number
  concentration: string | null
  /** Uses left, for spells with free castings. */
  uses: Record<string, number>
  onCancel: () => void
  /** Casts the spell at that index of the character's spells and closes the screen. */
  onCast: (index: number) => void
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The Spells HUD: the same shape as the other screens, one h3 per spell level
 * with the slots in the heading and one button per spell. This screen acts on
 * press: Enter on a spell casts it, pays for it, announces the result, and
 * closes, because a cast is one roll, not a selection to stage. Escape cancels.
 */
export function SpellsHud({ open, character, slotsUsed, pactUsed, concentration, uses, onCancel, onCast }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const applying = useRef(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setNote('')
      applying.current = false
      d.showModal()
      d.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open])

  const levels = spellLevels(character)
  const pact = character.spellcasting?.pact
  const headings = levels.map((l) => spellLevelHeading(character, slotsUsed, l))
  const map = [
    headings.length ? `${headings.join(', ')}.` : NO_SPELLS,
    pact ? `Pact slots: ${pactLeft(character, pactUsed)} of ${pact.count} at level ${pact.level}.` : '',
    concentration ? `Concentrating on ${concentration}.` : '',
    headings.length ? 'B moves between spells, Enter casts one and closes. Escape cancels.' : 'Escape closes.',
  ]
    .filter(Boolean)
    .join(' ')

  function cast(s: DerivedSpell) {
    if (!s.prepared) {
      setNote(`${s.name} is not prepared.${s.description ? ` ${s.description}` : ''}`)
      return
    }
    applying.current = true
    onCast(character.spells.indexOf(s))
  }

  function label(s: DerivedSpell): string {
    const stats = describeSpellStats(s, character)
    let t = s.name
    if (stats) t += `, ${stats}`
    if (s.uses) t += `, ${spellUsesLeft(s, uses)} of ${s.uses.max} free castings`
    if (s.concentration) t += ', concentration'
    if (!s.prepared) t += ', not prepared'
    if (concentration === s.name) t += ', concentrating'
    return t
  }

  return (
    <dialog
      ref={dialogRef}
      className="hud"
      tabIndex={-1}
      aria-labelledby="hud-spells-h"
      aria-describedby="hud-spells-d"
      onClose={() => {
        if (!applying.current) onCancel()
      }}
    >
      <h2 id="hud-spells-h">Spells</h2>
      <p id="hud-spells-d" className="muted">
        {map}
      </p>

      {levels.map((level) => (
        <section key={level} aria-labelledby={`hud-spell-level-${level}-h`}>
          <h3 id={`hud-spell-level-${level}-h`}>{spellLevelHeading(character, slotsUsed, level)}</h3>
          {character.spells.every((s) => s.level !== level) && <p className="muted">None.</p>}
          <div className="grid">
            {character.spells
              .filter((s) => s.level === level)
              .map((s) => {
                const descId = s.description ? `hud-sdesc-${slug(s.name)}` : undefined
                return (
                  <span key={s.name}>
                    <button type="button" aria-describedby={descId} onClick={() => cast(s)}>
                      {label(s)}
                    </button>
                    {s.description && (
                      <span id={descId} className="sr-only">
                        {s.description}
                      </span>
                    )}
                  </span>
                )
              })}
          </div>
        </section>
      ))}

      <p role="status" className="muted">
        {note}
      </p>
      <div className="grid">
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
