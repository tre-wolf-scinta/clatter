import { useEffect, useRef, useState } from 'react'
import type { Character, DerivedItem } from '../engine/character'
import type { BatchOp } from '../engine/commands'
import { describeAttackStats, plusWord } from '../engine/readouts'

interface Props {
  open: boolean
  character: Character
  inHand: string | null
  wearing: string | null
  activeToggles: string[]
  /** What is left of each consumable, by name. */
  items: Record<string, number>
  onCancel: () => void
  onApply: (ops: BatchOp[]) => void
}

interface Selection {
  /** Attack name to have in hand after Done; null for empty-handed. */
  weapon: string | null
  /** Armor item to wear after Done; null for unarmored. */
  armor: string | null
  /** Target state of each shield or worn armor-class item, by toggle name. */
  gear: Record<string, boolean>
  /** Consumables to use one of on Done. */
  uses: string[]
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

/**
 * The inventory HUD: a native modal dialog with one h3 per section and one
 * button per item, so H and B walk it. Toggle buttons show the state each
 * item will have after Done; plain buttons read a description. Nothing
 * changes until Done.
 */
export function InventoryHud({ open, character, inHand, wearing, activeToggles, items, onCancel, onApply }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const applying = useRef(false)
  const [sel, setSel] = useState<Selection>({ weapon: null, armor: null, gear: {}, uses: [] })
  const [note, setNote] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      const gear: Record<string, boolean> = {}
      for (const i of character.items) if (i.kind !== 'armor' && i.acBonus !== 0) gear[i.name] = activeToggles.includes(i.name)
      setSel({ weapon: inHand, armor: wearing, gear, uses: [] })
      setNote('')
      applying.current = false
      d.showModal()
      d.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open, character, inHand, wearing, activeToggles])

  const weaponItems = character.items.filter((i) => i.kind === 'weapon')
  const weapons: { name: string; attack: string; item: DerivedItem | null }[] = weaponItems.length
    ? weaponItems.map((i) => ({ name: i.name, attack: i.attack ?? i.name, item: i }))
    : character.attacks.map((a) => ({ name: a.name, attack: a.name, item: null }))
  const armors = character.items.filter((i) => i.kind === 'armor')
  const shields = character.items.filter((i) => i.kind !== 'armor' && i.kind !== 'weapon' && i.acBonus !== 0)
  const potions = character.items.filter((i) => i.kind === 'potion')
  const utility = character.items.filter((i) => i.kind === 'utility' && i.acBonus === 0)
  const quest = character.items.filter((i) => i.kind === 'quest')
  const left = (i: DerivedItem) => items[i.name] ?? i.count

  function pickWeapon(attack: string, label: string) {
    setSel((s) => {
      if (s.weapon === attack) {
        setNote(`${label} deselected. Nothing in hand after Done.`)
        return { ...s, weapon: null }
      }
      const was = s.weapon
      setNote(was && was !== attack ? `${label} selected, replacing ${was}.` : `${label} selected.`)
      return { ...s, weapon: attack }
    })
  }

  function pickArmor(name: string) {
    setSel((s) => {
      if (s.armor === name) {
        setNote(`${name} deselected. No armor after Done.`)
        return { ...s, armor: null }
      }
      const was = s.armor
      setNote(was && was !== name ? `${name} selected, replacing ${was}.` : `${name} selected.`)
      return { ...s, armor: name }
    })
  }

  function pickGear(name: string) {
    setSel((s) => {
      const on = !s.gear[name]
      setNote(`${name} will be ${on ? 'on' : 'off'} after Done.`)
      return { ...s, gear: { ...s.gear, [name]: on } }
    })
  }

  function pickUse(name: string) {
    setSel((s) => {
      const using = s.uses.includes(name)
      setNote(using ? `${name} deselected.` : `${name} will be used on Done.`)
      return { ...s, uses: using ? s.uses.filter((n) => n !== name) : [...s.uses, name] }
    })
  }

  function done() {
    const ops: BatchOp[] = []
    if (sel.weapon !== inHand) ops.push({ op: 'wield', name: sel.weapon })
    if (sel.armor !== wearing) ops.push({ op: 'wear', name: sel.armor })
    for (const [name, on] of Object.entries(sel.gear)) {
      if (on !== activeToggles.includes(name)) ops.push({ op: 'toggle', name, on })
    }
    for (const name of sel.uses) ops.push({ op: 'use', name })
    applying.current = true
    onApply(ops)
  }

  function describe(i: DerivedItem | null, fallback: string) {
    setNote(i?.description ?? fallback)
  }

  const desc = (i: DerivedItem | null) =>
    i?.description ? (
      <span id={`hud-desc-${slug(i.name)}`} className="sr-only">
        {i.description}
      </span>
    ) : null
  const describedBy = (i: DerivedItem | null) => (i?.description ? `hud-desc-${slug(i.name)}` : undefined)

  return (
    <dialog
      ref={dialogRef}
      className="hud"
      tabIndex={-1}
      aria-labelledby="hud-inventory-h"
      aria-describedby="hud-inventory-d"
      onClose={() => {
        if (!applying.current) onCancel()
      }}
    >
      <h2 id="hud-inventory-h">Inventory</h2>
      <p id="hud-inventory-d" className="muted">
        Weapons, Armor and shields, Potions, Utility, Quest items. H moves between sections, B between items, Enter
        selects, then Done applies everything. Escape cancels.
      </p>

      <section aria-labelledby="hud-weapons-h">
        <h3 id="hud-weapons-h">Weapons</h3>
        {weapons.length === 0 && <p className="muted">None.</p>}
        <div className="grid">
          {weapons.map((w) => {
            const attack = character.attacks.find((a) => a.name === w.attack)
            const label = `${w.name}${attack ? `, ${describeAttackStats(attack)}` : ''}${inHand === w.attack ? ', in hand' : ''}`
            return (
              <span key={w.name}>
                <button
                  type="button"
                  aria-pressed={sel.weapon === w.attack}
                  aria-describedby={describedBy(w.item)}
                  onClick={() => pickWeapon(w.attack, w.name)}
                >
                  {label}
                </button>
                {desc(w.item)}
              </span>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="hud-armor-h">
        <h3 id="hud-armor-h">Armor and shields</h3>
        {armors.length + shields.length === 0 && <p className="muted">None.</p>}
        <div className="grid">
          {armors.map((i) => {
            const cap =
              i.dexCap === null ? ' plus Dexterity' : i.dexCap === 0 ? '' : ` plus Dexterity up to ${i.dexCap}`
            const label = `${i.name}, armor class ${i.baseAc}${cap}${wearing === i.name ? ', worn' : ''}`
            return (
              <span key={i.name}>
                <button type="button" aria-pressed={sel.armor === i.name} aria-describedby={describedBy(i)} onClick={() => pickArmor(i.name)}>
                  {label}
                </button>
                {desc(i)}
              </span>
            )
          })}
          {shields.map((i) => {
            const label = `${i.name}, ${plusWord(i.acBonus)} armor class${activeToggles.includes(i.name) ? ', on' : ''}`
            return (
              <span key={i.name}>
                <button type="button" aria-pressed={!!sel.gear[i.name]} aria-describedby={describedBy(i)} onClick={() => pickGear(i.name)}>
                  {label}
                </button>
                {desc(i)}
              </span>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="hud-potions-h">
        <h3 id="hud-potions-h">Potions</h3>
        {potions.length === 0 && <p className="muted">None.</p>}
        <div className="grid">
          {potions.map((i) => (
            <span key={i.name}>
              <button
                type="button"
                aria-pressed={sel.uses.includes(i.name)}
                aria-describedby={describedBy(i)}
                disabled={left(i) <= 0}
                onClick={() => pickUse(i.name)}
              >
                {`${i.name}, ${left(i)} left`}
              </button>
              {desc(i)}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="hud-utility-h">
        <h3 id="hud-utility-h">Utility</h3>
        {utility.length === 0 && <p className="muted">None.</p>}
        <div className="grid">
          {utility.map((i) =>
            i.consumable ? (
              <span key={i.name}>
                <button
                  type="button"
                  aria-pressed={sel.uses.includes(i.name)}
                  aria-describedby={describedBy(i)}
                  disabled={left(i) <= 0}
                  onClick={() => pickUse(i.name)}
                >
                  {`${i.name}, ${left(i)} left`}
                </button>
                {desc(i)}
              </span>
            ) : (
              <span key={i.name}>
                <button type="button" aria-describedby={describedBy(i)} onClick={() => describe(i, `${i.name}. No description.`)}>
                  {i.count > 1 ? `${i.name}, ${i.count}` : i.name}
                </button>
                {desc(i)}
              </span>
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="hud-quest-h">
        <h3 id="hud-quest-h">Quest items</h3>
        {quest.length === 0 && <p className="muted">None.</p>}
        <div className="grid">
          {quest.map((i) => (
            <span key={i.name}>
              <button type="button" aria-describedby={describedBy(i)} onClick={() => describe(i, `${i.name}. No description.`)}>
                {i.name}
              </button>
              {desc(i)}
            </span>
          ))}
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
