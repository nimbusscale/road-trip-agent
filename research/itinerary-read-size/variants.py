# Rewrites the realistic whole read into slimmer versions, to measure what each change
# to its format would save (research/itinerary-read-size.md). Writes one file per
# version, and prints each one's characters and IDs.
#   python3 research/itinerary-read-size/variants.py \
#     research/itinerary-read-size/full-read-14-realistic.txt <output folder>
import re, sys, os
src, out = sys.argv[1], sys.argv[2]
base = open(src, encoding="utf8").read().rstrip("\n").split("\n")

SET = re.compile(r"^(\s*)- Set (\d+): (.+?) \((place_\w+)\), (.*?)(, selected)?\.( Why: \"(.*)\")?$")

def slim_candidates(lines, fold_selected, keep_why):
    res = []
    i = 0
    while i < len(lines):
        line = lines[i]
        hdr = line.strip()
        if hdr in ("- Candidates:", "- Lodging candidates:"):
            indent = line[: len(line) - len(line.lstrip())]
            j = i + 1
            cands = []
            while j < len(lines) and SET.match(lines[j]) and len(lines[j]) - len(lines[j].lstrip()) > len(indent):
                cands.append(SET.match(lines[j]))
                j += 1
            sel = [m for m in cands if m.group(6)]
            if not sel:  # undecided: keep every candidate, without the selected fold
                res.extend(lines[i:j])
            else:
                s = sel[0]
                others = len(cands) - 1
                # find owning line: the last line in res that names the selected place
                owner = max(k for k in range(len(res)) if s.group(4) in res[k])
                if fold_selected:
                    extra = s.group(5)
                    # stop lines already give visit time; drop it, and "detour ... when offered"
                    extra = re.sub(r", visit time [^,]+", "", extra)
                    extra = re.sub(r", detour [^,]+ when offered", "", extra)
                    why = f' Why: "{s.group(8)}"' if keep_why and s.group(8) else ""
                    o = res[owner]
                    if "Selected: " in o:
                        o = o.replace(f"({s.group(4)}), visit time", f"({s.group(4)}), {extra}, visit time")
                        o = o + why
                    else:  # lodging line
                        o = o[:-1] + f", {extra}.{why}"
                    res[owner] = o
                    if others:
                        res.append(f"{indent}- {others} other candidate{'s' if others != 1 else ''}.")
                else:
                    res.append(line)
                    keep = lines[i + 1 + cands.index(s)]
                    if not keep_why:
                        keep = re.sub(r' Why: ".*"$', "", keep)
                    res.append(keep)
                    if others:
                        res.append(f"{indent}  - {others} other candidate{'s' if others != 1 else ''}.")
            i = j
            continue
        res.append(line)
        i += 1
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
    def f(m):
        return f"{m.group(1)[:3]} {m.group(2)[:3]} {m.group(3)}"
    return [re.sub(rf"({days}), ({mon}) (\d+), 2027", f, l) for l in lines]

variants = {}
variants["0-baseline"] = base
variants["1-drop-unpicked"] = slim_candidates(base, fold_selected=False, keep_why=True)
variants["2-fold-selected"] = slim_candidates(base, fold_selected=True, keep_why=True)
variants["3-fold-no-why"] = slim_candidates(base, fold_selected=True, keep_why=False)
v = variants["2-fold-selected"]
variants["4-fold+no-drive"] = no_drive_lines(v)
variants["5-fold+no-default-tier"] = tier_only_if_not_default(v)
variants["6-fold+no-weather-text"] = no_weather_text(v)
variants["7-fold+no-usual-start"] = no_usual_start(v)
variants["8-fold+short-dates"] = short_dates(v)
allv = short_dates(no_usual_start(no_weather_text(tier_only_if_not_default(no_drive_lines(v)))))
variants["9-fold+all-small"] = allv
variants["11-recommended"] = tier_only_if_not_default(no_drive_lines(v))
variants["10-fold-no-why+all-small"] = short_dates(no_usual_start(no_weather_text(tier_only_if_not_default(no_drive_lines(variants["3-fold-no-why"])))))

os.makedirs(out, exist_ok=True)
b = sum(len(l) + 1 for l in base)
for name, lines in variants.items():
    text = "\n".join(lines) + "\n"
    open(f"{out}/{name}.txt", "w", encoding="utf8").write(text)
    ids = len(re.findall(r"\b(?:place|stop|day|stay)_[a-z0-9]{8}\b", text))
    print(f"{name:28} {len(text):6} chars  {100*(1-len(text)/b):5.1f}% less  {ids:4} IDs")
