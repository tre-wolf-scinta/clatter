import { describe, expect, it } from 'vitest'
import { isBridgeReply, roll20Message } from './bridge'

describe('roll20Message', () => {
  it('turns an announcement into a Roll20 card: name, total, rolled', () => {
    expect(roll20Message('Persi', 'Stealth check: 22. You rolled a 12 plus 10 from modifiers.')).toBe(
      '&{template:default} {{name=Persi: Stealth check}} {{Total=22}} {{Rolled=a 12 plus 10 from modifiers}}',
    )
    expect(roll20Message('Persi', 'Natural 20! Flail with Rage: 27 to hit. You rolled a 20 plus 7 from modifiers.')).toBe(
      '&{template:default} {{name=Persi: Natural 20! Flail with Rage}} {{Total=27 to hit}} {{Rolled=a 20 plus 7 from modifiers}}',
    )
    expect(roll20Message('Persi', 'Critical hit! Flail: 22 bludgeoning damage.')).toBe(
      '&{template:default} {{name=Persi: Critical hit! Flail}} {{Total=22 bludgeoning damage}}',
    )
    expect(roll20Message('Thalia', 'Charm Person: Wisdom save DC 12. Level 1 slots: 2 of 3 left.')).toBe(
      '&{template:default} {{name=Thalia: Charm Person}} {{Total=Wisdom save DC 12}} {{Rolled=Level 1 slots: 2 of 3 left}}',
    )
    expect(roll20Message('Thalia', 'Cast Mage Hand.')).toBe('&{template:default} {{name=Thalia: Cast Mage Hand}}')
    expect(roll20Message('T', 'Death save: 10, success. You rolled a 10.')).toBe(
      '&{template:default} {{name=T: Death save}} {{Total=10, success}} {{Rolled=a 10}}',
    )
  })

  it('keeps template syntax out of the card', () => {
    expect(roll20Message('A {b} | c', 'Odd {x}: 1.')).toBe('&{template:default} {{name=A b c: Odd x}} {{Total=1}}')
  })

  it('recognises the extension\'s replies and nothing else', () => {
    expect(isBridgeReply({ clatter: 'bridge', state: 'present' })).toBe(true)
    expect(isBridgeReply({ clatter: 'roll' })).toBe(false)
    expect(isBridgeReply(null)).toBe(false)
    expect(isBridgeReply('bridge')).toBe(false)
  })
})
