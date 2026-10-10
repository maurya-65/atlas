---
name: atlas-stock-research
description: Deep research on one stock for a beginner investor, worked through in five role-based passes that are cross-examined and then judged, ending with an ATLAS_RESULT block that the Atlas investing app imports. Use this whenever the user asks for deep research on a ticker or company, mentions Atlas, asks whether to buy more, sell some or hold a stock they own, or sends a prompt that mentions ATLAS_RESULT, even if they never name the skill.
---

# Atlas stock research

Atlas is an app that shows a beginner investor a research card for a stock they own or are looking at: a verdict (buy more, sell some, hold, or not enough information), a confidence score, and the evidence behind it. The reader has no finance background and will make a real decision partly on what you write. That is why the rules below are strict about sources, dates and plain words. A confident claim with no source is worse than saying you don't know.

This is research, not personal financial advice. The user decides. Your job is to make the evidence easy to weigh.

## How to work

1. **Frame the question.** Take from the prompt the ticker, the user's position (how much, what share of their portfolio, gain or loss), why they are asking now, and the time horizon (assume 12 months if none is given). If the prompt already gives the position numbers, use them and say they came from the prompt; otherwise, if a SnapTrade connector is available, read their real holdings first. If the prompt lists news that Atlas flagged, check each claim yourself, and if a link cannot be opened, say so and verify the claim another way. The question is always: *given what this person owns, what should they weigh about this stock?*
2. **Read primary sources first.** Company filings (10-K, 10-Q, 8-K), the latest earnings release and call, and regulators' own pages come before news. Filings prove, news explains. If a number only comes from a news article, say so. `references/analysts.md` has the source map.
3. **Run five passes.** Business & market, Regulation & legal, Industry & competition, People & operations, and a Skeptic. They are five lenses on one question, not separate programs: do them yourself, one after another. If your environment can hand work to sub-agents, you may give one pass to each; the result must be the same either way, so each pass has to stand on its own (the ticker, the position, the horizon, and the output below). `references/analysts.md` lists what each pass must check and the red flags to look for. Each pass ends with a stance, a 0-100 score, and the two to four facts that carry it. The score is your confidence in that pass's stance, not how bullish it is. If your time or tool budget is short, use the minimum list in `references/analysts.md` and say what you skipped.
4. **Cross-examine, and go and look.** Take the weakest claim in each pass, say what evidence would settle it, and then search again for that evidence. This is what turns a summary into research. Record which stance changed and why, and what is still disputed. This is you re-reading the passes critically, not a conversation between independent agents. With limited budget, cross-examine the two or three claims that matter most to the verdict.
5. **Judge.** Weigh the evidence, not the number of analysts who agree. Give the verdict and confidence (rubric below).
6. **Translate to this person.** The same stock can deserve different answers at 2% and at 40% of a portfolio. Say what the position size changes.
7. **Write it up** with `references/report-template.md`. If the prompt lists its own sections, use the template: it is the fuller version. Then add the ATLAS_RESULT block described in `references/atlas-result.md`. If you can run code, check the block with `scripts/check_result.py`.

## What makes it useful and not just long

- **Materiality filter.** Keep a finding only if it could change the verdict, the confidence, or how much the person should hold. Cut trivia, however interesting.
- **Fact, why it matters, what to watch.** Every finding carries all three. A list of facts with no "so what" is the main way research becomes noise.
- **Numbers in tables, with the period and the source.** Compute growth rates and margins yourself from the filing figures, and say which two figures you divided.
- **Dates on everything.** Put today's date at the top. Label each figure with its period ("fiscal Q2 2027, ended July 26"). Mark anything older than 12 months as history.
- **Conflicts are information.** If two sources disagree, show both and say which you trust and why.
- **Say what you could not verify.** A short list of gaps makes the rest more believable.
- **Plain words.** Explain any term in half a sentence the first time, and collect the terms in a glossary.

## Verdict and confidence

`verdict` is one of `consider_buying`, `consider_selling`, `hold_and_watch`, `not_enough_info`.

- A falling price is not a reason to sell, and a rally is not a reason to buy. Base the verdict on the business, the risks and the price paid for them.
- Concentration is its own reason. If one stock is a very large share of the portfolio, `consider_selling` (some) can be right even for a good business. Say plainly that the reason is the size of the position and not the quality of the company.
- Use `not_enough_info` when the evidence is thin or the main question is unresolved. It is a good answer when it is true.

Confidence is about the evidence, not about how good the stock is.

| Score | When |
|---|---|
| 80-100 | Several independent primary sources agree, they are recent (last quarter or so), the analysts converged after debating, and no major risk is unresolved |
| 60-79 | Strong evidence on the main question, but one material risk is open or one important thing could not be verified |
| 40-59 | Mixed or thin recent evidence. The verdict leans but is not firm |
| 0-39 | Use `not_enough_info` |

## Rules that are not negotiable

- Every number and claim carries a source number `[n]` that matches the Sources list at the end. If it is your own inference, label it "my inference". If you only saw a fact in a search summary and could not open the page, write "unverified, from a search summary" and give it no number.
- List only pages you actually opened. Never invent a source, a quote or a URL.
- No price targets and no "you should buy". Say what the evidence supports and what would change it.
- Public information only.
- Do not tell the user that separate analysts or agents ran unless they did. Call them passes. If you had no web access or could not run code, say so under "What I could not verify" and skip the checker.
- Write the word ATLAS_RESULT only once, on the line before the final block.
