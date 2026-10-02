# Rebet: agent brief

## Project
Rebet: the user pastes signals from a Discord bot (#rebet channel). Each signal is a bet with a game start time. The app organizes them on a calendar, reminds the user to place each bet shortly before game start, and tracks units won/lost. Single user, mostly used on a phone.

## Layout
- `index.html`: whole UI (vanilla JS, localStorage key `rebet.v1`; tabs Add / Upcoming / Calendar / Tracker; dark navy "Modernize"-style theme).
- `parser.js`: `RebetParser.parse(text, ctx)`; shared by browser and Node. Handles the Rebet bot format plus a generic fallback.
- `tests/parse.test.js`, `tests/fixtures/`: run `node tests/parse.test.js`. It must also pass with `TZ=Asia/Tokyo node tests/parse.test.js`.
- `STATUS.md`: you maintain it (create if missing).

## Real signal format (bot "Rebet", forwarded by KnightLocks)
```
USA - American Football - ncaa - Over 55.5 Total (-128) • EV: 1.9%
Florida Gators @ Missouri Tigers - (Total)
Sat, Oct 03, 3:30 PM EDT
W%: 57.26%  FV: -134  EV: 1.9%  QK: 0.62U
Pinnacle Odds: -148 / +121
Bet Key  ncaa|2026-10-04|Missouri Tigers|Florida Gators|total_game|over|line=55.5
Forged by KnightLocks•Today at 1:56 PM
```
- QK = stake in units. Headline odds (-128) are the bettable odds; Pinnacle odds are a reference.
- Game time is in the zone written (EDT). The Bet Key date can be a day off (UTC), so never use it for timing.
- "Today at ..." in the footer is when the signal was sent.

## Non-negotiables
- Times are critical. Store UTC instants, parse in the stated zone, display in the user's local zone. Reminders fire at `game_start - lead`. Never ship a change that breaks the timezone tests.
- Never place real bets, never touch sportsbook accounts or payment details, never post/DM/react in Discord. Read-only viewing of the user's channel to collect sample signals is fine.
- No secrets in the repo or page. The Supabase anon key may live in the client; service-role, VAPID private and email keys only as Edge Function secrets.
- Small commits on branch `claude/friendly-fermat-852uu6`. No pushes to main, no PR unless asked. Ask the user before anything that costs money or changes accounts/DNS.
- Keep the visual theme, and keep the app working offline from localStorage.

## Standing goal
Rebet is a reliable personal system: a pasted signal becomes a reminder on the user's phone shortly before game time, even with the page closed, and results roll into a unit tracker.

> Update 2026-10-02: Andy only needs a functional app for now. Milestones 3-4 (email/push) are deferred; see STATUS.md "Scope decision" for the current order.

## Milestones (top to bottom, one at a time; record progress in STATUS.md)
1. Collect 10+ real signals, including spread, moneyline, props, other sports/leagues, "Yesterday" stamps and no-time ones. Add them as fixtures with expected output and fix the parser until all pass. Use screen access to copy them from Discord.
2. Supabase: tables `bets`, `settings`, `push_subscriptions`, `reminders_sent`; RLS owner-only; magic-link auth; `supabase-js` sync with localStorage fallback; "import local data" button. Migrations in `supabase/migrations/`. Use the user's existing Supabase project.
3. Edge Function `send-reminders` on pg_cron every minute: due = pending and `now >= game_start - lead`, idempotent via `reminders_sent`. Email first (Resend), verify it works.
4. PWA: `manifest.webmanifest`, `sw.js`, Web Push (VAPID), subscribe button, notificationclick opens Upcoming. Host over HTTPS (GitHub Pages once repo access works). Test on the user's real phone (iOS needs home-screen install).
5. Frontend: settings panel (time zone, lead, second reminder, default odds, test notification), countdowns on place-now, week agenda, tracker breakdown by league/market, CSV export, undo toast.
6. Hardening: odds-moved warning, dedupe via Bet Key, past-game guard, error states, setup README.

## Loop (every cycle)
1. Read STATUS.md and pick the next unfinished item.
2. Implement it. Run both parser test commands. For UI changes, drive the page with Playwright or screenshots.
3. Commit, then update STATUS.md (done / next / blockers / questions for the user).
4. If a human step blocks you (login, approval, device test), put it at the top of STATUS.md and move to the next unblocked item.

## Definition of done
A real signal pasted at T-3h produces a push (and email) on the user's phone at game_start minus lead with the page closed, shows on the calendar at the correct local time, and settles into the unit tracker.

## Working with Claude (async, through this repo)
Claude (Claude Code, in a cloud session) and you share this branch. Neither can message the other directly, so use the repo as the channel.
- `git pull --rebase origin claude/friendly-fermat-852uu6` at the start of every cycle, and `git push` after every commit.
- Put messages in `STATUS.md` under `## Inbox for Claude` (what you want reviewed or fixed, with commit hashes) and read `## Inbox for Codex` for Claude's notes. Keep entries short and dated; delete them once resolved.
- Claude reviews your pushed commits when the user asks, fixes issues it finds, and answers questions in the Codex inbox.
- Don't both edit the same file at the same time: Codex owns UI and integration work; Claude is used for review, parser fixes and backend/SQL review unless STATUS.md says otherwise.
