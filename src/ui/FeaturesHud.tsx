import { useEffect, useRef, useState } from 'react'
import {
  FEATURE_SECTIONS,
  FEATURE_SECTION_NAMES,
  type Character,
  type DerivedFeature,
  type DerivedToggle,
  type RestKind,
} from '../engine/character'
import type { BatchOp } from '../engine/commands'
import { formatDiceExpr } from '../engine/dice'
import { describeToggleEffects, featureSections, hitDiceLeft, usesLeft, type FeatureEntry } from '../engine/readouts'

interface Props {
  open: boolean
  character: Character
  activeToggles: string[]
  /** Uses left of each limited feature, by name. */
  uses: Record<string, number>
  /** Hit dice left; null means full. */
  hitDice: number | null
  onCancel: () => void
  onApply: (ops: BatchOp[]) => void
}

interface Selection {
  /** The state each toggle will have after Done, by name. */
  toggles: Record<string, boolean>
  /** Features to spend a use of on Done. */
  spends: string[]
  hitDie: boolean
  rest: RestKind | null
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')
const restLabel = (kind: RestKind): string => (kind === 'long rest' ? 'Long rest' : 'Short rest')

/**
 * The Feats and abilities HUD: the same shape as the inventory. One h3 per
 * section, one button per feature. Toggle buttons show the state after Done;
 * limited features and the hit die are spent on Done; plain buttons read a
 * description. The Rest section takes a short or long rest on Done.
 */
export function FeaturesHud({ open, character, activeToggles, uses, hitDice, onCancel, onApply }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const applying = useRef(false)
  const [sel, setSel] = useState<Selection>({ toggles: {}, spends: [], hitDie: false, rest: null })
  const [note, setNote] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      const toggles: Record<string, boolean> = {}
      for (const t of character.toggles) toggles[t.name] = activeToggles.includes(t.name)
      setSel({ toggles, spends: [], hitDie: false, rest: null })
      setNote('')
      applying.current = false
      d.showModal()
      d.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open, character, activeToggles])

  const sections = featureSections(character)
  const shown = FEATURE_SECTIONS.filter((s) => s !== 'other' || sections.other.length > 0)
  const diceLeft = hitDiceLeft(character, hitDice)
  const map = [...shown.map((s) => FEATURE_SECTION_NAMES[s]), 'Rest'].join(', ')

  function pickToggle(t: DerivedToggle, f: DerivedFeature | null) {
    const on = !sel.toggles[t.name]
    if (on && f?.uses && usesLeft(f, uses) <= 0) {
      setNote(`No uses of ${f.name} left until a ${f.uses.per}.`)
      return
    }
    setSel((s) => ({ ...s, toggles: { ...s.toggles, [t.name]: on } }))
    setNote(`${f?.name ?? t.name} will be ${on ? 'on' : 'off'} after Done.`)
  }

  function pickSpend(f: DerivedFeature) {
    const using = sel.spends.includes(f.name)
    if (!using && f.uses && usesLeft(f, uses) <= 0) {
      setNote(`No uses of ${f.name} left until a ${f.uses.per}.`)
      return
    }
    setSel((s) => ({ ...s, spends: using ? s.spends.filter((n) => n !== f.name) : [...s.spends, f.name] }))
    setNote(using ? `${f.name} deselected.` : `${f.name} will be used on Done.`)
  }

  function pickHitDie() {
    if (!sel.hitDie && diceLeft <= 0) {
      setNote('No hit dice left until a long rest.')
      return
    }
    setSel((s) => ({ ...s, hitDie: !s.hitDie }))
    setNote(sel.hitDie ? 'Hit die deselected.' : 'A hit die will be spent on Done.')
  }

  function pickRest(kind: RestKind) {
    if (sel.rest === kind) {
      setSel((s) => ({ ...s, rest: null }))
      setNote(`${restLabel(kind)} deselected.`)
      return
    }
    const was = sel.rest
    setSel((s) => ({ ...s, rest: kind }))
    setNote(was ? `${restLabel(kind)} selected, replacing ${restLabel(was)}.` : `${restLabel(kind)} selected.`)
  }

  function done() {
    const ops: BatchOp[] = []
    if (sel.rest) ops.push({ op: 'rest', rest: sel.rest })
    if (sel.hitDie) ops.push({ op: 'hit-die' })
    for (const t of character.toggles) {
      const was = activeToggles.includes(t.name)
      const on = sel.toggles[t.name] ?? was
      if (on !== was) ops.push({ op: 'toggle', name: t.name, on })
    }
    for (const name of sel.spends) ops.push({ op: 'use', name })
    applying.current = true
    onApply(ops)
  }

  function renderEntry(e: FeatureEntry) {
    if (!e.feature) {
      const t = e.toggle
      const effects = describeToggleEffects(t)
      const label = `${t.name}${effects ? `, ${effects}` : ''}${activeToggles.includes(t.name) ? ', on' : ''}`
      return (
        <button key={t.name} type="button" aria-pressed={!!sel.toggles[t.name]} onClick={() => pickToggle(t, null)}>
          {label}
        </button>
      )
    }
    const f = e.feature
    const left = f.uses ? `, ${usesLeft(f, uses)} of ${f.uses.max} uses` : ''
    const descId = f.description ? `hud-fdesc-${slug(f.name)}` : undefined
    const desc = f.description ? (
      <span id={descId} className="sr-only">
        {f.description}
      </span>
    ) : null
    if (e.toggle) {
      const t = e.toggle
      const effects = describeToggleEffects(t)
      const label = `${f.name}${left}${effects ? `, ${effects}` : ''}${activeToggles.includes(t.name) ? ', on' : ''}`
      return (
        <span key={f.name}>
          <button type="button" aria-pressed={!!sel.toggles[t.name]} aria-describedby={descId} onClick={() => pickToggle(t, f)}>
            {label}
          </button>
          {desc}
        </span>
      )
    }
    if (f.uses) {
      const label = `${f.name}${left}${f.heal ? `, heals ${formatDiceExpr(f.heal)}` : ''}`
      return (
        <span key={f.name}>
          <button type="button" aria-pressed={sel.spends.includes(f.name)} aria-describedby={descId} onClick={() => pickSpend(f)}>
            {label}
          </button>
          {desc}
        </span>
      )
    }
    return (
      <span key={f.name}>
        <button type="button" aria-describedby={descId} onClick={() => setNote(f.description ?? `${f.name}. No description.`)}>
          {f.name}
        </button>
        {desc}
      </span>
    )
  }

  return (
    <dialog
      ref={dialogRef}
      className="hud"
      tabIndex={-1}
      aria-labelledby="hud-abilities-h"
      aria-describedby="hud-abilities-d"
      onClose={() => {
        if (!applying.current) onCancel()
      }}
    >
      <h2 id="hud-abilities-h">Feats and abilities</h2>
      <p id="hud-abilities-d" className="muted">
        {map}. H moves between sections, B between items, Enter selects, then Done applies everything. Escape cancels.
      </p>

      {shown.map((s) => (
        <section key={s} aria-labelledby={`hud-${s}-h`}>
          <h3 id={`hud-${s}-h`}>{FEATURE_SECTION_NAMES[s]}</h3>
          {sections[s].length === 0 && <p className="muted">None.</p>}
          <div className="grid">{sections[s].map(renderEntry)}</div>
        </section>
      ))}

      <section aria-labelledby="hud-rest-h">
        <h3 id="hud-rest-h">Rest</h3>
        <div className="grid">
          {character.hitDice && (
            <button type="button" aria-pressed={sel.hitDie} onClick={pickHitDie}>
              {`Hit die, ${diceLeft} of ${character.hitDice.count} left, d${character.hitDice.sides}`}
            </button>
          )}
          <button type="button" aria-pressed={sel.rest === 'short rest'} onClick={() => pickRest('short rest')}>
            Short rest
          </button>
          <button type="button" aria-pressed={sel.rest === 'long rest'} onClick={() => pickRest('long rest')}>
            Long rest
          </button>
        </div>
      </section>

      <p role="status" className="muted">
        {note}
      </p>
      <div className="grid">
        <button type="button" className="primary" onClick={done}>
          Done
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
