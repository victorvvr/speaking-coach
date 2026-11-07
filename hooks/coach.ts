// What the coach reads and how it asks: pure text work, no engine calls, so
// the tests can reach every rule here directly.

// Fewer of the person's own words than this and there is nothing to coach ("Yes, fix it").
export const MIN_WORDS = 8

// A very long dictation is judged on its first part; the coach needs a sample
// of how the person speaks, not all of it, and stays quick.
export const MAX_CHARS = 9000

// Text the engine, an app or another session puts in a chat, never the person's voice.
const NOT_THEIRS = [
  /^<task-notification\b/,
  /^<side-sessions-event\b/,
  /^<ci-monitor-event\b/,
  /^<command-(name|message|args)\b/,
  /^<local-command-/,
  /^<bash-(input|stdout|stderr)\b/,
  /^<user-prompt-submit-hook\b/,
  /^\[SYSTEM\b/i,
  /^\[Request interrupted/,
  /^\[Your previous response/,
  /^\[Workflow harness/,
  /^\[Artifact comment sent to Claude\]/,
  /^Your response above was cut off/,
  /^Caveat: /,
  /^Base directory for this skill:/,
  /^Background \(from the session that started this one\)/,
  /^This session is being continued from a previous conversation/,
]

/**
 * Whether a prompt's text reads as something the person said, rather than a
 * notification, a hook's or a skill's text, or a summary the app wrote.
 */
export function looksLikeTheirs(text: string): boolean {
  const start = text.trimStart()
  if (start === '' || start.startsWith('/')) return false

  return !NOT_THEIRS.some(pattern => pattern.test(start))
}

/**
 * The person's own words in a prompt: quotes of a reply they answer, comments the app
 * adds, pasted blocks, reminders, code, links and anything shaped like a key
 * taken out.
 */
export function ownWords(text: string): string {
  let t = text
  t = t.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, ' ')
  t = t.replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content[^>]*>/g, ' ')
  t = t.replace(/<!--[\s\S]*?-->/g, ' ')
  t = t.replace(/```[\s\S]*?(```|$)/g, ' ')
  t = t.replace(/`[^`\n]*`/g, ' ')
  t = t.replace(/\[(Image|Pasted text|File)[^\]]*\]/g, ' ')
  t = t
    .split('\n')
    .filter(line => !/^\s*>/.test(line))
    .join('\n')
  t = t.replace(/\b(https?:\/\/|www\.)\S+/gi, ' ')
  t = t.replace(/(^|\s)[~.]?\/[\w.@~%+-]+(\/[\w.@~%+-]*)+/g, ' ')
  // Keys and tokens: sk-…, ghp_…, or any long run that mixes letters and digits.
  t = t.replace(/\b(sk|pk|rk|ghp|gho|xox[abp]|AKIA)[-_][\w-]{8,}/g, ' ')
  t = t.replace(/\b(?=[\w-]{24,}\b)(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]+\b/g, ' ')
  t = t.replace(/<\/?[a-z][\w-]*[^>]*>/gi, ' ')
  t = t.replace(/[ \t]+/g, ' ')
  t = t.replace(/\n\s*\n+/g, '\n')

  return t.trim()
}

export function wordCount(text: string): number {
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)

  return words === null ? 0 : words.length
}

const FILLERS: readonly (readonly [string, RegExp])[] = [
  ['like', /\blike\b/gi],
  ['you know', /\byou know\b/gi],
  ['I guess', /\bI guess\b/gi],
  ['I mean', /\bI mean\b/gi],
  ['kind of', /\bkind of\b/gi],
  ['sort of', /\bsort of\b/gi],
  ['basically', /\bbasically\b/gi],
  ['actually', /\bactually\b/gi],
  // Romanian ones, for a message spoken in Romanian.
  ['practic', /(?<![\p{L}\p{N}])practic(?![\p{L}\p{N}])/giu],
  ['adică', /(?<![\p{L}\p{N}])adică(?![\p{L}\p{N}])/giu],
  ['gen', /(?<![\p{L}\p{N}])gen(?![\p{L}\p{N}])/giu],
  ['cumva', /(?<![\p{L}\p{N}])cumva(?![\p{L}\p{N}])/giu],
]

/**
 * How often each filler appears, those that appear at all, most first.
 * "like" here counts every use; the model tells the filler from the verb.
 */
export function fillerCounts(text: string): { word: string; count: number }[] {
  return FILLERS.map(([word, pattern]) => ({ word, count: (text.match(pattern) ?? []).length }))
    .filter(f => f.count > 0)
    .sort((a, b) => b.count - a.count)
}

export const SYSTEM = `You coach a person on speaking. They talk to Claude, an AI assistant, through speech-to-text, often for hours a day, and want to become a great speaker: clear, alive and fully themselves. You get one message they just dictated to Claude in the middle of a chat, and the end of Claude's reply just before it, so you know what the chat is about. Answer with exactly three lines and nothing else:

Good: <one thing they did well in this message, specific to it, at most 16 words>
Work on: <the one speaking habit that most weakened this message, at most 18 words; when nothing did, say so plainly>
Better: <one or two of their sentences from this message, said the way they would on a great day, at most 30 words; or the word none>

Who listens: Claude, in the middle of the chat, with everything said before in front of it. It already knows what "the coach", "the team", "it", "that" or "this" mean and what they are answering, so a short message that leans on the chat is good speaking, not vague. Never call a word or a reference vague, unclear or too short, never ask for more detail, context, examples or names, and never tell them to say who or what they mean: Claude knows. The end of Claude's reply is there only to show you that; never coach it, quote it or mention it.

Coach only how they spoke. What weakens a message, most important first:
- Restarts and cut-off words: starting a word or a sentence over ("I w- I want", "change the bit, the logic", "va- vague", "I think. I think you should").
- Repeats: the same word several times in a row ("so, so, so", "like, like"), the same sentence twice, or the same point or ask made again with nothing new.
- Filler words: like, you know, I guess, I mean, kind of, sort of, basically, actually (in Romanian: practic, adică, gen, cumva). "like" is filler only when it adds nothing; "I like it" and "looks like a bug" are fine. Name a filler only when it is frequent, and then give the count you were given.
- A point lost in a tangle: sentences run into each other, a thought wanders off and never comes back, or the ask gets lost among other things.

Never invent a problem. A message with none of these is clean, and so is one with a single small slip: then Work on says so plainly (for example: Nothing to fix here; it was clear and clean.) and Better is none. Never suggest polish for words that were already fine.

The goal is speaking well, not speaking short. Their feelings, values, reasons, warmth, humor and personality are part of the message, put there on purpose: never call them a lead-in, a warm-up, padding or something to cut, and never tell them to move their ask ahead of their reason or of what they believe.

Good may credit a feeling, a value or a reason that comes through, a clear example or a concrete plan, or a short message that says just what is needed.

Never mention spelling, misheard or wrong words, punctuation, capital letters, odd sentence breaks or grammar slips that look like transcription: the speech-to-text makes those, not them. Never mention swearing, rudeness or tone. Never judge what they asked for or whether their idea is good; only how they said it.

Talk to them directly as "you". Write in plain, everyday English with short words. Be kind but honest: no empty praise like "Great job", no softening. The Good and Work on lines are always in English.

The Better line rewrites real words of theirs that had one of the problems above, in their own voice: the same person on a great day, not a memo or a corporate edit. It keeps their meaning, their feeling, their why, their casual words and their personality, and drops only the fillers, restarts and repeats. It always changes something real: never copy their words as they said them. For example, from "So I really want to, like, thank the whole team, because honestly, you know, this year was hard and they, they never gave up. So yeah, like, let's do a dinner for them next Friday." a good Better line is: I really want to thank the whole team, because this year was hard and they never gave up. Let's take them to dinner next Friday. A bad one is: Book a team dinner next Friday. From a clean message such as "Can you check whether the deploy finished and tell me which test failed?" Work on is: Nothing to fix here; it was clear and clean. and Better is: none. The Better line is in the language they spoke (Spanish if they spoke Spanish, Romanian if they spoke Romanian). Write it as the words themselves, without quotation marks.`

// How much of Claude's last reply the coach sees: enough to know what the
// chat is about, its end, where the person's answer picks up.
export const MAX_CONTEXT = 1500

/**
 * The end of Claude's reply just before the person's message, with the same
 * things taken out as from theirs; '' when there is none (a new chat).
 * `messages` is the chat as the engine holds it: the person's message itself
 * may be in it already, and what comes from it on is left out.
 */
export function replyBefore(messages: readonly { role: string; text: string }[], prompt: string): string {
  const sent = prompt.trim()
  let end = messages.length
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user' && messages[i]?.text.trim() === sent) {
      end = i
      break
    }
  }
  for (let i = end - 1; i >= 0; i--) {
    const message = messages[i]
    if (message?.role !== 'assistant') continue
    const text = ownWords(message.text).replace(/\s+/g, ' ').trim()
    if (text === '') continue

    return text.length > MAX_CONTEXT ? `… ${text.slice(text.length - MAX_CONTEXT).trimStart()}` : text
  }

  return ''
}

/**
 * The one user message the model gets: the end of Claude's last reply, the
 * counts as facts, then the person's words.
 */
export function buildPrompt(words: string, reply = ''): string {
  const said = words.length > MAX_CHARS ? `${words.slice(0, MAX_CHARS)} …` : words
  const counts = fillerCounts(said)
  const facts = counts.length === 0 ? 'none' : counts.map(f => `"${f.word}" ${f.count}`).join(', ')
  const before = reply === '' ? '(none: the chat may have just started)' : reply

  return `The end of Claude's reply just before their message (Claude has the whole chat; this is only so you know what it is about):
<<<
${before}
>>>

Words in their message: ${wordCount(said)}. Filler counts (every use, filler or not): ${facts}.

Their message:
<<<
${said}
>>>`
}

const cut = (line: string, max: number): string => {
  const one = line.replace(/\s+/g, ' ').trim()

  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one
}

const unquote = (line: string): string => line.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim()

// "Better: none", or the like: the message was clean.
const NONE = /^(none|nothing|n\/a|-+|—)\.?$/i

const bare = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * The model's lines, or null when it did not answer in that shape. Good and
 * Work on are needed; Better is null when the model gave none, or when it only
 * repeats words the person said as they said them, which would improve nothing.
 */
export function parseFeedback(reply: string, words = ''): { good: string; workOn: string; better: string | null } | null {
  const find = (label: RegExp): string | undefined => {
    for (const raw of reply.split('\n')) {
      const line = raw.replace(/^[\s*_#>-]+/, '').replace(/\*\*/g, '')
      const match = line.match(label)
      if (match) return line.slice(match[0].length).trim()
    }

    return undefined
  }
  const good = find(/^good\s*:\s*/i)
  const workOn = find(/^work on\s*:\s*/i)
  const said = unquote(find(/^better\s*:\s*/i) ?? '')
  if (!good || !workOn) return null
  const copied = bare(said) !== '' && bare(words).includes(bare(said))
  const better = said === '' || NONE.test(said) || copied ? null : cut(said, 300)

  return { good: cut(good, 160), workOn: cut(workOn, 180), better }
}
