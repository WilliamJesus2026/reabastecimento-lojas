(function () {
  'use strict';

  const STORES = [
    { code: 'ACV', name: 'Gaia' }, { code: 'ACR', name: 'Dadi' }, { code: 'MCO', name: 'Eco' },
    { code: 'CSH', name: 'Bada' }, { code: 'REC', name: 'Trip' }, { code: 'ABI', name: 'Papel' },
    { code: 'VIA', name: 'Flip' }, { code: 'ICA', name: 'Noga' }, { code: 'RIO', name: 'Zoon' },
    { code: 'SHT', name: 'Arte' }, { code: 'BSH', name: 'Zeni' }
  ];
  const STORE_NAME = {};
  const STORE_ORDER = {};
  STORES.forEach((s, i) => { STORE_NAME[s.code] = s.name; STORE_ORDER[s.code] = i; });
  const ALL = '*';
  const PAGE = 150;
  const HIST_DAYS = 365;
  const HIST_LIMIT = 2000;

  // [loja, codigo, rotulo, alvo, estLoja, estCd, reposicao, v7, v30, diasSemVenda]
  const SAMPLE = [
    ['Estab ABC ACR DADI abe', '6001102aa', 'Cadeira Sting Dobravel Encosto Madeira Assento Cerejeira', 4, 0, 24, 4, 1, 3, 2],
    ['Estab ABC ACR DADI abe', '1561120aa', 'Cadeira de Escritorio Baixa Lume Cinza NR-17', 4, 0, 33, 4, 0, 1, 12],
    ['Estab ABC CSH BADA abe', '1560006am', 'Cadeira de Escritorio Madrid Alta Cromado/Caramelo', 3, 0, 52, 3, 0, 0, 147],
    ['Estab ABC CSH BADA abe', '1051103bb', 'Cadeira Nord Encosto Madeira Assento Texture Off White', 3, 0, 103, 3, 1, 2, 4],
    ['Estab ABC CSH BADA abe', '1561028pr', 'Cadeira De Escritorio Franca Alta c/ Regulagem Preto', 4, 1, 95, 3, 0, 0, null],
    ['Estab ABR RIO ZOON abe', '1342503aa', 'Prateleira Nala 80cmx20cm Louro Freijo', 3, 0, 86, 3, 0, 0, 84],
    ['Estab ABR RIO ZOON abe', '1342503ba', 'Prateleira Nala 1,20mx20cm Louro Freijo', 3, 0, 125, 3, 0, 1, 20],
    ['Estab ABH REC TRIP abe', '1342503ca', 'Prateleira Nala 1,80mx20cm Louro Freijo', 3, 0, 88, 3, 0, 0, null],
    ['Estab ABC BSH ZENI', '1920000cb', 'Cadeira Ami Encosto Estofado Giratoria Assento PU Caramelado', 4, 0, 2, 2, 2, 5, 1],
    ['Estab ABC ABI PAPEL Abe', '1561210ap', 'Assento Eiffel Em Pp Azul Petroleo', 2, 0, 6, 2, 0, 0, 301],
    ['Estab ABC ABI PAPEL Abe', '9200005ea', 'Capa de Almofada Drapeada Terra 50X50', 6, 1, 40, 5, 1, 4, 3],
    ['Estab ABH MCO ECO abe', '1561044aa', 'Cadeira de Escritorio Oslo Preta Selo NR-17', 2, 0, 38, 2, 0, 0, 65],
    ['Estab ABH MCO ECO abe', '1561231pr', 'Cadeira Eiffel Encosto Estofado Assento Botone Preta', 2, 0, 35, 2, 0, 0, null],
    ['Estab ABR VIA FLIP abe', '6000013ab', 'Mesa Lateral Haste 30cmx30cm Altura 56cm Verde Musgo', 2, 0, 18, 2, 0, 2, 9],
    ['Estab ABR ICA NOGA abe', '1561231br', 'Cadeira Eiffel Encosto Estofado Assento Botone Branca', 2, 0, 22, 2, 0, 0, null]
  ].map(a => ({
    loja: a[0], codigo: a[1], rotulo: a[2], posicao: 'Normal', alvo: a[3], estLoja: a[4], transito: 0, necessidade: a[6],
    estCd: a[5], reposicao: a[6], v1: 0, v7: a[7], v30: a[8], v45: a[8], v60: a[8], dsv: a[9]
  }));

  const S = {
    rows: [], by: {}, units: {}, sorted: [], total: 0, totalUnits: 0, missing: [], unknownLojas: [],
    meta: { sample: true, footer: null, filterLojas: null, totalRead: 0, cycle: null, file: '', hasVendas: true, hasTransito: false, hasPosicao: false, hasDsv: true },
    ritmo: null,
    files: { onebeat: null, ritmo: null },
    busy: { onebeat: null, ritmo: null },
    err: { onebeat: null, ritmo: null },
    enviar: {}, emails: {},
    selected: ALL, query: '', limit: PAGE,
    view: 'reposicao',
    cloud: { mode: 'firebase', ready: false, user: null, error: null },
    hist: [], histLoaded: false, histLoading: false, histError: null, lastSent: {}, sentCycle: {},
    mailOpened: {},
    hFilter: { loja: '', dias: 30, q: '' }, hOpen: {}, hLimit: 50,
    afterLogin: null
  };

  const $ = id => document.getElementById(id);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
  const fmt = n => Number(n || 0).toLocaleString('pt-BR');
  const plural = (n, one, many) => fmt(n) + ' ' + (n === 1 ? one : many);
  const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const fmtMs = ms => ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1).replace('.', ',') + ' s';
  const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = n => (n < 10 ? '0' : '') + n;
  const fmtDate = iso => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—';
  const fmtStamp = ts => { const d = new Date(ts); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const fmtFull = ts => { const d = new Date(ts); return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const todayIso = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const cycleIso = () => S.meta.cycle || todayIso();

  function findStore(loja) {
    if (!loja) return null;
    const toks = String(loja).trim().split(/\s+/);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i].toUpperCase();
      if (STORE_NAME[t]) return t;
    }
    return null;
  }

  /* ---------- cache local (só conveniência; a nuvem é a fonte quando há login) ---------- */
  function loadEmailsCache() {
    try { S.emails = JSON.parse(localStorage.getItem('reab_store_emails') || '{}') || {}; } catch (e) { S.emails = {}; }
  }
  function persistEmailsCache() {
    try { localStorage.setItem('reab_store_emails', JSON.stringify(S.emails)); } catch (e) { /* cota/privado: segue em memória */ }
  }

  /* ---------- dados derivados ---------- */
  function recompute() {
    const rows = S.rows;
    rows.forEach(r => { r.store = findStore(r.loja); });
    const rank = r => (r.store ? STORE_ORDER[r.store] : 999);
    S.sorted = rows.slice().sort((a, b) => rank(a) - rank(b) || b.reposicao - a.reposicao || (a.codigo < b.codigo ? -1 : 1));
    S.by = {}; S.units = {};
    STORES.forEach(s => { S.by[s.code] = []; S.units[s.code] = 0; });
    const unknown = {};
    S.sorted.forEach(r => {
      if (r.store) { S.by[r.store].push(r); S.units[r.store] += r.reposicao; }
      else unknown[r.loja] = (unknown[r.loja] || 0) + 1;
    });
    S.unknownLojas = Object.keys(unknown);
    S.total = rows.length;
    S.totalUnits = rows.reduce((s, r) => s + r.reposicao, 0);
    S.missing = STORES.filter(s => S.by[s.code].length === 0).map(s => s.code);
    if (S.selected !== ALL && !S.by[S.selected]) S.selected = ALL;
    indexHistory();
  }

  function firstStoreWithData() {
    for (let i = 0; i < STORES.length; i++) if (S.by[STORES[i].code].length) return STORES[i].code;
    return ALL;
  }

  const rkey = r => r.loja + '|' + r.codigo;
  const enviarFor = r => { const v = S.enviar[rkey(r)]; return v == null ? r.reposicao : v; };
  const ritmoOf = codigo => (S.ritmo && S.ritmo.map[codigo]) || null;
  const viewBase = () => (S.selected === ALL ? S.sorted : S.by[S.selected] || []);
  const cloudAllowed = () => !!(S.cloud.user && S.cloud.user.allowed);
  const histKnown = () => cloudAllowed() && S.histLoaded;

  // Índices do histórico: último envio de cada loja+código e envio da loja no ciclo atual.
  function indexHistory() {
    S.lastSent = {}; S.sentCycle = {};
    const cyc = cycleIso();
    S.hist.forEach(env => {
      if (env.ciclo === cyc && !S.sentCycle[env.loja]) S.sentCycle[env.loja] = env;
      (env.itens || []).forEach(it => {
        if (!it || !(it.e > 0)) return;
        const k = env.loja + '|' + it.c;
        if (!S.lastSent[k]) S.lastSent[k] = { ts: env.ts, qty: it.e, ciclo: env.ciclo };
      });
    });
  }

  /* ---------- 1. arquivos ---------- */
  const DROP_TEXT = {
    onebeat: { title: 'Arquivo de reposição', badge: '<span class="badge badge-req">obrigatório</span>', sub: 'O arquivo reposicao-AAAA-MM-DD.xlsx do OneBeat. Arraste ou clique para escolher.' },
    ritmo: { title: 'Relatório Ritmo', badge: '<span class="badge">opcional</span>', sub: 'Traz a classe e a situação de cada produto. Arraste o .csv ou clique para escolher.' }
  };

  function renderDrops() {
    ['onebeat', 'ritmo'].forEach(kind => {
      const box = $(kind === 'onebeat' ? 'dropOnebeat' : 'dropRitmo');
      const t = DROP_TEXT[kind];
      const f = S.files[kind], busy = S.busy[kind], err = S.err[kind];
      box.classList.toggle('is-loaded', !!f && !busy && !err);
      box.classList.toggle('is-error', !!err);
      let body = '<span class="drop-title">' + t.title + t.badge + '</span>';
      let ico = 'upload';
      if (busy) {
        body += '<span class="drop-file">' + esc(busy) + '</span><span class="drop-meta">Lendo arquivo…</span><span class="progress"><i></i></span>';
      } else if (err) {
        body += '<span class="drop-meta" style="color:var(--brand-text);font-weight:600">' + esc(err) + '</span>' +
          (f ? '<span class="drop-meta">O arquivo anterior (' + esc(f.name) + ') continua em uso.</span>' : '') +
          '<span class="drop-act">Escolher outro arquivo</span>';
      } else if (f) {
        ico = 'check';
        body += '<span class="drop-file">' + esc(f.name) + '</span><span class="drop-meta">' + esc(f.meta) + '</span><span class="drop-act">Trocar arquivo</span>';
      } else {
        body += '<span class="drop-sub">' + t.sub + '</span>';
      }
      box.querySelector('.drop-body').innerHTML = body;
      box.querySelector('.drop-ico').innerHTML = icon(ico);
    });
    $('sampleNote').hidden = !S.meta.sample;
  }

  /* ---------- 2. lojas ---------- */
  function renderSummary() {
    const withData = STORES.length - S.missing.length;
    const stat = (label, value, hint, cls) => '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value ' + (cls || '') + '">' + value + '</div>' +
      (hint ? '<div class="stat-hint">' + hint + '</div>' : '') + '</div>';
    let sentValue = '—', sentHint = 'entre para ver o histórico';
    if (histKnown()) {
      const done = STORES.filter(s => S.by[s.code].length && S.sentCycle[s.code]).length;
      sentValue = done + '<small> / ' + withData + '</small>';
      sentHint = 'lojas já registradas neste ciclo';
    }
    $('summary').innerHTML =
      stat('Lojas com dados', withData + '<small> / ' + STORES.length + '</small>', S.missing.length ? plural(S.missing.length, 'loja sem itens', 'lojas sem itens') : 'todas as lojas receberam') +
      stat('Itens para repor', fmt(S.total), S.meta.cycle ? 'ciclo de ' + fmtDate(S.meta.cycle) : '') +
      stat('Unidades sugeridas', fmt(S.totalUnits), plural(S.rows.filter(r => r.estLoja === 0).length, 'item com a loja zerada', 'itens com a loja zerada')) +
      stat('Envios deste ciclo', sentValue, sentHint);
  }

  function listStores(codes) {
    return codes.map(c => '<b>' + c + '</b> (' + STORE_NAME[c] + ')').join(', ');
  }

  function renderAlerts() {
    const out = [];
    const note = (tag, html, amber) => '<div class="note' + (amber ? ' note-amber' : '') + '"><span class="tag">' + tag + '</span><div>' + html + '</div></div>';
    if (S.missing.length) {
      let notInFilter = S.missing, inFilter = [];
      if (S.meta.filterLojas) {
        const fs = {};
        S.meta.filterLojas.forEach(l => { const c = findStore(l); if (c) fs[c] = 1; });
        notInFilter = S.missing.filter(c => !fs[c]);
        inFilter = S.missing.filter(c => fs[c]);
      }
      let html = '';
      if (S.meta.filterLojas) {
        if (notInFilter.length) {
          html += '<b>O arquivo veio sem ' + (notInFilter.length === 1 ? 'a loja ' : 'as lojas ') + notInFilter.join(', ') + '.</b> ' +
            'O filtro "Nome Loja" usado no OneBeat não incluiu ' + listStores(notInFilter) + '. Gere o relatório de novo marcando ' +
            (notInFilter.length === 1 ? 'essa loja' : 'essas lojas') + ' para elas receberem a lista.';
        }
        if (inFilter.length) {
          html += (html ? '<br>' : '') + listStores(inFilter) + (inFilter.length === 1 ? ' está' : ' estão') +
            ' no filtro, mas nenhum item pede reposição agora — nada a enviar.';
        }
      } else {
        html = '<b>' + (S.missing.length === 1 ? 'Uma loja' : S.missing.length + ' lojas') + ' sem nenhum item:</b> ' + listStores(S.missing) +
          '. Confira se estavam marcadas em "Nome Loja" ao gerar o arquivo, ou se realmente não há o que repor.';
      }
      if (S.meta.footer) html += '<details><summary>Ver os filtros usados nesse arquivo</summary><pre>' + esc(S.meta.footer) + '</pre></details>';
      out.push(note('!', html, notInFilter.length > 0 || !S.meta.filterLojas));
    }
    if (S.unknownLojas.length) {
      out.push(note('?', '<b>Há itens de lojas que o painel não conhece:</b> ' + S.unknownLojas.slice(0, 5).map(esc).join('; ') +
        '. Eles aparecem só em "Todas as lojas". Avise o time para cadastrar a loja no painel.', true));
    }
    if (S.ritmo && S.total) {
      let miss = 0;
      S.rows.forEach(r => { if (!S.ritmo.map[r.codigo]) miss++; });
      if (miss) out.push(note('i', '<b>' + plural(miss, 'item não está', 'itens não estão') + ' no Ritmo carregado</b> — ficam sem classe e situação. Pode ser um Ritmo mais antigo que o arquivo.', false));
      if (!S.ritmo.hasClasse) out.push(note('i', 'O arquivo do Ritmo não tem a coluna <b>Classe</b>; a coluna aparece vazia.', false));
    }
    $('alerts').innerHTML = out.join('');
  }

  function renderStores() {
    const max = Math.max(1, ...STORES.map(s => S.by[s.code].length));
    const known = histKnown();
    const card = (code, name, count, units, kind, selected, barPct) => {
      let foot;
      if (kind === 'empty') {
        foot = '<span class="chip chip-warn">' + icon('alert') + 'Sem dados</span><span>nada recebido</span>';
      } else if (kind === 'all') {
        foot = '<span class="chip">' + icon('check') + 'Visão geral</span><span class="num">' + fmt(units) + ' un.</span>';
      } else if (known) {
        const env = S.sentCycle[code];
        foot = env
          ? '<span class="chip chip-sent" title="Registrado por ' + esc(env.por) + '">' + icon('check') + 'Enviado ' + esc(fmtStamp(env.ts).slice(6)) + '</span><span class="num">' + fmt(env.totalUnidades) + ' un.</span>'
          : '<span class="chip chip-pending">Pendente</span><span class="num">' + fmt(units) + ' un.</span>';
      } else {
        foot = '<span class="chip">' + icon('check') + 'Com dados</span><span class="num">' + fmt(units) + ' un.</span>';
      }
      return '<button type="button" class="store-card is-' + kind + (known && kind === 'ok' && S.sentCycle[code] ? ' is-done' : '') + '" data-store="' + code + '" aria-pressed="' + selected + '">' +
        '<span class="sc-sq" aria-hidden="true"></span>' +
        '<span class="sc-top"><span class="sc-code">' + (code === ALL ? 'TODAS' : code) + '</span><span class="sc-name">' + esc(name) + '</span></span>' +
        '<span class="sc-main"><span class="sc-count">' + fmt(count) + '</span><span class="sc-unit">' + (count === 1 ? 'item' : 'itens') + '</span></span>' +
        '<span class="sc-bar"><i style="width:' + barPct + '%"></i></span>' +
        '<span class="sc-foot">' + foot + '</span></button>';
    };
    let html = card(ALL, 'Todas as lojas', S.total, S.totalUnits, 'all', S.selected === ALL, 100);
    STORES.forEach(s => {
      const n = S.by[s.code].length;
      html += card(s.code, s.name, n, S.units[s.code], n ? 'ok' : 'empty', S.selected === s.code, Math.round(100 * n / max));
    });
    $('storeGrid').innerHTML = html;
  }

  /* ---------- 3. envio ---------- */
  function metaLine(r) {
    const parts = [];
    if (S.meta.hasPosicao && r.posicao && r.posicao !== 'Normal') parts.push(esc(r.posicao));
    return parts.join(' · ');
  }

  function tableCols() {
    const hasR = !!S.ritmo;
    const cols = [];
    if (S.selected === ALL) cols.push({ h: 'Loja', cls: 'c-store', cell: r => '<b>' + esc(r.store || '?') + '</b>' });
    cols.push({ h: 'Código', cls: 'c-code', cell: r => esc(r.codigo) });
    cols.push({
      h: 'Produto', cls: 'c-name', cell: r => {
        const m = metaLine(r);
        return '<span class="pname">' + esc(r.rotulo) + '</span>' + (m ? '<span class="pmeta">' + m + '</span>' : '');
      }
    });
    if (hasR) {
      cols.push({ h: 'Classe', cls: 'c-cls', cell: r => { const x = ritmoOf(r.codigo); return esc(x && x[2] ? x[2] : '—'); } });
      cols.push({ h: 'Situação', cls: 'c-sit', cell: r => { const x = ritmoOf(r.codigo); return esc(x && x[1] ? x[1] : '—'); } });
    }
    cols.push({ h: 'Alvo', cls: 'r c-num', cell: r => fmt(r.alvo) });
    cols.push({ h: 'Est. loja', cls: 'r c-num', cell: r => fmt(r.estLoja) });
    if (S.meta.hasTransito) cols.push({ h: 'Trânsito', cls: 'r c-num', cell: r => fmt(r.transito) });
    cols.push({ h: 'Est. CD', cls: 'r c-num', cell: r => fmt(r.estCd) });
    cols.push({ h: 'Sugestão', cls: 'r c-num', cell: r => fmt(r.reposicao) });
    if (histKnown()) {
      cols.push({
        h: 'Último envio', cls: 'c-last', cell: r => {
          const ls = S.lastSent[(r.store || '?') + '|' + r.codigo];
          if (!ls) return '<span class="muted">—</span>';
          const days = Math.floor((Date.now() - ls.ts) / 86400000);
          return '<span class="last' + (days <= 7 ? ' is-recent' : '') + '" title="' + esc(fmtFull(ls.ts)) + '">' + esc(fmtStamp(ls.ts).slice(0, 5)) + ' · ' + fmt(ls.qty) + ' un.</span>';
        }
      });
    }
    cols.push({
      h: 'Enviar', cls: 'r c-send', cell: r => {
        const v = enviarFor(r);
        return '<input class="enviar-input' + (v !== r.reposicao ? ' is-changed' : '') + '" type="number" min="0" step="1" inputmode="numeric" data-k="' + esc(rkey(r)) +
          '" value="' + v + '" aria-label="Quantidade a enviar do código ' + esc(r.codigo) + '">';
      }
    });
    return cols;
  }

  function filteredView() {
    const base = viewBase();
    const q = S.query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(r => r.codigo.toLowerCase().indexOf(q) !== -1 || r.rotulo.toLowerCase().indexOf(q) !== -1);
  }

  function renderTable() {
    const base = viewBase();
    const view = filteredView();
    const empty = $('emptyBox');
    const wrap = document.querySelector('#view-reposicao .table-wrap');
    if (!base.length) {
      wrap.hidden = true; empty.hidden = false;
      const lack = S.selected !== ALL;
      empty.innerHTML = '<b>' + (lack ? 'Nenhum item para esta loja' : 'Nenhum item carregado') + '</b>' +
        (lack ? 'Esta loja não veio com reposição neste arquivo. Veja o aviso no passo 2.' : 'Carregue o arquivo de reposição no passo 1.');
      $('rowCount').textContent = '';
      $('btnMore').hidden = true;
      return;
    }
    wrap.hidden = false; empty.hidden = true;
    const cols = tableCols();
    $('tblHead').innerHTML = '<tr>' + cols.map(c => '<th scope="col"' + (c.cls ? ' class="' + c.cls.replace(/c-num/, '').trim() + '"' : '') + '>' + c.h + '</th>').join('') + '</tr>';
    const shown = view.slice(0, S.limit);
    const html = [];
    for (let i = 0; i < shown.length; i++) {
      const r = shown[i];
      html.push('<tr>' + cols.map(c => '<td' + (c.cls ? ' class="' + c.cls + '"' : '') + '>' + c.cell(r) + '</td>').join('') + '</tr>');
    }
    $('tblBody').innerHTML = html.join('') || '<tr><td colspan="' + cols.length + '" class="empty">Nada encontrado para "' + esc(S.query) + '".</td></tr>';
    $('rowCount').textContent = view.length === base.length
      ? 'Mostrando ' + shown.length + ' de ' + fmt(view.length) + ' itens'
      : 'Mostrando ' + shown.length + ' de ' + fmt(view.length) + ' itens encontrados (' + fmt(base.length) + ' no total)';
    const more = view.length - shown.length;
    $('btnMore').hidden = more <= 0;
    if (more > 0) $('btnMore').textContent = 'Mostrar mais ' + Math.min(PAGE, more);
    updateReset();
  }

  function totalsFor(rows) {
    let units = 0, items = 0;
    rows.forEach(r => { const v = enviarFor(r); if (v > 0) { units += v; items++; } });
    return { units: units, items: items };
  }

  function updateStats() {
    const base = viewBase();
    const t = totalsFor(base);
    $('sendStats').textContent = base.length
      ? plural(t.items, 'item', 'itens') + ' · ' + fmt(t.units) + ' unidades a enviar'
      : 'Nenhum item neste arquivo';
  }

  function updateReset() {
    $('btnReset').hidden = !viewBase().some(r => S.enviar[rkey(r)] != null && S.enviar[rkey(r)] !== r.reposicao);
  }

  function renderSentNote() {
    const code = S.selected;
    const env = code === ALL ? null : S.sentCycle[code];
    const note = $('sentNote');
    note.hidden = !env;
    if (env) {
      note.innerHTML = '<span class="tag">' + icon('check') + '</span><div><b>Envio registrado em ' + esc(fmtFull(env.ts)) + '</b> por ' + esc(env.por) + ' — ' +
        plural(env.totalItens, 'item', 'itens') + ', ' + fmt(env.totalUnidades) + ' unidades. <button type="button" class="link-btn" data-go="historico">Ver no histórico</button></div>';
    }
    const confirmBar = $('mailBar');
    const open = code !== ALL && S.mailOpened[code];
    confirmBar.hidden = !open;
    if (open) {
      confirmBar.innerHTML = '<span class="tag">' + icon('mail') + '</span><div><b>E-mail da ' + code + ' aberto.</b> Depois de enviar, registre no histórico para guardar o que foi mandado.</div>' +
        '<div class="btn-row"><button type="button" class="btn btn-primary" data-act="register">' + icon('check') + 'Registrar envio</button><button type="button" class="btn" data-act="dismiss-mail">Agora não</button></div>';
    }
  }

  function renderSend() {
    const all = S.selected === ALL;
    $('sendCode').textContent = all ? 'TODAS' : S.selected;
    $('sendCode').classList.toggle('is-all', all);
    $('sendName').textContent = all ? 'Todas as lojas' : STORE_NAME[S.selected];
    const base = viewBase();
    updateStats();
    const field = $('emailField'), input = $('storeEmail');
    field.hidden = all;
    input.value = all ? '' : (S.emails[S.selected] || '');
    field.classList.remove('is-invalid');
    updateEmailSaved();
    const sample = S.meta.sample;
    $('btnMail').disabled = all || !base.length || sample;
    $('btnRegister').disabled = all || !base.length || sample;
    $('btnRegister').lastChild.textContent = !all && S.sentCycle[S.selected] ? 'Registrar novo envio' : 'Registrar envio';
    $('btnCopy').disabled = !base.length;
    $('btnCopyAll').disabled = !S.total;
    $('sendHint').textContent = sample
      ? 'Carregue o arquivo de reposição no passo 1 para abrir o e-mail e registrar envios.'
      : all
        ? 'Escolha uma loja no passo 2 para abrir o e-mail dela. "Copiar todas as lojas" monta uma tabela por loja.'
        : 'Itens com Enviar = 0 ficam de fora da lista.';
    $('ritmoHint').textContent = S.ritmo ? 'Ritmo: ' + fmt(S.ritmo.count) + ' produtos' : 'Carregue o Ritmo no passo 1 para ver classe e situação.';
    renderSentNote();
    S.limit = PAGE;
    renderTable();
  }

  function updateEmailSaved() {
    const el = $('emailSaved');
    const v = (S.emails[S.selected] || '').trim();
    const valid = v && parseEmails(v).valid;
    el.hidden = S.selected === ALL || !valid;
    el.textContent = cloudAllowed() && !S.cloud.user.local ? 'salvo na nuvem' : 'só neste navegador';
    el.classList.toggle('is-local', !(cloudAllowed() && !S.cloud.user.local));
  }

  function renderReposicao() { renderDrops(); renderSummary(); renderAlerts(); renderStores(); renderSend(); }

  /* ---------- cópia e e-mail ---------- */
  function exportRows(rows) { return rows.map(r => ({ r: r, v: enviarFor(r) })).filter(x => x.v > 0); }
  const HEAD = ['Código', 'Nome', 'Classe', 'Loja', 'Enviar'];
  function classeTxt(codigo) { const c = ritmoOf(codigo); return c && c[2] ? c[2] : ''; }

  function rowsText(rows) {
    const lines = [HEAD.join('\t')];
    exportRows(rows).forEach(x => lines.push([x.r.codigo, x.r.rotulo, classeTxt(x.r.codigo), x.r.loja, x.v].join('\t')));
    return lines.join('\n');
  }

  // Tabela HTML com grade e faixa nas cores da Abra, para colar em e-mail (Gmail/Outlook) já formatada.
  function rowsHtml(rows, title) {
    const F = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;';
    const th = 'style="border:1px solid #999;background:#f0ead9;padding:6px 10px;text-align:left;' + F + '"';
    const td = 'style="border:1px solid #999;padding:5px 10px;' + F + '"';
    const tdr = 'style="border:1px solid #999;padding:5px 10px;text-align:right;' + F + '"';
    const ex = exportRows(rows);
    let h = '';
    if (title) {
      h += '<table style="border-collapse:collapse;margin:14px 0 6px;"><tr>' +
        '<td style="background:#BC0744;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;padding:8px 14px;">' + esc(title) + '</td>' +
        '<td style="background:#FBB900;width:12px;"></td></tr></table>';
    }
    h += '<table style="border-collapse:collapse;margin-bottom:8px;"><tr>' + HEAD.map(x => '<th ' + th + '>' + x + '</th>').join('') + '</tr>';
    ex.forEach(x => {
      h += '<tr><td ' + td + '>' + esc(x.r.codigo) + '</td><td ' + td + '>' + esc(x.r.rotulo) + '</td><td ' + td + '>' + esc(classeTxt(x.r.codigo)) +
        '</td><td ' + td + '>' + esc(x.r.loja) + '</td><td ' + tdr + '>' + x.v + '</td></tr>';
    });
    const units = ex.reduce((s, x) => s + x.v, 0);
    h += '<tr><td colspan="4" ' + th.replace('text-align:left;', 'text-align:right;') + '>Total (' + plural(ex.length, 'item', 'itens') + ')</td><td ' + th.replace('text-align:left;', 'text-align:right;') + '>' + units + '</td></tr></table>';
    return h;
  }

  function copyRich(html, text) {
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        return navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob(['<div>' + html + '</div>'], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]).then(() => true).catch(() => copyPlain(text));
      }
    } catch (e) { /* cai no texto simples */ }
    return copyPlain(text);
  }
  function copyPlain(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  let toastTimer = 0;
  function toast(msg, ok, action) {
    const t = $('toast');
    t.innerHTML = (ok === false ? '' : '<span class="tag">' + icon('check') + '</span>') + '<span>' + esc(msg) + '</span>' +
      (action ? '<button type="button" class="toast-act">' + esc(action.label) + '</button>' : '');
    t.classList.toggle('has-action', !!action);
    if (action) t.querySelector('.toast-act').onclick = () => { t.classList.remove('is-on'); action.fn(); };
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), action ? 14000 : 3800);
  }

  function askConfirm(title, body, okLabel) {
    return new Promise(resolve => {
      const dlg = $('confirmDlg');
      $('confirmTitle').textContent = title;
      $('confirmBody').textContent = body;
      $('confirmOk').textContent = okLabel || 'Confirmar';
      const done = v => { dlg.close(); resolve(v); };
      $('confirmOk').onclick = () => done(true);
      $('confirmCancel').onclick = () => done(false);
      dlg.oncancel = () => resolve(false);
      dlg.showModal();
    });
  }

  function parseEmails(raw) {
    const list = String(raw || '').split(/[;,\s]+/).filter(Boolean);
    const valid = list.length > 0 && list.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    return { list: list, valid: valid };
  }

  function copyCurrent() {
    const rows = viewBase();
    const n = exportRows(rows).length;
    if (!n) { toast('Nenhum item com Enviar maior que zero para copiar.', false); return; }
    const title = S.selected === ALL ? 'Reabastecimento · todas as lojas' : 'Reabastecimento · ' + S.selected + ' · ' + STORE_NAME[S.selected] + ' · ' + fmtDate(cycleIso());
    copyRich(rowsHtml(rows, title), rowsText(rows)).then(ok => {
      ok ? toast((S.selected === ALL ? 'Lista de todas as lojas' : 'Lista da ' + S.selected) + ' copiada (' + plural(n, 'item', 'itens') + '). Cole com Ctrl+V.')
        : toast('O navegador bloqueou a cópia. Tente de novo ou use outro navegador.', false);
    });
  }

  function copyAllStores() {
    const html = [], text = [];
    STORES.forEach(s => {
      const rows = S.by[s.code];
      if (!rows.length || !exportRows(rows).length) return;
      html.push(rowsHtml(rows, 'Reabastecimento · ' + s.code + ' · ' + s.name + ' · ' + fmtDate(cycleIso())));
      text.push('=== ' + s.code + ' · ' + s.name + ' ===\n' + rowsText(rows));
    });
    if (!html.length) { toast('Nenhuma loja com itens para copiar.', false); return; }
    copyRich(html.join(''), text.join('\n\n')).then(ok => {
      ok ? toast('Todas as lojas copiadas (' + plural(html.length, 'tabela', 'tabelas') + ', uma por loja).') : toast('O navegador bloqueou a cópia.', false);
    });
  }

  function openMail() {
    const code = S.selected;
    if (code === ALL || S.meta.sample) return;
    const rows = S.by[code] || [];
    const sendable = exportRows(rows);
    if (!sendable.length) { toast('Nenhum item com Enviar maior que zero nesta loja.', false); return; }
    const em = parseEmails($('storeEmail').value);
    if (!em.valid) {
      $('emailField').classList.add('is-invalid');
      $('storeEmail').focus();
      toast('Informe o e-mail da loja ' + code + ' (pode ser mais de um, separados por vírgula).', false);
      return;
    }
    $('emailField').classList.remove('is-invalid');
    const hoje = fmtDate(cycleIso());
    const units = sendable.reduce((s, x) => s + x.v, 0);
    const subject = 'Reabastecimento ' + code + ' (' + STORE_NAME[code] + ') - ' + hoje;
    const body = 'Segue o reabastecimento de ' + hoje + ' para a loja ' + code + ' (' + STORE_NAME[code] + ').\n\n' +
      plural(sendable.length, 'item', 'itens') + ', ' + fmt(units) + ' unidades. A lista completa foi copiada: cole aqui (Ctrl+V) antes de enviar.\n';
    const title = 'Reabastecimento · ' + code + ' · ' + STORE_NAME[code] + ' · ' + hoje;
    const copied = copyRich(rowsHtml(rows, title), rowsText(rows));
    const a = document.createElement('a');
    a.href = 'mailto:' + em.list.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    S.mailOpened[code] = true;
    renderSentNote();
    copied.then(ok => {
      ok ? toast('Lista da ' + code + ' copiada. No e-mail que abriu, cole com Ctrl+V.')
        : toast('O e-mail abriu, mas a cópia automática falhou. Use "Copiar lista" e cole.', false);
    });
  }

  /* ---------- histórico de envios ---------- */
  function buildEnvioDoc(code) {
    const rows = S.by[code] || [];
    const itens = rows.map(r => {
      const o = { c: r.codigo, n: r.rotulo, s: r.reposicao, e: enviarFor(r), cd: r.estCd };
      const k = classeTxt(r.codigo); if (k) o.k = k;
      return o;
    });
    const sent = itens.filter(i => i.e > 0);
    return {
      loja: code, lojaNome: STORE_NAME[code], ciclo: cycleIso(), arquivo: S.meta.file || '',
      email: String($('storeEmail').value || '').trim(),
      itens: itens, totalItens: sent.length,
      totalUnidades: sent.reduce((s, i) => s + i.e, 0), totalSugerido: itens.reduce((s, i) => s + i.s, 0),
      ajustados: itens.filter(i => i.e !== i.s).length
    };
  }

  let registering = false;
  function registerEnvio() {
    if (registering) return;
    const code = S.selected;
    if (code === ALL || S.meta.sample) return;
    const rows = S.by[code] || [];
    if (!exportRows(rows).length) { toast('Nenhum item com Enviar maior que zero para registrar.', false); return; }
    if (!cloudAllowed()) { openLogin(registerEnvio); return; }
    registering = true;
    const prev = S.sentCycle[code];
    const go = prev
      ? askConfirm('Já existe um envio da ' + code + ' neste ciclo', 'Registrado em ' + fmtFull(prev.ts) + ' por ' + prev.por + '. Registrar outro mesmo assim?', 'Registrar outro')
      : Promise.resolve(true);
    go.then(yes => {
      if (!yes) return null;
      $('btnRegister').disabled = true;
      return Cloud.addEnvio(buildEnvioDoc(code)).then(rec => {
        S.hist.unshift(rec); indexHistory();
        S.mailOpened[code] = false;
        renderSummary(); renderStores(); renderSend();
        if (S.view === 'historico') renderHistory();
        if (S.view === 'analise') mountAnalysis();
        toast('Envio da ' + code + ' registrado no histórico.', true, {
          label: 'Desfazer', fn: () => undoEnvio(rec)
        });
      });
    }).catch(e => {
      toast(e && e.userFacing ? e.message : 'Não consegui registrar o envio. Tente de novo.', false);
      renderSend();
    }).then(() => { registering = false; });
  }

  function undoEnvio(rec) {
    Cloud.removeEnvio(rec.id).then(() => {
      S.hist = S.hist.filter(h => h.id !== rec.id); indexHistory();
      renderSummary(); renderStores(); renderSend();
      if (S.view === 'historico') renderHistory();
      if (S.view === 'analise') mountAnalysis();
      toast('Registro desfeito.');
    }).catch(e => toast(e && e.userFacing ? e.message : 'Não foi possível desfazer.', false));
  }

  function ensureHistory(force) {
    if (!cloudAllowed() || S.histLoading) return;
    if (S.histLoaded && !force) return;
    S.histLoading = true; S.histError = null;
    Cloud.listEnvios({ sinceDays: HIST_DAYS, limit: HIST_LIMIT }).then(rows => {
      rows.forEach(e => { e.itens = (Array.isArray(e.itens) ? e.itens : []).filter(i => i && typeof i === 'object'); });
      if (!cloudAllowed()) { S.histLoading = false; return; }
      S.hist = rows; S.histLoaded = true; S.histLoading = false; indexHistory();
      if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('enviar-input')) { renderSummary(); renderStores(); }
      else renderReposicao();
      if (S.view === 'historico') renderHistory();
      if (S.view === 'analise') mountAnalysis();
    }).catch(e => {
      S.histLoading = false; S.histError = e && e.userFacing ? e.message : 'Não consegui carregar o histórico.';
      if (S.view === 'historico') renderHistory();
      if (S.view === 'analise') mountAnalysis();
    });
  }

  function renderHistory() {
    const gate = $('hGate'), body = $('hBody');
    const gateHtml = (title, text, btn) => '<div class="empty"><span class="empty-logos"><img src="assets/logo_abracadabra.png" alt="" width="44" height="44"><img src="assets/logo_abracasa.png" alt="" width="44" height="44"></span><b>' + title + '</b>' + text + (btn || '') + '</div>';
    if (!cloudAllowed()) {
      gate.hidden = false; body.hidden = true;
      const blocked = S.cloud.error;
      gate.innerHTML = blocked
        ? gateHtml('Nuvem indisponível', esc(blocked))
        : gateHtml('Entre para ver o histórico', 'O histórico de envios fica guardado na nuvem para todo o time. Entre com seu e-mail corporativo.', '<button type="button" class="btn btn-primary" data-act="login">' + icon('lock') + 'Entrar</button>');
      return;
    }
    if (S.histError) { gate.hidden = false; body.hidden = true; gate.innerHTML = gateHtml('Não consegui carregar', esc(S.histError), '<button type="button" class="btn" data-act="reload-hist">Tentar de novo</button>'); return; }
    if (!S.histLoaded) { gate.hidden = false; body.hidden = true; gate.innerHTML = gateHtml('Carregando histórico…', 'Buscando os envios registrados.'); ensureHistory(); return; }
    gate.hidden = true; body.hidden = false;

    const f = S.hFilter;
    const since = Date.now() - f.dias * 86400000;
    const q = f.q.trim().toLowerCase();
    const list = S.hist.filter(e => e.ts >= since && (!f.loja || e.loja === f.loja) &&
      (!q || (e.itens || []).some(i => String(i.c).toLowerCase().indexOf(q) !== -1 || String(i.n).toLowerCase().indexOf(q) !== -1)));
    const units = list.reduce((s, e) => s + (e.totalUnidades || 0), 0);
    const itemsN = list.reduce((s, e) => s + (e.totalItens || 0), 0);
    $('hSummary').innerHTML =
      '<div class="stat"><div class="stat-label">Envios registrados</div><div class="stat-value">' + fmt(list.length) + '</div></div>' +
      '<div class="stat"><div class="stat-label">Itens enviados</div><div class="stat-value">' + fmt(itemsN) + '</div></div>' +
      '<div class="stat"><div class="stat-label">Unidades enviadas</div><div class="stat-value">' + fmt(units) + '</div></div>' +
      '<div class="stat"><div class="stat-label">Lojas atendidas</div><div class="stat-value">' + new Set(list.map(e => e.loja)).size + '<small> / ' + STORES.length + '</small></div></div>';

    const shown = list.slice(0, S.hLimit);
    const mine = e => S.cloud.user && e.por === S.cloud.user.email && Date.now() - e.ts < 15 * 60 * 1000;
    const rows = [];
    shown.forEach(e => {
      const open = !!S.hOpen[e.id];
      rows.push('<tr class="h-row" data-id="' + esc(e.id) + '"><td class="c-toggle"><button type="button" class="row-toggle" data-act="toggle" data-id="' + esc(e.id) + '" aria-expanded="' + open + '" aria-label="Ver itens do envio">' + (open ? '▾' : '▸') + '</button></td>' +
        '<td>' + esc(fmtFull(e.ts)) + '</td><td class="c-store"><b>' + esc(e.loja) + '</b> <span class="muted">' + esc(e.lojaNome || '') + '</span></td>' +
        '<td>' + esc(fmtDate(e.ciclo)) + '</td><td class="r c-num">' + fmt(e.totalItens) + '</td><td class="r c-num">' + fmt(e.totalUnidades) + '</td>' +
        '<td class="r c-num">' + fmt(e.ajustados) + '</td><td class="muted">' + esc(e.por) + '</td></tr>');
      if (open) {
        const its = (e.itens || []).filter(i => i.e > 0 || i.s > 0);
        rows.push('<tr class="h-detail"><td></td><td colspan="7"><div class="h-detail-in"><div class="btn-row"><button type="button" class="btn" data-act="recopy" data-id="' + esc(e.id) + '">' + icon('copy') + 'Copiar esta lista</button>' +
          (mine(e) ? '<button type="button" class="btn" data-act="undo" data-id="' + esc(e.id) + '">Desfazer registro</button>' : '') +
          '<span class="hint">Arquivo: ' + esc(e.arquivo || '—') + (e.email ? ' · para ' + esc(e.email) : '') + '</span></div>' +
          '<table class="mini"><thead><tr><th>Código</th><th>Produto</th><th>Classe</th><th class="r">Sugerido</th><th class="r">Enviado</th></tr></thead><tbody>' +
          its.map(i => '<tr><td class="c-code">' + esc(i.c) + '</td><td>' + esc(i.n) + '</td><td>' + esc(i.k || '—') + '</td><td class="r c-num">' + fmt(i.s) + '</td><td class="r c-num' + (i.e !== i.s ? ' is-diff' : '') + '">' + fmt(i.e) + '</td></tr>').join('') +
          '</tbody></table></div></td></tr>');
      }
    });
    $('hBodyRows').innerHTML = rows.join('') || '<tr><td colspan="8" class="empty">Nenhum envio registrado nesse período' + (f.loja ? ' para a ' + f.loja : '') + (q ? ' com "' + esc(f.q) + '"' : '') + '.</td></tr>';
    $('hCount').textContent = 'Mostrando ' + shown.length + ' de ' + fmt(list.length) + ' envios';
    $('hMore').hidden = list.length <= shown.length;
  }

  function recopyEnvio(id) {
    const e = S.hist.find(h => h.id === id); if (!e) return;
    const its = (e.itens || []).filter(i => i.e > 0);
    const lines = [HEAD.join('\t')].concat(its.map(i => [i.c, i.n, i.k || '', e.loja, i.e].join('\t')));
    const F = 'font-family:Arial,Helvetica,sans-serif;font-size:13px;';
    const cell = (v, th, r) => '<' + (th ? 'th' : 'td') + ' style="border:1px solid #999;padding:5px 10px;' + F + (th ? 'background:#f0ead9;text-align:left;' : '') + (r ? 'text-align:right;' : '') + '">' + esc(v) + '</' + (th ? 'th' : 'td') + '>';
    const title = 'Reabastecimento · ' + e.loja + ' · ' + (e.lojaNome || '') + ' · ' + fmtDate(e.ciclo);
    const html = '<table style="border-collapse:collapse;margin:14px 0 6px;"><tr><td style="background:#BC0744;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:1px;padding:8px 14px;">' + esc(title) + '</td><td style="background:#FBB900;width:12px;"></td></tr></table>' +
      '<table style="border-collapse:collapse;"><tr>' + HEAD.map(h => cell(h, true)).join('') + '</tr>' +
      its.map(i => '<tr>' + cell(i.c) + cell(i.n) + cell(i.k || '') + cell(e.loja) + cell(i.e, false, true) + '</tr>').join('') + '</table>';
    copyRich(html, lines.join('\n')).then(ok => ok ? toast('Lista do envio de ' + fmtStamp(e.ts) + ' copiada.') : toast('O navegador bloqueou a cópia.', false));
  }

  /* ---------- análise (gráficos carregados sob demanda) ---------- */
  let anaPromise = null;
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Falha ao carregar ' + src)); document.head.appendChild(s); });
  }
  function loadAnalysisLib() {
    if (!anaPromise) anaPromise = loadScript('vendor/echarts.min.js').then(() => loadScript('analysis.js'));
    return anaPromise;
  }
  function analysisCtx() {
    return {
      rows: S.rows, stores: STORES, meta: S.meta, ritmo: S.ritmo, hist: S.hist, histOk: histKnown(), histLoading: S.histLoading || (cloudAllowed() && !S.histLoaded && !S.histError),
      histError: S.histError, cloudBlocked: S.cloud.error, sample: S.meta.sample,
      fmt: fmt, esc: esc, fmtDate: fmtDate, fmtStamp: fmtStamp, icon: icon,
      onLogin: () => openLogin(null)
    };
  }
  function mountAnalysis() {
    if (S.view !== 'analise') return;
    ensureHistory();
    loadAnalysisLib().then(() => { if (S.view === 'analise') window.Analysis.render($('anaBody'), analysisCtx()); })
      .catch(() => { $('anaBody').innerHTML = '<div class="empty"><b>Não consegui carregar os gráficos</b>Confira a conexão e recarregue a página.</div>'; });
  }

  /* ---------- login / conta ---------- */
  function renderUser() {
    const btn = $('btnUser');
    const c = S.cloud;
    if (c.user && c.user.local) {
      btn.className = 'user-btn is-local';
      btn.innerHTML = icon('alert') + '<span>Modo local</span>';
      btn.title = 'Modo de teste: o histórico fica só neste navegador.';
    } else if (c.user && c.user.allowed) {
      const nm = c.user.email.split('@')[0];
      btn.className = 'user-btn is-in';
      btn.innerHTML = '<span class="avatar">' + esc(nm.slice(0, 2).toUpperCase()) + '</span><span class="user-name">' + esc(nm) + '</span>';
      btn.title = c.user.email;
    } else if (c.user) {
      btn.className = 'user-btn is-pending';
      btn.innerHTML = icon('mail') + '<span>Confirmar e-mail</span>';
      btn.title = 'Falta confirmar seu e-mail';
    } else {
      btn.className = 'user-btn';
      btn.innerHTML = icon('lock') + '<span>Entrar</span>';
      btn.title = c.error || 'Entrar com e-mail corporativo';
    }
  }

  let loginMode = 'in';
  function loginPanel(name) {
    ['loginForm', 'loginVerify', 'loginAccount'].forEach(id => { $(id).hidden = id !== name; });
    $('loginTitle').textContent = name === 'loginForm' ? (loginMode === 'up' ? 'Criar conta' : loginMode === 'reset' ? 'Esqueci a senha' : 'Entrar') :
      name === 'loginVerify' ? 'Confirme seu e-mail' : 'Sua conta';
  }
  function setLoginMode(mode) {
    loginMode = mode;
    document.querySelectorAll('#loginSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === (mode === 'reset' ? 'in' : mode))));
    $('lgPassWrap').hidden = mode === 'reset';
    $('lgSubmit').textContent = mode === 'up' ? 'Criar conta' : mode === 'reset' ? 'Enviar link' : 'Entrar';
    $('lgForgot').hidden = mode !== 'in';
    $('lgPass').autocomplete = mode === 'up' ? 'new-password' : 'current-password';
    $('lgHint').textContent = mode === 'up'
      ? 'Use seu e-mail corporativo. Vamos enviar um link para confirmar que o e-mail é seu.'
      : mode === 'reset' ? 'Informe o e-mail da conta; enviaremos um link para criar uma nova senha.' : '';
    showLoginError('');
    loginPanel('loginForm');
  }
  function showLoginError(msg) { const e = $('lgError'); e.hidden = !msg; e.textContent = msg || ''; }

  function openLogin(after) {
    S.afterLogin = after || null;
    const c = S.cloud;
    if (c.user && c.user.local) { toast('Você está no modo local de teste: não precisa entrar.'); if (after) after(); return; }
    if (c.error && !c.user) { toast(c.error, false); return; }
    if (c.user && c.user.allowed) { $('acEmail').textContent = c.user.email; loginPanel('loginAccount'); }
    else if (c.user) { $('vfEmail').textContent = c.user.email; $('vfMsg').textContent = ''; loginPanel('loginVerify'); }
    else setLoginMode('in');
    const dlg = $('loginDlg'); if (!dlg.open) dlg.showModal();
    setTimeout(() => { if (!$('loginForm').hidden) $('lgEmail').focus(); }, 30);
  }

  function submitLogin() {
    const email = $('lgEmail').value.trim(), pass = $('lgPass').value;
    if (!email) { showLoginError('Digite seu e-mail corporativo.'); return; }
    const btn = $('lgSubmit'); btn.disabled = true; showLoginError('');
    let p;
    if (loginMode === 'reset') p = Cloud.resetPassword(email).then(() => { showLoginError(''); $('lgHint').textContent = 'Pronto! Se existir uma conta com esse e-mail, o link chegou na caixa de entrada.'; });
    else if (loginMode === 'up') p = Cloud.signUp(email, pass);
    else p = Cloud.signIn(email, pass);
    p.catch(e => showLoginError(e && e.message ? e.message : 'Não foi possível concluir.')).then(() => { btn.disabled = false; });
  }

  function onCloudChange(st) {
    const wasAllowed = cloudAllowed();
    S.cloud = st;
    renderUser();
    const allowed = cloudAllowed();
    const dlg = $('loginDlg');
    if (allowed && !wasAllowed) {
      if (dlg.open) dlg.close();
      syncEmailsFromCloud();
      ensureHistory(true);
      const cb = S.afterLogin; S.afterLogin = null;
      renderReposicao();
      if (S.view === 'historico') renderHistory();
      if (cb) setTimeout(cb, 50);
    } else if (!allowed && wasAllowed) {
      S.hist = []; S.histLoaded = false; S.histError = null; indexHistory();
      renderReposicao();
      if (S.view === 'historico') renderHistory();
      if (S.view === 'analise') mountAnalysis();
    } else if (!allowed && st.user && dlg.open) {
      $('vfEmail').textContent = st.user.email; loginPanel('loginVerify');
    }
    if (!st.user && S.view === 'historico') renderHistory();
  }

  const dirtyEmail = {};
  function syncEmailsFromCloud() {
    Cloud.loadEmails().then(cloud => {
      Object.keys(cloud).forEach(k => { if (cloud[k] && !dirtyEmail[k]) S.emails[k] = cloud[k]; });
      // migra o que estava só neste navegador (versão anterior do painel) para a nuvem
      Object.keys(S.emails).forEach(k => { if (!cloud[k] && S.emails[k] && parseEmails(S.emails[k]).valid) Cloud.saveEmail(k, S.emails[k]).catch(() => {}); });
      persistEmailsCache();
      if (S.view === 'reposicao') renderSend();
    }).catch(() => { /* sem permissão ou rede: segue com o cache */ });
  }

  /* ---------- leitura de arquivos (Web Worker) ---------- */
  let worker = null, seq = 0;
  const latest = { onebeat: 0, ritmo: 0 };
  const pending = {};

  function getWorker() {
    if (!worker) {
      worker = new Worker('parser.worker.js');
      worker.onmessage = onWorkerMessage;
      worker.onerror = () => {
        Object.keys(pending).forEach(id => {
          const p = pending[id]; delete pending[id];
          S.busy[p.kind] = null;
          S.err[p.kind] = 'O navegador não conseguiu iniciar a leitura. Abra o painel pelo endereço do site e tente de novo.';
        });
        worker = null; renderDrops();
      };
    }
    return worker;
  }

  function loadFile(kind, file) {
    if (!file) return;
    S.busy[kind] = file.name; S.err[kind] = null;
    renderDrops();
    const id = ++seq;
    latest[kind] = id;
    pending[id] = { kind: kind, name: file.name, t0: performance.now() };
    file.arrayBuffer().then(buf => {
      try { getWorker().postMessage({ id: id, kind: kind, name: file.name, buffer: buf }, [buf]); }
      catch (e) { failPending(id, 'O navegador não conseguiu iniciar a leitura. Abra o painel pelo endereço do site e tente de novo.'); }
    }).catch(() => failPending(id, 'Não consegui abrir este arquivo.'));
  }

  function failPending(id, msg) {
    const p = pending[id]; if (!p) return;
    delete pending[id];
    S.busy[p.kind] = null; S.err[p.kind] = msg;
    renderDrops();
  }

  function onWorkerMessage(e) {
    const m = e.data, p = pending[m.id];
    if (!p) return;
    delete pending[m.id];
    if (m.id !== latest[p.kind]) return;
    S.busy[p.kind] = null;
    if (!m.ok) { S.err[p.kind] = m.error; renderDrops(); return; }
    const wall = performance.now() - p.t0;
    const r = m.result;
    if (p.kind === 'onebeat') {
      S.rows = r.rows; S.enviar = {}; S.mailOpened = {};
      S.meta = {
        sample: false, footer: r.footer, filterLojas: r.filterLojas, totalRead: r.totalRead, cycle: r.cycleDate, file: p.name,
        hasVendas: r.hasVendas, hasTransito: r.hasTransito, hasPosicao: r.hasPosicao, hasDsv: r.hasDsv
      };
      S.files.onebeat = { name: p.name, meta: fmt(r.rows.length) + ' itens' + (r.cycleDate ? ' · ciclo de ' + fmtDate(r.cycleDate) : '') + ' · lido em ' + fmtMs(wall) };
      recompute();
      S.selected = firstStoreWithData();
      S.query = ''; $('searchInput').value = '';
      if (!r.rows.length) toast('Nenhum item com reposição maior que zero neste arquivo.', false);
    } else {
      S.ritmo = { map: r.map, count: r.count, hasClasse: r.hasClasse };
      S.files.ritmo = { name: p.name, meta: fmt(r.count) + ' produtos · lido em ' + fmtMs(wall) + (r.hasClasse ? '' : ' · sem coluna Classe') };
    }
    renderReposicao();
    if (S.view === 'analise') mountAnalysis();
  }

  function guessKind(name) { return /ritmo/i.test(name) ? 'ritmo' : null; }

  function handleFiles(files, zoneKind) {
    files = Array.prototype.slice.call(files || []);
    if (!files.length) return;
    if (files.length === 1) { loadFile(zoneKind || guessKind(files[0].name) || 'onebeat', files[0]); return; }
    const used = {};
    files.slice(0, 4).forEach(f => {
      const k = guessKind(f.name) || 'onebeat';
      if (!used[k]) { used[k] = 1; loadFile(k, f); }
    });
  }

  /* ---------- navegação entre abas ---------- */
  function viewFromHash() {
    const h = (location.hash || '').replace('#', '');
    return h === 'historico' || h === 'analise' ? h : 'reposicao';
  }
  function showView(name) {
    S.view = name;
    ['reposicao', 'historico', 'analise'].forEach(v => {
      $('view-' + v).hidden = v !== name;
      const t = $('tab-' + v);
      if (v === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (name === 'historico') renderHistory();
    if (name === 'analise') mountAnalysis();
    window.scrollTo(0, 0);
  }

  /* ---------- eventos ---------- */
  function bind() {
    $('fileOnebeat').addEventListener('change', e => { handleFiles(e.target.files, 'onebeat'); e.target.value = ''; });
    $('fileRitmo').addEventListener('change', e => { handleFiles(e.target.files, 'ritmo'); e.target.value = ''; });

    const hasFiles = e => e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
    ['dropOnebeat', 'dropRitmo'].forEach(id => {
      const box = $(id), kind = box.getAttribute('data-kind');
      box.addEventListener('dragenter', e => { if (hasFiles(e)) box.classList.add('is-drag'); });
      box.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); box.classList.add('is-drag'); } });
      box.addEventListener('dragleave', () => box.classList.remove('is-drag'));
      box.addEventListener('drop', e => {
        if (!hasFiles(e)) return;
        e.preventDefault(); e.stopPropagation(); box.classList.remove('is-drag');
        handleFiles(e.dataTransfer.files, kind);
        if (S.view !== 'reposicao') location.hash = '#reposicao';
      });
    });
    window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener('drop', e => { if (hasFiles(e)) { e.preventDefault(); handleFiles(e.dataTransfer.files, null); if (S.view !== 'reposicao') location.hash = '#reposicao'; } });

    window.addEventListener('hashchange', () => showView(viewFromHash()));

    $('storeGrid').addEventListener('click', e => {
      const b = e.target.closest('.store-card'); if (!b) return;
      S.selected = b.getAttribute('data-store');
      S.query = ''; $('searchInput').value = '';
      renderStores(); renderSend();
      $('envio').scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
    });

    let qt = 0;
    $('searchInput').addEventListener('input', e => {
      clearTimeout(qt);
      const v = e.target.value;
      qt = setTimeout(() => { S.query = v; S.limit = PAGE; renderTable(); }, 140);
    });
    $('btnMore').addEventListener('click', () => { S.limit += PAGE; renderTable(); });
    $('btnReset').addEventListener('click', () => {
      viewBase().forEach(r => { delete S.enviar[rkey(r)]; });
      renderTable(); updateStats();
    });

    const tb = $('tblBody');
    tb.addEventListener('input', e => {
      const el = e.target;
      if (!el.classList || !el.classList.contains('enviar-input')) return;
      const k = el.getAttribute('data-k');
      const row = S.rows.find(r => rkey(r) === k);
      let v = parseInt(el.value, 10); if (isNaN(v) || v < 0) v = 0;
      S.enviar[k] = v;
      el.classList.toggle('is-changed', row ? v !== row.reposicao : false);
      updateStats(); updateReset();
    });
    tb.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.classList || !e.target.classList.contains('enviar-input')) return;
      e.preventDefault();
      const inputs = tb.querySelectorAll('.enviar-input');
      const i = Array.prototype.indexOf.call(inputs, e.target);
      const nx = inputs[i + 1]; if (nx) { nx.focus(); nx.select(); }
    });

    const et = {}; 
    $('storeEmail').addEventListener('input', e => {
      const v = e.target.value.trim();
      if (S.selected === ALL) return;
      const code = S.selected;
      S.emails[code] = v; persistEmailsCache();
      $('emailField').classList.remove('is-invalid');
      dirtyEmail[code] = true;
      clearTimeout(et[code]);
      et[code] = setTimeout(() => {
        if (S.selected === code) updateEmailSaved();
        if (cloudAllowed() && !S.cloud.user.local && (v === '' || parseEmails(v).valid)) {
          Cloud.saveEmail(code, v).then(() => { delete dirtyEmail[code]; }).catch(() => toast('Não consegui salvar o e-mail na nuvem.', false));
        } else delete dirtyEmail[code];
      }, 600);
    });
    $('storeEmail').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openMail(); } });

    $('btnMail').addEventListener('click', openMail);
    $('btnRegister').addEventListener('click', registerEnvio);
    $('btnCopy').addEventListener('click', copyCurrent);
    $('btnCopyAll').addEventListener('click', copyAllStores);

    $('sendCard').addEventListener('click', e => {
      const b = e.target.closest('[data-act],[data-go]'); if (!b) return;
      if (b.dataset.go) { location.hash = '#' + b.dataset.go; return; }
      if (b.dataset.act === 'register') registerEnvio();
      if (b.dataset.act === 'dismiss-mail') { S.mailOpened[S.selected] = false; renderSentNote(); }
    });

    // histórico
    $('hLoja').innerHTML = '<option value="">Todas as lojas</option>' + STORES.map(s => '<option value="' + s.code + '">' + s.code + ' · ' + s.name + '</option>').join('');
    $('hLoja').addEventListener('change', e => { S.hFilter.loja = e.target.value; S.hLimit = 50; renderHistory(); });
    $('hDias').addEventListener('change', e => { S.hFilter.dias = Number(e.target.value); S.hLimit = 50; renderHistory(); });
    let ht = 0;
    $('hSearch').addEventListener('input', e => { clearTimeout(ht); const v = e.target.value; ht = setTimeout(() => { S.hFilter.q = v; S.hLimit = 50; renderHistory(); }, 200); });
    $('hMore').addEventListener('click', () => { S.hLimit += 50; renderHistory(); });
    $('view-historico').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.act === 'toggle') { S.hOpen[id] = !S.hOpen[id]; renderHistory(); }
      if (b.dataset.act === 'recopy') recopyEnvio(id);
      if (b.dataset.act === 'undo') { const rec = S.hist.find(h => h.id === id); if (rec) undoEnvio(rec); }
      if (b.dataset.act === 'login') openLogin(null);
      if (b.dataset.act === 'reload-hist') { S.histError = null; ensureHistory(true); renderHistory(); }
    });

    // login
    $('btnUser').addEventListener('click', () => openLogin(null));
    document.querySelectorAll('#loginSeg button').forEach(b => b.addEventListener('click', () => setLoginMode(b.dataset.mode)));
    $('lgForgot').addEventListener('click', () => setLoginMode('reset'));
    $('lgSubmit').addEventListener('click', submitLogin);
    $('loginForm').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitLogin(); } });
    $('vfDone').addEventListener('click', () => { $('vfMsg').textContent = 'Verificando…'; Cloud.refresh().then(st => { if (!(st.user && st.user.allowed)) $('vfMsg').textContent = 'Ainda não consta como confirmado. Abra o link do e-mail e tente de novo.'; }).catch(e => { $('vfMsg').textContent = e.message; }); });
    $('vfResend').addEventListener('click', () => { Cloud.resendVerification().then(() => { $('vfMsg').textContent = 'Enviamos outro e-mail. Olhe também o spam.'; }).catch(e => { $('vfMsg').textContent = e.message; }); });
    $('vfOut').addEventListener('click', () => { Cloud.signOut().then(() => { $('loginDlg').close(); }).catch(() => {}); });
    $('acOut').addEventListener('click', () => { Cloud.signOut().then(() => { $('loginDlg').close(); toast('Você saiu da conta.'); }).catch(() => toast('Não consegui sair da conta.', false)); });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).close()));
    ['loginDlg', 'help'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) $(id).close(); }));

    const help = $('help');
    $('btnHelp').addEventListener('click', () => help.showModal());

    const themeBtn = $('btnTheme');
    const isDark = () => {
      const t = document.documentElement.getAttribute('data-theme');
      return t ? t === 'dark' : (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    };
    const paintTheme = () => { themeBtn.innerHTML = icon(isDark() ? 'sun' : 'moon'); };
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('reab_theme', next); } catch (e) { /* preferência só nesta sessão */ }
      paintTheme();
      if (S.view === 'analise') mountAnalysis();
    });
    if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { paintTheme(); if (S.view === 'analise') mountAnalysis(); });
    paintTheme();
  }

  function init() {
    loadEmailsCache();
    bind();
    S.rows = SAMPLE;
    recompute();
    S.selected = firstStoreWithData();
    renderUser();
    renderReposicao();
    showView(viewFromHash());
    const local = new URLSearchParams(location.search).get('modo') === 'local';
    Cloud.onChange(onCloudChange);
    Cloud.init({ local: local });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
