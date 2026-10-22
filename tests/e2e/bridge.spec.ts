import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, expect, test as base, type BrowserContext } from '@playwright/test'

// The bridge, end to end, with the real extension loaded into Chromium and a
// stand-in for Roll20's chat served at a localhost address the test copy of the
// extension treats as a game tab. Only the markup the extension touches is
// mimicked: the textarea inside #textchat-input, #chatSendBtn, and the log.
const PORT = 5174
const CLATTER = `http://localhost:${PORT}/`
const FAKE_ROLL20 = `http://localhost:${PORT}/fake-roll20/editor/`
const FAKE_PATTERN = `http://localhost:${PORT}/fake-roll20/*`
const EXTENSION = fileURLToPath(new URL('../../extension/', import.meta.url))

const FAKE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Roll20</title></head><body>
<div id="textchat"><div class="content"></div></div>
<div id="textchat-input"><textarea aria-label="chat"></textarea><button id="chatSendBtn" type="button">Send</button></div>
<script>
document.getElementById('chatSendBtn').addEventListener('click', () => {
  const box = document.querySelector('#textchat-input textarea')
  const message = document.createElement('div')
  message.className = 'message general you'
  message.textContent = box.value
  document.querySelector('#textchat .content').appendChild(message)
  box.value = ''
})
</script></body></html>`

/** A copy of the extension that also treats the fake page as a Roll20 game tab. */
function testExtension(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'clatter-bridge-'))
  const manifest = JSON.parse(readFileSync(path.join(EXTENSION, 'manifest.json'), 'utf8')) as {
    content_scripts: { matches: string[] }[]
    host_permissions: string[]
  }
  manifest.content_scripts[1].matches.push(FAKE_PATTERN)
  manifest.host_permissions.push(FAKE_PATTERN)
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  for (const file of ['background.js', 'clatter.js', 'roll20.js']) {
    const source = readFileSync(path.join(EXTENSION, file), 'utf8')
    writeFileSync(path.join(dir, file), source.replace(`'https://app.roll20.net/editor/*'`, `'https://app.roll20.net/editor/*', '${FAKE_PATTERN}'`))
  }
  return dir
}

const test = base.extend<{ context: BrowserContext }>({
  // Extensions need a persistent context and the full Chromium (the headless shell
  // cannot load them); the chromium channel runs it headless. Where that browser
  // cannot start at all, the test is skipped with the reason, and CI is the gate.
  context: async ({}, use) => {
    const dir = testExtension()
    let context: BrowserContext
    try {
      context = await chromium.launchPersistentContext('', {
        channel: 'chromium',
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
      })
    } catch (err) {
      const message = (err as Error).message.split('\n')[0]
      test.skip(/spawn|side-by-side|executable doesn't exist/i.test(message), `the full Chromium could not start here: ${message}`)
      throw err
    }
    await context.route(`${FAKE_ROLL20}**`, (route) => route.fulfill({ contentType: 'text/html', body: FAKE_PAGE }))
    await use(context)
    await context.close()
  },
})

test('a roll in Clatter lands in the Roll20 chat as a card, and the setting turns it off', async ({ context }) => {
  const roll20 = await context.newPage()
  await roll20.goto(FAKE_ROLL20)
  const clatter = await context.newPage()
  await clatter.goto(CLATTER)
  const result = clatter.getByRole('region', { name: 'Result' })
  await expect(result).toContainText('Roll20 bridge connected.')
  await expect(clatter.getByText('Roll20 bridge: connected.')).toBeVisible()
  const box = clatter.getByRole('textbox', { name: 'What are you rolling?' })
  await box.fill('stealth')
  await box.press('Enter')
  await expect(result).toContainText(/Stealth check: \d+\./)
  const messages = roll20.locator('#textchat .content .message')
  await expect(messages).toHaveCount(1)
  await expect(messages.first()).toHaveText(
    /^&\{template:default\} \{\{name=Thalia Brightwood: Stealth check\}\} \{\{Total=\d+\}\} \{\{Rolled=an? \d+ plus 10 from modifiers\}\}$/,
  )
  await box.fill('charm person')
  await box.press('Enter')
  await expect(messages).toHaveCount(2)
  await expect(messages.nth(1)).toHaveText('&{template:default} {{name=Thalia Brightwood: Charm Person}} {{Total=Wisdom save DC 12}} {{Rolled=Level 1 slots: 2 of 3 left}}')
  await box.fill('-3')
  await box.press('Enter')
  await expect(result).toContainText('Took 3.')
  await expect(messages).toHaveCount(2)
  await clatter.getByRole('checkbox', { name: 'Send each result to Roll20 through the Clatter bridge extension' }).uncheck()
  await box.fill('athletics')
  await box.press('Enter')
  await expect(result).toContainText(/Athletics check: \d+\./)
  await expect(messages).toHaveCount(2)
})

test('without a Roll20 tab, Clatter says so once, after the roll has been heard', async ({ context }) => {
  const clatter = await context.newPage()
  await clatter.goto(CLATTER)
  const result = clatter.getByRole('region', { name: 'Result' })
  await expect(result).toContainText('Roll20 bridge connected.')
  const box = clatter.getByRole('textbox', { name: 'What are you rolling?' })
  await box.fill('stealth')
  await box.press('Enter')
  await expect(result).toContainText(/Stealth check: \d+\./)
  await expect(result).toContainText('No Roll20 game tab is open, so that stayed here.', { timeout: 10_000 })
})
