// Runs on the Clatter page. Clatter posts each roll to its own window; this
// script hands it to the extension and posts back what happened. It reads
// nothing else on the page.
const VERSION = 1

function reply(state, extra = {}) {
  window.postMessage({ clatter: 'bridge', state, version: VERSION, ...extra }, location.origin)
}

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== location.origin) return
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.clatter === 'hello') reply('present')
  if (data.clatter !== 'roll' || typeof data.text !== 'string') return
  try {
    chrome.runtime.sendMessage({ type: 'roll', text: data.text }).then(
      (result) => reply(result && result.ok ? 'sent' : 'failed', { reason: (result && result.reason) || 'no-reply' }),
      (error) => reply('failed', { reason: String(error) }),
    )
  } catch (error) {
    // The extension was reloaded under this page; a page reload reconnects it.
    reply('failed', { reason: String(error) })
  }
})

reply('present')
