// Runs on a Roll20 game page. Types the card into the chat box and presses
// send, the way a player would and the way Beyond20 does. Checked against the
// live tabletop on 2026-10-22: the box is the textarea inside #textchat-input,
// the button is #chatSendBtn, and Roll20 clears the box itself after sending.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'roll' || typeof message.text !== 'string') return false
  const box = document.querySelector('#textchat-input textarea')
  const send = document.querySelector('#chatSendBtn')
  if (!box || !send) {
    sendResponse({ ok: false, reason: 'no-chat' })
    return false
  }
  const draft = box.value
  box.value = message.text
  box.dispatchEvent(new Event('input', { bubbles: true }))
  send.click()
  // Give back whatever the player was in the middle of typing.
  if (draft) box.value = draft
  sendResponse({ ok: true })
  return false
})
