(() => {
'use strict';

const CFG = window.FAB_CONFIG || {};
const BUILD = '2026-11-07-1';
const LS_KEY = 'fabtracker.v1';
const MAX_UPLOAD = 25 * 1024 * 1024;
const SYNC_MS = 30000;

const BASE_STEPS = [
  'Spin coating','EBL patterning','Development','Etching','Redeposition removal',
  'Metal layer overlay patterning','Metal deposition','Liftoff','PECVD oxide',
  '2nd metal layer / routing','BOE window opening','Deep trench patterning',
  'Deep trench etching','Dicing','Polishing'
];
const BASE_TAGS = ['Full laser','Passive only','Deep trench','Cleaved','No PECVD'];
const STATUS = [['planned','Planned'],['ready','Ready'],['infab','In fab'],['measuring','Measuring'],['done','Done']];
const KINDS = [['gds','GDS layout'],['dxf','DXF drawing'],['design','Other design file'],['sem','SEM image'],['scope','Microscope image'],['other','Other']];
const DESIGN_KINDS = ['gds','dxf','design'];
const kindsFor = scope => KINDS.filter(([k]) => (scope === 'design') === DESIGN_KINDS.includes(k));
const ICO = {
  check:'<path d="M3 8.5l3.2 3.2L13 4.8"/>',
  x:'<path d="M4 4l8 8M12 4l-8 8"/>',
  up:'<path d="M8 13V3M3.5 7.5L8 3l4.5 4.5"/>',
  down:'<path d="M8 3v10M3.5 8.5L8 13l4.5-4.5"/>',
  plus:'<path d="M8 3v10M3 8h10"/>',
  back:'<path d="M10 3L5 8l5 5"/>',
  eye:'<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  download:'<path d="M8 2.5v7M4.8 6.8L8 10l3.2-3.2M3 13h10"/>',
  external:'<path d="M9 3h4v4M13 3L7.5 8.5M11 9.5V13H3V5h3.5"/>',
  alert:'<path d="M8 2l6.5 11.5h-13L8 2z"/><path d="M8 6.5v3M8 11.6v.1"/>',
  clip:'<path d="M13 7.5l-5 5a3 3 0 01-4.2-4.2l5.5-5.5a2 2 0 012.9 2.9L6.7 11.2a1 1 0 01-1.4-1.4L10 5.1"/>'
};
const ico = n => `<svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;

const S = {
  cfg:null, me:null, canWrite:true, mode:'boot', err:'', setupErr:'',
  srv:{}, pend:{}, queue:{}, busy:{}, L:[], byId:{},
  presets:[], presetsSha:null, loaded:false, syncing:false, lastSync:0,
  q:'', type:'all', tagFilter:[], editBlock:null, kindFilter:'all', tab:'fab', open:{}, fileStep:'', armed:null,
  down:false, dirty:false, blobs:{}
};
const $ = s => document.querySelector(s);
const $app = $('#app');
const modal = $('#modal');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36);
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = ms => ms ? new Date(ms).toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : '';
const stateWord = s => s === 'pass' ? 'done' : s === 'fail' ? 'failed' : 'not started';
const dataDir = () => (CFG.dataDir || 'data').replace(/\/$/, '');
const layoutPath = id => `${dataDir()}/layouts/${id}.json`;
const presetsPath = () => `${dataDir()}/presets.json`;
const route = () => { const m = location.hash.match(/^#l-([A-Za-z0-9]+)$/); return m ? m[1] : null; };

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.style.display = 'none'; }, 5000);
}
const errText = e => (e && e.detail) ? `${e.status}: ${e.detail}` : (e && e.status ? String(e.status) : 'network error');

/* ---------- people ---------- */
const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 42% 38%)`; };
function who(name, removeAct, extra){
  if (!name) return '<span class="who">Unknown</span>';
  const ini = String(name).split(/[\s._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const x = removeAct ? ` <button data-act="${removeAct}" ${extra || ''} aria-label="Remove ${esc(name)}">${ico('x')}</button>` : '';
  return `<span class="who ${removeAct ? 'x' : ''}"><i style="background:${hue(name)}">${esc(ini)}<img src="https://github.com/${encodeURIComponent(name)}.png?size=40" alt="" onerror="this.remove()"></i>${esc(name)}${x}</span>`;
}
function knownPeople(){
  const set = new Set(S.me ? [S.me.login] : []);
  S.L.forEach(l => { (l.workers || []).forEach(w => set.add(w)); (l.steps || []).forEach(s => s.by && set.add(s.by)); });
  return [...set];
}

/* ---------- data model ---------- */
function normTag(t){ return String(t || '').replace(/\s+/g, ' ').trim().slice(0, 30); }
function allTags(){
  const m = new Map();
  BASE_TAGS.forEach(t => m.set(t.toLowerCase(), {name:t, count:0}));
  S.L.forEach(l => l.tags.forEach(t => { const k = t.toLowerCase(); const e = m.get(k) || {name:t, count:0}; e.count++; m.set(k, e); }));
  return [...m.values()];
}
function rebuild(){
  S.L = [];
  for (const id in S.srv){
    let d = S.srv[id].data;
    const p = S.pend[id];
    if (p && p.length){ d = clone(d); p.forEach(x => x.fn(d)); }
    d.id = id; d.steps = d.steps || []; d.files = d.files || []; d.workers = d.workers || [];
    d.tags = d.tags || []; d.results = d.results || [];
    d.steps.forEach(s => { s.issues = s.issues || []; });
    S.L.push(d);
  }
  S.L.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  S.byId = {}; S.L.forEach(l => { S.byId[l.id] = l; });
}
function stats(l){
  return {total:l.steps.length, pass:l.steps.filter(s => s.state === 'pass').length, fail:l.steps.filter(s => s.state === 'fail').length};
}
const openIssues = l => l.steps.reduce((n, s) => n + s.issues.filter(i => !i.resolved).length, 0);
function strip(l, big){
  if (!l.steps.length) return `<div class="strip none ${big ? 'big' : ''}" title="No steps yet"></div>`;
  return `<div class="strip ${big ? 'big' : ''}" role="img" aria-label="${stats(l).pass} of ${l.steps.length} steps done">${l.steps.map(s => `<i class="${s.state}" title="${esc(s.name)} (${stateWord(s.state)})"></i>`).join('')}</div>`;
}

/* ---------- writing: optimistic UI, queued commits, retry on conflict ---------- */
function mutate(id, fn, message){
  const ts = Date.now();
  const wrapped = d => { fn(d); d.updatedAt = ts; };
  const p = {fn: wrapped};
  (S.pend[id] ||= []).push(p);
  rebuild(); sched();
  S.queue[id] = (S.queue[id] || Promise.resolve()).then(() => commit(id, p, message));
  return S.queue[id];
}
async function commit(id, p, message){
  S.busy[id] = (S.busy[id] || 0) + 1;
  try {
    for (let attempt = 0; attempt < 4; attempt++){
      const base = S.srv[id];
      if (!base) throw Object.assign(new Error('missing'), {status:404});
      const next = clone(base.data); p.fn(next);
      try {
        const r = await GH.putJson(layoutPath(id), next, base.sha, `${message} [${S.me.login}]`);
        S.srv[id] = {data:next, sha:r.sha};
        break;
      } catch (e){
        if ((e.status === 409 || e.status === 422) && attempt < 3){
          const fresh = await GH.getJson(layoutPath(id));
          if (fresh) S.srv[id] = fresh; else throw e;
          continue;
        }
        throw e;
      }
    }
  } catch (e){
    toast('Couldn’t save that change (' + errText(e) + '). Reloading the latest data.');
    try { const fresh = await GH.getJson(layoutPath(id)); if (fresh) S.srv[id] = fresh; } catch (_) {}
  } finally {
    S.pend[id] = (S.pend[id] || []).filter(x => x !== p);
    S.busy[id]--; rebuild(); sched();
  }
}
const me = () => S.me.login;
const stepOf = (d, sid) => d.steps.find(s => s.id === sid);
const pushLog = (s, entry) => { s.log = [...(s.log || []), entry].slice(-20); };

function setMark(lid, sid, state){
  const l = S.byId[lid], s = l && stepOf(l, sid); if (!s) return;
  const target = s.state === state ? 'pending' : state, at = Date.now(), by = me();
  mutate(lid, d => {
    const x = stepOf(d, sid); if (!x) return;
    x.state = target; x.by = by; x.at = at; pushLog(x, {by, at, state:target, note:''});
    if (target !== 'pending' && d.status === 'ready') d.status = 'infab';
  }, `${s.name}: ${target === 'pass' ? 'done' : target === 'fail' ? 'failed' : 'reset'} (${l.name})`);
}
function saveNote(lid, sid, text){
  const l = S.byId[lid], s = l && stepOf(l, sid); if (!s || (s.note || '') === text) return;
  const at = Date.now(), by = me();
  mutate(lid, d => {
    const x = stepOf(d, sid); if (!x) return;
    x.note = text; x.by = by; x.at = at; pushLog(x, {by, at, state:x.state, note:text.slice(0, 400)});
    if (d.status === 'ready') d.status = 'infab';
  }, `Note on ${s.name} (${l.name})`);
}
function setStepFields(lid, sid, patch, note){
  const l = S.byId[lid], s = l && stepOf(l, sid); if (!s) return;
  const at = Date.now(), by = me();
  mutate(lid, d => {
    const x = stepOf(d, sid); if (!x) return;
    Object.assign(x, patch); x.by = by; x.at = at; pushLog(x, {by, at, state:x.state, note});
    if (d.status === 'ready') d.status = 'infab';
  }, `Update ${s.name} (${l.name})`);
}
function addIssue(lid, sid, text){
  text = (text || '').trim(); const l = S.byId[lid], s = l && stepOf(l, sid); if (!text || !s) return;
  const at = Date.now(), by = me(), issue = {id:rid(), text, by, at, resolved:false, resolvedBy:null, resolvedAt:null};
  mutate(lid, d => {
    const x = stepOf(d, sid); if (!x) return;
    x.issues = x.issues || []; x.issues.push(issue);
    x.by = by; x.at = at; pushLog(x, {by, at, state:x.state, note:'Issue: ' + text.slice(0, 300)});
  }, `Issue on ${s.name} (${l.name})`);
}
function resolveIssue(lid, sid, iid){
  const l = S.byId[lid], s = l && stepOf(l, sid), i = s && s.issues.find(x => x.id === iid); if (!i) return;
  const resolved = !i.resolved, at = Date.now(), by = me();
  mutate(lid, d => {
    const x = stepOf(d, sid), y = x && (x.issues || []).find(z => z.id === iid); if (!y) return;
    y.resolved = resolved; y.resolvedBy = resolved ? by : null; y.resolvedAt = resolved ? at : null;
    x.by = by; x.at = at; pushLog(x, {by, at, state:x.state, note:(resolved ? 'Issue resolved: ' : 'Issue reopened: ') + y.text.slice(0, 200)});
  }, `${resolved ? 'Resolve' : 'Reopen'} issue on ${s.name} (${l.name})`);
}
function delIssue(lid, sid, iid){
  const l = S.byId[lid], s = l && stepOf(l, sid); if (!s) return;
  mutate(lid, d => { const x = stepOf(d, sid); if (x) x.issues = (x.issues || []).filter(i => i.id !== iid); }, `Delete issue on ${s.name} (${l.name})`);
}
function renameStep(lid, sid, name){
  name = name.trim(); const l = S.byId[lid], s = l && stepOf(l, sid);
  if (!s || !name || s.name === name) return;
  mutate(lid, d => { const x = stepOf(d, sid); if (x) x.name = name; }, `Rename step to ${name} (${l.name})`);
}
function moveStep(lid, sid, dir){
  mutate(lid, d => {
    const i = d.steps.findIndex(s => s.id === sid), j = i + dir;
    if (i < 0 || j < 0 || j >= d.steps.length) return;
    [d.steps[i], d.steps[j]] = [d.steps[j], d.steps[i]];
  }, `Reorder steps (${S.byId[lid].name})`);
}
function newStep(name, started){ return {id:rid(), name, state:'pending', note:'', recipe:'', started:started || '', issues:[], by:null, at:null, log:[]}; }
function addStep(lid, name, afterId, started){
  name = (name || '').trim(); if (!name || !S.byId[lid]) return;
  const step = newStep(name, started);
  mutate(lid, d => {
    if (stepOf(d, step.id)) return;
    const i = afterId ? d.steps.findIndex(s => s.id === afterId) : -1;
    if (i >= 0) d.steps.splice(i + 1, 0, step); else d.steps.push(step);
  }, `Add step ${name} (${S.byId[lid].name})`);
  const known = BASE_STEPS.concat(S.presets).some(n => n.toLowerCase() === name.toLowerCase());
  if (!known) editPresets(list => list.some(n => n.toLowerCase() === name.toLowerCase()) ? list : [...list, name]);
}
function delStep(lid, sid){
  const s = stepOf(S.byId[lid], sid); if (!s) return;
  mutate(lid, d => { d.steps = d.steps.filter(x => x.id !== sid); }, `Delete step ${s.name} (${S.byId[lid].name})`);
}
function updateLayout(lid, patch, what){
  mutate(lid, d => Object.assign(d, patch), `${what || 'Update'} (${S.byId[lid].name})`);
}
function addTags(lid, text){
  const l = S.byId[lid]; if (!l) return;
  const known = allTags();
  const add = [];
  String(text || '').split(',').map(normTag).filter(Boolean).forEach(t => {
    const k = t.toLowerCase();
    if (l.tags.some(x => x.toLowerCase() === k) || add.some(x => x.toLowerCase() === k)) return;
    const e = known.find(x => x.name.toLowerCase() === k);
    add.push(e ? e.name : t);
  });
  if (!add.length) return;
  mutate(lid, d => { d.tags = d.tags || []; add.forEach(t => { if (!d.tags.some(x => x.toLowerCase() === t.toLowerCase())) d.tags.push(t); }); }, `Tag ${add.join(', ')} (${l.name})`);
}
function rmTag(lid, tag){
  const l = S.byId[lid]; if (!l) return;
  mutate(lid, d => { d.tags = (d.tags || []).filter(t => t !== tag); }, `Remove tag ${tag} (${l.name})`);
}
function loadExample(lid){
  const l = S.byId[lid]; if (!l || l.steps.length) return;
  const steps = BASE_STEPS.map(n => newStep(n));
  mutate(lid, d => { if (!d.steps.length) d.steps = clone(steps); }, `Load example flow (${l.name})`);
}
async function editPresets(fn){
  for (let a = 0; a < 3; a++){
    try {
      const list = fn(S.presets.slice());
      const r = await GH.putJson(presetsPath(), {names:list}, S.presetsSha, `Update quick-add steps [${me()}]`);
      S.presetsSha = r.sha; S.presets = list; sched(); return;
    } catch (e){
      if (e.status === 409 || e.status === 422){
        const f = await GH.getJson(presetsPath());
        S.presetsSha = f ? f.sha : null; S.presets = f ? (f.data.names || []) : [];
      } else { toast('Couldn’t save the quick-add list (' + errText(e) + ').'); return; }
    }
  }
}
function arm(key, fn){
  if (S.armed === key){ S.armed = null; fn(); return; }
  S.armed = key; sched();
  clearTimeout(arm.t); arm.t = setTimeout(() => { S.armed = null; sched(); }, 4000);
}
async function deleteLayout(lid){
  try {
    await (S.queue[lid] || Promise.resolve());
    const l = S.srv[lid].data;
    const paths = (l.files || []).filter(f => f.source === 'repo').map(f => f.path).concat((l.results || []).filter(b => b.type === 'image' && b.path).map(b => b.path));
    for (const p of paths){ try { await GH.del(p, `Delete file [${me()}]`); } catch (_) {} }
    await GH.delWithSha(layoutPath(lid), S.srv[lid].sha, `Delete layout ${l.name} [${me()}]`);
    delete S.srv[lid]; rebuild(); location.hash = 'overview';
  } catch (e){ toast('Couldn’t delete the layout (' + errText(e) + ').'); }
}
async function removeFile(lid, fid){
  const l = S.byId[lid], f = l && l.files.find(x => x.id === fid); if (!f) return;
  await mutate(lid, d => { d.files = d.files.filter(x => x.id !== fid); }, `Remove file ${f.name} (${l.name})`);
  if (f.source === 'repo'){ try { await GH.del(f.path, `Delete ${f.name} [${me()}]`); } catch (_) {} }
}
/* results blocks */
function addBlock(lid, block){
  const l = S.byId[lid]; if (!l) return;
  block.id = block.id || rid(); block.by = me(); block.at = Date.now();
  mutate(lid, d => { (d.results ||= []).push(block); }, `Add ${block.type} to results (${l.name})`);
  return block.id;
}
function updateBlock(lid, bid, patch){
  const l = S.byId[lid]; if (!l) return;
  const at = Date.now(), by = me();
  mutate(lid, d => { const b = (d.results || []).find(x => x.id === bid); if (b){ Object.assign(b, patch); b.by = by; b.at = at; } }, `Edit results (${l.name})`);
}
function delBlock(lid, bid){
  const l = S.byId[lid], b = l && l.results.find(x => x.id === bid); if (!b) return;
  mutate(lid, d => {
    d.results = (d.results || []).filter(x => x.id !== bid);
  }, `Delete results block (${l.name})`).then(() => { if (b.type === 'image' && b.path) GH.del(b.path, `Delete image [${me()}]`).catch(() => {}); });
}
function moveBlock(lid, bid, dir){
  mutate(lid, d => {
    const a = d.results || [], i = a.findIndex(x => x.id === bid), j = i + dir;
    if (i < 0 || j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
  }, `Reorder results (${S.byId[lid].name})`);
}

/* ---------- syncing ---------- */
async function sync(){
  if (S.syncing || S.mode !== 'app') return;
  S.syncing = true;
  try {
    const items = (await GH.list(dataDir() + '/layouts')).filter(x => x.type === 'file' && x.name.endsWith('.json'));
    const seen = new Set();
    await Promise.all(items.map(async it => {
      const id = it.name.slice(0, -5); seen.add(id);
      const cur = S.srv[id];
      if ((cur && cur.sha === it.sha) || S.busy[id]) return;
      const r = await GH.getJson(it.path); if (r) S.srv[id] = r;
    }));
    for (const id in S.srv) if (!seen.has(id) && !S.busy[id]) delete S.srv[id];
    const pf = await GH.getJson(presetsPath());
    S.presets = pf ? (pf.data.names || []) : []; S.presetsSha = pf ? pf.sha : null;
    S.loaded = true; S.err = ''; S.lastSync = Date.now();
  } catch (e){
    if (e.status === 401){ signOut('Your token was rejected. Paste a new one.'); return; }
    S.err = errText(e);
    if (S.loaded) toast('Couldn’t refresh from GitHub (' + S.err + ').');
  } finally {
    S.syncing = false; rebuild(); sched();
  }
}

/* ---------- sign-in ---------- */
function readSaved(){ try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (_) { return {}; } }
async function connect(c){
  GH.configure(c);
  const [u, r] = await Promise.all([GH.me(), GH.repo()]);
  S.me = {login:u.login, name:u.name || ''};
  S.canWrite = !!(r.permissions && r.permissions.push);
  c.branch = c.branch || r.default_branch;
  GH.configure(c);
  S.cfg = c;
  localStorage.setItem(LS_KEY, JSON.stringify({dataRepo:c.owner + '/' + c.repo, branch:c.branch, token:c.token}));
  S.mode = 'app'; S.loaded = false; S.setupErr = '';
  sched(); sync();
}
function signOut(msg){
  const s = readSaved(); localStorage.setItem(LS_KEY, JSON.stringify({dataRepo:s.dataRepo, branch:s.branch}));
  S.mode = 'setup'; S.setupErr = msg || ''; S.srv = {}; S.loaded = false; S.me = null; sched();
}
function tokenLink(owner){
  const q = new URLSearchParams({name:'fab-tracker', description:'Fab tracker: read and write files in the data repository', expires_in:'365', contents:'write'});
  if (owner) q.set('target_name', owner);
  return 'https://github.com/settings/personal-access-tokens/new?' + q.toString();
}
function viewSetup(){
  const s = readSaved();
  const repo = s.dataRepo || CFG.dataRepo || '';
  const branch = s.branch || CFG.branch || '';
  const repoFields = `<label>Data repository<input class="txt" name="repo" placeholder="owner/name" value="${esc(repo)}" required></label>
    <label>Branch (optional)<input class="txt" name="branch" placeholder="default branch" value="${esc(branch)}"></label>`;
  return `<header class="top"><h1>Fab tracker</h1></header>
  <form class="setup" data-form="setup">
    <h2>Sign in</h2>
    <p>You sign in once on each device. After that, this browser stays signed in.</p>
    ${S.setupErr ? `<div class="err">${esc(S.setupErr)}</div>` : ''}
    <ol class="stepslist">
      <li><a id="tokenlink" class="btn" target="_blank" rel="noopener noreferrer" href="${tokenLink(repo.split('/')[0])}">Create your token on GitHub</a>
        <span>The form opens pre-filled. Under <b>Repository access</b> choose <b>Only select repositories</b> and pick the data repository, then click <b>Generate token</b> and copy it.</span></li>
      <li>Paste the token here.<input class="txt" name="token" type="password" autocomplete="off" placeholder="github_pat_…" required></li>
    </ol>
    ${repo ? `<p class="hint">Data repository: <b>${esc(repo)}</b></p><details><summary>Change repository</summary>${repoFields}</details>` : repoFields}
    <button class="btn primary" type="submit">Sign in</button>
  </form>`;
}

/* ---------- views ---------- */
function topbar(extra){
  return `<header class="top"><h1><a href="#overview">Fab tracker</a></h1>${extra || ''}
    ${S.me ? `<div class="me">${who(S.me.login)} <button class="btn ghost" data-act="signout">Sign out</button></div>` : ''}</header>`;
}
const fmtDate = d => { const [y, m, dd] = String(d).split('-').map(Number); return y ? new Date(y, m - 1, dd).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}) : ''; };
const tagChips = l => l.tags.map(t => `<span class="tagc">${esc(t)}</span>`).join('');
function matchLayout(l){
  if (S.type !== 'all' && l.type !== S.type) return false;
  if (S.tagFilter.length && !S.tagFilter.every(t => l.tags.some(x => x.toLowerCase() === t.toLowerCase()))) return false;
  const q = S.q.trim().toLowerCase(); if (!q) return true;
  return [l.name, l.purpose, ...l.tags, ...(l.workers || [])].join(' ').toLowerCase().includes(q);
}
function ovList(){
  if (!S.L.length){
    return `<div class="empty"><strong>No layouts yet</strong>Add the first layout to start tracking its design, fab steps and results.${S.canWrite ? '<br><button class="btn primary" data-act="newlayout">' + ico('plus') + ' New layout</button>' : ''}</div>`;
  }
  const list = S.L.filter(matchLayout);
  if (!list.length) return '<div class="empty"><strong>Nothing matches</strong>Try a different search, or clear the type and tag filters.</div>';
  return STATUS.map(([k, label]) => {
    const g = list.filter(l => (l.status || 'planned') === k); if (!g.length) return '';
    return `<section class="group"><h2>${label} <span>${g.length}</span></h2><div class="rows">${g.map(l => {
      const st = stats(l), oi = openIssues(l);
      return `<div class="row" role="link" tabindex="0" data-act="open" data-id="${l.id}">
        <div><div class="nm">${esc(l.name)}</div><div class="tagrow">${l.type ? `<span class="tag ${l.type}">${l.type === 'active' ? 'Active' : 'Passive'}</span>` : ''}${tagChips(l)}</div></div>
        <div class="purpose">${esc(l.purpose || 'No description')}</div>
        <div class="c-who">${l.workers.length ? l.workers.map(w => who(w)).join('') : '<span class="who">Unassigned</span>'}</div>
        <div class="c-prog">${strip(l)}<small>${st.total ? `${st.pass} of ${st.total} done${st.fail ? ` · ${st.fail} failed` : ''}` : 'No steps yet'}${oi ? ` · <span class="iss">${oi} open issue${oi > 1 ? 's' : ''}</span>` : ''}</small></div>
      </div>`;
    }).join('')}</div></section>`;
  }).join('');
}
function activity(){
  const items = [];
  S.L.forEach(l => l.steps.forEach(s => { if (s.at) items.push({l, s}); }));
  items.sort((a, b) => b.s.at - a.s.at);
  if (!items.length) return '<p class="hint">Updates to steps will show up here, with who made them.</p>';
  return `<ul class="act">${items.slice(0, 8).map(({l, s}) => {
    const ln = (s.log || []).slice(-1)[0], note = (ln && ln.note) || '';
    const verb = note.startsWith('Issue resolved') ? `resolved an issue on <b>${esc(s.name)}</b>` :
      note.startsWith('Issue:') ? `reported an issue on <b>${esc(s.name)}</b>` :
      s.state === 'pass' ? `marked <b>${esc(s.name)}</b> done` : s.state === 'fail' ? `marked <b>${esc(s.name)}</b> failed` : `updated <b>${esc(s.name)}</b>`;
    return `<li>${who(s.by)} ${verb} on <a data-act="open" data-id="${l.id}">${esc(l.name)}</a><time>${fmt(s.at)}</time></li>`;
  }).join('')}</ul>`;
}
function tagBar(){
  const used = allTags().filter(t => t.count > 0).sort((a, b) => a.name.localeCompare(b.name));
  if (!used.length) return '';
  return `<div class="tagbar" role="group" aria-label="Filter by tag"><span class="lbl">Tags</span>${used.map(t => `<button class="tagbtn" data-act="tagfilter" data-tag="${esc(t.name)}" aria-pressed="${S.tagFilter.some(x => x.toLowerCase() === t.name.toLowerCase())}">${esc(t.name)} <span>${t.count}</span></button>`).join('')}${S.tagFilter.length ? '<button class="btn ghost sm" data-act="cleartags">Clear</button>' : ''}</div>`;
}
function viewOverview(){
  return topbar(S.canWrite ? `<button class="btn primary" data-act="newlayout">${ico('plus')} New layout</button>` : '') + `
  <div class="bar">
    <input class="search" data-live="q" type="search" placeholder="Search layouts, tags, purposes or people" aria-label="Search layouts" value="${esc(S.q)}">
    <div class="seg" role="group" aria-label="Filter by type">
      ${[['all','All'],['passive','Passive'],['active','Active']].map(([v, l]) => `<button data-act="typefilter" data-v="${v}" aria-pressed="${S.type === v}">${l}</button>`).join('')}
    </div>
    <button class="btn" data-act="openlocal" title="View a GDS file from your computer without uploading it">Open GDS file</button>
    <button class="btn" data-act="opendrive" title="View a GDS file from a Google Drive link">Open from Drive</button>
    ${S.L.length ? '<button class="btn" data-act="export">Export CSV</button>' : ''}
    <button class="btn ghost" data-act="refresh" title="Fetch the latest from GitHub">Refresh</button>
  </div>
  ${tagBar()}
  <div class="ov"><div id="ovlist">${ovList()}</div><aside><h2>Latest updates</h2>${activity()}</aside></div>`;
}

function stepRow(l, s, i){
  const open = !!S.open[s.id], ro = S.canWrite ? '' : 'disabled';
  const nFiles = l.files.filter(f => f.stepId === s.id).length;
  const nOpen = s.issues.filter(x => !x.resolved).length;
  const hist = (s.log || []).slice().reverse();
  return `<li class="step ${s.state}" data-id="${s.id}">
    <span class="node">${s.state === 'pass' ? ico('check') : s.state === 'fail' ? ico('x') : i + 1}</span>
    <div class="s-main" data-act="toggle" data-id="${s.id}">
      <div class="s-name">${esc(s.name)}</div>
      ${s.recipe ? `<div class="s-recipe"><b>Recipe</b> ${esc(s.recipe)}</div>` : ''}
      ${s.note ? `<div class="s-note">${esc(s.note)}</div>` : ''}
      <div class="s-meta">${s.started ? `<span class="dchip">Started ${fmtDate(s.started)}</span>` : ''}${nOpen ? `<span class="issue-badge">${ico('alert')} ${nOpen} open issue${nOpen > 1 ? 's' : ''}</span>` : ''}${s.at ? `${who(s.by)}<span>${fmt(s.at)}</span>` : (s.started ? '' : '<span>Not started</span>')}${nFiles ? `<button class="chipbtn" data-act="stepfiles" data-id="${s.id}">${nFiles} file${nFiles > 1 ? 's' : ''}</button>` : ''}</div>
    </div>
    <div class="s-btns">
      <button class="mark pass ${s.state === 'pass' ? 'on' : ''}" data-act="mark" data-state="pass" data-id="${s.id}" aria-pressed="${s.state === 'pass'}" aria-label="Mark ${esc(s.name)} done" title="Done" ${ro}>${ico('check')}</button>
      <button class="mark fail ${s.state === 'fail' ? 'on' : ''}" data-act="mark" data-state="fail" data-id="${s.id}" aria-pressed="${s.state === 'fail'}" aria-label="Mark ${esc(s.name)} failed" title="Failed" ${ro}>${ico('x')}</button>
    </div>
    ${open ? `<div class="s-panel">
      <div class="two">
        <label>Started<span class="inl"><input type="date" class="txt" data-sdate="${s.id}" value="${esc(s.started || '')}" ${ro}><button class="btn sm" data-act="today" data-id="${s.id}" ${ro}>Today</button></span></label>
        <label>Recipe used<input class="txt" data-recipe="${s.id}" value="${esc(s.recipe || '')}" placeholder="e.g. Si etch v3, 60 s" ${ro}></label>
      </div>
      <label>Note<textarea class="txt" rows="3" data-note="${s.id}" placeholder="Dose, thickness, observations, anything worth remembering" ${ro}>${esc(s.note || '')}</textarea></label>
      <div class="issues">
        <b>Issues</b>
        ${s.issues.length ? `<ul class="ilist">${s.issues.map(x => `<li class="${x.resolved ? 'res' : ''}"><div>${esc(x.text)}</div>
          <div class="im">${who(x.by)} · ${fmt(x.at)}${x.resolved ? ` · resolved by ${esc(x.resolvedBy || '')} ${fmt(x.resolvedAt)}` : ''}</div>
          ${S.canWrite ? `<div class="ia"><button class="btn sm" data-act="resolveissue" data-id="${s.id}" data-iid="${x.id}">${x.resolved ? 'Reopen' : 'Mark resolved'}</button><button class="btn ghost sm danger ${S.armed === 'i' + x.id ? 'armed' : ''}" data-act="delissue" data-id="${s.id}" data-iid="${x.id}">${S.armed === 'i' + x.id ? 'Click again to delete' : 'Delete'}</button></div>` : ''}</li>`).join('')}</ul>` : '<p class="hint" style="margin:0">No issues reported on this step.</p>'}
        ${S.canWrite ? `<div class="tools"><input class="txt" data-issue="${s.id}" placeholder="Describe the problem, e.g. resist peeled at the edge" aria-label="Describe an issue"><button class="btn" data-act="addissue" data-id="${s.id}">${ico('alert')} Report issue</button></div>` : ''}
      </div>
      ${S.canWrite ? `<div class="tools">
        <input class="txt" data-rename="${s.id}" value="${esc(s.name)}" aria-label="Step name">
        <button class="btn" data-act="move" data-dir="-1" data-id="${s.id}" aria-label="Move up">${ico('up')}</button>
        <button class="btn" data-act="move" data-dir="1" data-id="${s.id}" aria-label="Move down">${ico('down')}</button>
        <button class="btn" data-act="attach" data-scope="fab" data-step="${s.id}">${ico('clip')} Attach file</button>
        <button class="btn danger ${S.armed === 's' + s.id ? 'armed' : ''}" data-act="delstep" data-id="${s.id}">${S.armed === 's' + s.id ? 'Click again to delete' : 'Delete step'}</button>
      </div>
      <div class="tools"><input class="txt" data-after="${s.id}" placeholder="Add a step after this one" aria-label="Add a step after this one"><button class="btn" data-act="addafter" data-id="${s.id}">${ico('plus')} Add</button></div>` : ''}
      ${hist.length ? `<ol class="hist" aria-label="History">${hist.map(h => `<li>${who(h.by)}<span class="st ${h.state}">${h.state === 'pass' ? 'Done' : h.state === 'fail' ? 'Failed' : 'Pending'}</span><span>${fmt(h.at)}</span>${h.note ? `<q>${esc(h.note)}</q>` : ''}</li>`).join('')}</ol>` : ''}
    </div>` : ''}
  </li>`;
}
function presetChips(){
  const base = BASE_STEPS.map(n => `<span class="chip"><button data-act="preset" data-name="${esc(n)}">+ ${esc(n)}</button></span>`);
  const cust = S.presets.filter(n => !BASE_STEPS.some(b => b.toLowerCase() === n.toLowerCase())).map(n => `<span class="chip"><button data-act="preset" data-name="${esc(n)}">+ ${esc(n)}</button><button class="rm" data-act="rmpreset" data-name="${esc(n)}" aria-label="Remove ${esc(n)} from quick add">${ico('x')}</button></span>`);
  return base.concat(cust).join('');
}
function tabProcess(l){
  return `<ol class="steps">${l.steps.map((s, i) => stepRow(l, s, i)).join('')}</ol>` + (S.canWrite ? `
    <div class="addbox">
      <div class="addrow"><input class="txt" data-addstep="${l.id}" placeholder="${l.steps.length ? 'Add another step (any name, as many times as you need)' : 'Add the first step'}" aria-label="New step name"><input type="date" class="txt dateadd" data-addstepdate title="Start date (optional)" aria-label="Start date (optional)"><button class="btn primary" data-act="addstep" data-id="${l.id}">${ico('plus')} Add step</button></div>
      <div class="chips" aria-label="Quick add">${presetChips()}</div>
      ${!l.steps.length ? `<p class="hint">Or <button class="btn" data-act="example" data-id="${l.id}">Load the example flow (${BASE_STEPS.length} steps)</button></p>` : '<p class="hint">Quick-add chips can be used as many times as you like. The start date is optional and applies to the next step you add. New step names you type are saved to the quick-add list for everyone.</p>'}
    </div>` : '');
}
function stepLabel(l, f){
  if (!f.stepId) return 'Whole layout';
  const s = stepOf(l, f.stepId); return s ? s.name : 'Deleted step';
}
function fileCard(l, f){
  const isImg = f.source === 'repo' && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name);
  const kind = (KINDS.find(k => k[0] === (f.kind || 'other')) || KINDS[3])[1];
  return `<div class="file">
    ${isImg ? `<button class="thumb" data-act="lightbox" data-path="${esc(f.path)}" data-name="${esc(f.name)}" aria-label="View ${esc(f.name)}"><img data-path="${esc(f.path)}" alt="${esc(f.name)}"></button>` : `<div class="thumb">${esc((f.kind || 'file').toUpperCase().slice(0, 4))}</div>`}
    <div><div class="fn">${esc(f.name)}</div>
      <div class="fm">${kind} · ${esc(stepLabel(l, f))}${f.source === 'link' ? ' · Link' : ''}${f.size ? ' · ' + (f.size / 1048576 >= 1 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB') : ''}</div>
      ${f.note ? `<div class="fm">${esc(f.note)}</div>` : ''}
      <div class="fm">${who(f.by)} · ${fmt(f.at)}</div>
      <div class="fa">${f.source === 'link'
        ? `${isDriveGds(f) ? `<button class="btn primary sm" data-act="viewdrive" data-url="${esc(f.url)}" data-name="${esc(f.name)}">${ico('eye')} View layout</button>` : ''}<a class="btn sm" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${ico('external')} Open link</a>`
        : `${isGds(f) ? `<button class="btn primary sm" data-act="viewgds" data-path="${esc(f.path)}" data-name="${esc(f.name)}">${ico('eye')} View layout</button>` : ''}<button class="btn sm" data-act="download" data-path="${esc(f.path)}" data-name="${esc(f.name)}">${ico('download')} Download</button>`}</div></div>
    ${S.canWrite ? `<button class="btn ghost sm danger ${S.armed === 'f' + f.id ? 'armed' : ''}" data-act="delfile" data-id="${f.id}">${S.armed === 'f' + f.id ? 'Click again to remove' : 'Remove'}</button>` : ''}
  </div>`;
}
function tabFiles(l, scope){
  const kinds = kindsFor(scope), kk = kinds.map(k => k[0]);
  let files = l.files.filter(f => kk.includes(f.kind || 'other')).sort((a, b) => (b.at || 0) - (a.at || 0));
  const filtered = scope === 'fab' && S.fileStep && stepOf(l, S.fileStep);
  if (filtered) files = files.filter(f => f.stepId === S.fileStep);
  const kf = kk.includes(S.kindFilter) ? S.kindFilter : 'all';
  const count = k => files.filter(f => (f.kind || 'other') === k).length;
  const stepAttr = filtered ? S.fileStep : '';
  const adder = S.canWrite ? `<div class="addfiles">
    <h3>${scope === 'design' ? 'Add design files' : 'Add images and files'}</h3>
    <p class="hint" style="margin:0 0 10px">${scope === 'design' ? 'Choose the file type, then upload it or link it from Box or Google Drive.' : 'SEM and microscope images and other process files. You can tie them to a step.'}</p>
    <div class="kindbtns">${kinds.map(([k, t]) => `<button class="btn" data-act="attach" data-scope="${scope}" data-kind="${k}" data-step="${stepAttr}">${ico('clip')} ${t}</button>`).join('')}</div>
    ${scope === 'design' ? `<p class="hint">Large GDS on Box? Download it, then <button class="btn" data-act="openlocal">view it from your computer</button> without uploading.</p>` : ''}
  </div>` : '';
  const filt = `<div class="filt"><div class="seg" role="group" aria-label="Filter by file type">
      <button data-act="kindfilter" data-v="all" aria-pressed="${kf === 'all'}">All (${files.length})</button>
      ${kinds.map(([k, t]) => `<button data-act="kindfilter" data-v="${k}" aria-pressed="${kf === k}">${t} (${count(k)})</button>`).join('')}
    </div>
    ${filtered ? `<span class="who">Only files for ${esc(stepOf(l, S.fileStep).name)}</span><button class="btn ghost" data-act="clearstepfilter">Show all steps</button>` : ''}</div>`;
  let body;
  if (!files.length) body = `<div class="empty"><strong>${filtered ? 'No files on this step' : 'No files yet'}</strong>${scope === 'design' ? 'Add the GDS layout, DXF drawings and other design files here.' : 'Add SEM images, microscope images and other process files here.'}</div>`;
  else if (kf !== 'all'){
    const list = files.filter(f => (f.kind || 'other') === kf);
    body = list.length ? `<div class="files">${list.map(f => fileCard(l, f)).join('')}</div>` : '<div class="empty"><strong>Nothing of this type yet</strong></div>';
  } else {
    body = kinds.map(([k, t]) => { const list = files.filter(f => (f.kind || 'other') === k); return list.length ? `<section class="group"><h2>${t} <span>${list.length}</span></h2><div class="files">${list.map(f => fileCard(l, f)).join('')}</div></section>` : ''; }).join('');
  }
  return adder + filt + body;
}
function tagsEditor(l, ro){
  const chips = l.tags.map(t => `<span class="tagc ed">${esc(t)}${ro ? '' : ` <button data-act="rmtag" data-tag="${esc(t)}" aria-label="Remove tag ${esc(t)}">${ico('x')}</button>`}</span>`).join('');
  const sugg = allTags().filter(t => !l.tags.some(x => x.toLowerCase() === t.name.toLowerCase()));
  return `<div class="tagsed"><span class="lbl">Tags</span>${chips || '<span class="hint" style="margin:0">None yet</span>'}
    ${ro ? '' : `<span class="addp"><input class="txt" data-addtag list="tag-list" placeholder="Add a tag, e.g. Cleaved" aria-label="Add a tag"><datalist id="tag-list">${sugg.map(t => `<option value="${esc(t.name)}">`).join('')}</datalist><button class="btn ghost" data-act="addtagbtn">${ico('plus')} Add</button></span>`}</div>`;
}
function workersEditor(l, ro){
  const chips = l.workers.map((w, i) => ro ? who(w) : who(w, 'rmworker', `data-i="${i}"`)).join('');
  return `<div class="workers">${chips || '<span class="who">Nobody assigned</span>'}
    ${ro ? '' : `<div class="addp"><input class="txt" data-addworker list="people-list" placeholder="Add a person" aria-label="Add a person"><datalist id="people-list">${knownPeople().filter(p => !l.workers.includes(p)).map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    <button class="btn ghost" data-act="addworker">${ico('plus')} Add</button>${l.workers.includes(S.me.login) ? '' : '<button class="btn ghost" data-act="addme">Add me</button>'}</div>`}</div>`;
}
function viewDetail(id){
  const l = S.byId[id];
  if (!l) return topbar() + '<div class="empty"><strong>Layout not found</strong>It may have been deleted.<br><a class="btn" href="#overview">Back to all layouts</a></div>';
  const ro = !S.canWrite, dis = ro ? 'disabled' : '', st = stats(l), oi = openIssues(l);
  const nDesign = l.files.filter(f => DESIGN_KINDS.includes(f.kind || 'other')).length;
  const tab = ['design', 'fab', 'results'].includes(S.tab) ? S.tab : 'fab';
  const body = tab === 'design' ? tabFiles(l, 'design') :
    tab === 'results' ? tabResults(l) :
    tabProcess(l) + `<section id="fab-files" class="fabfiles"><h3 class="sec">Process images and files</h3>${tabFiles(l, 'fab')}</section>`;
  return topbar() + `
  <button class="btn ghost back" data-act="home">${ico('back')} All layouts</button>
  <div class="dhead">
    <input class="title" data-f="name" value="${esc(l.name)}" aria-label="Layout name" ${dis}>
    <div class="meta">
      <div class="seg t-${l.type || 'passive'}" role="group" aria-label="Layout type">
        <button data-act="settype" data-v="passive" aria-pressed="${l.type === 'passive'}" ${dis}>Passive</button>
        <button data-act="settype" data-v="active" aria-pressed="${l.type === 'active'}" ${dis}>Active</button>
      </div>
      <label class="fld">Status <select data-f="status" ${dis}>${STATUS.map(([k, t]) => `<option value="${k}" ${(l.status || 'planned') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      ${workersEditor(l, ro)}
    </div>
    ${tagsEditor(l, ro)}
    <textarea class="txt" rows="2" data-f="purpose" placeholder="What is this layout for?" aria-label="Purpose" ${dis}>${esc(l.purpose || '')}</textarea>
    <div class="prog">${strip(l, true)}<div class="sum">${st.total ? `<b>${st.pass} of ${st.total}</b> steps done${st.fail ? `, <b>${st.fail}</b> failed` : ''}` : 'No steps yet'}${oi ? ` · <span class="iss">${oi} open issue${oi > 1 ? 's' : ''}</span>` : ''}</div></div>
  </div>
  <div class="tabs" role="tablist">
    <button role="tab" data-act="tab" data-v="design" aria-selected="${tab === 'design'}">Design${nDesign ? ` (${nDesign})` : ''}</button>
    <button role="tab" data-act="tab" data-v="fab" aria-selected="${tab === 'fab'}">Fab${st.total ? ` (${st.pass}/${st.total})` : ''}</button>
    <button role="tab" data-act="tab" data-v="results" aria-selected="${tab === 'results'}">Results${l.results.length ? ` (${l.results.length})` : ''}</button>
  </div>
  ${body}
  ${S.canWrite ? `<p style="margin-top:36px"><button class="btn danger ${S.armed === 'l' + id ? 'armed' : ''}" data-act="dellayout" data-id="${id}">${S.armed === 'l' + id ? 'Click again to delete this layout and its files' : 'Delete layout'}</button></p>` : ''}`;
}

/* ---------- render loop (never re-render while someone is typing or clicking) ---------- */
function dirtyField(){
  const ae = document.activeElement;
  return !!(ae && $app.contains(ae) && ae.matches('input:not([type]),input[type="text"],input[type="password"],textarea') && !ae.hasAttribute('data-live') && ae.value !== ae.defaultValue);
}
function sched(){ if (S.raf) return; S.raf = requestAnimationFrame(() => { S.raf = 0; render(); }); }
const flush = () => { if (S.dirty) sched(); };
function render(){
  if (S.down || dirtyField()){ S.dirty = true; return; }
  S.dirty = false;
  const ae = document.activeElement, live = ae && ae.dataset && ae.dataset.live;
  const sel = live ? [ae.selectionStart, ae.selectionEnd] : null;
  let html;
  if (S.mode === 'boot') html = '<div class="empty">Loading…</div>';
  else if (S.mode === 'setup') html = viewSetup();
  else if (!S.loaded) html = topbar() + (S.err ? `<div class="empty"><strong>Couldn’t load the data</strong>GitHub returned “${esc(S.err)}”. Check the repository name and that your token can read it.<br><button class="btn" data-act="refresh">Try again</button> <button class="btn" data-act="signout">Change sign-in</button></div>` : '<div class="empty">Loading layouts from GitHub…</div>');
  else {
    const r = route();
    html = (S.canWrite ? '' : '<div class="banner">You have read-only access to this repository, so you can’t update steps.</div>') + (r ? viewDetail(r) : viewOverview());
  }
  if (S.mode === 'app' && S.loaded) html += `<footer class="ver">Fab tracker, build ${BUILD}</footer>`;
  $app.innerHTML = html;
  if (live){
    const el = $app.querySelector(`[data-live="${live}"]`);
    if (el){ el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch (_) {} }
  }
  hydrateThumbs();
}

/* ---------- repo files (private repos need the token to download) ---------- */
async function blobUrl(path){
  if (!S.blobs[path]) S.blobs[path] = GH.getBlob(path).then(b => URL.createObjectURL(b));
  return S.blobs[path];
}
function hydrateThumbs(){
  $app.querySelectorAll('img[data-path]').forEach(img => {
    if (img.src) return;
    blobUrl(img.dataset.path).then(u => { img.src = u; }).catch(() => { img.replaceWith(document.createTextNode('IMG')); });
  });
}
async function downloadRepoFile(path, name){
  try {
    const url = await blobUrl(path);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e){ toast('Couldn’t download the file (' + errText(e) + ').'); }
}

/* ---------- modals ---------- */
function closeModal(){
  if (S.viewer){ try { S.viewer.destroy(); } catch (_) {} S.viewer = null; }
  modal.innerHTML = '';
}
function openModal(inner, cls){
  modal.innerHTML = `<div class="ov-bg" data-act="closebg"><div class="dlg ${cls || ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
  const f = modal.querySelector('input,textarea,select'); if (f) f.focus();
}
function openNew(){
  openModal(`<h2>New layout</h2>
    <label>Name<input class="txt" id="nl-name" placeholder="e.g. Ring resonator test, run 3"></label>
    <label>Type<select id="nl-type"><option value="passive">Passive</option><option value="active">Active</option></select></label>
    <label>Tags (separate with commas)<input class="txt" id="nl-tags" list="tag-list-new" placeholder="e.g. Full laser, Deep trench"><datalist id="tag-list-new">${allTags().map(t => `<option value="${esc(t.name)}">`).join('')}</datalist></label>
    <label>Status<select id="nl-status">${STATUS.slice(0, 2).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></label>
    <label>What is it for?<textarea class="txt" id="nl-purpose" rows="3"></textarea></label>
    <label class="check"><input type="checkbox" id="nl-example"> Start with the example flow (${BASE_STEPS.length} steps)</label>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="createlayout">Create layout</button></div>`);
}
async function createLayout(){
  const name = $('#nl-name').value.trim();
  if (!name){ toast('Give the layout a name.'); return; }
  const id = rid(), t = Date.now();
  const btn = modal.querySelector('[data-act="createlayout"]'); btn.disabled = true;
  const known = allTags(), tags = [];
  $('#nl-tags').value.split(',').map(normTag).filter(Boolean).forEach(x => {
    if (tags.some(y => y.toLowerCase() === x.toLowerCase())) return;
    const e = known.find(k => k.name.toLowerCase() === x.toLowerCase()); tags.push(e ? e.name : x);
  });
  const data = {id, name, type:$('#nl-type').value, status:$('#nl-status').value, purpose:$('#nl-purpose').value.trim(),
    tags, workers:[me()], createdBy:me(), createdAt:t, updatedAt:t,
    steps:$('#nl-example').checked ? BASE_STEPS.map(n => newStep(n)) : [], files:[], results:[]};
  try {
    const r = await GH.putJson(layoutPath(id), data, null, `Create layout ${name} [${me()}]`);
    S.srv[id] = {data, sha:r.sha}; rebuild();
    closeModal(); S.tab = 'fab'; location.hash = 'l-' + id; sched();
  } catch (e){ btn.disabled = false; toast('Couldn’t create the layout (' + errText(e) + ').'); }
}
function openAttach(lid, stepId, kind, scope){
  const l = S.byId[lid]; scope = scope || 'fab';
  const kinds = kindsFor(scope);
  openModal(`<h2>${scope === 'design' ? 'Add a design file' : 'Add an image or file'}</h2>
    <label>What is it<select id="at-kind">${kinds.map(([k, t]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    ${scope === 'fab' ? `<label>Belongs to<select id="at-step"><option value="">Whole layout</option>${l.steps.map((s, i) => `<option value="${s.id}" ${s.id === stepId ? 'selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join('')}</select></label>` : ''}
    <label>Source<select id="at-src"><option value="upload">Upload from this computer</option><option value="link">Link from Box or Google Drive</option></select></label>
    <div id="at-up">
      <label>Files<input type="file" id="at-file" multiple></label>
      <p class="note-s">Uploads are saved in the data repository, up to 25 MB each. Large GDS files: compress them to <b>.zip</b> or <b>.gds.gz</b> first (they usually shrink a lot). Set the type to <b>GDS layout</b>; the viewer unpacks them automatically.</p>
    </div>
    <div id="at-ln" hidden>
      <label>Link<input class="txt" id="at-url" placeholder="https://…" inputmode="url"></label>
      <label style="margin-top:10px">Name<input class="txt" id="at-name" placeholder="e.g. run3_ring_v2.gds"></label>
    </div>
    <label>Note (optional)<input class="txt" id="at-note" placeholder="e.g. after 60 s etch, 20 kV"></label>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="doattach" data-id="${lid}">Attach</button></div>`);
  $('#at-src').addEventListener('change', e => { $('#at-up').hidden = e.target.value !== 'upload'; $('#at-ln').hidden = e.target.value !== 'link'; });
}
function fileB64(f){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.slice(r.result.indexOf(',') + 1));
    r.onerror = () => rej(r.error); r.readAsDataURL(f);
  });
}
/* ---------- built-in GDS viewer (kwasm, KLayout compiled to WebAssembly) ---------- */
const isGds = f => f.source === 'repo' && (/\.(gds|gdsii)(\.gz)?$/i.test(f.name) || (/\.zip$/i.test(f.name) && f.kind === 'gds'));
function loadKwasm(){
  if (window.Kwasm) return Promise.resolve();
  if (!S.kw) S.kw = new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = CFG.kwasmUrl || 'js/vendor/kwasm.js';
    el.onload = res;
    el.onerror = () => { S.kw = null; rej(new Error('viewer-missing')); };
    document.head.appendChild(el);
  });
  return S.kw;
}
function driveId(url){
  const m = String(url || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
const isDriveGds = f => f.source === 'link' && driveId(f.url) && (f.kind === 'gds' || /\.(gds|gdsii)(\.gz)?$/i.test(f.name));
async function fetchDriveBlob(id){
  const key = CFG.googleApiKey;
  if (!key) throw new Error('no-key');
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&key=${encodeURIComponent(key)}`);
  if (!r.ok){ const e = new Error('drive'); e.status = r.status; throw e; }
  return r.blob();
}
async function unzipGds(blob){
  const buf = new Uint8Array(await blob.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--){ if (dv.getUint32(i, true) === 0x06054b50){ e = i; break; } }
  if (e < 0) throw new Error('bad-zip');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  for (let n = 0; n < count; n++){
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (!/\.(gds|gdsii)$/i.test(name) || name.startsWith('__MACOSX')) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = new Blob([buf.subarray(start, start + csize)]);
    if (method === 0) return data;
    if (method === 8) return new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
    throw new Error('bad-zip');
  }
  throw new Error('zip-nogds');
}
async function gunzipIfNeeded(blob){
  const h = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  const isZip = h[0] === 0x50 && h[1] === 0x4b, isGz = h[0] === 0x1f && h[1] === 0x8b;
  if (!isZip && !isGz) return blob;
  if (typeof DecompressionStream === 'undefined') throw new Error('no-gunzip');
  return isZip ? unzipGds(blob) : new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
}
async function openViewer(name, source){
  const isPath = typeof source === 'string';
  openModal(`<h2>${esc(name)}</h2><div id="gds-view" class="gdsview">Loading the layout…</div>
    <div class="acts">${isPath ? `<button class="btn" data-act="download" data-path="${esc(source)}" data-name="${esc(name)}">${ico('download')} Download</button>` : ''}<button class="btn primary" data-act="closemodal">Close</button></div>`, 'vw');
  try {
    await loadKwasm();
    const blob = isPath ? await GH.getBlob(source) : (source.drive ? await fetchDriveBlob(source.drive) : source);
    const b64 = await fileB64(await gunzipIfNeeded(blob));
    const host = $('#gds-view'); if (!host) return;
    host.textContent = '';
    S.viewer = window.Kwasm.mount(host, {viewerId:'layout', gds:b64});
  } catch (e){
    const host = $('#gds-view'); if (!host) return;
    host.textContent =
      e.message === 'viewer-missing' ? 'The viewer file is missing. Add kwasm.js to js/vendor/ (see js/vendor/README.txt).' :
      e.message === 'zip-nogds' ? 'No .gds file was found inside this zip.' :
      e.message === 'bad-zip' ? 'Couldn’t read this zip. Try compressing the GDS again as a normal .zip or .gds.gz.' :
      e.message === 'no-gunzip' ? 'This browser can’t unpack .gz files. Use a recent Chrome, Edge, Firefox or Safari.' :
      e.message === 'no-key' ? 'Google Drive viewing needs a Google API key. Add it as googleApiKey in js/config.js (see the README).' :
      e.message === 'drive' && (e.status === 403 || e.status === 404) ? 'Google refused the file (' + e.status + '). Check that it is shared as “Anyone with the link”, and that the Drive API is enabled for your key.' :
      e.message === 'drive' ? 'Google Drive returned an error (' + e.status + ').' :
      e instanceof TypeError ? 'The browser couldn’t reach the file. Check your connection and that the key allows this website.' :
      'Couldn’t open this layout (' + errText(e) + ').';
  }
}
function openDriveLink(){
  openModal(`<h2>Open from Google Drive</h2>
    <label>Drive link<input class="txt" id="dr-url" placeholder="https://drive.google.com/file/d/…" inputmode="url"></label>
    <p class="note-s">The file must be shared as “Anyone with the link”. The link is only used to view it, nothing is saved.</p>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="drivego">View layout</button></div>`);
}
function pickLocalGds(){
  const i = document.createElement('input');
  i.type = 'file'; i.accept = '.gds,.gdsii,.gz,.zip';
  i.onchange = () => { if (i.files[0]) openViewer(i.files[0].name, i.files[0]); };
  i.click();
}
async function doAttach(lid){
  const kind = $('#at-kind').value, stepSel = $('#at-step'), stepId = stepSel ? stepSel.value : '';
  const src = $('#at-src').value, note = $('#at-note').value.trim();
  const btn = modal.querySelector('[data-act="doattach"]'); btn.disabled = true;
  const l = S.byId[lid];
  try {
    if (src === 'link'){
      const url = $('#at-url').value.trim();
      if (!/^https:\/\//i.test(url)){ toast('Paste a full https:// link.'); btn.disabled = false; return; }
      const name = $('#at-name').value.trim() || url.replace(/^https:\/\//i, '').slice(0, 60);
      const entry = {id:rid(), name, kind, stepId, source:'link', url, note, by:me(), at:Date.now()};
      await mutate(lid, d => { d.files.push(entry); }, `Link ${name} (${l.name})`);
    } else {
      const list = [...$('#at-file').files];
      if (!list.length){ toast('Choose a file first.'); btn.disabled = false; return; }
      const big = list.find(f => f.size > MAX_UPLOAD);
      if (big){ toast(big.name + ' is over 25 MB. For a GDS, compress it to .zip or .gds.gz first, or use Open GDS file.'); btn.disabled = false; return; }
      for (let i = 0; i < list.length; i++){
        btn.textContent = `Uploading ${i + 1} of ${list.length}…`;
        const f = list[i], fid = rid();
        const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, '_');
        const path = `${dataDir()}/files/${lid}/${kind}/${fid}-${safe}`;
        await GH.putBytes(path, await fileB64(f), `Add file ${f.name} [${me()}]`);
        const entry = {id:fid, name:f.name, kind, stepId, source:'repo', path, size:f.size, note, by:me(), at:Date.now()};
        await mutate(lid, d => { d.files.push(entry); }, `Attach ${f.name} (${l.name})`);
      }
    }
    closeModal(); sched();
  } catch (e){
    btn.disabled = false; btn.textContent = 'Attach';
    toast('Couldn’t attach the file (' + errText(e) + ').');
  }
}
/* ---------- results section: text, images, tables, plots ---------- */
const PALETTE = ['#4C6FD1','#E0604F','#2EA67A','#D49A22','#8B77D9','#1FA3BD','#C2549D','#7A8699'];
const MAX_TABLE_ROWS = 2000;
function splitLine(line, d){
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++){
    const c = line[i];
    if (q){ if (c === '"'){ if (line[i + 1] === '"'){ cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === d){ out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out.map(s => s.trim());
}
function parseTable(text){
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return {columns:[], rows:[]};
  const first = lines[0];
  const d = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const rows = lines.map(l => splitLine(l, d));
  const w = Math.max(...rows.map(r => r.length));
  const pad = r => { const x = r.slice(); while (x.length < w) x.push(''); return x; };
  return {columns:pad(rows[0]).map((c, i) => c || 'Column ' + (i + 1)), rows:rows.slice(1).map(pad)};
}
const tableToTsv = t => t ? [t.columns, ...t.rows].map(r => r.join('\t')).join('\n') : '';
function tableHtml(t, limit){
  const max = limit || 200, rows = t.rows.slice(0, max);
  return `<div class="tbl"><table><thead><tr>${t.columns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>${t.rows.length > max ? `<p class="hint">Showing the first ${max} of ${t.rows.length} rows.</p>` : ''}</div>`;
}
function niceDomain(min, max){
  if (min === max){ const p = Math.abs(min) || 1; min -= p * 0.5; max += p * 0.5; }
  const raw = (max - min) / 5, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
  const ticks = []; for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(+v.toPrecision(12));
  return {lo, hi, ticks};
}
const fmtTick = v => { if (v === 0) return '0'; const a = Math.abs(v); return (a >= 1e5 || a < 1e-3) ? v.toExponential(1).replace('e+', 'e') : String(+v.toPrecision(6)); };
function plotSvg(t, cfg){
  const ysIdx = (cfg.ys || []).filter(i => i >= 0 && i < t.columns.length);
  if (!t.rows.length || !ysIdx.length) return '<p class="hint">Choose at least one column to plot.</p>';
  const xcol = cfg.x >= 0 && cfg.x < t.columns.length ? cfg.x : 0;
  const xsRaw = t.rows.map(r => r[xcol]);
  const numX = xsRaw.every(v => v !== '' && isFinite(parseFloat(v)));
  const bar = cfg.kind === 'bar', cat = bar || !numX;
  const xv = cat ? xsRaw.map((_, i) => i) : xsRaw.map(parseFloat);
  const series = ysIdx.map((ci, si) => ({name:t.columns[ci], color:PALETTE[si % PALETTE.length], v:t.rows.map(r => { const n = parseFloat(r[ci]); return isFinite(n) ? n : NaN; })}));
  let ymin = Infinity, ymax = -Infinity;
  series.forEach(s => s.v.forEach(n => { if (!isNaN(n)){ ymin = Math.min(ymin, n); ymax = Math.max(ymax, n); } }));
  if (!isFinite(ymin)) return '<p class="hint">The chosen columns contain no numbers.</p>';
  if (bar){ ymin = Math.min(0, ymin); ymax = Math.max(0, ymax); }
  const Y = niceDomain(ymin, ymax);
  const X = cat ? {lo:-0.5, hi:xv.length - 0.5, ticks:[]} : niceDomain(Math.min(...xv), Math.max(...xv));
  const W = 680, H = 380, legend = series.length > 1;
  const m = {l:68, r:20, t:legend ? 44 : 22, b:cfg.xlabel ? 62 : 46};
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const sx = v => m.l + (v - X.lo) / (X.hi - X.lo) * pw, sy = v => m.t + ph - (v - Y.lo) / (Y.hi - Y.lo) * ph;
  const TXT = 'fill:var(--muted,#566274);font:12px system-ui,sans-serif';
  let g = '';
  Y.ticks.forEach(v => { g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v).toFixed(1)}" y2="${sy(v).toFixed(1)}" style="stroke:var(--line,#D2D8E1)"/><text x="${m.l - 8}" y="${(sy(v) + 4).toFixed(1)}" text-anchor="end" style="${TXT}">${fmtTick(v)}</text>`; });
  if (cat){
    const step = Math.ceil(xv.length / 12);
    xsRaw.forEach((lab, i) => { if (i % step) return; g += `<text x="${sx(i).toFixed(1)}" y="${H - m.b + 18}" text-anchor="middle" style="${TXT}">${esc(String(lab).slice(0, 14))}</text>`; });
  } else X.ticks.forEach(v => { g += `<line x1="${sx(v).toFixed(1)}" x2="${sx(v).toFixed(1)}" y1="${m.t}" y2="${m.t + ph}" style="stroke:var(--line,#D2D8E1)" opacity=".5"/><text x="${sx(v).toFixed(1)}" y="${H - m.b + 18}" text-anchor="middle" style="${TXT}">${fmtTick(v)}</text>`; });
  g += `<line x1="${m.l}" x2="${m.l}" y1="${m.t}" y2="${m.t + ph}" style="stroke:var(--line-strong,#B4BECC)"/><line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ph}" y2="${m.t + ph}" style="stroke:var(--line-strong,#B4BECC)"/>`;
  const base = sy(Math.max(Y.lo, Math.min(0, Y.hi)));
  series.forEach((s, si) => {
    if (bar){
      const gw = pw / xv.length * 0.78, bw = gw / series.length;
      s.v.forEach((n, i) => { if (isNaN(n)) return; const top = sy(n); g += `<rect x="${(sx(i) - gw / 2 + si * bw).toFixed(1)}" y="${Math.min(base, top).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${Math.abs(base - top).toFixed(1)}" fill="${s.color}"/>`; });
    } else {
      if (cfg.kind !== 'scatter'){
        let d = '', pen = false;
        s.v.forEach((n, i) => { if (isNaN(n)){ pen = false; return; } d += (pen ? 'L' : 'M') + sx(xv[i]).toFixed(1) + ' ' + sy(n).toFixed(1); pen = true; });
        g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
      }
      if (cfg.kind === 'scatter' || xv.length <= 60) s.v.forEach((n, i) => { if (!isNaN(n)) g += `<circle cx="${sx(xv[i]).toFixed(1)}" cy="${sy(n).toFixed(1)}" r="${cfg.kind === 'scatter' ? 4 : 3}" fill="${s.color}"/>`; });
    }
  });
  if (legend){ let lx = m.l; series.forEach(s => { g += `<rect x="${lx}" y="14" width="12" height="12" rx="2" fill="${s.color}"/><text x="${lx + 17}" y="25" style="${TXT}">${esc(s.name)}</text>`; lx += 30 + Math.min(String(s.name).length, 24) * 7; }); }
  if (cfg.xlabel) g += `<text x="${m.l + pw / 2}" y="${H - 12}" text-anchor="middle" style="${TXT};font-size:13px">${esc(cfg.xlabel)}</text>`;
  if (cfg.ylabel) g += `<text transform="rotate(-90)" x="${-(m.t + ph / 2)}" y="16" text-anchor="middle" style="${TXT};font-size:13px">${esc(cfg.ylabel)}</text>`;
  return `<svg class="plot-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(cfg.title || 'Plot')}"><rect width="${W}" height="${H}" style="fill:var(--raised,#fff)"/>${g}</svg>`;
}
const inlineMd = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');
function mdLite(text){
  let html = '', inList = false;
  for (const ln of esc(text).split('\n')){
    if (/^\s*[-*] /.test(ln)){ if (!inList){ html += '<ul>'; inList = true; } html += '<li>' + inlineMd(ln.replace(/^\s*[-*] /, '')) + '</li>'; continue; }
    if (inList){ html += '</ul>'; inList = false; }
    if (/^#{1,3} /.test(ln)) html += '<h4>' + inlineMd(ln.replace(/^#{1,3} /, '')) + '</h4>';
    else if (ln.trim() === '') html += '<br>';
    else html += '<p>' + inlineMd(ln) + '</p>';
  }
  return html + (inList ? '</ul>' : '');
}
function blockCard(l, b, i, n){
  const rw = S.canWrite, editing = S.editBlock === b.id;
  const label = {text:'Text', image:'Image', table:'Table', plot:'Plot'}[b.type] || b.type;
  let body = '';
  if (b.type === 'text'){
    body = editing
      ? `<textarea class="txt" rows="9" data-btext="${b.id}" placeholder="Write the results here. You can use - bullets, # headings and **bold**.">${esc(b.text || '')}</textarea><div class="tools"><button class="btn primary" data-act="savetext" data-id="${b.id}">Save</button><button class="btn" data-act="canceltext">Cancel</button></div>`
      : `<div class="prose">${mdLite(b.text || '') || '<p class="hint">Empty. Click Edit to write.</p>'}</div>`;
  } else if (b.type === 'image'){
    body = `<button class="rimg" data-act="lightbox" data-path="${esc(b.path)}" data-name="${esc(b.name || '')}" aria-label="Enlarge image"><img data-path="${esc(b.path)}" alt="${esc(b.caption || b.name || '')}"></button><input class="txt cap" data-bcaption="${b.id}" value="${esc(b.caption || '')}" placeholder="Caption" aria-label="Caption" ${rw ? '' : 'disabled'}>`;
  } else if (b.type === 'table'){
    body = tableHtml(b) + (rw ? `<div class="tools"><button class="btn" data-act="plottable" data-id="${b.id}">${ico('plus')} Plot this table</button></div>` : '');
  } else if (b.type === 'plot'){
    const t = l.results.find(x => x.id === b.tableId && x.type === 'table');
    body = t ? `<div class="plotwrap" data-plot="${b.id}">${plotSvg(t, b)}</div><div class="tools"><button class="btn sm" data-act="plotdl" data-id="${b.id}">${ico('download')} Download SVG</button></div>` : '<p class="hint">The table behind this plot was deleted.</p>';
  }
  const edit = b.type === 'text' ? 'edittext' : b.type === 'table' ? 'edittable' : b.type === 'plot' ? 'editplot' : '';
  return `<article class="rblock">
    <div class="rhead"><span class="rtype">${label}</span><input class="txt btitle" data-btitle="${b.id}" value="${esc(b.title || '')}" placeholder="Untitled" aria-label="Title" ${rw ? '' : 'disabled'}>
      ${rw ? `<span class="ract">${edit ? `<button class="btn sm" data-act="${edit}" data-id="${b.id}">Edit</button>` : ''}<button class="btn sm" data-act="moveblock" data-dir="-1" data-id="${b.id}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${ico('up')}</button><button class="btn sm" data-act="moveblock" data-dir="1" data-id="${b.id}" aria-label="Move down" ${i === n - 1 ? 'disabled' : ''}>${ico('down')}</button><button class="btn ghost sm danger ${S.armed === 'b' + b.id ? 'armed' : ''}" data-act="delblock" data-id="${b.id}">${S.armed === 'b' + b.id ? 'Click again' : 'Delete'}</button></span>` : ''}</div>
    <div class="rbody">${body}</div>
    <div class="rfoot">${who(b.by)} · ${fmt(b.at)}</div>
  </article>`;
}
function tabResults(l){
  const bar = `<div class="rbar">${S.canWrite ? `<button class="btn" data-act="addtext">${ico('plus')} Text</button><button class="btn" data-act="addimage">${ico('plus')} Image</button><button class="btn" data-act="addtable">${ico('plus')} Table</button><button class="btn" data-act="addplot">${ico('plus')} Plot</button>` : ''}<button class="btn ghost" data-act="printreport">Print report</button></div>`;
  return bar + (l.results.length ? l.results.map((b, i) => blockCard(l, b, i, l.results.length)).join('')
    : '<div class="empty"><strong>No results yet</strong>Once the devices are measured, add notes, SEM or measurement images, data tables and plots here.</div>');
}
function openTableEditor(lid, bid){
  const l = S.byId[lid], b = bid && l.results.find(x => x.id === bid);
  openModal(`<h2>${b ? 'Edit table' : 'New table'}</h2>
    <label>Title<input class="txt" id="tb-title"></label>
    <label>Data (first row = column names; paste from Excel or CSV)<textarea class="txt" id="tb-text" rows="9" spellcheck="false" wrap="off" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px"></textarea></label>
    <div><button class="btn" data-act="tbfile">Import CSV file</button></div>
    <div id="tb-prev"></div>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="savetable" data-id="${bid || ''}">Save table</button></div>`, 'wide');
  $('#tb-title').value = b ? (b.title || '') : '';
  $('#tb-text').value = b ? tableToTsv(b) : '';
  const prev = () => { const t = parseTable($('#tb-text').value); $('#tb-prev').innerHTML = t.columns.length ? tableHtml(t, 8) + `<p class="hint">${t.rows.length} row${t.rows.length === 1 ? '' : 's'}, ${t.columns.length} column${t.columns.length === 1 ? '' : 's'}</p>` : '<p class="hint">Paste your data above to see a preview.</p>'; };
  $('#tb-text').addEventListener('input', prev); prev();
}
function saveTable(lid, bid){
  const t = parseTable($('#tb-text').value), title = $('#tb-title').value.trim();
  if (!t.columns.length){ toast('Paste some data first.'); return; }
  if (t.rows.length > MAX_TABLE_ROWS){ toast('Tables are limited to ' + MAX_TABLE_ROWS + ' rows. Plot the full data elsewhere and add it as an image.'); return; }
  if (bid) updateBlock(lid, bid, {title, columns:t.columns, rows:t.rows});
  else addBlock(lid, {type:'table', title, columns:t.columns, rows:t.rows});
  closeModal();
}
function openPlotEditor(lid, bid, tableId){
  const l = S.byId[lid], tables = l.results.filter(x => x.type === 'table');
  if (!tables.length){ toast('Add a table first, then plot it.'); return; }
  const b = bid && l.results.find(x => x.id === bid);
  const cfg = b ? {...b} : {kind:'line', tableId:tableId || tables[0].id, x:0, ys:[1], xlabel:'', ylabel:'', title:''};
  openModal(`<h2>${b ? 'Edit plot' : 'New plot'}</h2>
    <label>Title<input class="txt" id="pl-title"></label>
    <div class="two"><label>Table<select id="pl-table">${tables.map(t => `<option value="${t.id}">${esc(t.title || 'Untitled table')}</option>`).join('')}</select></label>
      <label>Type<select id="pl-kind"><option value="line">Line</option><option value="scatter">Scatter</option><option value="bar">Bar</option></select></label></div>
    <div class="two"><label>X column<select id="pl-x"></select></label><label>Y columns<div id="pl-ys" class="checks"></div></label></div>
    <div class="two"><label>X axis label<input class="txt" id="pl-xl"></label><label>Y axis label<input class="txt" id="pl-yl"></label></div>
    <div id="pl-prev" class="plotwrap"></div>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="savepl" data-id="${bid || ''}">Save plot</button></div>`, 'wide');
  const tbl = () => tables.find(t => t.id === $('#pl-table').value) || tables[0];
  const read = () => ({title:$('#pl-title').value.trim(), tableId:$('#pl-table').value, kind:$('#pl-kind').value, x:+$('#pl-x').value,
    ys:[...document.querySelectorAll('#pl-ys input:checked')].map(i => +i.value), xlabel:$('#pl-xl').value.trim(), ylabel:$('#pl-yl').value.trim()});
  const draw = () => { $('#pl-prev').innerHTML = plotSvg(tbl(), read()); };
  const fill = (x, ys) => {
    const t = tbl();
    $('#pl-x').innerHTML = t.columns.map((c, i) => `<option value="${i}" ${i === x ? 'selected' : ''}>${esc(c)}</option>`).join('');
    $('#pl-ys').innerHTML = t.columns.map((c, i) => `<label class="check"><input type="checkbox" value="${i}" ${ys.includes(i) ? 'checked' : ''}> ${esc(c)}</label>`).join('');
  };
  $('#pl-title').value = cfg.title || ''; $('#pl-xl').value = cfg.xlabel || ''; $('#pl-yl').value = cfg.ylabel || '';
  $('#pl-table').value = cfg.tableId; $('#pl-kind').value = cfg.kind || 'line';
  fill(cfg.x || 0, cfg.ys || [1]); draw();
  $('#pl-table').addEventListener('change', () => { const t = tbl(); fill(0, t.columns.length > 1 ? [1] : [0]); draw(); });
  const dlg = modal.querySelector('.dlg'); dlg.addEventListener('change', draw); dlg.addEventListener('input', draw);
  S.plotRead = read;
}
function savePlot(lid, bid){
  const c = S.plotRead();
  if (!c.ys.length){ toast('Tick at least one Y column.'); return; }
  if (bid) updateBlock(lid, bid, c); else addBlock(lid, Object.assign({type:'plot'}, c));
  closeModal();
}
function downloadPlot(bid){
  const el = document.querySelector(`[data-plot="${bid}"] svg`); if (!el) return;
  const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + el.outerHTML], {type:'image/svg+xml'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'plot.svg';
  document.body.appendChild(a); a.click(); a.remove();
}
function openResultImage(lid){
  openModal(`<h2>Add images to results</h2>
    <label>Images<input type="file" id="ri-file" multiple accept="image/*"></label>
    <label>Caption (optional)<input class="txt" id="ri-cap" placeholder="e.g. Ring resonator, 1550 nm sweep"></label>
    <p class="note-s">PNG, JPEG, WebP, GIF or SVG, up to 25 MB each. Saved in the data repository under <b>${esc(dataDir())}/files/&lt;layout&gt;/results/</b>.</p>
    <div class="acts"><button class="btn" data-act="closemodal">Cancel</button><button class="btn primary" data-act="doresultimg" data-id="${lid}">Add</button></div>`);
}
async function doResultImages(lid){
  const list = [...$('#ri-file').files], cap = $('#ri-cap').value.trim();
  const btn = modal.querySelector('[data-act="doresultimg"]');
  if (!list.length){ toast('Choose an image first.'); return; }
  const bad = list.find(f => !/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(f.name) || f.size > MAX_UPLOAD);
  if (bad){ toast(bad.name + ' isn’t an image under 25 MB.'); return; }
  btn.disabled = true;
  try {
    for (let i = 0; i < list.length; i++){
      btn.textContent = `Uploading ${i + 1} of ${list.length}…`;
      const f = list[i], bid = rid();
      const path = `${dataDir()}/files/${lid}/results/${bid}-${f.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`;
      await GH.putBytes(path, await fileB64(f), `Add result image ${f.name} [${me()}]`);
      addBlock(lid, {id:bid, type:'image', title:'', caption:cap, name:f.name, path, size:f.size});
    }
    closeModal();
  } catch (e){ btn.disabled = false; btn.textContent = 'Add'; toast('Couldn’t add the image (' + errText(e) + ').'); }
}

/* ---------- export ---------- */
function exportCsv(){
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Layout','Type','Tags','Status','Purpose','Workers','Step #','Step','Started','Recipe','Result','Open issues','Note','Updated by','Updated at']];
  S.L.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(l => {
    const base = [l.name, l.type, l.tags.join('; '), l.status, l.purpose, l.workers.join('; ')];
    if (!l.steps.length) rows.push([...base, '', '', '', '', '', '', '', '', '']);
    l.steps.forEach((s, i) => rows.push([...base, i + 1, s.name, s.started || '', s.recipe || '', stateWord(s.state), s.issues.filter(x => !x.resolved).map(x => x.text).join(' | '), s.note, s.at ? s.by : '', s.at ? new Date(s.at).toISOString() : '']));
  });
  const blob = new Blob([rows.map(r => r.map(q).join(',')).join('\n')], {type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'fab-tracker.csv';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ---------- events ---------- */
document.addEventListener('pointerdown', () => { S.down = true; }, true);
const up = () => { if (S.down){ S.down = false; setTimeout(flush, 60); } };
document.addEventListener('pointerup', up, true);
document.addEventListener('pointercancel', up, true);
document.addEventListener('focusout', () => setTimeout(flush, 80));
window.addEventListener('hashchange', () => { S.fileStep = ''; S.kindFilter = 'all'; S.tab = 'fab'; S.open = {}; S.editBlock = null; sched(); window.scrollTo(0, 0); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
setInterval(() => { if (!document.hidden) sync(); }, SYNC_MS);

document.addEventListener('submit', async e => {
  if (e.target.dataset.form !== 'setup') return;
  e.preventDefault();
  const f = new FormData(e.target), repo = String(f.get('repo')).trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '');
  const [owner, name] = repo.split('/');
  if (!owner || !name){ S.setupErr = 'Enter the repository as owner/name.'; sched(); return; }
  const btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await connect({owner, repo:name, branch:String(f.get('branch')).trim(), token:String(f.get('token')).trim()});
  } catch (err){
    S.setupErr = err.status === 401 ? 'GitHub rejected that token.' : err.status === 404 ? 'Repository not found, or the token has no access to it.' : 'Couldn’t reach GitHub (' + errText(err) + ').';
    S.mode = 'setup'; sched();
  }
});
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function takeAddDate(){ const i = $app.querySelector('[data-addstepdate]'); const v = i ? i.value : ''; if (i) i.value = ''; return v; }
function addWorker(lid, name){
  name = (name || '').trim(); const l = S.byId[lid];
  if (!name || !l || l.workers.includes(name)) return;
  mutate(lid, d => { if (!d.workers.includes(name)) d.workers.push(name); }, `Add ${name} to ${l.name}`);
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.innerHTML){ closeModal(); return; }
  const t = e.target, lid = route();
  if (e.key !== 'Enter' || t.tagName === 'TEXTAREA') return;
  if (t.dataset.addstep){ const v = t.value; t.value = ''; addStep(t.dataset.addstep, v, undefined, takeAddDate()); }
  else if (t.dataset.after){ const v = t.value; t.value = ''; addStep(lid, v, t.dataset.after); }
  else if (t.hasAttribute('data-addworker')) addWorker(lid, t.value);
  else if (t.hasAttribute('data-addtag')){ const v = t.value; t.value = ''; addTags(lid, v); }
  else if (t.dataset.issue){ const v = t.value; t.value = ''; addIssue(lid, t.dataset.issue, v); }
  else if (t.matches('.title,[data-rename],[data-recipe],[data-btitle],[data-bcaption]')) t.blur();
  else if (t.id === 'nl-name') createLayout();
  else if (t.dataset.act === 'open' && t.getAttribute('role') === 'link') location.hash = 'l-' + t.dataset.id;
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.live === 'q'){ S.q = t.value; $('#ovlist').innerHTML = ovList(); }
  else if (t.name === 'repo'){ const l = $('#tokenlink'); if (l) l.href = tokenLink(t.value.split('/')[0].trim()); }
});
document.addEventListener('change', e => {
  const t = e.target, lid = route();
  if (t.dataset.f && lid){
    const v = t.value.trim();
    if (t.dataset.f === 'name' && !v){ t.value = S.byId[lid].name; return; }
    updateLayout(lid, {[t.dataset.f]: v}, t.dataset.f === 'status' ? 'Set status ' + v : 'Edit ' + t.dataset.f);
  } else if (t.dataset.note) saveNote(lid, t.dataset.note, t.value);
  else if (t.dataset.rename) renameStep(lid, t.dataset.rename, t.value);
  else if (t.dataset.sdate) setStepFields(lid, t.dataset.sdate, {started:t.value}, t.value ? 'Started ' + t.value : 'Start date cleared');
  else if (t.dataset.recipe){
    const s = stepOf(S.byId[lid], t.dataset.recipe), v = t.value.trim();
    if (s && (s.recipe || '') !== v) setStepFields(lid, t.dataset.recipe, {recipe:v}, v ? 'Recipe: ' + v : 'Recipe cleared');
  }
  else if (t.dataset.btitle) updateBlock(lid, t.dataset.btitle, {title:t.value.trim()});
  else if (t.dataset.bcaption) updateBlock(lid, t.dataset.bcaption, {caption:t.value.trim()});
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id, lid = route();
  if (a === 'closebg'){ if (e.target === t) closeModal(); return; }
  if (a === 'open'){ location.hash = 'l-' + id; return; }
  if (a === 'download') e.preventDefault();
  switch (a){
    case 'home': location.hash = 'overview'; break;
    case 'signout': signOut(); break;
    case 'refresh': S.syncing = false; sync(); break;
    case 'newlayout': openNew(); break;
    case 'createlayout': createLayout(); break;
    case 'closemodal': closeModal(); break;
    case 'typefilter': S.type = t.dataset.v; sched(); break;
    case 'tagfilter': { const tg = t.dataset.tag, i = S.tagFilter.findIndex(x => x.toLowerCase() === tg.toLowerCase()); if (i >= 0) S.tagFilter.splice(i, 1); else S.tagFilter.push(tg); sched(); break; }
    case 'cleartags': S.tagFilter = []; sched(); break;
    case 'export': exportCsv(); break;
    case 'tab': S.tab = t.dataset.v; S.kindFilter = 'all'; sched(); break;
    case 'toggle': S.open[id] = !S.open[id]; sched(); break;
    case 'mark': if (S.canWrite) setMark(lid, id, t.dataset.state); break;
    case 'move': moveStep(lid, id, +t.dataset.dir); break;
    case 'delstep': arm('s' + id, () => delStep(lid, id)); break;
    case 'addstep': { const i = $app.querySelector('[data-addstep]'); const v = i.value; i.value = ''; addStep(id, v, undefined, takeAddDate()); break; }
    case 'addafter': { const i = $app.querySelector(`[data-after="${id}"]`); const v = i.value; i.value = ''; addStep(lid, v, id); break; }
    case 'preset': addStep(lid, t.dataset.name, undefined, takeAddDate()); break;
    case 'rmpreset': editPresets(list => list.filter(n => n !== t.dataset.name)); break;
    case 'example': loadExample(id); break;
    case 'today': setStepFields(lid, id, {started:todayStr()}, 'Started ' + todayStr()); break;
    case 'addissue': { const i = $app.querySelector(`[data-issue="${id}"]`); const v = i.value; i.value = ''; addIssue(lid, id, v); break; }
    case 'resolveissue': resolveIssue(lid, id, t.dataset.iid); break;
    case 'delissue': arm('i' + t.dataset.iid, () => delIssue(lid, id, t.dataset.iid)); break;
    case 'settype': updateLayout(lid, {type:t.dataset.v}, 'Set type ' + t.dataset.v); break;
    case 'addtagbtn': { const i = $app.querySelector('[data-addtag]'); const v = i.value; i.value = ''; addTags(lid, v); break; }
    case 'rmtag': rmTag(lid, t.dataset.tag); break;
    case 'addworker': { const i = $app.querySelector('[data-addworker]'); const v = i.value; i.value = ''; addWorker(lid, v); break; }
    case 'addme': addWorker(lid, me()); break;
    case 'rmworker': { const l = S.byId[lid], w = l.workers[+t.dataset.i]; mutate(lid, d => { d.workers = d.workers.filter(x => x !== w); }, `Remove ${w} from ${l.name}`); break; }
    case 'attach': openAttach(lid, t.dataset.step || '', t.dataset.kind || '', t.dataset.scope || 'fab'); break;
    case 'doattach': doAttach(id); break;
    case 'stepfiles': e.stopPropagation(); S.fileStep = id; S.tab = 'fab'; sched(); setTimeout(() => { const el = $('#fab-files'); if (el) el.scrollIntoView({behavior:'smooth'}); }, 120); break;
    case 'clearstepfilter': S.fileStep = ''; sched(); break;
    case 'kindfilter': S.kindFilter = t.dataset.v; sched(); break;
    case 'delfile': arm('f' + id, () => removeFile(lid, id)); break;
    case 'dellayout': arm('l' + id, () => deleteLayout(id)); break;
    case 'download': downloadRepoFile(t.dataset.path, t.dataset.name); break;
    case 'viewgds': openViewer(t.dataset.name, t.dataset.path); break;
    case 'openlocal': pickLocalGds(); break;
    case 'viewdrive': openViewer(t.dataset.name, {drive: driveId(t.dataset.url)}); break;
    case 'opendrive': openDriveLink(); break;
    case 'drivego': { const did = driveId($('#dr-url').value); if (!did){ toast('Paste a Google Drive file link (drive.google.com/file/d/…).'); break; } closeModal(); openViewer('Google Drive file', {drive:did}); break; }
    /* results */
    case 'addtext': { const bid = addBlock(lid, {type:'text', title:'', text:''}); S.editBlock = bid; sched(); break; }
    case 'edittext': S.editBlock = id; sched(); break;
    case 'canceltext': S.editBlock = null; sched(); break;
    case 'savetext': { const ta = $app.querySelector(`[data-btext="${id}"]`); updateBlock(lid, id, {text:ta ? ta.value : ''}); S.editBlock = null; sched(); break; }
    case 'addimage': openResultImage(lid); break;
    case 'doresultimg': doResultImages(id); break;
    case 'addtable': openTableEditor(lid, null); break;
    case 'edittable': openTableEditor(lid, id); break;
    case 'tbfile': { const i = document.createElement('input'); i.type = 'file'; i.accept = '.csv,.tsv,.txt'; i.onchange = async () => { if (i.files[0]){ $('#tb-text').value = await i.files[0].text(); $('#tb-text').dispatchEvent(new Event('input')); } }; i.click(); break; }
    case 'savetable': saveTable(lid, id); break;
    case 'addplot': openPlotEditor(lid, null); break;
    case 'plottable': openPlotEditor(lid, null, id); break;
    case 'editplot': openPlotEditor(lid, id); break;
    case 'savepl': savePlot(lid, id); break;
    case 'plotdl': downloadPlot(id); break;
    case 'moveblock': moveBlock(lid, id, +t.dataset.dir); break;
    case 'delblock': arm('b' + id, () => delBlock(lid, id)); break;
    case 'printreport': window.print(); break;
    case 'lightbox':
      openModal(`<img alt="${esc(t.dataset.name)}"><div class="acts"><span class="who" style="margin-right:auto">${esc(t.dataset.name)}</span><button class="btn" data-act="closemodal">Close</button></div>`, 'lb');
      blobUrl(t.dataset.path).then(u => { const im = modal.querySelector('.lb img'); if (im) im.src = u; });
      break;
  }
});

/* ---------- start ---------- */
(async function init(){
  const s = readSaved();
  const repoStr = s.dataRepo || CFG.dataRepo || '';
  if (s.token && repoStr.includes('/')){
    const [owner, repo] = repoStr.split('/');
    try { await connect({owner, repo, branch:s.branch || CFG.branch || '', token:s.token}); return; }
    catch (e){ S.setupErr = e.status === 401 ? 'Your saved token was rejected. Paste a new one.' : 'Couldn’t sign in automatically (' + errText(e) + ').'; }
  }
  S.mode = 'setup'; render();
})();
render();
})();

