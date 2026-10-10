# The ATLAS_RESULT block

The last thing in the answer is a line containing exactly `ATLAS_RESULT`, then one fenced `json` block, then nothing. Atlas reads the last ATLAS_RESULT in the text and parses the first complete JSON object after it. If the block is wrong, the import is refused and the user has to ask again, so it is worth checking.

```json
{
  "ticker": "EXMP",
  "verdict": "hold_and_watch",
  "confidence": 62,
  "summary": "3-5 sentences: the verdict, the main reason, the main risk, with [n] citations.",
  "bull": ["Each point is one sentence with [n]."],
  "bear": ["Each point is one sentence with [n]."],
  "angles": [
    { "name": "Business & market", "stance": "hold_and_watch", "score": 60, "summary": "2-3 sentences [n]" }
  ],
  "agreements": ["Something the analysts agreed on."],
  "disagreements": ["Something still disputed, naming the passes."],
  "whatWouldChangeMyMind": "One or two concrete things.",
  "sources": [
    { "title": "Page title", "url": "https://example.com/page" }
  ]
}
```

A complete example is in `example-result.json` next to this file.

## Rules

- `ticker`: letters only, up to 10 characters (dots and dashes are fine, e.g. `BRK-B`). The ticker must be the stock the user asked about.
- `verdict` and each angle's `stance`: exactly one of `consider_buying`, `consider_selling`, `hold_and_watch`, `not_enough_info`. Anything else is refused.
- `confidence` and each angle's `score`: a number from 0 to 100.
- `angles`: one for each of Business & market, Regulation & legal, Industry & competition, People & operations, Skeptic.
- `sources`: at least one with an `http://` or `https://` URL. List them in the same order as the report's Sources list.
- Citations: write `[n]` where n is the position in `sources`, counting from 1. Atlas links each one to its source and removes any that point at nothing, so a wrong number silently loses the citation.
- Plain words, as in the report. No line breaks inside strings.
- Do not write the word ATLAS_RESULT anywhere else.

## Checking it

If you can run code, save the whole answer to a file and run:

```
python scripts/check_result.py report.md
```

It parses the block the way Atlas does and lists anything that would be refused or lose a citation. Fix what it reports and run it again.
