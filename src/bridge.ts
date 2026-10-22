/**
 * The Roll20 bridge. Clatter posts each shareable result to its own window as
 * a chat message in Roll20's template syntax; the Clatter bridge extension
 * (extension/) relays it to the open Roll20 game tab, where it becomes a card.
 * Without the extension nothing listens and nothing happens.
 */

export const BRIDGE_VERSION = 1

/** What Clatter posts: a message ready for Roll20's chat box. */
export interface BridgeRollMessage {
  clatter: 'roll'
  version: number
  text: string
}

/** Clatter asks on load whether the extension is there; the extension answers "present". */
export interface BridgeHello {
  clatter: 'hello'
}

/** What the extension posts back into the page. */
export interface BridgeReply {
  clatter: 'bridge'
  state: 'present' | 'sent' | 'failed'
  version?: number
  /** For a failure: no-roll20 (no game tab open), no-chat (the game page has no chat box yet), or an error. */
  reason?: string
}

export const isBridgeReply = (data: unknown): data is BridgeReply =>
  typeof data === 'object' && data !== null && (data as { clatter?: unknown }).clatter === 'bridge'

/** Braces and pipes are Roll20 template syntax; they come out as spaces. */
const clean = (s: string): string => s.replace(/[{}|]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The card mirrors what the player heard. The first sentence splits at its
 * colon into the card's name and its Total; the remaining sentences are the
 * Rolled line, with "You rolled" dropped because someone else reads the card.
 * "Natural 20! Stealth check: 30. You rolled a 20 plus 10 from modifiers." becomes
 * name "Persi: Natural 20! Stealth check", Total "30", Rolled "a 20 plus 10 from modifiers".
 */
export function roll20Message(character: string, announcement: string): string {
  const text = announcement.trim()
  const end = text.indexOf('. ')
  const first = (end === -1 ? text : text.slice(0, end)).replace(/\.$/, '')
  const rest = (end === -1 ? '' : text.slice(end + 2)).replace(/^You rolled /, '').replace(/\.$/, '').trim()
  const colon = first.indexOf(': ')
  const name = colon === -1 ? first : first.slice(0, colon)
  const total = colon === -1 ? '' : first.slice(colon + 2)
  const fields = [`{{name=${clean(`${character}: ${name}`)}}}`]
  if (total) fields.push(`{{Total=${clean(total)}}}`)
  if (rest) fields.push(`{{Rolled=${clean(rest)}}}`)
  return `&{template:default} ${fields.join(' ')}`
}
