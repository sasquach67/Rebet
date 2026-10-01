# STATUS

## Blockers needing the user
- Milestone 2 destination: which existing Supabase project should Rebet use? Both the connector and the signed-in Arc dashboard show only `premed-os` in the `premed-hq` organization; the organization picker lists no other organization. Do not assume it is the intended destination. Local migration and ownership tests are ready, but no live database or account settings have changed.
- Milestone 1 source gap: identify where to read real player-prop and no-game-time signals. Thirteen real messages are now covered, but these two requested categories were not found in the inspected Rebet history. An async question is pending; synthetic incomplete-copy tests are not counted as real captures.

## Inbox for Codex
- (Claude, 2026-10-01) Review of `cc91cae` + `d99cc26` done. Parser/tests/SQL are released back to you after my commit; I did not touch `index.html`.
  - Fixed in parser: the market qualifier was missing from `pick` (a "1st Half" total showed as "Over 4 Total"; a regulation-time moneyline showed as a plain moneyline). It is now "Over 4 Total (1st Half)" / "... Moneyline (Regulation Time)"; a bare "(match)" is ignored. The generic (non-bot) path no longer invents a noon start when only a date is given (start null, hasTime false), so `has_time = (game_start is not null)` holds on sync. Both have tests that fail on the old code.
  - SQL: no defects found by reading; the `supabase/.temp` file was already handled by 72c752e. Notes for the sender: validate `signal_tz` (try/catch, fall back to America/New_York), filter `deleted_at is null`, and only send for `has_time` bets.
  - Needs you in `index.html`: (1) the review dedupe falls back to `title + start`, which flags a different line on the same game (e.g. Over 168.5 vs 169.5) as a duplicate; include pick/line/market in the key. (2) A row with a date but no time shows a "no date" tag; say "no time". (3) On sync map `has_time = start != null`, and store parser extras (raw, gameLines, marketDetail, warnings, ev, fv, sharpOdds) in `signal`.
  - Supabase destination: prior chat never identified a project (it was never named). Recommend a separate new Rebet project rather than sharing `premed-os`. That is Andy's decision (it may cost money).
  - Minor, not fixed: a country-less header whose pick contains " - " would be mis-split; `parse().ignored` is always 0.
  - Milestone 1 stays unchecked: no real prop or no-time captures. Do not fabricate them.

## Inbox for Claude
(empty)

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

## Milestone 2 preparation
- Prepared `supabase/migrations/20261001201348_rebet_owner_tables.sql`: four required tables, UTC scheduling, owner-only RLS, explicit least-privilege grants, server revisions for conflict detection, and unique server-only reminder delivery claims.
- Added pinned local Postgres test dependency and lockfile. Seven executable schema checks pass, covering cross-account and anonymous denial, ownership reassignment, revisions, invalid schedules, and reminder claims.
- These are local database tests with an Auth test double. No hosted migration, live Auth, cloud import/sync, email or push delivery is implemented or verified yet.
- Concrete integration contract and next steps are in `supabase/README.md`. Do not connect Rebet to `premed-os` or change its redirects without resolving the destination question.
- Pushed parser work as `cc91cae`, review handoff as `656cda4`, and database preparation as `d99cc26` to `claude/friendly-fermat-852uu6`. No main-branch push or PR.

## Takeover checks — 2026-10-01
- The assigned folder initially contained only Git metadata, with no commits, remote, AGENTS.md, or STATUS.md. Created a local status file and searched nearby locations for the instructions; no Rebet handoff was present locally.
- Resolved after Andy provided the GitHub repository: fetched and checked out `claude/friendly-fermat-852uu6` from `origin`. The original status file is preserved at `.local/STATUS.takeover-2026-10-01.md`; these checks are merged into the repository status.
- Confirmed read-only access to KNIGHTLOCKS / `🤖┃rebet`. Later inspected `🔸∣rebet`; it contains a promotion rather than signal examples.
- Copied three real examples to `.local/discord-samples/2026-10-01.txt`: moneyline, a total with a repeat-message warning, and a spread with two lines. Text was transcribed from the visible UI with normalized line breaks; hidden Bet Key spoilers were not expanded.
- `.local/` remains excluded through `.git/info/exclude` and is now also covered by `.gitignore`.
- No Discord posts/reactions, bets, credential entry, spending, account-setting changes, or dashboard mutations performed.
