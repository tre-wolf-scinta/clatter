// The Clatter bridge: relays a roll from the Clatter tab to the open Roll20 game
// tab. No state, no storage, no network. Chrome starts this worker when a
// message arrives and stops it again when it is idle.
const ROLL20_TABS = ['https://app.roll20.net/editor/*']

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'roll' || typeof message.text !== 'string') return false
  relay(message.text).then(sendResponse)
  return true // sendResponse is called once relay finishes
})

async function relay(text) {
  const tabs = await chrome.tabs.query({ url: ROLL20_TABS })
  if (!tabs.length) return { ok: false, reason: 'no-roll20' }
  // The game tab that is active, else the one used most recently.
  const tab = tabs.find((t) => t.active) ?? [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
  try {
    const reply = await chrome.tabs.sendMessage(tab.id, { type: 'roll', text })
    return reply ?? { ok: false, reason: 'no-reply' }
  } catch {
    // No content script answered: the game is still loading, or the tab predates this extension.
    return { ok: false, reason: 'no-chat' }
  }
}
