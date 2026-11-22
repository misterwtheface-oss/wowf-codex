# WoW Forever Codex — Progress

Goal (user, 2026-11-20): a detailed codex for World of Warcraft: Forever, starting with classes: talent calculator,
spell list, valid races and their racial abilities; show where Forever differs from Classic, and where a racial
benefits the class. Later: saved builds and equipment.

## Status
- 2026-11-20: first build. 9 classes. Talents: Forever trees (3 tabs, 51 points, tier gates, prerequisites), Legacy
  "Talented" rank setting (0-5: first points at levels 9..5), points saved per class (localStorage). Every talent marked
  New / Changed (numbers or wording only) / unchanged vs Classic Era 1.15.9, with the Classic text, old position, ranks,
  name and prerequisites; Classic talents Forever dropped listed under each tree. Spells: class spell list grouped by
  school, filters All / New / Changed / Unchanged / Removed; per-rank level, cost, cast, cooldown, range and text with
  the Classic value struck through; renames (Curse of Agony -> Bane of Agony) and merges (Create Healthstone (Minor)...
  -> ranks of Create Healthstone) matched by spell id; spells that ship unchanged from Season of Discovery data are
  marked "Season of Discovery" (the files alone cannot show whether a trainer teaches them). Races: the races each
  class can be (new combos marked: Human Hunter, Orc Mage, Dwarf Shaman, Undead Paladin, Gnome Priest, Troll Warlock,
  and the new Skyborne races), racials with status vs Classic, class-only versions (Gnome Eureka!, Expansive Mind,
  Undead Touch of the Grave), fit tags (Class version / Your resource / Offense / Slaying) with the data that proves
  them; Choose a race (saved per class).
- 2026-11-21: fixes from user review: off-grid retired talent nodes dropped (Holy Priest, Hunter MM/SV), mobile header
  wraps (info sheet was cut off), same-tier column moves not a change, tooltips never show raw tokens (single-effect
  fallback: Contingency Plan; character-stat formulas = fixed part + "(+ attack power)"), new entries labelled by origin
  ("from TBC / Wrath / Cata / MoP", then retail "WoD/Legion / BfA / Shadowlands / Dragonflight / The War Within / Midnight" by same-name class spell or talent in that client; "was in SoD" only as fallback).
- 2026-11-20: Professions (top switch Classes / Professions; data in `professions.js`, loaded on first open). 13
  professions (Comprehension new). Recipes grouped by Forever's recipe categories, search by recipe / result / reagent,
  filters as Spells. Each recipe: result item (type, level, stats, use text), reagents, tools, skill-up colours (orange
  = recipe item's skill), cast time, recipe items that teach it; diff vs Classic (name, result, reagents, skill-ups,
  text, tools); recipes that changed profession marked Moved (healing potions Alchemy -> First Aid); Forever's parked
  "Season of Discovery" recipe groups shown last. Result items compared with Classic (name, quality, item level,
  required level, armor, stats, damage, speed, effects; Classic flat equip bonuses read as stats). Legacy view: the Legacy Professions tree (read-only, ranks + gates).
- 2026-11-21: Stats view per class: each base stat's effects (attack power / ranged per point, block value, armor,
  health and mana per point, crit / dodge / regen named) with what Classic's tooltip said (gained / lost effects
  marked: Druid Agility -> Cat Form attack power is new), base health / mana at 60, then the talents and abilities
  that raise or convert the stat (from their decoded effects), each compared with Classic; all-stat buffs grouped.
- 2026-11-21: Equipment (third top switch; data in `equipment.js`, loaded on first open, one icon sheet per slot
  group). 11,895 wearable items in 17 slot groups; filters status vs Classic / armor or weapon type / minimum quality,
  search names, stats, effects. Detail: the shared item block (Classic values struck through), binding, classes,
  sell price, server-only marker, item set with pieces and bonuses, random suffixes, "Seen in play" (drops with
  rate, gathers, pick pocket, vendors with price, quest rewards) from the play log, and a link to the item's
  Wowhead Forever page (drops, vendors, quests) with Wowhead's own tooltip script on hover. Wowhead's robots.txt
  bars AI crawlers, so its data is linked, never copied.
- 2026-11-21: Saved builds: above the talent trees, a list of named builds per class (talent points + Talented
  rank, in localStorage), Save (same name overwrites, a new name adds), Delete, Share. Share link
  `#b=<CLASS>~<talented>~<node id base36><rank>.…` (node ids, so data updates never shift it); opening one re-adds the
  points through the calculator's own rules in tier order (unknown or not-yet-allowed ranks drop out). Phones use
  the system share sheet, desktop copies the link.
- Data: extract `tools/build_codex.py` (professions: `tools/build_professions.py`, stats: `tools/build_stats.py`) (+ Classic baseline `tools/fetch_classic.py`, wago.tools CSV of the pinned
  Classic Era build, decoded by the same `build_spells.py` with `WOWF_DATASET=classic`). App build: `python tools/build_data.py --strict`.

## Open
- [ ] Stats: crit / dodge / spell crit / regen per point are client functions with no table in the files (named, not numbered).
- [ ] Professions: trainer recipes' learn skill is server-side. Forever item stat amounts are derived from the budget
  (a 1-point difference is flagged as possible rounding); confirm a few in game.
- [ ] Equipment: drop sources fill only from the play log (WowfLootLog addon) or the Wowhead link; Blizzard API
  (items, auctions) waits on the user's developer key.
- [ ] Talent gate rule assumed Classic-style (points in the tiers above the node); confirm in game.
- [ ] Spell values are rank base values (no level growth, no spell power); trainer lists and costs are server-side.
