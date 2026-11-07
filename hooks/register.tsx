import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptSubmitInput, Register } from 'claude-code'

import type { CoachFeedback } from '../types'
import { MIN_WORDS, SYSTEM, buildPrompt, looksLikeTheirs, ownWords, parseFeedback, replyBefore, wordCount } from './coach'

// The coach's model: Sonnet at low effort answers in a few seconds and reads
// how something was said well enough to coach it.
export const MODEL = 'claude-sonnet-5-5'

const feedbackAtom = atom({ plugin: 'speaking-coach', key: 'feedback' } as const, null as CoachFeedback | null)
const hiddenAtom = atom({ plugin: 'speaking-coach', key: 'isHidden' } as const, false)

// Who typed it: the person at the prompt, in the app, the terminal, a phone or
// an SDK host. Notifications, other sessions, schedules and plugins are not them.
const PERSON = new Set(['composer', 'bridge', 'sdk', 'unclassified'])

const CLAUDE = /\b(claude|opus|sonnet|haiku|fable)\b|default/i

const norm = (s: string): string => s.toLowerCase().trim().replace(/[\s.]+/g, '-')

/**
 * Whether the chat runs on a model that is not Claude: a model whose name is
 * not Claude's, or a Claude name the settings' `modelOverrides` send to
 * another provider's model. The coach stays quiet there, so it never sends
 * the words of a chat kept off Claude to Claude.
 */
export function isOffClaude(model: string, overrides: unknown): boolean {
  const m = norm(model)
  if (m === '') return false
  let target = m
  if (overrides !== null && typeof overrides === 'object') {
    for (const [from, to] of Object.entries(overrides as Record<string, unknown>)) {
      const f = norm(from)
      if (typeof to === 'string' && f !== '' && (f === m || f.includes(m) || m.includes(f))) target = norm(to)
    }
  }

  return !CLAUDE.test(target)
}

/**
 * The person's own words in a prompt worth coaching, or null when the prompt
 * is not theirs (a notification, a command, a hook's text) or too short to
 * say anything about.
 */
export function coachable(e: PromptSubmitInput): string | null {
  if (e.command !== undefined || e.isMeta === true || !PERSON.has(e.origin.kind)) return null
  if (!looksLikeTheirs(e.text)) return null
  const words = ownWords(e.text)

  return wordCount(words) < MIN_WORDS ? null : words
}

// The newest message sent; an older one's feedback that arrives late is
// dropped. A reload starts it over, which costs at most one stale answer.
let latest = 0

async function coach($: EngineInterface, words: string, sent: string, ticket: number): Promise<void> {
  try {
    const model = await $.session.model().catch(() => '')
    const overrides = await $.settings.read({ key: 'modelOverrides' }).catch(() => undefined)
    if (isOffClaude(model, overrides)) return
    const at = await $.clock.now()
    // The end of Claude's last reply, so the coach knows what the chat is about;
    // the chat's Claude never sees the coach's call or its lines.
    const messages = await $.session.messages().catch(() => [])
    const reply = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: buildPrompt(words, replyBefore(messages, sent)),
      maxTokens: 400,
      effort: 'low',
      timeoutMs: 60_000,
    })
    if (!reply.isAnswered || ticket !== latest) return
    const lines = parseFeedback(reply.text, words)
    if (lines === null) return
    await update($, feedbackAtom, () => ({ ...lines, at }))
    await update($, hiddenAtom, () => false)
  } catch {
    // The coach stays quiet; the chat goes on as it was.
  }
}

export const register: Register = on => {
  // The prompt goes on untouched; the coach reads it beside the chat, after.
  on('prompt.submit', ($, e, next) => {
    const words = coachable(e)
    if (words !== null) {
      latest += 1
      const ticket = latest
      $.clock.after(0, () => {
        void coach($, words, e.text, ticket)
      })
    }

    return next(e)
  })

  // Three lines above the message box (two when the message was clean and there
  // is nothing to say better), replaced by each new message's, with
  // the surface's own close control. Nothing while none has come yet, and
  // nothing in a subagent's view or while a survey shows.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const feedback = await read($, feedbackAtom)
    const isHidden = await read($, hiddenAtom)
    if (e.props.hasSurvey || e.props.view.agentId !== undefined || feedback === null || isHidden) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const close = () => update($, hiddenAtom, () => true)
    // The band is one for all mods: what the mods beneath drew stays, under the feedback.
    const below = await next(e)
    const others = isDrawable(below) ? below : null

    return (
      <Box flexDirection="column">
        <Box columnGap={2}>
          <Box flexDirection="column" flexGrow={1}>
            <Text>
              <Text weight="semibold">Good: </Text>
              {feedback.good}
            </Text>
            <Text>
              <Text weight="semibold">Work on: </Text>
              {feedback.workOn}
            </Text>
            {feedback.better ? (
              <Text>
                <Text weight="semibold">Better: </Text>
                {feedback.better}
              </Text>
            ) : null}
          </Box>
          <Button key="speaking-coach-close" plain dimColor role="dismiss" label="Close" onPress={close} />
        </Box>
        {others ? <Box marginTop={1}>{others}</Box> : null}
      </Box>
    )
  })
}

// Only a real element can be nested; anything else (the app's own empty band) is left out.
const DRAWABLE = ['Box', 'Text', 'Button', 'Input', 'Select', 'Link', 'Code', 'Markdown', 'Svg', 'Raster', 'Image', 'Client']
function isDrawable(node: unknown): boolean {
  return typeof node === 'object' && node !== null && DRAWABLE.includes((node as { type?: string }).type ?? '')
}
