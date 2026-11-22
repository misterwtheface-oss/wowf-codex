/* WoW Forever Codex: classes (talent calculator, spell list, races and racials), professions (recipes, Legacy
   Professions tree) and equipment, every entry compared with Classic Era. Profession data (professions.js) and
   equipment data (equipment.js) load on first use. */
(() => {
  'use strict';
  const X = window.CODEX;
  const FEATURES = {};
  const KEY = 'wowf-codex-v1';
  const VIEWS = [['talents', 'Talents'], ['spells', 'Spells'], ['races', 'Races'], ['stats', 'Stats']];
  const PVIEWS = [['recipes', 'Recipes'], ['legacy', 'Legacy']];
  const MODES = [['classes', 'Classes'], ['prof', 'Professions'], ['equip', 'Equipment']];
  const CLS = Object.fromEntries(X.classes.map(c => [c.token, c]));
  const RACE = Object.fromEntries(X.races.map(r => [r.id, r]));
  const CLASS_BY_ID = Object.fromEntries(X.classes.map(c => [c.id, c]));
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const wide = () => matchMedia('(min-width: 900px)').matches;

  // ------------------------------------------------------------------ state
  const S = Object.assign({ cls: X.classes[0].token, view: 'talents', tab: 0, pts: {}, race: {}, filter: 'all',
    mode: 'classes', prof: null, pview: 'recipes', pfilter: 'all', eslot: 'head', efilter: 'all', esub: '', eq: 0 },
    JSON.parse(localStorage.getItem(KEY) || '{}'));
  if (!CLS[S.cls]) S.cls = X.classes[0].token;
  let sel = null; // {kind, id}
  let P = null, query = ''; // window.PROF once loaded; recipe search text (not saved)
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
  const cls = () => CLS[S.cls];
  const pts = () => (S.pts[S.cls] ||= {});

  // ------------------------------------------------------------------ helpers
  function icon(ref, size = 40, extra = '') {
    if (!ref) return `<i class="ic ic-none ${extra}" style="width:${size}px;height:${size}px"></i>`;
    const sh = X.sheets[ref[0]], i = ref[1];
    const x = (i % sh.cols) * size, y = Math.floor(i / sh.cols) * size;
    return `<i class="ic ${extra}" style="width:${size}px;height:${size}px;background-image:url('${sh.src}');` +
      `background-size:${sh.cols * size}px ${sh.rows * size}px;background-position:-${x}px -${y}px"></i>`;
  }
  // game text: colour codes (case-insensitive: |cffffd100 ... |r, |CFFFFFFFF ... |R; a coloured run reads as a
  // highlight), inline textures and line breaks
  const clean = t => esc(String(t || '').replace(/\|T[^|]*\|t/g, ''))
    .replace(/\|c(?:[0-9a-f]{8}|n[A-Z_]+:)(.*?)\|r/gi, '<b class="hl">$1</b>')
    .replace(/\|c[0-9a-f]{8}|\|cn[A-Z_]+:|\|r/gi, '').replace(/\n/g, '<br>');
  const NUM = /\d+(?:\.\d+)?/g;
  // mark the numbers of `text` that differ from the same-position numbers of `other`
  function marked(text, other, cls_ = 'up') {
    const t = clean(text);
    if (other == null) return t;
    const a = String(text || '').match(NUM) || [], b = String(other || '').match(NUM) || [];
    if (a.length !== b.length) return t;
    let k = 0;
    return t.replace(NUM, m => { const i = k++; return a[i] !== b[i] ? `<b class="${cls_}">${m}</b>` : m; });
  }
  const BADGE = { new: 'New', changed: 'Changed', removed: 'Removed', moved: 'Moved', sod: 'Season of Discovery' };
  const KIND = { wording: ' · wording', skill: ' · skill-ups', item: ' · item' };
  // x: the entry (origin = later expansion it was backported from; was_sod = only Season of Discovery had it)
  function badge(status, kind, x) {
    if (!status || status === 'same') return '';
    const k = status === 'changed' && KIND[kind] ? KIND[kind] :
      status === 'new' && x?.origin ? ` · from ${x.origin}` : status === 'new' && x?.was_sod ? ' · was in SoD' : '';
    return `<span class="bdg bdg-${status}">${BADGE[status]}${k}</span>`;
  }

  const originNote = x => x.origin ? `; backported from ${x.origin} (the ${x.origin} ${esc(cls().name)} had one of this name)` :
    x.was_sod ? '; Season of Discovery had a version' : '';

  // ------------------------------------------------------------------ talents: rules
  const tabOf = c => Object.fromEntries(c.tabs.flatMap((t, ti) => t.nodes.map(n => [n.id, ti])));
  const nodeById = c => Object.fromEntries(c.tabs.flatMap(t => t.nodes.map(n => [n.id, n])));
  const total = () => Object.values(pts()).reduce((a, b) => a + b, 0);
  const tabPts = ti => cls().tabs[ti].nodes.reduce((a, n) => a + (pts()[n.id] || 0), 0);
  // points in the tab's tiers above `tier` (the gate counts what is spent before the node's row)
  const above = (ti, tier, P = pts()) => cls().tabs[ti].nodes.reduce((a, n) => a + (n.tier < tier ? P[n.id] || 0 : 0), 0);
  function blockers(n, ti, P = pts()) {
    const out = [];
    if (n.gate && above(ti, n.tier, P) < n.gate) out.push(`Requires ${n.gate} points in ${cls().tabs[ti].name}`);
    const nb = nodeById(cls());
    for (const p of n.prereq) {
      const q = nb[p];
      if (q && (P[p] || 0) < q.max) out.push(`Requires ${q.name} (${q.max}/${q.max})`);
    }
    return out;
  }
  const canAdd = (n, ti) => total() < cls().points && (pts()[n.id] || 0) < n.max && !blockers(n, ti).length;
  function canRemove(n, ti) {
    const P = pts(), have = P[n.id] || 0;
    if (!have) return false;
    const Q = { ...P, [n.id]: have - 1 };
    return cls().tabs[ti].nodes.every(m => !(Q[m.id] || 0) || !blockers(m, ti, Q).length);
  }
  function change(n, ti, d) {
    if (d > 0 ? !canAdd(n, ti) : !canRemove(n, ti)) return false;
    const P = pts();
    P[n.id] = (P[n.id] || 0) + d;
    if (!P[n.id]) delete P[n.id];
    save();
    return true;
  }

  // ------------------------------------------------------------------ chrome
  function renderModes() {
    $('modes').innerHTML = MODES.map(([k, l]) => `<button class="mode ${S.mode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('');
  }
  function renderClasses() {
    if (S.mode === 'prof') return renderProfs();
    if (S.mode === 'equip') return renderSlots();
    $('classes').innerHTML = X.classes.map(c =>
      `<button class="cls ${c.token === S.cls ? 'on' : ''}" data-cls="${c.token}" style="--cc:${c.color}" title="${esc(c.name)}">` +
      `${icon(c.icon, 30)}<span>${esc(c.name)}</span></button>`).join('');
    document.documentElement.style.setProperty('--cc', cls().color);
  }
  function renderViews() {
    if (S.mode === 'equip') { $('views').innerHTML = ''; return; }
    const [list, cur] = S.mode === 'prof' ? [PVIEWS, S.pview] : [VIEWS, S.view];
    $('views').innerHTML = list.map(([k, l]) => `<button class="view ${cur === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('');
  }
  function renderSummary() {
    if (S.mode !== 'classes') { $('summary').innerHTML = ''; return; }
    const c = cls(), t = total(), race = RACE[S.race[S.cls]];
    // level needed for t points: Legacy Talented ranks hand out the first points earlier, then one per level
    const tal = c.talented.slice(0, S.talented || 0);
    const lvl = !t ? '–' : t <= tal.length ? tal[t - 1] : c.first_level - 1 + t - tal.length;
    $('summary').innerHTML =
      (race ? `<button class="sum-race" data-view="races" title="${esc(race.name)}">${icon(race.icon, 26)}</button>` : '') +
      `<span class="sum-pts"><b>${t}</b>/${c.points}</span><span class="sum-lvl">Level ${lvl}</span>` +
      `<label class="sum-tal" title="Legacy: Talented rank">Talented <select data-talented>${[0, 1, 2, 3, 4, 5].map(i =>
        `<option ${i === (S.talented || 0) ? 'selected' : ''}>${i}</option>`).join('')}</select></label>` +
      (t ? `<button class="btn-ghost" data-reset="all">Reset</button>` : '');
  }

  // ------------------------------------------------------------------ talents view
  const NODE = 44, GAP_X = 18, GAP_Y = 16;
  function treeHTML(t, ti) {
    const cols = Math.max(4, ...t.nodes.map(n => n.col)), tiers = Math.max(7, ...t.nodes.map(n => n.tier));
    const W = cols * NODE + (cols - 1) * GAP_X, H = tiers * NODE + (tiers - 1) * GAP_Y;
    const X0 = n => (n.col - 1) * (NODE + GAP_X), Y0 = n => (n.tier - 1) * (NODE + GAP_Y);
    const nb = Object.fromEntries(t.nodes.map(n => [n.id, n]));
    const P = pts();
    let lines = '';
    for (const n of t.nodes) for (const p of n.prereq) {
      const q = nb[p];
      if (!q) continue;
      const met = (P[p] || 0) >= q.max;
      const x1 = X0(q) + NODE / 2, y1 = Y0(q) + NODE / 2, x2 = X0(n) + NODE / 2, y2 = Y0(n) + NODE / 2;
      const d = q.tier === n.tier ? `M${x1} ${y1}H${x2}` : `M${x1} ${y1}V${y2}${x1 !== x2 ? 'H' + x2 : ''}`;
      lines += `<path d="${d}" class="${met ? 'met' : ''}"/>`;
    }
    const nodes = t.nodes.map(n => {
      const have = P[n.id] || 0, add = canAdd(n, ti);
      const st = have >= n.max ? 'max' : have ? 'part' : add ? 'avail' : 'locked';
      const isSel = sel && sel.kind === 'talent' && sel.id === n.id;
      return `<button class="node ${st} ${isSel ? 'sel' : ''} st-${n.status}" data-node="${n.id}" data-tab="${ti}" ` +
        `style="left:${X0(n)}px;top:${Y0(n)}px" aria-label="${esc(n.name)}">${icon(n.icon, NODE - 4)}` +
        `<span class="rk">${have}/${n.max}</span>${n.status !== 'same' ? `<span class="dot ${n.classic?.kind === 'wording' && Object.keys(n.classic).length === 2 ? 'hollow' : ''}"></span>` : ''}</button>`;
    }).join('');
    const removed = (cls().removed_talents[t.name] || []);
    return `<div class="tree" style="--bg:url('${t.bg || ''}')">
      <div class="tree-head">${icon(t.icon, 22)}<b>${esc(t.name)}</b><span class="tp">${tabPts(ti)}</span>
        ${tabPts(ti) ? `<button class="btn-ghost" data-reset="${ti}">Reset</button>` : ''}</div>
      <div class="grid" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}">${lines}</svg>${nodes}</div>
      ${removed.length ? `<div class="removed"><div class="removed-h">Removed from Classic</div>${removed.map(n =>
        `<button class="rm-item" data-rmtalent="${n.id}">${icon(n.icon, 24, 'faded')}<span>${esc(n.name)}</span></button>`).join('')}</div>` : ''}
    </div>`;
  }
  function renderTalents() {
    const c = cls();
    const tabs = `<nav class="tabs">${c.tabs.map((t, i) =>
      `<button class="tab ${S.tab === i ? 'on' : ''}" data-tab-pick="${i}">${icon(t.icon, 20)}<span>${esc(t.name)}</span><b>${tabPts(i)}</b></button>`).join('')}</nav>`;
    return tabs + `<div class="trees">${c.tabs.map((t, i) => `<div class="tree-wrap ${S.tab === i ? 'on' : ''}">${treeHTML(t, i)}</div>`).join('')}</div>`;
  }

  function talentDetail(n, ti) {
    const have = pts()[n.id] || 0, cl = n.classic || {};
    const cur = have ? n.ranks[have - 1] : null, next = have < n.max ? n.ranks[have] : null;
    const crank = r => cl.ranks ? cl.ranks[Math.min(r, cl.ranks.length - 1)] : null;
    const blocks = blockers(n, ti);
    const nb = nodeById(cls());
    let classic = '';
    if (n.status === 'changed') {
      const rows = [];
      if (cl.name) rows.push(`<li>Was <b>${esc(cl.name)}</b></li>`);
      if (cl.tab) rows.push(`<li>Was in <b>${esc(cl.tab)}</b></li>`);
      if (cl.pos) rows.push(`<li>Was tier ${cl.pos[0]} (now tier ${n.tier})</li>`);
      if (cl.max) rows.push(`<li>Had ${cl.max} ranks (now ${n.max})</li>`);
      if (cl.prereq) rows.push(`<li>Required ${cl.prereq.filter(Boolean).map(esc).join(', ') || 'nothing'} (now ${n.prereq.map(p => esc(nb[p]?.name)).join(', ') || 'nothing'})</li>`);
      if (cl.ranks) rows.push(`<li class="classic-text"><span class="lbl">Classic, rank ${Math.min(Math.max(have, 1), cl.ranks.length)}</span>${marked(crank(Math.max(have, 1) - 1), n.ranks[Math.max(have, 1) - 1], 'down')}</li>`);
      classic = `<div class="classic"><div class="classic-h">Compared with Classic${cl.kind === 'wording' ? ' (wording only)' : ''}</div><ul>${rows.join('')}</ul></div>`;
    } else if (n.status === 'new') {
      classic = `<div class="classic"><div class="classic-h">Not in Classic${originNote(n)}</div></div>`;
    }
    return `<div class="d-head">${icon(n.icon, 48)}<div><div class="d-name">${esc(n.name)}</div>
        <div class="d-sub">${esc(cls().tabs[ti].name)} · tier ${n.tier} · ${n.active ? 'Ability' : 'Passive'}</div>${badge(n.status, cl.kind, n)}</div></div>
      <div class="d-rank"><button class="pm" data-pm="-1" ${canRemove(n, ti) ? '' : 'disabled'}>−</button>
        <span>Rank <b>${have}</b>/${n.max}</span><button class="pm" data-pm="1" ${canAdd(n, ti) ? '' : 'disabled'}>+</button></div>
      ${blocks.length && have < n.max ? `<div class="req">${blocks.map(esc).join('<br>')}</div>` : ''}
      ${cur ? `<div class="d-text"><span class="lbl">Current rank</span>${marked(cur, crank(have - 1))}</div>` : ''}
      ${next ? `<div class="d-text"><span class="lbl">${have ? 'Next rank' : 'Rank 1'}</span>${marked(next, crank(have))}</div>` : ''}
      ${classic}`;
  }
  function removedTalentDetail(n, tab) {
    return `<div class="d-head">${icon(n.icon, 48, 'faded')}<div><div class="d-name">${esc(n.name)}</div>
      <div class="d-sub">Classic ${esc(tab)} · tier ${n.tier} · ${n.max} ranks</div>${badge('removed')}</div></div>
      <div class="d-text"><span class="lbl">Classic, rank ${n.max}</span>${clean(n.ranks[n.ranks.length - 1])}</div>`;
  }

  // ------------------------------------------------------------------ spells view
  const FILTERS = [['all', 'All'], ['new', 'New'], ['changed', 'Changed'], ['same', 'Unchanged'], ['removed', 'Removed']];
  const chipRow = (list, cur, attr) => `<nav class="chips">${list.map(([k, l]) =>
    `<button class="chip ${cur === k ? 'on' : ''}" data-${attr}="${esc(k)}">${esc(l)}</button>`).join('')}</nav>`;
  function spellRow(s, i, removed) {
    const top = s.ranks[s.ranks.length - 1];
    const lv = s.ranks[0].level, nr = s.ranks.length;
    const sub = [lv ? `Level ${lv}${nr > 1 && top.level !== lv ? '–' + top.level : ''}` : '', nr > 1 ? `${nr} ranks` : '',
      s.talent ? 'Talent' : '', s.classic_name ? `was ${esc(s.classic_name)}` : '',
      s.moved_to ? `now ${esc(s.moved_to)}` : ''].filter(Boolean).join(' · ');
    return `<button class="sp ${removed ? 'sp-rm' : ''}" data-spell="${removed ? 'r' : 's'}${i}">${icon(s.icon, 36, removed ? 'faded' : '')}
      <span class="sp-main"><span class="sp-name">${esc(s.name)}</span><span class="sp-sub">${sub}</span></span>${badge(s.status, rankKind(s), s)}</button>`;
  }
  // a group whose every change is wording only reads as 'wording'
  function rankKind(s) {
    if (s.status !== 'changed' || s.classic_name || s.removed_ranks) return null;
    const ch = s.ranks.filter(r => r.classic || r.status === 'new');
    return ch.length && ch.every(r => r.classic && Object.keys(r.classic).length === 1 && r.kind === 'wording') ? 'wording' : null;
  }
  function renderSpells() {
    const c = cls(), f = S.filter;
    const chips = chipRow(FILTERS, f, 'filter');
    if (f === 'removed') {
      return chips + `<div class="sp-list">${c.removed_spells.map((s, i) => spellRow(s, i, true)).join('') || '<p class="empty">None</p>'}</div>`;
    }
    const groups = {};
    c.spells.forEach((s, i) => { if (f === 'all' || s.status === f) (groups[s.school] ||= []).push([s, i]); });
    const order = [...c.tabs.map(t => t.name), ...Object.keys(groups)].filter((v, i, a) => a.indexOf(v) === i && groups[v]);
    return chips + order.map(g => `<h3 class="sp-h">${esc(g)}</h3><div class="sp-list">${groups[g].map(([s, i]) => spellRow(s, i)).join('')}</div>`).join('');
  }
  const FIELDS = [['level', 'Level'], ['cost', 'Cost'], ['cast', 'Cast'], ['cd', 'Cooldown'], ['range', 'Range']];
  function rankBlock(r, removed) {
    const cl = r.classic || {};
    const facts = FIELDS.filter(([k]) => r[k] || cl[k]).map(([k, l]) => {
      const v = k === 'level' && r[k] ? `Level ${r[k]}` : esc(r[k] || '—');
      const old = k in cl ? `<s>${esc(k === 'level' && cl[k] ? 'Level ' + cl[k] : cl[k] || 'none')}</s>` : '';
      return `<span class="fact ${k in cl ? 'diff' : ''}">${v}${old}</span>`;
    }).join('');
    return `<div class="rank ${removed ? 'rank-rm' : ''}"><div class="rank-h">${r.rank ? 'Rank ' + r.rank : 'Spell'}${r.status === 'new' ? badge('new') : ''}${removed ? badge('removed') : ''}</div>
      <div class="facts">${facts}</div>
      <div class="d-text">${marked(r.desc, cl.desc)}</div>
      ${'desc' in cl ? `<div class="d-text classic-text"><span class="lbl">Classic${r.kind === 'wording' ? ' (wording only)' : ''}</span>${marked(cl.desc, r.desc, 'down')}</div>` : ''}</div>`;
  }
  function spellDetail(s, removed) {
    const ranks = [...s.ranks].reverse();
    const sodNote = s.origin || s.was_sod ? `Not in vanilla Classic${originNote(s)}.` : '';
    const note = removed ? (s.status === 'moved' ? `Now taught under ${esc(s.moved_to)}` :
      s.in_client ? 'Still in the game files, but nothing teaches it' : 'Not in Forever') :
      s.status === 'sod' ? 'Same as in Season of Discovery. It ships in the Forever files; the files alone do not show whether a trainer teaches it.' : sodNote;
    return `<div class="d-head">${icon(s.icon, 48, removed ? 'faded' : '')}<div><div class="d-name">${esc(s.name)}</div>
      <div class="d-sub">${esc(s.school)}${s.talent ? ' · from a talent' : ''}${s.classic_name ? ` · Classic name: ${esc(s.classic_name)}` : ''}</div>
      ${badge(s.status, rankKind(s), s)}</div></div>
      ${note ? `<div class="req note">${note}</div>` : ''}
      ${ranks.map(r => rankBlock(r, false)).join('')}
      ${(s.removed_ranks || []).map(r => rankBlock(r, true)).join('')}`;
  }

  // ------------------------------------------------------------------ races view
  const TAG = { class: ['Class version', 'fit-strong'], resource: ['Your resource', 'fit-strong'], offense: ['Offense', 'fit'], slaying: ['Slaying', 'fit'] };
  function racialRow(g, race, removed) {
    const c = cls();
    const fit = !removed && g.fits[c.id];
    const v = removed ? g.variants[0] : (g.variants.find(x => x.id === fit?.variant) || g.variants[0]);
    const tags = fit ? fit.tags.map(t => `<span class="tag ${TAG[t.tag][1]}">${TAG[t.tag][0]}</span>`).join('') : '';
    return `<button class="racial ${removed ? 'sp-rm' : ''} ${fit && fit.tags.some(t => TAG[t.tag][1] === 'fit-strong') ? 'strong' : ''}"
        data-racial="${race.id}:${removed ? 'r' : 's'}:${esc(g.name)}">${icon(g.icon, 32, removed ? 'faded' : '')}
      <span class="sp-main"><span class="sp-name">${esc(g.name)} <span class="ap">${removed ? '' : g.active ? 'Active' : 'Passive'}</span></span>
      <span class="sp-sub">${clean(v.desc)}</span>${tags ? `<span class="tags">${tags}</span>` : ''}</span>${badge(g.status, g.kind)}</button>`;
  }
  function raceCard(r) {
    const c = cls(), on = S.race[S.cls] === r.id;
    const combo = r.new_race ? badge('new').replace('New', 'New race') : !r.classic_classes.includes(c.id) ? `<span class="bdg bdg-new">New for ${esc(c.name)}</span>` : '';
    return `<article class="race ${on ? 'on' : ''}"><header class="race-h" data-race="${r.id}">${icon(r.icon, 40)}
        <div><div class="race-name">${esc(r.name)}</div><div class="d-sub">${r.faction}</div></div>${combo}
        <span class="pick">${on ? 'Chosen' : 'Choose'}</span></header>
      <div class="racials">${r.racials.map(g => racialRow(g, r)).join('')}
      ${r.removed_racials.length ? `<div class="removed-h">Removed from Classic</div>${r.removed_racials.map(g => racialRow(g, r, true)).join('')}` : ''}</div></article>`;
  }
  function renderRaces() {
    const c = cls();
    const list = c.races.map(id => RACE[id]);
    return ['Alliance', 'Horde'].map(f => {
      const rs = list.filter(r => r.faction === f);
      return rs.length ? `<h3 class="sp-h">${f}</h3><div class="races">${rs.map(raceCard).join('')}</div>` : '';
    }).join('');
  }
  function racialDetail(raceId, removed, name) {
    const r = RACE[raceId], c = cls();
    const g = (removed ? r.removed_racials : r.racials).find(x => x.name === name);
    const fit = !removed && g.fits[c.id];
    const v = removed ? g.variants[0] : (g.variants.find(x => x.id === fit?.variant) || g.variants[0]);
    const others = !removed && g.variants.length > 1 ? g.variants.filter(x => x !== v) : [];
    const facts = FIELDS.slice(1).filter(([k]) => v[k]).map(([k]) => `<span class="fact">${esc(v[k])}</span>`).join('');
    return `<div class="d-head">${icon(g.icon, 48, removed ? 'faded' : '')}<div><div class="d-name">${esc(g.name)}</div>
      <div class="d-sub">${esc(r.name)} · ${removed ? 'Classic' : g.active ? 'Active' : 'Passive'}</div>${badge(removed ? 'removed' : g.status, g.kind)}</div></div>
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      <div class="d-text">${marked(v.desc, g.classic?.desc)}</div>
      ${g.classic?.desc ? `<div class="d-text classic-text"><span class="lbl">Classic${g.kind === 'wording' ? ' (wording only)' : ''}</span>${marked(g.classic.desc, v.desc, 'down')}</div>` : ''}
      ${fit && fit.tags.length ? `<div class="classic"><div class="classic-h">Why it fits ${esc(c.name)}</div><ul>${fit.tags.map(t =>
        `<li><span class="tag ${TAG[t.tag][1]}">${TAG[t.tag][0]}</span> ${esc(t.why)}</li>`).join('')}</ul></div>` : ''}
      ${others.length ? `<div class="classic"><div class="classic-h">Other class versions</div><ul>${others.map(o =>
        `<li><b>${o.classes.map(id => esc(CLASS_BY_ID[id].name)).join(', ') || 'Other classes'}</b>: ${clean(o.desc)}</li>`).join('')}</ul></div>` : ''}`;
  }

  // ------------------------------------------------------------------ stats view: what each base stat gives the class
  const STAT_NAMES = ['Strength', 'Agility', 'Stamina', 'Intellect', 'Spirit'];
  // a user is listed under every stat it touches (Forever tags; Classic tags when Forever has none)
  // (buffs that raise all five stats, Mark of the Wild, are listed once under "All stats")
  const tagsOf = u => u.tags.length ? u.tags : u.classic_tags || [];
  const allStats = u => STAT_NAMES.every(n => tagsOf(u).some(t => t[0] === n));
  const usersOf = (st, stat) => st.users.map((u, i) => [u, i]).filter(([u]) =>
    stat === 'all' ? allStats(u) : !allStats(u) && tagsOf(u).some(t => t[0] === stat));
  function userRow(u, i, stat) {
    const tg = tagsOf(u).filter(t => stat === 'all' ? t[0] === 'Strength' : t[0] === stat)
      .map(t => `<span class="tag">${esc(stat === 'all' ? t[1].replace('Strength', 'all stats') : t[1])}</span>`).join('');
    return `<button class="sp st-u ${u.status === 'removed' ? 'sp-rm' : ''}" data-suser="${i}">${icon(u.icon, 30, u.status === 'removed' ? 'faded' : '')}
      <span class="sp-main"><span class="sp-name">${esc(u.name)}</span><span class="sp-sub">${u.kind === 'talent' ? 'Talent' : 'Ability'} · ${esc(u.tab)}</span>
      <span class="tags">${tg}</span></span>${badge(u.status)}</button>`;
  }
  function renderStats() {
    const c = cls(), st = c.stats, b = st.base;
    const base = [b.health ? `Base health at 60: <b>${b.health}</b>` : '', b.mana ? `Base mana at 60: <b>${b.mana}</b>` : '',
      b.pet_mana_regen ? `Demon mana regeneration: ${b.pet_mana_regen.pet}% of your Intellect per 5 sec (Imp ${b.pet_mana_regen.imp}%)` : '']
      .filter(Boolean).map(x => `<span class="fact">${x}</span>`).join('');
    return (base ? `<div class="facts st-base">${base}</div>` : '') + `<div class="stats">${st.stats.map(s => {
      const eff = s.effects.map(e => `<li class="st-e st-${e.status}"><span>${esc(e.label)}</span>${e.value ? `<span class="st-v">${esc(e.value)}</span>` : ''}` +
        `${e.status !== 'same' ? badge(e.status) : ''}</li>`).join('');
      const users = usersOf(st, s.stat).map(([u, i]) => userRow(u, i, s.stat)).join('');
      return `<article class="stat"><h3 class="stat-h">${esc(s.stat)}</h3><ul class="st-list">${eff}</ul>
        ${s.classic_text.length ? `<div class="d-text classic-text st-ct"><span class="lbl">Classic tooltip</span>${s.classic_text.map(clean).join('<br>')}</div>` : ''}
        ${users ? `<div class="st-users"><span class="lbl">Talents and abilities</span>${users}</div>` : ''}</article>`;
    }).join('')}${(() => {
      const all = usersOf(st, 'all').map(([u, i]) => userRow(u, i, 'all')).join('');
      return all ? `<article class="stat"><h3 class="stat-h">All stats</h3><div class="st-users">${all}</div></article>` : '';
    })()}</div>`;
  }
  function statUserDetail(u) {
    const ft = u.tags.map(t => `<span class="tag fit-strong">${esc(t[1])}</span>`).join('');
    const ct = (u.classic_tags || []).map(t => `<span class="tag">${esc(t[1])}</span>`).join('');
    const why = u.status === 'new' ? 'Not in Classic' : u.status === 'removed' ? 'Not in Forever' :
      u.status === 'changed' && !u.tags.length ? 'Forever kept it, but it no longer changes a stat' :
      u.status === 'changed' && !u.classic_tags?.length ? 'Classic had it, but it did not change a stat' : '';
    return `<div class="d-head">${icon(u.icon, 48, u.status === 'removed' ? 'faded' : '')}<div><div class="d-name">${esc(u.name)}</div>
        <div class="d-sub">${u.kind === 'talent' ? 'Talent' : 'Ability'} · ${esc(u.tab)}</div>${badge(u.status)}</div></div>
      ${why ? `<div class="req note">${why}.</div>` : ''}
      ${ft ? `<div class="d-text"><span class="lbl">Stat effects</span><span class="tags">${ft}</span></div>` : ''}
      ${u.text ? `<div class="d-text">${marked(u.text, u.classic_text)}</div>` : ''}
      ${ct || u.classic_text ? `<div class="classic"><div class="classic-h">Classic</div>${ct ? `<div class="tags">${ct}</div>` : ''}
        ${u.classic_text ? `<div class="d-text classic-text">${marked(u.classic_text, u.text, 'down')}</div>` : ''}</div>` : ''}
      ${u.node ? `<button class="btn-ghost" data-goto-talent="${u.node}">Open in Talents</button>` : ''}`;
  }

  // ------------------------------------------------------------------ professions (data from professions.js)
  const QUALITY = ['#9d9d9d', '#ffffff', '#1eff00', '#0070dd', '#a335ee', '#ff8000', '#e6cc80', '#00ccff'];
  const prof = () => P.professions.find(p => p.id === S.prof) || P.professions[0];
  const item = id => E?.byId[id] || P?.items[id] || { n: `Item ${id}`, q: 1, i: null };
  const qc = id => QUALITY[item(id).q] || QUALITY[1];
  // a lazily loaded file's icon sheets sit at fixed indices (sheet0 from the build), whatever loads first
  const placeSheets = D => D.sheets.forEach((sh, i) => { X.sheets[D.sheet0 + i] = sh; });
  function loadScript(src, onload, what) {
    const sc = document.createElement('script');
    sc.src = src;
    sc.onload = onload;
    sc.onerror = () => { $('main').innerHTML = `<p class="empty">${what} could not load. Check the connection and reload.</p>`; };
    document.head.appendChild(sc);
  }
  function loadProf(done) {
    loadScript(X.prof_src, () => { P = window.PROF; placeSheets(P); done(); }, 'Professions');
  }
  function renderProfs() {
    if (!P) { $('classes').innerHTML = ''; return; }
    if (!P.professions.some(p => p.id === S.prof)) S.prof = P.professions[0].id;
    $('classes').innerHTML = P.professions.map(p =>
      `<button class="cls prof ${p.id === S.prof ? 'on' : ''}" data-prof="${p.id}" title="${esc(p.name)}">` +
      `${icon(p.icon, 28)}<span>${esc(p.name)}</span></button>`).join('');
    document.documentElement.style.setProperty('--cc', 'var(--gold)');
  }
  // skill-up colours: orange from the skill that teaches it (item-taught only), yellow, green (midpoint), grey
  function skillChips(r, old) {
    const [y, g] = r.skill;
    if (!y && !g) return '';
    const mid = s => Math.floor((s[0] + s[1]) / 2);
    const one = (cls_, v, o) => `<span class="sk ${cls_}">${v}${o != null && o !== v ? `<s>${o}</s>` : ''}</span>`;
    return (r.learn ? one('sk-o', r.learn) : '') + one('sk-y', y, old?.[0]) + one('sk-g', mid(r.skill), old && mid(old)) + one('sk-x', g, old?.[1]);
  }
  const itemName = (id, n) => `<span style="color:${qc(id)}">${esc(item(id).n)}</span>${n > 1 ? ` <span class="x">×${n}</span>` : ''}`;
  function recipeRow(r, i, removed) {
    const sub = removed ? (r.status === 'moved' ? `now ${esc(r.moved_to)}` : '') :
      [r.moved_from ? `was ${esc(r.moved_from)}` : '', r.classic?.name ? `was ${esc(r.classic.name)}` : ''].filter(Boolean).join(' · ');
    const name = r.creates ? `<span style="color:${qc(r.creates)}">${esc(r.name)}</span>` : esc(r.name);
    return `<button class="sp rc ${removed ? 'sp-rm' : ''}" data-recipe="${removed ? 'r' : 's'}${i}">${icon(r.icon, 36, removed ? 'faded' : '')}
      <span class="sp-main"><span class="sp-name">${name}</span><span class="sp-sub">${skillChips(r)}${sub ? ` <span>${sub}</span>` : ''}</span></span>${badge(r.moved_from ? 'moved' : r.status, r.kind, r)}</button>`;
  }
  function matches(r) {
    if (!query) return true;
    const q = query.toLowerCase(), has = t => String(t || '').toLowerCase().includes(q);
    return has(r.name) || (r.creates && has(item(r.creates).n)) || r.reagents.some(([id]) => has(item(id).n));
  }
  function recipeList() {
    const p = prof(), f = S.pfilter, rm = f === 'removed';
    const src = rm ? p.removed : p.recipes;
    const groups = {};
    src.forEach((r, i) => { if ((rm || f === 'all' || r.status === f) && matches(r)) (groups[r.cat || 'Other'] ||= []).push([r, i]); });
    const order = Object.keys(groups).sort((a, b) => (a === 'Season of Discovery') - (b === 'Season of Discovery') || a.localeCompare(b));
    return order.map(g => `<h3 class="sp-h">${esc(g)}</h3><div class="sp-list">${groups[g].map(([r, i]) => recipeRow(r, i, rm)).join('')}</div>`).join('') ||
      '<p class="empty">None</p>';
  }
  function renderRecipes() {
    const p = prof(), f = S.pfilter;
    const chips = chipRow(FILTERS, f, 'filter');
    const head = p.new || p.desc ? `<p class="p-desc">${p.new ? badge('new').replace('New', 'New profession') + ' ' : ''}${esc(p.desc)}</p>` : '';
    return head + chips + `<input class="search" id="psearch" type="search" placeholder="Search recipes, results, reagents" value="${esc(query)}">` +
      `<div id="plist">${recipeList()}</div>`;
  }
  function reagentList(list, old) {
    return `<ul class="rg">${list.map(([id, n]) => `<li>${icon(item(id).i, 24)}${itemName(id, n)}</li>`).join('')}</ul>` +
      (old ? `<div class="d-text classic-text"><span class="lbl">Classic reagents</span><ul class="rg rg-old">${old.map(([id, n]) =>
        `<li>${icon(item(id).i, 20, 'faded')}${itemName(id, n)}</li>`).join('')}</ul></div>` : '');
  }
  // result item; c = the Classic value of each fact that differs (struck through beside Forever's)
  const ITEM_FACT = { n: 'name', q: 'quality', ilvl: 'item level', req: 'required level', armor: 'armor', stats: 'stats',
    dmg: 'damage', speed: 'speed', use: 'effects' };
  function itemBlock(id, n) {
    const it = item(id), d = it.d || {}, c = it.c || {};
    const old = (k, v) => k in c ? `<s>${esc(c[k] == null ? 'none' : v(c[k]))}</s>` : '';
    const fact = (k, v) => d[k] || k in c ? `<div>${esc(d[k] ? v(d[k]) : 'No ' + ITEM_FACT[k])}${old(k, v)}</div>` : '';
    const lines = (d.type ? `<div>${esc(d.type)}</div>` : '') + fact('ilvl', v => `Item level ${v}`) + fact('req', v => `Requires level ${v}`) +
      fact('armor', v => `${v} Armor`) + fact('dmg', v => v) + fact('speed', v => v);
    const was = 'n' in c || 'q' in c ? `<div class="item-was">Classic: <span style="color:${QUALITY['q' in c ? c.q : it.q]}">${esc(c.n || it.n)}</span></div>` : '';
    const list = (k, cls_) => k in c ? `<div class="item-old"><span class="lbl">Classic ${ITEM_FACT[k]}</span>${(c[k] || ['none']).map(clean).join('<br>')}</div>` : '';
    return `<div class="item"><div class="item-h">${icon(it.i, 36)}<div><div class="item-n" style="color:${qc(id)}">${esc(it.n)}${n > 1 ? ` <span class="x">×${n}</span>` : ''}</div>
      ${was}<div class="d-sub">${lines}</div></div></div>
      ${d.stats ? `<div class="item-st" title="Stat amounts derived from the item budget">${d.stats.map(esc).join('<br>')}</div>` : ''}
      ${list('stats')}${it.round ? '<div class="item-old">Within 1 of Classic: may be rounding</div>' : ''}
      ${(d.use || []).map(u => `<div class="item-use">${clean(u)}</div>`).join('')}
      ${list('use')}
      ${d.flavor ? `<div class="item-fl">"${clean(d.flavor)}"</div>` : ''}</div>`;
  }
  function recipeDetail(r, removed) {
    const p = prof(), cl = r.classic || {};
    const notes = [];
    if (removed) notes.push(r.status === 'moved' ? `Now made with ${esc(r.moved_to)}.` : r.in_client ? 'Still in the game files, but nothing teaches it.' : 'Not in Forever.');
    if (r.moved_from) notes.push(`A ${esc(r.moved_from)} recipe in Classic.`);
    if (r.parked) notes.push('Forever files this under its Season of Discovery recipe group.');
    if (r.status === 'new' && !r.parked) notes.push(`Not in Classic${r.origin ? `; ${esc(p.name)} in ${esc(r.origin)} had a recipe of this name` : r.was_sod ? '; Season of Discovery had a version' : ''}.`);
    if (r.status === 'sod') notes.push('Same as in Season of Discovery; vanilla Classic did not have it.');
    const facts = [`<span class="fact ${'cast' in cl ? 'diff' : ''}">${esc(r.cast)} cast${'cast' in cl ? `<s>${esc(cl.cast)}</s>` : ''}</span>`];
    if (r.tools || cl.tools) facts.push(`<span class="fact ${'tools' in cl ? 'diff' : ''}">Tools: ${esc((r.tools || []).join(', ') || 'none')}${'tools' in cl ? `<s>${esc(cl.tools.join(', ') || 'none')}</s>` : ''}</span>`);
    const sk = skillChips(r, cl.skill);
    const rows = [];
    if (cl.name) rows.push(`<li>Was <b>${esc(cl.name)}</b></li>`);
    if (cl.creates) rows.push(`<li>Made ${cl.creates[0] ? itemName(cl.creates[0], cl.creates[1]) : 'no item'}</li>`);
    if (cl.item) rows.push(`<li>Result item changed: ${Object.keys(item(r.creates).c || {}).map(k => ITEM_FACT[k]).join(', ')}</li>`);
    if (cl.skill) rows.push(`<li>Skill-ups were ${cl.skill[0]} / ${Math.floor((cl.skill[0] + cl.skill[1]) / 2)} / ${cl.skill[1]}</li>`);
    if ('desc' in cl) rows.push(`<li class="classic-text"><span class="lbl">Classic text</span>${marked(cl.desc, r.desc, 'down')}</li>`);
    return `<div class="d-head">${icon(r.icon, 48, removed ? 'faded' : '')}<div><div class="d-name">${esc(r.name)}</div>
        <div class="d-sub">${esc(p.name)} · ${esc(r.cat || 'Other')}</div>${badge(r.status, r.kind, r)}</div></div>
      ${notes.length ? `<div class="req note">${notes.join(' ')}</div>` : ''}
      ${r.creates ? itemBlock(r.creates, r.count) : ''}
      ${r.desc ? `<div class="d-text">${marked(r.desc, cl.desc)}</div>` : ''}
      ${r.reagents.length || cl.reagents ? `<div class="d-text"><span class="lbl">Reagents</span>${reagentList(r.reagents, cl.reagents)}</div>` : ''}
      ${sk ? `<div class="d-text"><span class="lbl">Skill-ups</span><div class="sks">${sk}</div></div>` : ''}
      <div class="facts">${facts.join('')}</div>
      ${r.taught_by ? `<div class="d-text"><span class="lbl">Taught by</span><ul class="rg">${r.taught_by.map(id =>
        `<li>${icon(item(id).i, 24)}${itemName(id)}</li>`).join('')}</ul></div>` : ''}
      ${r.auto ? '<div class="d-text"><span class="lbl">Taught by</span>Learned with the profession</div>' : ''}
      ${rows.length && !removed ? `<div class="classic"><div class="classic-h">Compared with Classic${r.kind === 'wording' ? ' (wording only)' : ''}</div><ul>${rows.join('')}</ul></div>` : ''}`;
  }

  // Legacy Professions tree: read-only map of the nodes (all new in Forever)
  function renderLegacy() {
    const t = P.legacy, nodes = t.nodes;
    const cols = Math.max(...nodes.map(n => n.col)), rows = Math.max(...nodes.map(n => n.row));
    const W = cols * NODE + (cols - 1) * GAP_X * 2, H = rows * NODE + (rows - 1) * GAP_Y * 2;
    const X0 = n => (n.col - 1) * (NODE + GAP_X * 2), Y0 = n => (n.row - 1) * (NODE + GAP_Y * 2);
    const nb = Object.fromEntries(nodes.map(n => [n.id, n]));
    const lines = nodes.flatMap(n => n.prereq.map(p => nb[p]).filter(Boolean).map(q =>
      `<path d="M${X0(q) + NODE / 2} ${Y0(q) + NODE / 2}L${X0(n) + NODE / 2} ${Y0(n) + NODE / 2}"/>`)).join('');
    const btns = nodes.map(n => `<button class="node ${n.placeholder ? 'locked' : 'avail'} ${sel && sel.kind === 'lnode' && sel.id === n.id ? 'sel' : ''}" data-lnode="${n.id}"
      style="left:${X0(n)}px;top:${Y0(n)}px" aria-label="${esc(n.name)}">${icon(n.icon, NODE - 4)}<span class="rk">${n.max}</span></button>`).join('');
    return `<div class="tree legacy"><div class="tree-head on">${esc(t.name)}</div>
      <div class="grid" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}">${lines}</svg>${btns}</div></div>`;
  }
  function legacyDetail(n) {
    const nb = Object.fromEntries(P.legacy.nodes.map(x => [x.id, x]));
    const req = [n.gate ? `Requires ${n.gate} points spent in the ${esc(P.legacy.name)} tree` : '',
      ...n.prereq.map(p => `Requires ${esc(nb[p]?.name)}`)].filter(Boolean);
    return `<div class="d-head">${icon(n.icon, 48, n.placeholder ? 'faded' : '')}<div><div class="d-name">${esc(n.placeholder ? 'Locked' : n.name)}</div>
        <div class="d-sub">Legacy · ${esc(P.legacy.name)} · ${n.max} ${n.max > 1 ? 'ranks' : 'rank'}</div>${badge('new')}</div></div>
      ${req.length ? `<div class="req note">${req.join('<br>')}</div>` : ''}
      ${n.ranks.map((t, i) => `<div class="d-text">${n.ranks.length > 1 ? `<span class="lbl">Rank ${i + 1}</span>` : ''}${marked(t, i ? n.ranks[i - 1] : null)}</div>`).join('')}
      <div class="classic"><div class="classic-h">Not in Classic: the Legacy System is new in Forever</div></div>`;
  }

  // ------------------------------------------------------------------ equipment (data from equipment.js)
  // drops, vendors and quests are server-side: each item links to its Wowhead Forever page (Wowhead's own tooltip
  // script, the embed they publish for other sites) and shows what the play log saw (extract tools/read_lootlog.py)
  const ESTATUS = FILTERS.slice(0, 4);
  const QNAMES = ['Poor', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Artifact'];
  const WH = id => `https://www.wowhead.com/forever/item=${id}`;
  let E = null, eQuery = '', eShown = 150;
  function loadEquip(done) {
    loadScript(X.equip_src, () => {
      E = window.EQUIP;
      E.byId = Object.fromEntries(E.items.map(o => [o.id, o]));
      placeSheets(E);
      if (!window.$WowheadPower) {
        window.whTooltips = { colorLinks: false, iconizeLinks: false, renameLinks: false };
        const w = document.createElement('script');
        w.src = 'https://wow.zamimg.com/js/tooltips.js';
        document.head.appendChild(w);
      }
      done();
    }, 'Equipment');
  }
  const eslot = () => E.slots.find(s => s[0] === S.eslot) || E.slots[0];
  function renderSlots() {
    if (!E) { $('classes').innerHTML = ''; return; }
    $('classes').innerHTML = E.slots.map(([k, l]) =>
      `<button class="cls slot ${k === eslot()[0] ? 'on' : ''}" data-slot="${k}"><span>${esc(l)}</span></button>`).join('');
    document.documentElement.style.setProperty('--cc', 'var(--gold)');
  }
  const money = c => [[Math.floor(c / 10000), 'g'], [Math.floor(c / 100) % 100, 's'], [c % 100, 'c']]
    .filter(([v], i, a) => v || (i === 2 && !a[0][0] && !a[1][0])).map(([v, u]) => `${v}${u}`).join(' ');
  function eMatches(o) {
    if (S.efilter !== 'all' && o.st !== S.efilter) return false;
    if (S.esub && (o.sub || '') !== S.esub) return false;
    if (o.q < (S.eq || 0)) return false;
    if (!eQuery) return true;
    const q = eQuery.toLowerCase(), has = t => t.toLowerCase().includes(q);
    return has(o.n) || (o.d?.stats || []).some(has) || (o.d?.use || []).some(has);
  }
  function equipRow(o) {
    const d = o.d || {};
    const sub = [d.ilvl ? `iLvl ${d.ilvl}` : '', d.req ? `Req ${d.req}` : '', o.sub, o.set ? 'Set' : '', o.seen ? 'Seen in play' : '']
      .filter(Boolean).map(esc).join(' · ');
    return `<button class="sp" data-equip="${o.id}">${icon(o.i, 36)}<span class="sp-main"><span class="sp-name" style="color:${QUALITY[o.q] || QUALITY[1]}">${esc(o.n)}</span>
      <span class="sp-sub">${sub}</span></span>${badge(o.st === 'same' ? null : o.st)}</button>`;
  }
  function equipList() {
    const list = E.items.filter(o => o.s === eslot()[0] && eMatches(o));
    return (list.length ? `<div class="sp-list">${list.slice(0, eShown).map(equipRow).join('')}</div>` : '<p class="empty">None</p>') +
      (list.length > eShown ? `<button class="chip more" data-more>Show more (${list.length - eShown} left)</button>` : '');
  }
  function renderEquip() {
    const inSlot = E.items.filter(o => o.s === eslot()[0]);
    const subs = [...new Set(inSlot.map(o => o.sub).filter(Boolean))].sort();
    if (S.esub && !subs.includes(S.esub)) S.esub = '';
    const qs = [...new Set(inSlot.map(o => o.q))].sort();
    const qcur = qs.includes(S.eq) ? S.eq : qs[0];
    return chipRow(ESTATUS, S.efilter, 'filter') +
      (subs.length > 1 ? chipRow([['', 'All types'], ...subs.map(s => [s, s])], S.esub, 'esub') : '') +
      chipRow(qs.map(q => [String(q), q === qs[0] ? 'Any quality' : QNAMES[q] + '+']), String(qcur), 'eq') +
      `<input class="search" id="esearch" type="search" placeholder="Search names, stats, effects" value="${esc(eQuery)}">` +
      `<div id="elist">${equipList()}</div>`;
  }
  function equipDetail(o) {
    const st = E.sets[o.set], sx = o.sfx != null ? E.sfx[o.sfx] : null;
    const facts = [o.tag, o.bind, o.unique ? 'Unique' : '', o.cls ? 'Classes: ' + o.cls.join(', ') : '', o.sell ? 'Sells for ' + money(o.sell) : '']
      .filter(Boolean).map(f => `<span class="fact">${esc(f)}</span>`).join('');
    const note = o.server ? '<div class="req note">Only in the data the server sends at login, not in the shipped files.</div>' : '';
    const cmp = o.st === 'new' ? 'Not in Classic: no Classic item has this id' : o.st === 'same' ? 'Same as Classic' : 'Changed from Classic (struck-through values)';
    return `${itemBlock(o.id, 1)}${note}<div class="facts">${facts}</div>
      ${st ? `<div class="d-text"><span class="lbl">${esc(st.n)}</span><ul class="rg">${st.items.map(([id, n]) =>
        `<li>${E.byId[id] ? `<button class="lnk" data-equip="${id}" style="color:${QUALITY[E.byId[id].q]}">${esc(n)}</button>` : esc(n)}</li>`).join('')}</ul>
        ${st.bonus.map(([n, t]) => `<div class="item-use">(${n}) Set: ${clean(t)}</div>`).join('')}</div>` : ''}
      ${sx ? `<div class="d-text"><span class="lbl">Random suffixes</span><ul class="rg sfx">${sx.map(([n, s]) =>
        `<li><b>${esc(n)}</b> ${esc(s.join(', '))}</li>`).join('')}</ul></div>` : ''}
      ${o.seen ? seenBlock(o.seen) : ''}
      <div class="d-text"><span class="lbl">Where it comes from</span>
        <a class="wh" href="${WH(o.id)}" target="_blank" rel="noopener">Drops, vendors and quests on Wowhead</a></div>
      <div class="classic"><div class="classic-h">${cmp}</div></div>`;
  }
  // play log (read_lootlog.py): drops / gathers / picks [source, zone, times, of loots], vendors [name, zone, price], quests [title]
  function seenBlock(s) {
    const got = (how, list) => (list || []).map(([n, z, k, of]) =>
      `<li>${how} <b>${esc(n)}</b>${z ? ` in ${esc(z)}` : ''}: ${k} of ${of} (${Math.round(100 * k / of)}%)</li>`);
    const rows = [...got('Dropped by', s.drops), ...got('Gathered from', s.gathers), ...got('Pick-pocketed from', s.picks),
      ...(s.vendors || []).map(([n, z, p]) => `<li>Sold by <b>${esc(n)}</b>${z ? ` in ${esc(z)}` : ''}${p ? ` for ${money(p)}` : ''}</li>`),
      ...(s.quests || []).map(([t]) => `<li>Reward from <b>${esc(t)}</b></li>`)];
    return `<div class="d-text"><span class="lbl">Seen in play</span><ul class="rg">${rows.join('')}</ul></div>`;
  }

  // ------------------------------------------------------------------ detail (side panel on wide screens, sheet on phones)
  function detailHTML() {
    if (!sel) return '';
    if (sel.kind === 'equip') { const o = E.byId[sel.id]; return o ? equipDetail(o) : ''; }
    if (sel.kind === 'recipe') {
      const rm = sel.id[0] === 'r', r = (rm ? prof().removed : prof().recipes)[+sel.id.slice(1)];
      return r ? recipeDetail(r, rm) : '';
    }
    if (sel.kind === 'lnode') {
      const n = P.legacy.nodes.find(x => x.id === sel.id);
      return n ? legacyDetail(n) : '';
    }
    const c = cls();
    if (sel.kind === 'talent') {
      const ti = tabOf(c)[sel.id];
      return ti == null ? '' : talentDetail(nodeById(c)[sel.id], ti);
    }
    if (sel.kind === 'rmtalent') {
      for (const [tab, ns] of Object.entries(c.removed_talents)) { const n = ns.find(x => x.id === sel.id); if (n) return removedTalentDetail(n, tab); }
      return '';
    }
    if (sel.kind === 'spell') {
      const rm = sel.id[0] === 'r', i = +sel.id.slice(1);
      const s = (rm ? c.removed_spells : c.spells)[i];
      return s ? spellDetail(s, rm) : '';
    }
    if (sel.kind === 'suser') { const u = c.stats.users[sel.id]; return u ? statUserDetail(u) : ''; }
    if (sel.kind === 'racial') {
      const [rid, rm, ...name] = sel.id.split(':');
      return racialDetail(+rid, rm === 'r', name.join(':'));
    }
    return '';
  }
  function renderDetail() {
    const html = detailHTML();
    if (html && sel?.kind === 'equip') setTimeout(() => window.$WowheadPower?.refreshLinks?.(), 0);
    if (wide()) {
      const el = $('detail'), top = el.scrollTop;
      el.innerHTML = html || `<div class="d-empty">${esc(S.mode === 'prof' ? (P ? prof().name : '') : S.mode === 'equip' ? (E ? eslot()[1] : '') : cls().name)}</div>`;
      el.scrollTop = top;
      closeSheet(true);
    } else {
      $('detail').innerHTML = '';
      const p = $('sheet-panel'), top = p.scrollTop;
      if (html) {
        p.innerHTML = `<button class="sheet-close" data-close aria-label="Close">×</button>` + html;
        p.scrollTop = top;
        openSheet();
      } else closeSheet();
    }
  }
  let sheetOpen = false;
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    $('sheet').classList.remove('hidden');
    history.pushState({ sheet: 1 }, '');
  }
  function closeSheet(silent) {
    if (!sheetOpen) return;
    sheetOpen = false;
    $('sheet').classList.add('hidden');
    if (!silent && history.state && history.state.sheet) history.back();
  }
  addEventListener('popstate', () => {
    if (sheetOpen) { sheetOpen = false; $('sheet').classList.add('hidden'); sel = null; renderMain(); }
  });

  // ------------------------------------------------------------------ render
  function renderMain() {
    const y = scrollY, m = $('main');
    const trees = [...m.querySelectorAll('.tree-wrap')].map(e => e.scrollLeft);
    if (S.mode === 'prof') {
      m.className = 'main v-' + S.pview;
      m.innerHTML = !P ? '<p class="empty">Loading…</p>' : S.pview === 'legacy' ? renderLegacy() : renderRecipes();
      scrollTo(0, y);
      return;
    }
    if (S.mode === 'equip') {
      m.className = 'main v-equip';
      m.innerHTML = E ? renderEquip() : '<p class="empty">Loading…</p>';
      scrollTo(0, y);
      return;
    }
    m.className = 'main v-' + S.view;
    m.innerHTML = S.view === 'talents' ? renderTalents() : S.view === 'spells' ? renderSpells() : S.view === 'stats' ? renderStats() : renderRaces();
    m.querySelectorAll('.tree-wrap').forEach((e, i) => { e.scrollLeft = trees[i] || 0; });
    scrollTo(0, y);
  }
  function render() {
    renderModes(); renderClasses(); renderViews(); renderSummary(); renderMain(); renderDetail();
    if (S.mode === 'prof' && !P) loadProf(render);
    if (S.mode === 'equip' && !E) loadEquip(render);
  }

  // ------------------------------------------------------------------ events
  document.addEventListener('click', e => {
    const t = e.target.closest('button, header.race-h, .sheet');
    if (!t) return;
    const d = t.dataset;
    if (t.id === 'sheet') { if (e.target === t) { sel = null; closeSheet(); renderMain(); } return; }
    if (d.mode) { S.mode = d.mode; sel = null; save(); closeSheet(); render(); return; }
    if (d.cls) { S.cls = d.cls; S.tab = Math.min(S.tab, 2); sel = null; save(); closeSheet(); render(); return; }
    if (d.prof) { S.prof = +d.prof; query = ''; sel = null; save(); closeSheet(); render(); return; }
    if (d.view) { S[S.mode === 'prof' ? 'pview' : 'view'] = d.view; sel = null; save(); closeSheet(); render(); return; }
    if (d.tabPick) { S.tab = +d.tabPick; save(); renderMain(); return; }
    if (d.slot) { S.eslot = d.slot; eQuery = ''; eShown = 150; sel = null; save(); closeSheet(); render(); return; }
    if ('esub' in d) { S.esub = d.esub; eShown = 150; save(); renderMain(); return; }
    if (d.eq) { S.eq = +d.eq; eShown = 150; save(); renderMain(); return; }
    if ('more' in d) { eShown += 300; $('elist').innerHTML = equipList(); return; }
    if (d.equip) { sel = { kind: 'equip', id: +d.equip }; renderDetail(); return; }
    if (d.filter) { S[S.mode === 'prof' ? 'pfilter' : S.mode === 'equip' ? 'efilter' : 'filter'] = d.filter; eShown = 150; sel = null; save(); renderMain(); renderDetail(); return; }
    if (d.recipe) { sel = { kind: 'recipe', id: d.recipe }; renderDetail(); return; }
    if (d.lnode) { sel = { kind: 'lnode', id: +d.lnode }; renderMain(); renderDetail(); return; }
    if ('close' in d) { sel = null; closeSheet(); renderMain(); return; }
    if (d.reset) {
      const P = pts();
      if (d.reset === 'all') S.pts[S.cls] = {};
      else cls().tabs[+d.reset].nodes.forEach(n => delete P[n.id]);
      save(); renderSummary(); renderMain(); renderDetail(); return;
    }
    if (d.node) {
      const id = +d.node, ti = +d.tab, n = nodeById(cls())[id];
      if (wide() && sel && sel.kind === 'talent' && sel.id === id) change(n, ti, 1);
      sel = { kind: 'talent', id };
      renderSummary(); renderMain(); renderDetail(); return;
    }
    if (d.pm) {
      const n = nodeById(cls())[sel.id];
      change(n, tabOf(cls())[sel.id], +d.pm);
      renderSummary(); renderMain(); renderDetail(); return;
    }
    if (d.rmtalent) { sel = { kind: 'rmtalent', id: +d.rmtalent }; renderDetail(); return; }
    if (d.spell) { sel = { kind: 'spell', id: d.spell }; renderDetail(); return; }
    if (d.suser) { sel = { kind: 'suser', id: +d.suser }; renderDetail(); return; }
    if (d.gotoTalent) {
      const id = +d.gotoTalent;
      S.view = 'talents'; S.tab = tabOf(cls())[id] ?? S.tab; sel = { kind: 'talent', id }; save(); closeSheet(true); render(); return;
    }
    if (d.racial) { sel = { kind: 'racial', id: d.racial }; renderDetail(); return; }
    if (d.race) {
      const id = +d.race;
      S.race[S.cls] = S.race[S.cls] === id ? undefined : id;
      save(); renderSummary(); renderMain(); return;
    }
  });
  // recipe / equipment search: redraw the list only, so the field keeps focus
  document.addEventListener('input', e => {
    if (e.target.id === 'esearch') { eQuery = e.target.value.trim(); eShown = 150; $('elist').innerHTML = equipList(); return; }
    if (e.target.id !== 'psearch') return;
    query = e.target.value.trim();
    $('plist').innerHTML = recipeList();
  });
  document.addEventListener('change', e => {
    if ('talented' in e.target.dataset) { S.talented = +e.target.value; save(); renderSummary(); }
  });
  // right-click removes a point (desktop)
  document.addEventListener('contextmenu', e => {
    const b = e.target.closest('[data-node]');
    if (!b) return;
    e.preventDefault();
    const id = +b.dataset.node;
    change(nodeById(cls())[id], +b.dataset.tab, -1);
    sel = { kind: 'talent', id };
    renderSummary(); renderMain(); renderDetail();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) { sel = null; closeSheet(); renderMain(); } });
  let wasWide = wide();
  addEventListener('resize', () => { if (wide() !== wasWide) { wasWide = wide(); renderDetail(); } });

  render();
})();
