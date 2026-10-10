# Report template

Use these headings, in this order, so the report reads the same every time and the user knows where to look. Aim for about 3,500 words or fewer before the Sources list. If it runs long, cut the glossary and "The other angles" to a line each first. Short paragraphs, tables for numbers, no filler.

```
# {Company} ({TICKER}): research as of {today's date}

**Verdict:** {plain words} · **Confidence:** {n}/100 · **Horizon:** {12 months}

## 1. Bottom line
**In one line:** what the company does and how it makes money.

Then three or four sentences: what the evidence says, the main reason, the main risk. [n]
**What would change my mind:** one or two concrete, checkable things.

## 2. For your position
You own ${value} ({x}% of your portfolio), {up/down} {y}% from what you paid.
- What a 20% and a 50% fall in this stock do to your whole portfolio, in dollars and percent.
- Whether the size of the position changes the answer, and why. Keep this apart from the quality of the company.

## 3. What changed recently
Newest first, last 90 days. Each line: date, what happened, why it matters. [n]

## 4. Business and numbers
A table of the last 6-8 quarters (revenue, growth against the year before, operating margin, free cash flow), with the period and source. Then three to five bullets that read the table: what is improving, what is not.

## 5. What the market expects
Valuation against its own history and close peers, and what growth the price assumes. No price target.

## 6. Bull case and bear case
A table each: claim | evidence [n] | what would prove it wrong.

## 7. Risks, ranked
A table: risk | likelihood (low / medium / high) | impact | evidence [n] | what to watch.

## 8. The other angles
Regulation and legal, industry and competition, people and operations: one short paragraph each, only what matters.

## 9. Where the analysts disagreed
What was disputed, what each side showed, what is still open.

## 10. Dates to watch
The next three to six months: earnings date, court dates, rule deadlines, product events, contract expiries. [n]

## 11. What I could not verify
Plain list of gaps and why they matter.

## 12. Glossary
Only the terms used above, each in half a sentence.

## 13. Sources
1. Title, publisher, date, type (filing, regulator, company, news), URL
2. ...
```

Then the ATLAS_RESULT block, see `atlas-result.md`.

Notes:
- Citations `[n]` in the report and in the JSON use the same numbers, the order of the Sources list.
- Write "your" and "you" to the user. Do not write "the investor".
- A table cell with no data says "not disclosed" or "not found", never a guess.
- Translate ratios into things a beginner can feel: a 1.4% operating margin is about $1.40 of profit on every $100 of sales.
