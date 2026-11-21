"""Build the app's runtime artifacts from _wowf_extract (never ships the extract itself, rule G-extract-not-in-app).

  python tools/build_data.py [--strict]

Input : ../_wowf_extract/data/entities/codex.json (tools/build_codex.py in the extract)
        ../_wowf_extract/assets/{icons,atlas/members,talents} (tools/build_assets.py in the extract)
Output: data.js (window.CODEX), professions.js (window.PROF, loaded on demand), assets/icons/<sheet>.webp (64 px
        icon sheets: one shared, one per class, one per profession), assets/talents/<background>.webp
--strict fails on any missing asset instead of reporting it (rule A-provenance-guards).
"""
import hashlib
import json
import os
import subprocess
import sys

from PIL import Image

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(os.path.dirname(APP), "_wowf_extract")
ICONS = os.path.join(EXT, "assets", "icons")
MEMBERS = os.path.join(EXT, "assets", "atlas", "members")
TALENTS = os.path.join(EXT, "assets", "talents")
STRICT = "--strict" in sys.argv
CELL = 64   # native icon size; atlas art (128/256 px) is reduced with Lanczos, no sharpening (rule G-no-ai-scaler)
COLS = 16
missing = []


def ver(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()[:8]


def rel(path):
    return os.path.relpath(path, APP).replace("\\", "/") + "?v=" + ver(path)


class Sheet:
    """Collects icons into one webp sheet; icon refs become [sheet index, cell index]."""

    def __init__(self, name, sid):
        self.name, self.sid, self.cells, self.ix = name, sid, [], {}

    def add(self, src):
        """src = ('icon', file name) or ('atlas', member name). Returns [sheet, cell] or None (logged as missing)."""
        if not src or not src[1]:
            return None
        if src in self.ix:
            return [self.sid, self.ix[src]]
        path = os.path.join(ICONS if src[0] == "icon" else MEMBERS, src[1] + ("" if src[1].endswith(".png") else ".png"))
        if not os.path.exists(path):
            missing.append(f"{self.name}: {src}")
            return None
        self.ix[src] = len(self.cells)
        self.cells.append(path)
        return [self.sid, self.ix[src]]

    def save(self):
        rows = max(1, (len(self.cells) + COLS - 1) // COLS)
        img = Image.new("RGBA", (COLS * CELL, rows * CELL), (0, 0, 0, 0))
        for i, p in enumerate(self.cells):
            im = Image.open(p).convert("RGBA")
            if im.size != (CELL, CELL):
                im = im.resize((CELL, CELL), Image.LANCZOS)
            img.paste(im, ((i % COLS) * CELL, (i // COLS) * CELL))
        out = os.path.join(APP, "assets", "icons", self.name + ".webp")
        os.makedirs(os.path.dirname(out), exist_ok=True)
        img.save(out, "WEBP", quality=90, method=6)
        return {"src": rel(out), "cols": COLS, "rows": rows}


def professions(P, first):
    """professions.js (window.PROF), loaded by the app only when Professions opens. One icon sheet per profession; an
    icon shared by several professions sits in the first one that uses it (sheet indices continue after data.js's)."""
    sheets, where = [], {}

    def ic(sheet, name):
        if not name:
            return None
        if name not in where:
            where[name] = sheet.add(("icon", name))
        return where[name]

    common = Sheet("prof-common", first)
    sheets.append(common)
    for n in P["legacy"]["nodes"]:
        n["icon"] = ic(common, n["icon"])
    for p in P["professions"]:
        p["icon"] = ic(common, p["icon"])
    items = P["items"]
    for p in P["professions"]:
        sh = Sheet("prof-" + p["name"].lower().replace(" ", "-"), first + len(sheets))
        sheets.append(sh)
        for r in p["recipes"] + p["removed"]:
            r["icon"] = ic(sh, r["icon"])
            cl = r.get("classic") or {}
            for iid in [r.get("creates"), (cl.get("creates") or [None])[0]] + [i for i, _ in r["reagents"]] + \
                    [i for i, _ in cl.get("reagents") or []] + (r.get("taught_by") or []):
                it = items.get(str(iid)) if iid else None
                if it and isinstance(it.get("i"), str):
                    it["i"] = ic(sh, it["i"])
    for it in items.values():
        if isinstance(it.get("i"), str):
            it["i"] = None
    P["sheets"] = [s.save() for s in sheets]
    out = os.path.join(APP, "professions.js")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("window.PROF=" + json.dumps(P, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("professions.js", os.path.getsize(out), "sheets", [(s.name, len(s.cells)) for s in sheets])
    return rel(out)


def main():
    X = json.load(open(os.path.join(EXT, "data", "entities", "codex.json"), encoding="utf-8"))
    sheets = [Sheet("common", 0)]
    common = sheets[0]

    def ic(sheet, name):
        return sheet.add(("icon", name)) if name else None

    def spell_icons(sheet, sp):
        sp["icon"] = ic(sheet, sp.get("icon"))
        for r in sp.get("ranks", []) + sp.get("removed_ranks", []):
            r.pop("icon", None)
            r.pop("passive", None)
        sp.pop("ids", None)

    for c in X["classes"]:
        c["icon"] = common.add(("atlas", c["icon"]))
        sh = Sheet(c["token"].lower(), len(sheets))
        sheets.append(sh)
        for t in c["tabs"]:
            t["icon"] = ic(common, t["icon"])
            bg = os.path.join(TALENTS, t["bg"] + ".png")
            if os.path.exists(bg):
                out = os.path.join(APP, "assets", "talents", t["bg"] + ".webp")
                os.makedirs(os.path.dirname(out), exist_ok=True)
                Image.open(bg).convert("RGBA").save(out, "WEBP", quality=88, method=6)
                t["bg"] = rel(out)
            else:
                missing.append(f"talent background {bg}")
                t["bg"] = None
            for n in t["nodes"]:
                n["icon"] = ic(sh, n["icon"])
        for tab, nodes in c["removed_talents"].items():
            for n in nodes:
                n["icon"] = ic(sh, n["icon"])
        c.pop("classic_tabs", None)
        for u in c["stats"]["users"]:
            u["icon"] = ic(sh, u["icon"])
        for sp in c["spells"] + c["removed_spells"]:
            spell_icons(sh, sp)
    for r in X["races"]:
        r["icon"] = common.add(("atlas", r["icon"]))
        for g in r["racials"] + r["removed_racials"]:
            g["icon"] = ic(common, g["icon"])
            for v in g["variants"]:
                v.pop("icon", None)
    X["sheets"] = [s.save() for s in sheets]
    X["prof_src"] = professions(X.pop("professions"), len(sheets))
    out = os.path.join(APP, "data.js")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write("window.CODEX=" + json.dumps(X, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print("data.js", os.path.getsize(out), "sheets", [(s.name, len(s.cells)) for s in sheets])
    if missing:
        print("MISSING", len(missing), *missing[:30], sep="\n  ")
        if STRICT:
            sys.exit(1)
    subprocess.run([sys.executable, os.path.join(os.path.dirname(APP), "tools", "app", "stamp_cache.py"), APP], check=True)


if __name__ == "__main__":
    main()
