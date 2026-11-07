# Speaking Coach

A Claude Code mod for people who talk to Claude through speech-to-text. After each message you send, three short lines appear above the message box: one thing you did well, one speaking habit to work on, and one of your sentences said better, in your own voice.

```
Good: You backed your doubt with a real customer example.
Work on: You said "like" 14 times and started two sentences over. Pause silently instead.
Better: Our customers read everything, so let's keep the long page and also put the price at the top.
```

It coaches how you say things, not how short you are: restarts, repeats, fillers (with their count) and points lost in a tangle. Your reasons, feelings and personality stay in the "Better" line; only fillers, restarts and repeats go. It never mentions spelling, misheard words or punctuation, because those come from the speech-to-text, not from you.

The listener is Claude in the middle of a chat, so the coach reads the end of Claude's last reply and never calls a word vague when the chat already makes it clear. It never makes up a problem: a clean message gets "Nothing to fix here" and no "Better" line.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install speaking-coach --marketplace victorvvr/speaking-coach
```

Answer `y` to add the marketplace, then press Enter to install it for your user (every project). It works from then on, in the terminal and in the Claude desktop app's Code tab.

From a shell instead:

```
claude plugin install speaking-coach --marketplace victorvvr/speaking-coach
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `victorvvr/speaking-coach`, then Add plugin.

## What it does with your messages

Each message you type or dictate with at least 8 words of your own is sent to Claude (Sonnet, at low effort) in a separate call to judge it, with the end of Claude's reply just before it (at most 1,500 characters) so the coach knows what the chat is about. That call uses your own Claude Code sign-in and counts toward your usage, a small amount per message. The feedback stays in the band: the chat's own Claude never sees it, and your message goes to the chat unchanged.

It skips short replies ("Yes, fix it"), slash commands, notifications, messages from other sessions and hidden prompts. Before judging, it takes out quoted lines (`> `), pasted blocks, code, links, file paths and anything shaped like a key, from your message and from that reply. In a chat whose model is not Claude, including a Claude model your settings' `modelOverrides` send to another provider, it says nothing.

Close the band with its close button; the next message's feedback opens it again.

## License

MIT
