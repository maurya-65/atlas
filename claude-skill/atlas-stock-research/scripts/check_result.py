"""Check the ATLAS_RESULT block at the end of a research report.

Usage: python check_result.py report.md

It reads the block the way Atlas does (the last ATLAS_RESULT, then the first complete JSON object after it)
and prints what Atlas would refuse and what would lose a citation. Exit code 0 means the block is fine.
Standard library only.
"""
import json
import re
import sys

VERDICTS = {"consider_buying", "consider_selling", "hold_and_watch", "not_enough_info"}
ANGLES = ["Business & market", "Regulation & legal", "Industry & competition", "People & operations", "Skeptic"]


def first_object(text, start):
    """The first balanced {...} after `start`, ignoring braces inside JSON strings."""
    begin = text.find("{", start)
    if begin < 0:
        return None
    depth, in_string, i = 0, False, begin
    while i < len(text):
        ch = text[i]
        if in_string:
            if ch == "\\":
                i += 1
            elif ch == '"':
                in_string = False
        elif ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[begin : i + 1]
        i += 1
    return None


def strings_in(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for item in value:
            yield from strings_in(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from strings_in(item)


def check(text):
    errors, warnings = [], []

    marker = text.rfind("ATLAS_RESULT")
    if marker < 0:
        return ["No ATLAS_RESULT line found."], warnings
    if text.count("ATLAS_RESULT") > 1:
        warnings.append("The word ATLAS_RESULT appears more than once. Write it only before the final block.")
    raw = first_object(text, marker)
    if raw is None:
        return ["The block after ATLAS_RESULT is cut off (no complete JSON object)."], warnings
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        return [f"The block is not valid JSON: {e}."], warnings
    if not isinstance(data, dict):
        return ["The block must be a JSON object."], warnings

    ticker = data.get("ticker")
    if not isinstance(ticker, str) or not re.fullmatch(r"[A-Za-z.\-]{1,10}", ticker.strip()):
        errors.append('"ticker" must be letters only, up to 10 characters (dots and dashes allowed).')
    if data.get("verdict") not in VERDICTS:
        errors.append(f'"verdict" must be one of {sorted(VERDICTS)}.')

    sources = data.get("sources")
    usable = set()
    if not isinstance(sources, list):
        errors.append('"sources" must be a list.')
        sources = []
    for n, s in enumerate(sources, start=1):
        url = s.get("url") if isinstance(s, dict) else None
        if isinstance(url, str) and re.match(r"https?://", url):
            usable.add(n)
        else:
            warnings.append(f"Source [{n}] has no http(s) URL, so citations to it are dropped.")
    if not usable:
        errors.append('"sources" needs at least one entry with an http(s) URL.')

    confidence = data.get("confidence")
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        warnings.append('"confidence" is not a number, so Atlas shows 0.')
    elif not 0 <= confidence <= 100:
        warnings.append('"confidence" is outside 0-100 and will be clamped.')

    for key in ("summary", "whatWouldChangeMyMind"):
        if not isinstance(data.get(key), str) or not data.get(key).strip():
            warnings.append(f'"{key}" is missing or empty.')
    for key in ("bull", "bear", "agreements", "disagreements"):
        if not isinstance(data.get(key), list):
            warnings.append(f'"{key}" should be a list of strings.')

    angles = data.get("angles")
    if isinstance(angles, list):
        names = [a.get("name") for a in angles if isinstance(a, dict)]
        for wanted in ANGLES:
            if wanted not in names:
                warnings.append(f'No angle named "{wanted}".')
        for a in angles:
            if isinstance(a, dict) and a.get("stance") not in VERDICTS:
                warnings.append(f'Angle "{a.get("name")}" has an invalid stance, which Atlas shows as not_enough_info.')
    else:
        warnings.append('"angles" should be a list with one entry per pass.')

    body = text[:marker]
    cited = {int(n) for n in re.findall(r"\[(\d+)\]", body)}
    for n in sorted(cited):
        if n < 1 or n > len(sources):
            warnings.append(f"The report cites [{n}] but the Sources list has {len(sources)} entries.")

    for text_value in strings_in({k: v for k, v in data.items() if k != "sources"}):
        for m in re.finditer(r"\[(\d+)\]", text_value):
            if int(m.group(1)) not in usable:
                warnings.append(f"Citation [{m.group(1)}] points at no usable source and will be removed: \"{text_value[:60]}...\"")

    if data.get("verdict") == "not_enough_info" and isinstance(confidence, (int, float)) and confidence >= 40:
        warnings.append("not_enough_info with confidence 40 or more does not fit the rubric.")
    if isinstance(confidence, (int, float)) and confidence >= 80 and len(usable) < 5:
        warnings.append("Confidence 80 or more with fewer than 5 usable sources does not fit the rubric.")
    urls = [s.get("url") for s in sources if isinstance(s, dict)]
    if len(urls) != len(set(urls)):
        warnings.append("Some sources are listed twice.")

    return errors, warnings


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    with open(sys.argv[1], encoding="utf-8") as f:
        errors, warnings = check(f.read())
    for e in errors:
        print("ERROR  ", e)
    for w in warnings:
        print("WARNING", w)
    if not errors and not warnings:
        print("OK: Atlas will import this block as it is.")
    elif not errors:
        print("Atlas will import this block, but see the warnings.")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
