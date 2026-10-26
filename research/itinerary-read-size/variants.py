# Rewrites the realistic whole read into slimmer versions, to measure what each change
# to its format would save (research/itinerary-read-size.md). Writes one file per
# version, named by its letter in the doc's section 3, and prints each one's characters
# and IDs. It also runs on the nothing-picked read, where only versions L and M, and the L versions with names, change it.
#   python3 research/itinerary-read-size/variants.py \
#     research/itinerary-read-size/full-read-14-realistic.txt <output folder>
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
base = open(src, encoding="utf8").read().rstrip("\n").split("\n")

SET = re.compile(r"^(\s*)- Set (\d+): (.+?) \((place_\w+)\), (.*?)(, selected)?\.( Why: \"(.*)\")?$")


def plural(n):
    return f"{n} other candidate{'s' if n != 1 else ''}"


def others_lines(indent, cands, sel, others, listing="count"):
    """What stands in for the candidates not picked."""
    rest = [m for m in cands if m is not sel]
    if not rest:
        return []
    if others == "count":
        return [f"{indent}- {plural(len(rest))}."]
    picked_set = int(sel.group(2))
    if others == "by_set":
        return [f"{indent}- Other candidates: {set_counts(rest, listing)}."]
    # newer_sets: count the rest of the picked set and older sets, list newer sets in full
    older = [m for m in rest if int(m.group(2)) <= picked_set]
    newer = [m for m in rest if int(m.group(2)) > picked_set]
    lines = [f"{indent}- {plural(len(older))} in sets up to the picked one."] if older else []
    if newer:
        lines.append(f"{indent}- In sets newer than the picked one:")
        lines += [f"{indent}  {m.group(0).strip()}" for m in newer]
    return lines


def set_counts(cands, listing="count"):
    """Counts the candidates by set, or lists their names by set, with or without IDs."""
    sets = {}
    for m in cands:
        sets.setdefault(int(m.group(2)), []).append(m)
    if listing == "count":
        return ", ".join(f"{len(ms)} in set {k}" for k, ms in sorted(sets.items()))
    name = (lambda m: f"{m.group(3)} ({m.group(4)})") if listing == "names_ids" else (lambda m: m.group(3))
    return "; ".join(f"set {k}: " + ", ".join(name(m) for m in ms) for k, ms in sorted(sets.items()))


def slim_candidates(
    lines, fold=True, keep_why=True, keep_detour=False, others="count", undecided="list", listing="count"
):
    res = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip() not in ("- Candidates:", "- Lodging candidates:"):
            res.append(line)
            i += 1
            continue
        indent = line[: len(line) - len(line.lstrip())]
        j = i + 1
        cands = []
        while j < len(lines) and SET.match(lines[j]) and len(lines[j]) - len(lines[j].lstrip()) > len(indent):
            cands.append(SET.match(lines[j]))
            j += 1
        sel = next((m for m in cands if m.group(6)), None)
        if sel is None and undecided == "count":  # nothing picked: count the candidates by set
            res.append(f"{indent}- {line.strip()[2:-1]}: {set_counts(cands, listing)}.")
        elif sel is None:  # nothing picked: keep every candidate
            res.extend(lines[i:j])
        elif fold:
            extra = re.sub(r", visit time [^,]+", "", sel.group(5))
            if not keep_detour:
                extra = re.sub(r", detour [^,]+ when offered", "", extra)
            why = f' Why: "{sel.group(8)}"' if keep_why and sel.group(8) else ""
            owner = max(k for k in range(len(res)) if sel.group(4) in res[k])
            o = res[owner]
            if "Selected: " in o:  # a stop line, which already gives the visit time
                o = o.replace(f"({sel.group(4)}), visit time", f"({sel.group(4)}), {extra}, visit time") + why
            else:  # a stay's lodging line
                o = o[:-1] + f", {extra}.{why}"
            res[owner] = o
            res += others_lines(indent, cands, sel, others, listing)
        else:  # keep the selected candidate's own line
            keep = lines[i + 1 + cands.index(sel)]
            if not keep_why:
                keep = re.sub(r' Why: ".*"$', "", keep)
            res += [line, keep] + others_lines(indent + "  ", cands, sel, others)
        i = j
    return res


def no_drive_lines(lines):
    return [l for l in lines if not re.match(r"^- .*: drive\.$", l)]


def tier_only_if_not_default(lines):
    return [l.replace(' Tier: value, from the rule "the trip default".', "") for l in lines]


def no_weather_text(lines):
    return [re.sub(r'(- Weather and clothing, from [^,]+, written [^:]+): ".*?"', r"\1.", l) for l in lines]


def no_usual_start(lines):
    return [l.replace(" Starts 8:00 a.m., the usual start time.", "") for l in lines]


def short_dates(lines):
    days = "Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday"
    mon = "January|February|March|April|May|June|July|August|September|October|November|December"
    return [re.sub(rf"({days}), ({mon}) (\d+), 2027", lambda m: f"{m.group(1)[:3]} {m.group(2)[:3]} {m.group(3)}", l) for l in lines]


def small_cuts(lines):
    return short_dates(no_usual_start(no_weather_text(tier_only_if_not_default(no_drive_lines(lines)))))


b_version = slim_candidates(base)
versions = {
    "today": base,
    "A-drop-unpicked": slim_candidates(base, fold=False),
    "B-fold-selected": b_version,
    "C-B-no-drive-lines": no_drive_lines(b_version),
    "D-B-tier-only-if-not-default": tier_only_if_not_default(b_version),
    "E-B-no-weather-text": no_weather_text(b_version),
    "F-B-with-C-and-D": tier_only_if_not_default(no_drive_lines(b_version)),
    "G-B-no-why": slim_candidates(base, keep_why=False),
    "H-B-all-small-cuts": small_cuts(b_version),
    "I-H-no-why": small_cuts(slim_candidates(base, keep_why=False)),
    "J-B-detour-count-by-set": slim_candidates(base, keep_detour=True, others="by_set"),
    "K-B-detour-newer-sets": slim_candidates(base, keep_detour=True, others="newer_sets"),
    "L-J-count-undecided-too": slim_candidates(base, keep_detour=True, others="by_set", undecided="count"),
    "M-L-no-why-no-weather-text": no_weather_text(
        slim_candidates(base, keep_why=False, keep_detour=True, others="by_set", undecided="count")
    ),
    "L-with-names": slim_candidates(base, keep_detour=True, others="by_set", undecided="count", listing="names"),
    "L-with-names-and-ids": slim_candidates(
        base, keep_detour=True, others="by_set", undecided="count", listing="names_ids"
    ),
}

os.makedirs(out, exist_ok=True)
total = sum(len(l) + 1 for l in base)
for name, lines in versions.items():
    text = "\n".join(lines) + "\n"
    open(f"{out}/{name}.txt", "w", encoding="utf8").write(text)
    ids = len(re.findall(r"\b(?:place|stop|day|stay)_[a-z0-9]{8}\b", text))
    print(f"{name:30} {len(text):6} chars  {100 * (1 - len(text) / total):5.1f}% less  {ids:4} IDs")
