import { expect, mock, test } from 'claude-code/testing'
import type { On, PromptOrigin } from 'claude-code'

import { MAX_CONTEXT, MIN_WORDS, buildPrompt, fillerCounts, looksLikeTheirs, ownWords, parseFeedback, replyBefore, wordCount } from '../hooks/coach'
import { MODEL, isOffClaude } from '../hooks/register'

// A made-up dictated message that answers a reply by quoting parts of it
// (the "> " lines and the reply comments are not the person's own words).
const DICTATION = `<!-- reply 2 -->
> A shorter landing page usually converts better, because people decide in the first few seconds.

So, like, you mean the whole page, or just the top part?

<!-- reply -->
> Put the price where people can see it without scrolling.

Yeah, I, I think that makes sense. I think that makes sense. But, like, the thing is, like, our customers are mostly older people, you know, and they, like, they want to read everything before they decide anything, so I guess what I'm saying is that, like, I'm not sure a short page works for them. Like, my mom for example, she reads every single word on a page before she buys anything, and she's, like, exactly our customer. So, so maybe we could, like, keep the long page but, like, put the price and the main button at the top too? I mean, basically both. And then, like, we can test which one works better after two weeks or so.

<!-- reply -->
> Test one change at a time, or you won't know which change made the difference.

Okay, okay. That's actually a good point. I didn't think about that at all, like, at all. So let's start with the price at the top and, like, keep everything else the same for now, and then, like, next month we can try the shorter version.`

const TASK_NOTIFICATION = `<task-notification>
<task-id>example-task-1</task-id>
<status>completed</status>
<summary>Agent "Run the test suite" finished</summary>
<result>All 42 tests passed on the first run, and nothing else changed.</result>
</task-notification>`

const ANSWER = `Good: You backed your doubt with a real customer example.
Work on: You said "like" 14 times, mostly as filler. Pause silently instead.
Better: Our customers read everything, so let's keep the long page and put the price at the top.`

// A clean message on a subject the chat set up ("the coach", "the team"), and
// the model's answer to it: nothing to fix, so no Better line.
const CLEAN = 'Can I choose which people on the team get the coach and which do not?'
const CLEAN_ANSWER = `Good: One direct question, so Claude knows exactly what to answer.
Work on: Nothing to fix here; it was clear and clean.
Better: none`

// The chat so far: Claude's reply the person answers, which names the subject.
const CHAT = [
  { role: 'user', text: 'Does everyone on the team have the coach too?', toolUses: [] },
  { role: 'assistant', text: 'Let me look.', toolUses: [] },
  { role: 'user', text: '', toolUses: [], toolResults: [] },
  {
    role: 'assistant',
    text: 'No. The team gets the context figure from your command, but the speaking coach is only on your Mac.',
    toolUses: [],
  },
] as const

const BAND = {
  plugin: 'speaking-coach',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

const SURFACES = ['desktop', 'terminal', 'vscode', 'mobile'] as const

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(
  on: On,
  model = 'claude-opus-5-5',
  answer = ANSWER,
  settings: Record<string, unknown> = {},
  beneath?: string,
  chat: readonly { role: 'user' | 'assistant'; text: string }[] = CHAT,
) {
  const clock = mock.clock(on, { now: Date.UTC(2026, 10, 7, 4) })
  const asked: { model: string; prompt: string; system: string; effort?: string }[] = []
  on('session.model', () => ({ value: model }))
  on('settings.read', () => ({ value: settings }))
  on('session.messages', () => ({ value: chat.map(m => ({ toolUses: [], ...m })) }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  // The band beneath the coach: empty, or another mod's line when `beneath` is given.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e)

    return beneath === undefined ? <Box /> : <Text>{beneath}</Text>
  })
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, prompt: e.prompt, system: e.system ?? '', effort: e.effort })

    return {
      value: {
        isAnswered: true,
        text: answer,
        usage: { input_tokens: 900, output_tokens: 60, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })

  return { clock, asked }
}

const said = (text: string, origin: PromptOrigin = { kind: 'composer' }) => ({ text, wait: false, origin })

test('a long dictation goes on untouched, and the coach reads only the person\'s own words', async ($, on) => {
  const { clock, asked } = engine(on)

  expect(await $.prompt.submit(said(DICTATION))).toEqual({ text: DICTATION })
  await clock.settle()

  expect(asked.length).toBe(1)
  expect(asked[0]?.model).toBe(MODEL)
  expect(asked[0]?.effort).toBe('low')
  expect(asked[0]?.system).toContain('Never mention spelling')
  const prompt = asked[0]?.prompt ?? ''
  expect(prompt).toContain('my mom for example')
  expect(prompt).toContain('next month we can try the shorter version.')
  // The quoted parts of the reply and the app's reply comments are not theirs.
  expect(prompt).not.toContain('A shorter landing page usually converts better')
  expect(prompt).not.toContain('Test one change at a time')
  expect(prompt).not.toContain('reply 2')
  expect(prompt).toMatch(/"like" \d+/)
  // The end of Claude's last reply comes along, so the coach knows what the chat is about.
  expect(asked[0]?.system).toContain('Never call a word or a reference vague')
  expect(prompt).toContain('the speaking coach is only on your Mac')
  expect(prompt.indexOf('only on your Mac')).toBeLessThan(prompt.indexOf('Their message:'))
  expect(prompt).not.toContain('Let me look.')
})

test('a clean message gets no made-up fix: two lines, no Better', async ($, on) => {
  // The engine already holds the person's message: the reply before it is still the one read.
  const { clock, asked } = engine(on, 'claude-opus-5-5', CLEAN_ANSWER, {}, undefined, [
    ...CHAT,
    { role: 'user', text: CLEAN },
  ])
  await $.prompt.submit(said(CLEAN))
  await clock.settle()
  expect(asked[0]?.prompt).toContain('the speaking coach is only on your Mac')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^Work on: / }))?.text).toBe(
      'Work on: Nothing to fix here; it was clear and clean.',
    )
    expect(await ui.find({ type: 'Text', text: /^Better: / })).toBeUndefined()
    expect((await ui.findAll({ type: 'Text' })).filter(t => /^(Good|Work on|Better): \S/.test(t.text)).length).toBe(2)
    await ui.unmount()
  }
})

test('a Better line that only repeats the person\'s words is not shown', async ($, on) => {
  const copied = `Good: One direct question.\nWork on: Nothing to fix here.\nBetter: "${CLEAN}"`
  const { clock } = engine(on, 'claude-opus-5-5', copied)
  await $.prompt.submit(said(CLEAN))
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Good: / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Better: / })).toBeUndefined()
  await ui.unmount()
})

test('the band shows the three lines on every surface, and closes', async ($, on) => {
  const { clock } = engine(on)
  await $.prompt.submit(said(DICTATION))
  await clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^Good: You backed/ }))?.text).toBe(
      'Good: You backed your doubt with a real customer example.',
    )
    expect((await ui.find({ type: 'Text', text: /^Work on: / }))?.text).toContain('"like" 14 times')
    expect((await ui.find({ type: 'Text', text: /^Better: / }))?.text).toBe(
      'Better: Our customers read everything, so let\'s keep the long page and put the price at the top.',
    )
    expect((await ui.findAll({ type: 'Text' })).filter(t => /^(Good|Work on|Better): \S/.test(t.text)).length).toBe(3)
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  await ui.press({ key: 'speaking-coach-close' })
  expect(await ui.find({ type: 'Text', text: /^Good: / })).toBeUndefined()
  await ui.unmount()

  // The next message's feedback opens it again.
  await $.prompt.submit(said('Okay, so what I want is for the band to come back after I close it, every time.'))
  await clock.settle()
  const again = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await again.find({ type: 'Text', text: /^Good: / })).toBeDefined()
  await again.unmount()
})

test('another mod drawing in the band stays drawn, before and with the feedback', async ($, on) => {
  const { clock } = engine(on, 'claude-opus-5-5', ANSWER, {}, 'A pet sleeps here.')

  for (const surface of ['desktop', 'terminal'] as const) {
    const before = await $.ui.mount({ ...BAND, surface })
    expect((await before.find({ type: 'Text', text: /pet sleeps/ }))?.text).toBe('A pet sleeps here.')
    await before.unmount()
  }

  await $.prompt.submit(said(DICTATION))
  await clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /^Good: / })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /pet sleeps/ }))?.text).toBe('A pet sleeps here.')
    await ui.unmount()
  }
})

test('short answers, notifications, commands and hidden prompts are not coached', async ($, on) => {
  const { clock, asked } = engine(on)

  expect(await $.prompt.submit(said('Yes, fix it'))).toEqual({ text: 'Yes, fix it' })
  await $.prompt.submit(said(TASK_NOTIFICATION, { kind: 'task-notification' }))
  // The same text arriving unstamped is still known by its words.
  await $.prompt.submit(said(TASK_NOTIFICATION, { kind: 'unclassified' }))
  await $.prompt.submit(said('[SYSTEM NOTIFICATION - NOT USER INPUT] This is an automated background-task event, not a message from the user at all.'))
  await $.prompt.submit(said('Another session says the build finished and every test passed on the first try today.', { kind: 'peer' }))
  await $.prompt.submit({ ...said('/review all of it please, the whole chat from the very start'), command: { name: 'review', args: 'all of it please' } })
  await $.prompt.submit({ ...said('A hidden prompt the person never typed, long enough to count as many words.'), isMeta: true })
  await clock.settle()

  expect(asked.length).toBe(0)
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Good: / })).toBeUndefined()
  await ui.unmount()
})

test('a chat whose model is routed away from Claude is left alone', async ($, on) => {
  const { clock, asked } = engine(on, 'claude-haiku-5-5', ANSWER, {
    modelOverrides: { 'claude-haiku-5-5': 'some-other-provider-model' },
  })
  await $.prompt.submit(said(DICTATION))
  await clock.settle()
  expect(asked.length).toBe(0)
})

test('a chat on a plain Claude model is coached, whatever its size', async ($, on) => {
  const { clock, asked } = engine(on, 'claude-haiku-5-5')
  await $.prompt.submit(said(DICTATION))
  await clock.settle()
  expect(asked.length).toBe(1)
})

test('which chats count as off Claude', () => {
  expect(isOffClaude('claude-opus-5-5', undefined)).toBe(false)
  expect(isOffClaude('Sonnet 5.5', {})).toBe(false)
  expect(isOffClaude('', undefined)).toBe(false)
  expect(isOffClaude('Default (recommended)', undefined)).toBe(false)
  expect(isOffClaude('gemini-3-pro', undefined)).toBe(true)
  expect(isOffClaude('claude-haiku-5-5', { 'claude-haiku-5-5': 'other-model' })).toBe(true)
  expect(isOffClaude('haiku', { 'claude-haiku-5-5': 'other-model' })).toBe(true)
  expect(isOffClaude('claude-opus-5-5', { 'claude-haiku-5-5': 'other-model' })).toBe(false)
})

test('an answer in the wrong shape shows nothing', async ($, on) => {
  const { clock } = engine(on, 'claude-opus-5-5', 'Sure! Here is some feedback on your message.')
  await $.prompt.submit(said(DICTATION))
  await clock.settle()
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^Good: / })).toBeUndefined()
  await ui.unmount()
})

test('the person\'s own words: what is taken out and what is counted', () => {
  const own = ownWords(DICTATION)
  expect(own).not.toContain('>')
  expect(own).not.toContain('<!--')
  expect(own).toContain('So, like, you mean the whole page, or just the top part?')
  expect(wordCount(own)).toBeGreaterThan(150)

  const like = fillerCounts(own).find(f => f.word === 'like')
  expect(like?.count).toBeGreaterThan(10)
  expect(fillerCounts('Deci, practic, vreau să, adică, practic să știu. Generalul.')).toEqual([
    { word: 'practic', count: 2 },
    { word: 'adică', count: 1 },
  ])

  expect(ownWords('Use this key sk-example-notreal-Ab12Cd34Ef56Gh78Ij90 and https://example.com/a/b now')).toBe('Use this key and now')
  expect(ownWords('Look at /home/someone/projects/app/README.md and `npm test` then tell me')).toBe('Look at and then tell me')

  expect(looksLikeTheirs(TASK_NOTIFICATION)).toBe(false)
  expect(looksLikeTheirs('/review all')).toBe(false)
  expect(looksLikeTheirs(DICTATION)).toBe(true)
  expect(wordCount('Yes, fix it')).toBeLessThan(MIN_WORDS)
  expect(buildPrompt(own)).toContain('Their message:')
})

test('the model\'s three lines are read in any light formatting, and only whole', () => {
  expect(parseFeedback('**Good:** Clear ask.\n\n- **Work on:** Point first.\n> Better: "Do it now."')).toEqual({
    good: 'Clear ask.',
    workOn: 'Point first.',
    better: 'Do it now.',
  })
  expect(parseFeedback('Good: Clear ask.\nWork on: Point first.')).toEqual({ good: 'Clear ask.', workOn: 'Point first.', better: null })
  expect(parseFeedback('Good: Clear ask.\nWork on: Nothing to fix.\nBetter: None.')?.better).toBeNull()
  expect(parseFeedback('Good: Clear ask.\nWork on: Nothing.\nBetter: Is it done?', 'So, is it, is it done?')?.better).toBeNull()
  expect(parseFeedback('Good: Clear ask.\nWork on: Restarts.\nBetter: Is it done yet?', 'So, is it, is it done?')?.better).toBe('Is it done yet?')
  expect(parseFeedback('Work on: Point first.\nBetter: Do it now.')).toBeNull()
  expect(parseFeedback('Here is my feedback.')).toBeNull()
})

test('the end of Claude\'s reply before the person\'s message, and nothing after it', () => {
  expect(replyBefore([], 'Hello there')).toBe('')
  expect(replyBefore([{ role: 'user', text: 'Hello there' }], 'Hello there')).toBe('')
  expect(replyBefore(CHAT, CLEAN)).toBe(CHAT[3].text)
  // Held already, with Claude's next reply begun after it: the reply before it all the same.
  expect(replyBefore([...CHAT, { role: 'user', text: CLEAN }, { role: 'assistant', text: 'Working on it.' }], ` ${CLEAN} `)).toBe(
    CHAT[3].text,
  )
  // A long reply: its end only; code, links and keys taken out as from the person's words.
  const long = `${'Start. '.repeat(400)}Run \`npm test\` at https://example.com/x then answer sk-example-notreal-Ab12Cd34Ef56Gh78 now.`
  const end = replyBefore([{ role: 'assistant', text: long }], CLEAN)
  expect(end.startsWith('… ')).toBe(true)
  expect(end.length).toBeLessThanOrEqual(MAX_CONTEXT + 2)
  expect(end.endsWith('Run at then answer now.')).toBe(true)
  expect(buildPrompt('Some words of theirs', '')).toContain('(none: the chat may have just started)')
})
