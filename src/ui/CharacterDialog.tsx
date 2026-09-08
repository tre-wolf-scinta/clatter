import { useEffect, useRef, useState, type ChangeEvent } from 'react'

interface Props {
  open: boolean
  initialText: string
  onClose: () => void
  /** Returns an error message to show, or null on success. */
  onLoad: (text: string) => string | null
}

/** Native dialog: the browser traps focus, handles Escape, and returns focus to the opener. */
export function CharacterDialog({ open, initialText, onClose, onLoad }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [text, setText] = useState(initialText)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setText(initialText)
      setError('')
      setNotice('')
      d.showModal()
      textRef.current?.focus()
    } else if (!open && d.open) {
      d.close()
    }
  }, [open, initialText])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setText(await file.text())
    setError('')
    setNotice(`Read ${file.name} into the text box. Press Load to use it.`)
  }

  function load() {
    const err = onLoad(text)
    setError(err ?? '')
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setNotice('Copied to the clipboard.')
    } catch {
      setNotice('Could not copy automatically. Select the text box and copy it yourself.')
    }
  }

  return (
    <dialog ref={dialogRef} aria-labelledby="char-dialog-h" onClose={onClose}>
      <h2 id="char-dialog-h">Character</h2>
      <p>Paste character JSON below, or browse for a file, then press Load. The README describes the format.</p>
      <div className="field">
        <label htmlFor="char-text">Character JSON</label>
        <textarea id="char-text" ref={textRef} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </div>
      <div className="field">
        <label htmlFor="char-file">Browse for a character file</label>
        <input id="char-file" type="file" accept=".json,application/json" onChange={onFile} />
      </div>
      <p role="alert" className="error">
        {error}
      </p>
      <p role="status" className="muted">
        {notice}
      </p>
      <div className="grid">
        <button type="button" className="primary" onClick={load}>
          Load
        </button>
        <button type="button" onClick={copy}>
          Copy JSON
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
