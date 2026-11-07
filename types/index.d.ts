/**
 * The coach's lines on one message the person sent.
 */
export type CoachFeedback = {
  good: string
  workOn: string
  // One of their sentences said better; null when the message was clean.
  better: string | null
  // When the message was sent, ms since the epoch.
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    'speaking-coach': {
      // The newest feedback in this chat, or none yet.
      feedback: CoachFeedback | null
      // The person closed the band; the next feedback opens it again.
      isHidden: boolean
    }
  }
}
