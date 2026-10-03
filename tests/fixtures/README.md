# Parser fixture provenance

Run `node tests/parse.test.js` and `TZ=Asia/Tokyo node tests/parse.test.js` from the repository root. Expected values are maintained in `real-signals.expected.json`; the two original fixtures have inline assertions in the test file.

There are **13 real bot messages**: two in the original `rebet-bot-2.txt`, plus eleven individually captured messages. Codex transcribed the additional messages from the Discord desktop UI on October 1, 2026, in KNIGHTLOCKS / `🤖┃rebet`, channel `1457953939441061959`. The fixed parsing context is October 1, 2026 at 4:00 PM America/New_York. “Today” and “Yesterday” refer to that capture day.

Line breaks and whitespace were normalized from visible text. Message bodies, odds, dates and statistics were retained. User lists and reactions were omitted. `[Spoiler not expanded]` explicitly marks an uncaptured Bet Key; it is not a real key. Per-message URLs were not captured. Source statements have not been independently verified as sports facts.

| Fixture | Displayed posting time | Coverage |
| --- | --- | --- |
| `moneyline-argentina` | Oct 1, 12:47 PM | Soccer moneyline; nested market parentheses |
| `total-repeat-nfl` | Oct 1, 12:53 PM | Repeat-message warning; American odds |
| `spread-multiple-hawaii` | Oct 1, 1:21 PM | Negative spread; two independent lines; midnight EDT |
| `total-multiple-euroleague` | Oct 1, 2:16 PM | Header without country; three lines; repeat warning |
| `spread-headline-second-arkansas` | Oct 1, 3:23 PM | Headline matches the second line, not the first |
| `total-first-half-mlb` | Oct 1, 10:16 AM | Preserve first-half market detail |
| `moneyline-regulation-hockey` | Oct 1, 11:10 AM | Regulation-time detail; past-game warning |
| `spread-soccer-no-country` | Oct 1, 8:23 AM | Soccer header without country |
| `moneyline-cpbl` | Oct 1, 12:14 PM | Different baseball league; morning EDT |
| `spread-yesterday-womens-soccer` | Sep 30, 1:20 PM (“Yesterday”) | Relative sent timestamp; previous day's game |
| `total-stale-headline-ncaa` | Feb 26, 7:01 PM | Explicit sent date; EST; unmatched headline |

The first three files were copied directly from the earlier local capture at `.local/discord-samples/2026-10-01.txt`. The other eight were transcribed during this parser cycle. The two original NCAA examples were supplied with the repository and were also visible in the channel during this cycle.

One bot message produces one selected signal. `gameLines` preserves every listed price and its own statistics; `selectedGameLine` points to the entry matching the headline pick and odds. If no entry matches, the headline remains visible but units, win percentage and fair value stay unset, with a review warning. The parser does not turn alternative lines into additional bets.

## Remaining source coverage

No real player-prop or no-game-time message was found in the inspected channel history. Searches for passing, yards and points did not yield player props; the other `🔸∣rebet` channel contained a promotion rather than signals. These categories remain open for milestone 1.

Tests that remove the game timestamp, alter footer content, or wrap a key in spoiler markup are explicitly labeled controlled mutations. They test incomplete-copy behavior and **do not count as additional real captures**. Missing game times produce `start: null`, never an invented noon or a time borrowed from the message footer.

### Win result screenshot (2026-10-03)
`win-checkmark-liberty.txt` transcribes the visible author/time, WINNER heading and checkmarked pick from Andy's supplied screenshot. The attached score image and reactions are excluded. This is a win post, not a new betting signal.
