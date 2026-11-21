/* WoW Forever Codex: classes (talent calculator, spell list, races and racials), every entry compared with Classic Era. */
(() => {
  'use strict';
  const X = window.CODEX;
  const FEATURES = {};
  const KEY = 'wowf-codex-v1';
  const VIEWS = [['talents', 'Talents'], ['spells', 'Spells'], ['races', 'Races']];
  const CLS = Object.fromEntries(X.classes.map(c => [c.token, c]));
  const RACE = Object.fromEntries(X.races.map(r => [r.id, r]));
  const CLASS_BY_ID = Object.fromEntries(X.classes.map(c => [c.id, c]));
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const wide = () => matchMedia('(min-width: 900px)').matches;

  // ------------------------------------------------------------------ state
  const S = Object.assign({ cls: X.classes[0].token, view: 'talents', tab: 0, pts: {}, race: {}, filter: 'all' },
    JSON.parse(localStorage.getItem(KEY) || '{}'));
  if (!CLS[S.cls]) S.cls = X.classes[0].token;
  let sel = null; // {kind, id}
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
  // game text: colour codes, inline textures and line breaks
  const clean = t => esc(String(t || '').replace(/\|c[0-9a-fA-F]{8}|\|cn[A-Z_]+:|\|r/g, '').replace(/\|T[^|]*\|t/g, ''))
    .replace(/\n/g, '<br>');
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
  // x: the entry (origin = later expansion it was backported from; was_sod = only Season of Discovery had it)
  function badge(status, kind, x) {
    if (!status || status === 'same') return '';
    const k = status === 'changed' && kind === 'wording' ? ' · wording' :
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
  function renderClasses() {
    $('classes').innerHTML = X.classes.map(c =>
      `<button class="cls ${c.token === S.cls ? 'on' : ''}" data-cls="${c.token}" style="--cc:${c.color}" title="${esc(c.name)}">` +
      `${icon(c.icon, 30)}<span>${esc(c.name)}</span></button>`).join('');
    document.documentElement.style.setProperty('--cc', cls().color);
  }
  function renderViews() {
    $('views').innerHTML = VIEWS.map(([k, l]) => `<button class="view ${S.view === k ? 'on' : ''}" data-view="${k}">${l}</button>`).join('');
  }
  function renderSummary() {
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
    const chips = `<nav class="chips">${FILTERS.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-filter="${k}">${l}</button>`).join('')}</nav>`;
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

  // ------------------------------------------------------------------ detail (side panel on wide screens, sheet on phones)
  function detailHTML() {
    if (!sel) return '';
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
    if (sel.kind === 'racial') {
      const [rid, rm, ...name] = sel.id.split(':');
      return racialDetail(+rid, rm === 'r', name.join(':'));
    }
    return '';
  }
  function renderDetail() {
    const html = detailHTML();
    if (wide()) {
      const el = $('detail'), top = el.scrollTop;
      el.innerHTML = html || `<div class="d-empty">${esc(cls().name)}</div>`;
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
    m.className = 'main v-' + S.view;
    m.innerHTML = S.view === 'talents' ? renderTalents() : S.view === 'spells' ? renderSpells() : renderRaces();
    m.querySelectorAll('.tree-wrap').forEach((e, i) => { e.scrollLeft = trees[i] || 0; });
    scrollTo(0, y);
  }
  function render() {
    renderClasses(); renderViews(); renderSummary(); renderMain(); renderDetail();
  }

  // ------------------------------------------------------------------ events
  document.addEventListener('click', e => {
    const t = e.target.closest('button, header.race-h, .sheet');
    if (!t) return;
    const d = t.dataset;
    if (t.id === 'sheet') { if (e.target === t) { sel = null; closeSheet(); renderMain(); } return; }
    if (d.cls) { S.cls = d.cls; S.tab = Math.min(S.tab, 2); sel = null; save(); closeSheet(); render(); return; }
    if (d.view) { S.view = d.view; sel = null; save(); closeSheet(); render(); return; }
    if (d.tabPick) { S.tab = +d.tabPick; save(); renderMain(); return; }
    if (d.filter) { S.filter = d.filter; sel = null; save(); renderMain(); renderDetail(); return; }
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
    if (d.racial) { sel = { kind: 'racial', id: d.racial }; renderDetail(); return; }
    if (d.race) {
      const id = +d.race;
      S.race[S.cls] = S.race[S.cls] === id ? undefined : id;
      save(); renderSummary(); renderMain(); return;
    }
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
