import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

// Every locator is role + accessible name. If NVDA cannot reach it, neither can these tests.
const rollBox = (page: Page) => page.getByRole('textbox', { name: 'What are you rolling?' })
const result = (page: Page) => page.getByRole('region', { name: 'Result' })

async function expectNoAxeViolations(page: Page, when: string) {
  const { violations } = await new AxeBuilder({ page }).analyze()
  expect(violations, `${when}: ${JSON.stringify(violations, null, 2)}`).toEqual([])
}

async function type(page: Page, command: string) {
  await rollBox(page).fill(command)
  await rollBox(page).press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('roll box is focused on load; a typed skill rolls, announces, and keeps focus', async ({ page }) => {
  const box = rollBox(page)
  await expect(box).toBeFocused()
  await type(page, 'stealth')
  await expect(result(page)).toContainText(/Stealth check: \d+\. You rolled an? \d+ plus 10 from modifiers\./)
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
})

test('advantage and bonus dice are spoken', async ({ page }) => {
  await type(page, 'stealth adv +1d4')
  await expect(result(page)).toContainText(
    /Stealth check with advantage: \d+\. You rolled an? \d+ and an? \d+, kept the \d+, plus 10 from modifiers, plus \d from a d4\./,
  )
})

test('ambiguous input is reported, not guessed', async ({ page }) => {
  await type(page, 'per')
  await expect(result(page)).toContainText('Ambiguous: Perception, Performance, or Persuasion. Type more letters.')
})

test('attacks are two rolls: to hit, then damage', async ({ page }) => {
  await type(page, 'rapier')
  await expect(result(page)).toContainText(/Rapier: \d+ to hit\. You rolled an? \d+ plus 7 from modifiers\./)
  await type(page, 'dmg')
  await expect(result(page)).toContainText(/Rapier: \d+ piercing damage\. You rolled an? \d+ plus 4 from modifiers\./)
})

test('buttons are named with their modifier and roll from the keyboard', async ({ page }) => {
  const button = page.getByRole('button', { name: 'Dexterity save +7' })
  await button.focus()
  await button.press('Enter')
  await expect(result(page)).toContainText(/Dexterity save: \d+\./)
  await button.press('Shift+Enter')
  await expect(result(page)).toContainText(/Dexterity save with advantage: \d+\./)
  const damage = page.getByRole('button', { name: 'Rapier damage 1d8+4 piercing' })
  await damage.focus()
  await damage.press('Enter')
  await expect(result(page)).toContainText(/Rapier: \d+ piercing damage\./)
})

test('sticky advantage toggle applies to typed rolls', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Advantage', exact: true })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await type(page, 'perception')
  await expect(result(page)).toContainText(/Perception check with advantage/)
})

test('history lists rolls newest first; empty Enter rolls again; last repeats without rolling', async ({ page }) => {
  await type(page, 'stealth')
  await expect(result(page)).toContainText(/Stealth check/)
  await type(page, 'athletics')
  await expect(result(page)).toContainText(/Athletics check/)
  const items = page.getByRole('region', { name: 'Roll history' }).getByRole('listitem')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText(/Athletics check/)
  await expect(items.nth(1)).toContainText(/Stealth check/)
  await rollBox(page).press('Enter')
  await expect(items).toHaveCount(3)
  await expect(items.first()).toContainText(/Athletics check/)
  const latest = (await items.first().textContent()) ?? ''
  await type(page, 'last')
  await expect(result(page)).toContainText(latest)
  await expect(items).toHaveCount(3)
})

test('slash returns focus to the roll box', async ({ page }) => {
  await page.getByRole('heading', { name: 'Skills' }).click()
  await expect(rollBox(page)).not.toBeFocused()
  await page.keyboard.press('/')
  await expect(rollBox(page)).toBeFocused()
})

test('character dialog: focus lands in the JSON box, errors are alerts, loading updates the page', async ({
  page,
}) => {
  const opener = page.getByRole('button', { name: 'Load or edit character' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Character' })
  await expect(dialog).toBeVisible()
  const json = dialog.getByRole('textbox', { name: 'Character JSON' })
  await expect(json).toBeFocused()
  await expect(dialog.getByText('Browse for a character file')).toBeVisible()
  await expectNoAxeViolations(page, 'dialog open')
  await json.fill('not json')
  await dialog.getByRole('button', { name: 'Load' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not valid JSON')
  await json.fill(
    JSON.stringify({
      name: 'Test Hero',
      level: 3,
      abilities: { str: 16, dex: 14 },
      proficiencies: { skills: ['stealth'] },
      attacks: [{ name: 'Club', damage: '1d4' }],
      toggles: [{ name: 'Rage', damageBonus: 2 }],
    }),
  )
  await dialog.getByRole('button', { name: 'Load' }).click()
  await expect(dialog).toBeHidden()
  await expect(result(page)).toContainText('Loaded Test Hero, level 3.')
  await expect(page.getByRole('button', { name: 'Stealth +4' })).toBeVisible()
  await expect(opener).toBeFocused()
})

test('a ?character= link loads that file on arrival and it sticks', async ({ page }) => {
  await page.goto('/?character=characters/persi-obsidian.json')
  await expect(result(page)).toContainText('Loaded Persi Obsidian, level 5.')
  await expect(page.getByRole('button', { name: 'Flail +7 to hit' })).toBeVisible()
  await expect(rollBox(page)).toBeFocused()
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Flail +7 to hit' })).toBeVisible()
  await page.goto('/?character=characters/nobody.json')
  await expect(result(page)).toContainText(
    'Could not load the character from the link: that address did not return a character file.',
  )
})

test('character toggles are pressable buttons and typed words', async ({ page }) => {
  await page.getByRole('button', { name: 'Load or edit character' }).click()
  const dialog = page.getByRole('dialog', { name: 'Character' })
  await dialog
    .getByRole('textbox', { name: 'Character JSON' })
    .fill(
      JSON.stringify({
        name: 'Test Hero',
        level: 5,
        abilities: { str: 18 },
        attacks: [{ name: 'Club', damage: '1d4', damageType: 'bludgeoning' }],
        toggles: [{ name: 'Rage', damageBonus: 2 }],
      }),
    )
  await dialog.getByRole('button', { name: 'Load' }).click()
  await expect(dialog).toBeHidden()
  const rage = page.getByRole('button', { name: 'Rage +2 damage' })
  await expect(rage).toHaveAttribute('aria-pressed', 'false')
  await expectNoAxeViolations(page, 'character with toggles loaded')
  await type(page, 'club rage')
  await expect(result(page)).toContainText(/Club with Rage: \d+ to hit\./)
  await type(page, 'club rage dmg')
  await expect(result(page)).toContainText(/Club with Rage: \d+ bludgeoning damage\. You rolled .*, plus 2 from Rage\./)
  await expect(rage).toHaveAttribute('aria-pressed', 'false')
  await type(page, 'rage')
  await expect(result(page)).toContainText('Rage on.')
  await expect(rage).toHaveAttribute('aria-pressed', 'true')
  await type(page, 'club')
  await expect(result(page)).toContainText(/Club with Rage: \d+ to hit\./)
  await rage.click()
  await expect(rage).toHaveAttribute('aria-pressed', 'false')
  await type(page, 'club')
  await expect(result(page)).toContainText(/Club: \d+ to hit\./)
})

test('no axe violations on the initial page', async ({ page }) => {
  await expectNoAxeViolations(page, 'initial page')
})

test('headings and landmarks give NVDA a map of the page', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Roll',
    'Result',
    'Ability checks',
    'Saving throws',
    'Skills',
    'Attacks',
    'Other rolls',
    'Roll history',
    'Character',
    'Settings',
    'Help',
  ])
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
})
