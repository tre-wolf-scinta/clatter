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
  await type(page, '/d')
  // A natural 20 on the to-hit makes this a critical by design, so accept either breakdown.
  await expect(result(page)).toContainText(/Rapier: \d+ piercing damage\. You rolled .*plus 4 from modifiers\./)
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

test('hit points: a bare signed number, slash questions, undo, and it survives a reload', async ({ page }) => {
  await page.goto('/?character=characters/persi-obsidian.json')
  await expect(result(page)).toContainText('Loaded Persi Obsidian, level 5.')
  await type(page, '-5')
  await expect(result(page)).toContainText('Took 5. 55 of 60 hit points.')
  await type(page, '/ac')
  await expect(result(page)).toContainText('Armor class 16: unarmored defense 10, Dexterity plus 2, Constitution plus 4.')
  await type(page, '/stealth')
  await expect(result(page)).toContainText('Stealth plus 5, proficient.')
  await type(page, '/status')
  await expect(result(page)).toContainText('55 of 60 hit points. No toggles on.')
  await page.goto('/')
  await type(page, 'hp')
  await expect(result(page)).toContainText('55 of 60 hit points.')
  await type(page, 'undo')
  await expect(result(page)).toContainText('Nothing to undo.')
  await type(page, '+5')
  await expect(result(page)).toContainText('Healed 5. 60 of 60 hit points.')
})

test('the skills list can be narrowed to proficient skills', async ({ page }) => {
  const box = page.getByRole('checkbox', { name: 'Show only proficient skills' })
  await expect(box).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Athletics +0' })).toBeVisible()
  await box.check()
  await expect(page.getByRole('button', { name: 'Athletics +0' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Stealth +10' })).toBeVisible()
  await expectNoAxeViolations(page, 'proficient skills only')
  await box.uncheck()
  await expect(page.getByRole('button', { name: 'Athletics +0' })).toBeVisible()
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

test('the weapon in hand, gear readout, and items', async ({ page }) => {
  // The sample rogue starts with her rapier equipped.
  await type(page, 'attack')
  await expect(result(page)).toContainText(/Rapier: \d+ to hit\. You rolled an? \d+ plus 7 from modifiers\./)
  await type(page, 'dmg')
  await expect(result(page)).toContainText(/Rapier: \d+ piercing damage\./)
  await type(page, 'wield dagger')
  await expect(result(page)).toContainText('Dagger in hand: plus 7 to hit, 1d4+4 piercing.')
  await type(page, '/a')
  await expect(result(page)).toContainText(/Dagger: \d+ to hit\./)
  await type(page, '/equipped')
  await expect(result(page)).toContainText(
    'Dagger in hand: plus 7 to hit, 1d4+4 piercing. Armor: Leather armor. Carrying Potion of Healing with 2 left and Torch with 5 left.',
  )
  await type(page, '-10')
  await expect(result(page)).toContainText('Took 10. 28 of 38 hit points.')
  await type(page, 'drink healing')
  await expect(result(page)).toContainText(/Drank a Potion of Healing: healed \d+\. \d+ of 38 hit points\. You rolled \d and \d, plus 2\. 1 left\./)
  const potion = page.getByRole('button', { name: 'Potion of Healing, 1 left' })
  await expect(potion).toBeVisible()
  await expectNoAxeViolations(page, 'items in play')
  await potion.click()
  await expect(result(page)).toContainText(/Used a Potion of Healing: healed \d+\..* 0 left\./)
  await expect(page.getByRole('button', { name: 'Potion of Healing, 0 left' })).toBeDisabled()
  await page.goto('/')
  await type(page, '/equipped')
  await expect(result(page)).toContainText(
    'Dagger in hand: plus 7 to hit, 1d4+4 piercing. Armor: Leather armor. Carrying Potion of Healing with 0 left and Torch with 5 left.',
  )
})

test('the inventory HUD: open by typing or shortcut, select with toggle buttons, apply with Done', async ({ page }) => {
  await type(page, '/i')
  const hud = page.getByRole('dialog', { name: 'Inventory' })
  await expect(hud).toBeVisible()
  await expect(hud).toBeFocused()
  await expect(hud.getByRole('heading', { level: 3 })).toHaveText([
    'Weapons',
    'Armor and shields',
    'Potions',
    'Utility',
    'Quest items',
  ])
  const rapier = hud.getByRole('button', { name: /^Rapier/ })
  const dagger = hud.getByRole('button', { name: /^Dagger/ })
  await expect(rapier).toHaveAttribute('aria-pressed', 'true')
  await expect(dagger).toHaveAttribute('aria-pressed', 'false')
  await dagger.click()
  await expect(dagger).toHaveAttribute('aria-pressed', 'true')
  await expect(rapier).toHaveAttribute('aria-pressed', 'false')
  await expect(hud.getByRole('status')).toContainText('Dagger selected, replacing Rapier.')
  await hud.getByRole('button', { name: 'Potion of Healing, 2 left' }).click()
  await hud.getByRole('button', { name: 'Letter from the Guildmaster' }).click()
  await expect(hud.getByRole('status')).toContainText('Sealed with black wax.')
  await expectNoAxeViolations(page, 'inventory open')
  await hud.getByRole('button', { name: 'Done' }).click()
  await expect(hud).toBeHidden()
  await expect(result(page)).toContainText(/Dagger in hand\. Used a Potion of Healing: healed \d+\. \d+ of 38 hit points\..* 1 left\./)
  await expect(rollBox(page)).toBeFocused()
  await page.keyboard.press('Alt+i')
  await expect(hud).toBeVisible()
  await hud.getByRole('button', { name: 'Cancel' }).click()
  await expect(hud).toBeHidden()
  await type(page, '/equipped')
  await expect(result(page)).toContainText(
    'Dagger in hand: plus 7 to hit, 1d4+4 piercing. Armor: Leather armor. Carrying Potion of Healing with 1 left and Torch with 5 left.',
  )
})

test('the feats and abilities HUD: sections, toggles with uses, the rest section, and Done', async ({ page }) => {
  await type(page, '/f')
  const hud = page.getByRole('dialog', { name: 'Feats and abilities' })
  await expect(hud).toBeVisible()
  await expect(hud).toBeFocused()
  await expect(hud.getByRole('heading', { level: 3 })).toHaveText(['Class features', 'Species traits', 'Feats', 'Rest'])
  const steady = hud.getByRole('button', { name: /^Steady Aim/ })
  await expect(steady).toHaveAttribute('aria-pressed', 'false')
  await steady.click()
  await expect(steady).toHaveAttribute('aria-pressed', 'true')
  await expect(hud.getByRole('status')).toContainText('Steady Aim will be on after Done.')
  await hud.getByRole('button', { name: 'Lucky, 3 of 3 uses' }).click()
  await expect(hud.getByRole('status')).toContainText('Lucky will be used on Done.')
  await hud.getByRole('button', { name: 'Cunning Action' }).click()
  await expect(hud.getByRole('status')).toContainText('bonus action to Dash, Disengage, or Hide')
  await expect(hud.getByRole('button', { name: 'Hit die, 5 of 5 left, d8' })).toBeVisible()
  await expectNoAxeViolations(page, 'feats and abilities open')
  await hud.getByRole('button', { name: 'Done' }).click()
  await expect(hud).toBeHidden()
  await expect(result(page)).toContainText('Steady Aim on. Used Lucky. 2 uses left.')
  await expect(rollBox(page)).toBeFocused()
  await type(page, 'attack')
  await expect(result(page)).toContainText(
    /Rapier with advantage and Steady Aim: \d+ to hit\. You rolled an? \d+ and an? \d+, kept the \d+, plus 7 from modifiers\./,
  )
  await page.keyboard.press('Alt+a')
  await expect(hud).toBeVisible()
  await expect(hud.getByRole('button', { name: 'Lucky, 2 of 3 uses' })).toBeVisible()
  await hud.getByRole('button', { name: 'Cancel' }).click()
  await expect(hud).toBeHidden()
  await type(page, 'feats')
  await expect(result(page)).toContainText(
    'Class features: Sneak Attack, Cunning Action, Steady Aim on, Uncanny Dodge. Species traits: Darkvision, Fey Ancestry. Feats: Lucky with 2 of 3 uses. Hit dice: 5 of 5.',
  )
  await type(page, '-10')
  await type(page, 'hit die')
  await expect(result(page)).toContainText(
    /Spent a hit die: healed \d+\. \d+ of 38 hit points\. You rolled an? \d+ plus 2 from Constitution\. 4 hit dice left\./,
  )
  await page.goto('/')
  await type(page, '/hd')
  await expect(result(page)).toContainText('Hit dice: 4 of 5, d8.')
  await type(page, 'long rest')
  await expect(result(page)).toContainText('Long rest. 38 of 38 hit points. Lucky recovered. Hit dice: 5 of 5.')
})

test('the spells HUD: one heading per level with the slots, Enter casts and closes, slots and rests by typing', async ({ page }) => {
  await type(page, '/s')
  const hud = page.getByRole('dialog', { name: 'Spells' })
  await expect(hud).toBeVisible()
  await expect(hud).toBeFocused()
  await expect(hud.getByRole('heading', { level: 3 })).toHaveText(['Cantrips', 'Level 1, 3 of 3 slots'])
  const fireBolt = hud.getByRole('button', { name: 'Fire Bolt, plus 4 to hit, 2d10 fire' })
  await expect(fireBolt).toBeVisible()
  await expect(hud.getByRole('button', { name: 'Charm Person, Wisdom save DC 12' })).toBeVisible()
  await expectNoAxeViolations(page, 'spells open')
  await fireBolt.click()
  await expect(hud).toBeHidden()
  await expect(result(page)).toContainText(/Fire Bolt: \d+ to hit\. You rolled an? \d+ plus 4 from modifiers\./)
  await expect(rollBox(page)).toBeFocused()
  await type(page, 'dmg')
  await expect(result(page)).toContainText(/Fire Bolt: \d+ fire damage\. You rolled [\d, and]+\./)
  await page.keyboard.press('Alt+s')
  await expect(hud).toBeVisible()
  await hud.getByRole('button', { name: 'Charm Person, Wisdom save DC 12' }).click()
  await expect(hud).toBeHidden()
  await expect(result(page)).toContainText('Charm Person: Wisdom save DC 12. Level 1 slots: 2 of 3 left.')
  await type(page, 'shield')
  await expect(result(page)).toContainText('Cast Shield. Level 1 slots: 1 of 3 left. Shield spell on. Armor class 20.')
  await type(page, '/slots')
  await expect(result(page)).toContainText('Level 1 slots: 1 of 3.')
  await page.goto('/')
  await type(page, 'spells')
  await expect(result(page)).toContainText(
    'Cantrips: Fire Bolt, Mage Hand, Minor Illusion. Level 1, 1 of 3 slots: Shield, Sleep, Charm Person, Disguise Self.',
  )
  await type(page, 'long rest')
  await expect(result(page)).toContainText(/Long rest\. 38 of 38 hit points\. Spell slots recovered\./)
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
    'Items',
    'Roll history',
    'Character',
    'Settings',
    'Help',
  ])
  await expect(page.getByRole('banner')).toBeVisible()
  await expect(page.getByRole('main')).toBeVisible()
})
