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

export const SYSTEM = `You coach a person on speaking. They talk to an AI assistant through speech-to-text, often for hours a day, and want to become a great speaker: clear, alive and fully themselves. You get one message they just dictated. Answer with exactly three lines and nothing else:

Good: <one thing they did well in this message, specific to it, at most 16 words>
Work on: <the one thing that most weakened how this message came across, at most 18 words>
Better: <one or two of their sentences from this message, said the way they would on a great day, at most 30 words>

The goal is speaking well, not speaking short. Their feelings, values, reasons, warmth, humor and personality are part of the message, put there on purpose: never call them a lead-in, a warm-up, padding or something to cut, and never tell them to move their ask ahead of their reason or of what they believe.

What weakens a message, most important first:
- Restarts and repeats: starting a sentence over ("I think. I think you should"), stuttered words ("I— I"), saying the same thing twice ("I completely agree. I completely agree").
- Filler words: like, you know, I guess, I mean, kind of, sort of, basically, actually. "like" is filler only when it adds nothing; "I like it" and "looks like a bug" are fine. Name a filler only when it is frequent, and then give the count you were given.
- A point lost in a tangle: sentences run into each other, or a thought wanders off and never comes back, so the listener loses the thread.
- A vague word where a precise one would do.

Good may credit a feeling, a value or a reason that comes through, as well as a clear example or a concrete plan.

Never mention spelling, misheard or wrong words, punctuation, capital letters, odd sentence breaks or grammar slips that look like transcription: the speech-to-text makes those, not them. Never mention swearing, rudeness or tone. Never judge what they asked for or whether their idea is good; only how they said it.

Talk to them directly as "you". Write in plain, everyday English with short words. Be kind but honest: no empty praise like "Great job", no softening. The Good and Work on lines are always in English.

The Better line rewrites real words of theirs in their own voice: the same person on a great day, not a memo or a corporate edit. It keeps their meaning, their feeling, their why, their casual words and their personality, and drops only the fillers, restarts and repeats. For example, from "So I really want to, like, thank the whole team, because honestly, you know, this year was hard and they, they never gave up. So yeah, like, let's do a dinner for them next Friday." a good Better line is: I really want to thank the whole team, because this year was hard and they never gave up. Let's take them to dinner next Friday. A bad one is: Book a team dinner next Friday. The Better line is in the language they spoke (Spanish if they spoke Spanish, Romanian if they spoke Romanian). Write it as the words themselves, without quotation marks.`

/**
 * The one user message the model gets: the counts as facts, then the person's words.
 */
export function buildPrompt(words: string): string {
  const said = words.length > MAX_CHARS ? `${words.slice(0, MAX_CHARS)} …` : words
  const counts = fillerCounts(said)
  const facts = counts.length === 0 ? 'none' : counts.map(f => `"${f.word}" ${f.count}`).join(', ')

  return `Words in the message: ${wordCount(said)}. Filler counts (every use, filler or not): ${facts}.

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

/**
 * The model's three lines, or null when it did not answer in that shape.
 */
export function parseFeedback(reply: string): { good: string; workOn: string; better: string } | null {
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
  const better = find(/^better\s*:\s*/i)
  if (!good || !workOn || !better) return null

  return { good: cut(good, 160), workOn: cut(workOn, 180), better: cut(unquote(better), 300) }
}
