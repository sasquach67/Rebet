# STATUS

## Blockers needing the user
- Milestone 1 source gap: identify where to read real player-prop and no-game-time signals. Thirteen real messages are now covered, but these two requested categories were not found in the inspected Rebet history. An async question is pending; synthetic incomplete-copy tests are not counted as real captures.

## Inbox for Codex
- (Codex, 2026-10-01) Read Claude's initial handoff and the full AGENTS.md. Working on milestone 1; Andy explicitly assigned the parser fixes and three captured fixtures to Codex.

## Inbox for Claude
- (Codex, 2026-10-01) Review `cc91cae`: real-fixture parser coverage, headline-to-line matching, missing-time handling and hidden Bet Keys. 24 checks pass in both required TZ runs; browser review shows Arkansas headline stake 0.72. Real prop/no-time source examples remain open. Codex is moving to Supabase integration under the Loop; please coordinate any overlapping edits here.

## Milestones
1. [ ] Real signal fixtures
2. [ ] Supabase schema, auth, sync
3. [ ] send-reminders Edge Function
4. [ ] PWA + push
5. [ ] Frontend features
6. [ ] Hardening

## Current work
- Milestone 1: eleven new real captures plus the two original messages; expected outputs and provenance documented in `tests/fixtures/README.md`. All three original local samples are preserved as fixtures.
- Parser fixes: optional country in headers, market detail, per-line prices/stats, correct headline matching (including a second listed line), repeat warnings, hidden/inline/spoiler Bet Keys, footer isolation, and no fabricated game time for incomplete bot pastes.
- Validation: all 24 parser checks pass with the default environment and `TZ=Asia/Tokyo`; syntax and whitespace checks pass. Browser smoke test observed the Arkansas +8.5 headline populate 0.72 units, -137 odds, and Oct 3 at 8:00 PM local time, with the alternative-line warning.
- Milestone 1 remains unchecked pending real prop/no-time source coverage. Per the Loop, continue to the next unblocked milestone while waiting for those examples.
- Multiple game lines: retain one selected headline bet per bot message, with alternatives preserved separately; pair stats with their own line rather than taking the first QK block blindly.

## Takeover checks — 2026-10-01
- The assigned folder initially contained only Git metadata, with no commits, remote, AGENTS.md, or STATUS.md. Created a local status file and searched nearby locations for the instructions; no Rebet handoff was present locally.
- Resolved after Andy provided the GitHub repository: fetched and checked out `claude/friendly-fermat-852uu6` from `origin`. The original status file is preserved at `.local/STATUS.takeover-2026-10-01.md`; these checks are merged into the repository status.
- Confirmed read-only access to KNIGHTLOCKS / `🤖┃rebet`. Later inspected `🔸∣rebet`; it contains a promotion rather than signal examples.
- Copied three real examples to `.local/discord-samples/2026-10-01.txt`: moneyline, a total with a repeat-message warning, and a spread with two lines. Text was transcribed from the visible UI with normalized line breaks; hidden Bet Key spoilers were not expanded.
- `.local/` remains excluded through `.git/info/exclude` and is now also covered by `.gitignore`.
- No Discord posts/reactions, bets, credential entry, spending, account-setting changes, or dashboard mutations performed.
