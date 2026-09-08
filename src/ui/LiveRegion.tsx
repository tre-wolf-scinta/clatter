import { useEffect, useRef } from 'react'

interface Props {
  text: string
  /** Bump to re-announce even when the text has not changed. */
  nonce: number
  assertive: boolean
}

/**
 * The one live region. It stays mounted for the life of the page and is
 * updated imperatively: cleared, then filled a moment later, so screen
 * readers announce every roll even when two results are word-for-word identical.
 * React never renders children into it, so the imperative text is never overwritten.
 */
export function LiveRegion({ text, nonce, assertive }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || nonce === 0) return
    el.textContent = ''
    const timer = setTimeout(() => {
      el.textContent = text
    }, 50)
    return () => clearTimeout(timer)
  }, [text, nonce])
  return <div ref={ref} className="result" aria-live={assertive ? 'assertive' : 'polite'} aria-atomic="true" />
}
