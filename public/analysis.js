(function (root) {
  'use strict';

  var state = { days: 90 };
  var charts = [];
  var resizeBound = false;

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function tokens() {
    return {
      ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), line: css('--line'), surface: css('--surface'),
      brand: css('--brand'), brandText: css('--brand-text'), amber: css('--amber'), good: css('--good'), muted: css('--surface-3'),
      mono: css('--f-mono') || 'monospace', ui: css('--f-ui') || 'sans-serif'
    };
  }
  function noMotion() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }

  function disposeAll() { charts.forEach(function (c) { try { c.dispose(); } catch (e) { /* já descartado */ } }); charts = []; }

  function bindResize() {
    if (resizeBound) return;
    resizeBound = true;
    window.addEventListener('resize', function () { charts.forEach(function (c) { try { c.resize(); } catch (e) { /* ignorado */ } }); });
  }

  function trunc(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  /* ---------- gráficos genéricos ---------- */
  // items: [{ name, value, tip }]; highlight(i) -> true pinta com a cor da marca, senão cinza (quando usado)
  function barH(el, items, o) {
    o = o || {};
    var t = tokens(), fmt = o.fmt;
    el.style.height = Math.max(110, items.length * 30 + 16) + 'px';
    var chart = echarts.init(el);
    charts.push(chart);
    chart.setOption({
      animation: !noMotion(), textStyle: { fontFamily: t.ui },
      grid: { left: 4, right: 58, top: 4, bottom: 4, containLabel: true },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category', inverse: true, data: items.map(function (i) { return i.name; }),
        axisTick: { show: false }, axisLine: { show: false },
        axisLabel: { color: t.ink2, fontSize: 12, width: o.labelWidth || 170, overflow: 'truncate' }
      },
      tooltip: {
        trigger: 'item', confine: true, backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 12 },
        formatter: function (p) { var it = items[p.dataIndex]; return '<b>' + root.__esc(it.full || it.name) + '</b><br>' + fmt(it.value) + (o.unit ? ' ' + o.unit : '') + (it.tip ? '<br><span style="opacity:.8">' + it.tip + '</span>' : ''); }
      },
      series: [{
        type: 'bar', barMaxWidth: 16, data: items.map(function (i, idx) {
          return { value: i.value, itemStyle: { color: (o.highlight && !o.highlight(idx, i)) ? t.muted : t.brand, borderRadius: [0, 3, 3, 0] } };
        }),
        label: { show: true, position: 'right', color: t.ink, fontFamily: t.mono, fontSize: 12, formatter: function (p) { return fmt(p.value); } }
      }]
    });
    return chart;
  }

  function barV(el, items, o) {
    o = o || {};
    var t = tokens(), fmt = o.fmt;
    el.style.height = (o.height || 230) + 'px';
    var chart = echarts.init(el);
    charts.push(chart);
    chart.setOption({
      animation: !noMotion(), textStyle: { fontFamily: t.ui },
      grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
      xAxis: { type: 'category', data: items.map(function (i) { return i.name; }), axisTick: { show: false }, axisLine: { lineStyle: { color: t.line } }, axisLabel: { color: t.ink2, fontSize: 12, interval: 0 } },
      yAxis: { type: 'value', show: false },
      tooltip: {
        trigger: 'item', confine: true, backgroundColor: t.surface, borderColor: t.line, textStyle: { color: t.ink, fontSize: 12 },
        formatter: function (p) { var it = items[p.dataIndex]; return '<b>' + root.__esc(it.name) + '</b><br>' + fmt(it.value) + (o.unit ? ' ' + o.unit : '') + (it.tip ? '<br><span style="opacity:.8">' + it.tip + '</span>' : ''); }
      },
      series: [{
        type: 'bar', barMaxWidth: 38, data: items.map(function (i, idx) {
          return { value: i.value, itemStyle: { color: (o.highlight && !o.highlight(idx, i)) ? t.muted : t.brand, borderRadius: [3, 3, 0, 0] } };
        }),
        label: { show: true, position: 'top', color: t.ink, fontFamily: t.mono, fontSize: 12, formatter: function (p) { return fmt(p.value); } }
      }]
    });
    return chart;
  }

  /* ---------- peças de HTML ---------- */
  function card(id, title, sub, extra) {
    return '<section class="card ana-card"><h4>' + title + '</h4><p class="sub">' + sub + '</p><div class="chart" id="' + id + '" role="img" aria-label="' + title + '"></div>' + (extra || '') + '</section>';
  }
  function insight(html) { return '<p class="insight">' + html + '</p>'; }

  function groupSum(rows, keyFn, valFn) {
    var m = Object.create(null);
    rows.forEach(function (r) { var k = keyFn(r); if (!m[k]) m[k] = { key: k, value: 0, n: 0 }; m[k].value += valFn(r); m[k].n++; });
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  /* ---------- CICLO ATUAL ---------- */
  function renderCycle(box, ctx) {
    var fmt = ctx.fmt, esc = ctx.esc, rows = ctx.rows, html = '';
    var units = rows.reduce(function (s, r) { return s + r.reposicao; }, 0);
    var names = {}; ctx.stores.forEach(function (s) { names[s.code] = s.name; });

    // por loja
    var byStore = ctx.stores.map(function (s) {
      var rs = rows.filter(function (r) { return r.store === s.code; });
      return { code: s.code, name: s.code + ' · ' + s.name, value: rs.reduce(function (a, r) { return a + r.reposicao; }, 0), n: rs.length };
    }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.value - a.value; });

    // top produtos (soma entre lojas)
    var prods = Object.create(null);
    rows.forEach(function (r) {
      var p = prods[r.codigo] || (prods[r.codigo] = { codigo: r.codigo, rotulo: r.rotulo, value: 0, lojas: 0, cd: r.estCd });
      p.value += r.reposicao; p.lojas++;
    });
    var top = Object.keys(prods).map(function (k) { return prods[k]; }).sort(function (a, b) { return b.value - a.value || (a.codigo < b.codigo ? -1 : 1); }).slice(0, 10);

    // cobertura atual da loja: (estoque + trânsito) / alvo
    var cov = { zero: 0, baixa: 0, media: 0 };
    rows.forEach(function (r) {
      var have = r.estLoja + (r.transito || 0), alvo = r.alvo || 0;
      if (have <= 0) cov.zero++; else if (alvo > 0 && have / alvo < 0.5) cov.baixa++; else cov.media++;
    });

    // uso do estoque do CD por produto (a soma entre lojas disputa o mesmo estoque)
    var uso = { a: 0, b: 0, c: 0, d: 0, e: 0 };
    Object.keys(prods).forEach(function (k) {
      var p = prods[k], cd = p.cd || 0, pct = cd > 0 ? p.value / cd : 9;
      if (pct > 1) uso.e++; else if (pct === 1) uso.d++; else if (pct > 0.5) uso.c++; else if (pct > 0.25) uso.b++; else uso.a++;
    });
    var nProd = Object.keys(prods).length;

    html += '<div class="ana-grid">';
    html += card('cLoja', 'Unidades sugeridas por loja', 'Quanto cada loja deve receber neste ciclo.',
      insight(byStore.length ? '<b>' + esc(byStore[0].name) + '</b> concentra ' + Math.round(100 * byStore[0].value / Math.max(1, units)) + '% das unidades (' + fmt(byStore[0].value) + ' de ' + fmt(units) + ').' : ''));
    html += card('cTop', 'Produtos com mais unidades sugeridas', 'Soma entre todas as lojas, top 10.',
      insight(top.length ? 'Os 10 produtos somam <b>' + fmt(top.reduce(function (s, p) { return s + p.value; }, 0)) + '</b> unidades (' + Math.round(100 * top.reduce(function (s, p) { return s + p.value; }, 0) / Math.max(1, units)) + '% do total).' : ''));
    html += card('cCov', 'Como estão as lojas hoje', 'Estoque na loja + trânsito comparado com o alvo de cada item.',
      insight('<b>' + fmt(cov.zero) + '</b> de ' + fmt(rows.length) + ' itens estão com a loja <b>zerada</b> (sem estoque e nada a caminho).'));
    html += card('cCd', 'Uso do estoque do CD por produto', 'Quanto do estoque do CD cada produto consumiria somando todas as lojas.',
      insight(uso.e ? '<b>' + fmt(uso.e) + '</b> de ' + fmt(nProd) + ' produtos pedem <b>mais do que o CD tem</b>: não dá para atender todas as lojas.'
        : uso.d ? '<b>' + fmt(uso.d) + '</b> de ' + fmt(nProd) + ' produtos levam <b>100% do estoque do CD</b>: o CD fica zerado nesses itens depois do envio.' : 'Nenhum produto zera o estoque do CD com este envio.'));
    html += card('cClasse', ctx.ritmo ? 'Classes com mais unidades' : 'Posição de venda dos itens', ctx.ritmo ? 'Classe do produto no Ritmo, em unidades sugeridas.' : 'Carregue o Ritmo para ver por classe de produto.');
    html += '<section class="card ana-card"><h4>Checagens do arquivo</h4><p class="sub">Conferências automáticas de qualidade dos dados.</p><div class="checks" id="cChecks"></div></section>';
    html += '</div>';
    box.insertAdjacentHTML('beforeend', html);

    if (byStore.length) barH(document.getElementById('cLoja'), byStore.map(function (s) { return { name: s.name, value: s.value, tip: fmt(s.n) + ' itens' }; }), { fmt: fmt, unit: 'un.' });
    else document.getElementById('cLoja').outerHTML = '<p class="muted">Sem itens neste arquivo.</p>';
    if (top.length) barH(document.getElementById('cTop'), top.map(function (p) { return { name: p.codigo + ' · ' + trunc(p.rotulo, 34), value: p.value, tip: esc(p.rotulo) + '<br>' + p.lojas + ' loja(s) · estoque do CD: ' + fmt(p.cd) }; }), { fmt: fmt, unit: 'un.', labelWidth: 230 });

    barV(document.getElementById('cCov'), [
      { name: 'Loja zerada', value: cov.zero }, { name: 'Até 49% do alvo', value: cov.baixa }, { name: '50% a 99% do alvo', value: cov.media }
    ], { fmt: fmt, unit: 'itens', height: 220, highlight: function (i) { return i === 0; } });

    barV(document.getElementById('cCd'), [
      { name: 'Até 25% do CD', value: uso.a }, { name: '26% a 50%', value: uso.b }, { name: '51% a 99%', value: uso.c },
      { name: '100% (zera o CD)', value: uso.d }, { name: 'Acima do CD', value: uso.e }
    ], { fmt: fmt, unit: 'produtos', height: 220, highlight: function (i) { return i >= 3; } });

    // classes ou posição
    var grp;
    if (ctx.ritmo) grp = groupSum(rows, function (r) { var x = ctx.ritmo.map[r.codigo]; return x && x[2] ? x[2] : 'Sem classe no Ritmo'; }, function (r) { return r.reposicao; });
    else grp = groupSum(rows, function (r) { return r.posicao || 'Normal'; }, function (r) { return r.reposicao; });
    grp.sort(function (a, b) { return b.value - a.value; });
    var gTop = grp.slice(0, 8);
    var outras = grp.slice(8).reduce(function (s, g) { return s + g.value; }, 0);
    if (outras) gTop.push({ key: 'Outras', value: outras, n: grp.length - 8 });
    barH(document.getElementById('cClasse'), gTop.map(function (g) { return { name: trunc(g.key, 30), full: g.key, value: g.value, tip: fmt(g.n) + ' itens' }; }), { fmt: fmt, unit: 'un.', labelWidth: 210 });

    // checagens
    var checks = [];
    var n = rows.length;
    if (ctx.meta.hasNecessidade !== false && rows.some(function (r) { return r.necessidade != null; })) {
      var ok1 = rows.filter(function (r) { return r.necessidade == null || r.necessidade === Math.max(0, r.alvo - r.estLoja - (r.transito || 0)); }).length;
      checks.push({ ok: ok1 === n, t: 'A conta fecha: alvo − estoque da loja − trânsito = necessidade', v: fmt(ok1) + ' de ' + fmt(n) + ' itens' });
    }
    var ok2 = rows.filter(function (r) { return r.reposicao <= r.estCd; }).length;
    checks.push({ ok: ok2 === n, t: 'A sugestão de cada linha cabe no estoque do CD', v: fmt(ok2) + ' de ' + fmt(n) + ' itens' });
    checks.push({ ok: uso.e === 0, t: 'A soma entre lojas cabe no estoque do CD (por produto)', v: fmt(nProd - uso.e) + ' de ' + fmt(nProd) + ' produtos' });
    var okNome = rows.filter(function (r) { return r.rotulo; }).length;
    checks.push({ ok: okNome === n, t: 'Todos os itens têm descrição', v: fmt(okNome) + ' de ' + fmt(n) + ' itens' });
    if (ctx.ritmo) {
      var okR = rows.filter(function (r) { var x = ctx.ritmo.map[r.codigo]; return x && x[2]; }).length;
      checks.push({ ok: okR === n, t: 'Itens com classe no Ritmo carregado', v: fmt(okR) + ' de ' + fmt(n) + ' itens (' + Math.round(100 * okR / Math.max(1, n)) + '%)' });
    }
    if (ctx.meta.filterLojas) {
      var inFilter = {}; ctx.meta.filterLojas.forEach(function (l) { var tk = String(l).split(/\s+/); tk.forEach(function (x) { if (names[x.toUpperCase()]) inFilter[x.toUpperCase()] = 1; }); });
      var nf = Object.keys(inFilter).length, withItems = byStore.length;
      checks.push({ ok: nf === ctx.stores.length, t: 'Todas as lojas do painel estão no filtro do OneBeat', v: fmt(nf) + ' de ' + fmt(ctx.stores.length) + ' lojas · ' + fmt(withItems) + ' com itens' });
    }
    document.getElementById('cChecks').innerHTML = checks.map(function (c) {
      return '<div class="check ' + (c.ok ? 'is-ok' : 'is-warn') + '"><span class="check-ico">' + ctx.icon(c.ok ? 'check' : 'alert') + '</span><span class="check-t">' + esc(c.t) + '</span><span class="check-v num">' + esc(c.v) + '</span></div>';
    }).join('');
  }

  /* ---------- HISTÓRICO ---------- */
  function weekStart(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d; }

  function renderHistory(box, ctx) {
    var fmt = ctx.fmt, esc = ctx.esc;
    var since = Date.now() - state.days * 86400000;
    var envs = ctx.hist.filter(function (e) { return e.ts >= since; });
    if (!envs.length) {
      box.insertAdjacentHTML('beforeend', '<div class="empty"><b>Ainda não há envios neste período</b>Registre os envios na aba Reposição (botão "Registrar envio") e os gráficos aparecem aqui.</div>');
      return;
    }
    var names = {}; ctx.stores.forEach(function (s) { names[s.code] = s.name; });
    var totUn = envs.reduce(function (s, e) { return s + (e.totalUnidades || 0); }, 0);
    var totSug = envs.reduce(function (s, e) { return s + (e.totalSugerido || 0); }, 0);
    var totItens = envs.reduce(function (s, e) { return s + (e.itens || []).length; }, 0);
    var totAj = envs.reduce(function (s, e) { return s + (e.ajustados || 0); }, 0);
    var distinct = {}; envs.forEach(function (e) { (e.itens || []).forEach(function (i) { if (i.e > 0) distinct[i.c] = 1; }); });

    var kpi = function (l, v, h) { return '<div class="stat"><div class="stat-label">' + l + '</div><div class="stat-value">' + v + '</div>' + (h ? '<div class="stat-hint">' + h + '</div>' : '') + '</div>'; };
    var html = '<div class="summary">' +
      kpi('Envios registrados', fmt(envs.length), 'nos últimos ' + state.days + ' dias') +
      kpi('Unidades enviadas', fmt(totUn), fmt(Object.keys(distinct).length) + ' produtos diferentes') +
      kpi('Sugerido enviado', Math.round(100 * totUn / Math.max(1, totSug)) + '<small>%</small>', fmt(totUn) + ' de ' + fmt(totSug) + ' unidades sugeridas') +
      kpi('Itens ajustados à mão', Math.round(100 * totAj / Math.max(1, totItens)) + '<small>%</small>', fmt(totAj) + ' de ' + fmt(totItens) + ' itens') + '</div>';
    html += '<div class="ana-grid">';
    html += card('ahLoja', 'Unidades enviadas por loja', 'Soma dos envios registrados no período.');
    html += card('ahSem', 'Unidades enviadas por semana', 'Cada coluna é uma semana (começa na segunda-feira).');
    html += card('ahTop', 'Produtos mais enviados', 'Unidades acumuladas no período, top 10.');
    html += card('ahCls', 'Classes mais enviadas', 'Classe do produto registrada no momento do envio.');
    html += card('ahAj', 'Ajustes manuais por loja', 'Parte dos itens em que o enviado foi diferente do sugerido.');
    html += '<section class="card ana-card"><h4>Itens reenviados em menos de 15 dias</h4><p class="sub">Quando o mesmo item volta para a mesma loja em pouco tempo, vale olhar o alvo dele.</p><div id="ahRe"></div></section>';
    html += '</div>';
    box.insertAdjacentHTML('beforeend', html);

    // por loja
    var byLoja = ctx.stores.map(function (s) {
      var es = envs.filter(function (e) { return e.loja === s.code; });
      return { name: s.code + ' · ' + s.name, value: es.reduce(function (a, e) { return a + (e.totalUnidades || 0); }, 0), tip: es.length + ' envio(s)' };
    }).filter(function (x) { return x.value > 0; }).sort(function (a, b) { return b.value - a.value; });
    barH(document.getElementById('ahLoja'), byLoja, { fmt: fmt, unit: 'un.' });

    // por semana
    var wk = Object.create(null);
    envs.forEach(function (e) { var k = weekStart(e.ts).getTime(); if (!wk[k]) wk[k] = { v: 0, n: 0 }; wk[k].v += e.totalUnidades || 0; wk[k].n++; });
    var wkItems = Object.keys(wk).map(Number).sort(function (a, b) { return a - b; }).map(function (k) {
      var d = new Date(k);
      return { name: ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2), value: wk[k].v, tip: wk[k].n + ' envio(s)' };
    });
    barV(document.getElementById('ahSem'), wkItems, { fmt: fmt, unit: 'un.', height: 230 });

    // produtos e classes
    var pr = Object.create(null), cl = Object.create(null);
    envs.forEach(function (e) {
      (e.itens || []).forEach(function (i) {
        if (!(i.e > 0)) return;
        var p = pr[i.c] || (pr[i.c] = { c: i.c, n: i.n, v: 0, envios: 0 });
        p.v += i.e; p.envios++;
        var k = i.k || 'Sem classe'; cl[k] = (cl[k] || 0) + i.e;
      });
    });
    var topP = Object.keys(pr).map(function (k) { return pr[k]; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 10);
    barH(document.getElementById('ahTop'), topP.map(function (p) { return { name: p.c + ' · ' + trunc(p.n, 34), value: p.v, tip: esc(p.n) + '<br>enviado em ' + p.envios + ' remessa(s)' }; }), { fmt: fmt, unit: 'un.', labelWidth: 230 });
    var clItems = Object.keys(cl).map(function (k) { return { name: k, value: cl[k] }; }).sort(function (a, b) { return b.value - a.value; });
    var clTop = clItems.slice(0, 8), clRest = clItems.slice(8).reduce(function (s, x) { return s + x.value; }, 0);
    if (clRest) clTop.push({ name: 'Outras', value: clRest });
    barH(document.getElementById('ahCls'), clTop.map(function (c) { return { name: trunc(c.name, 30), full: c.name, value: c.value }; }), { fmt: fmt, unit: 'un.', labelWidth: 210 });

    // ajustes por loja
    var aj = ctx.stores.map(function (s) {
      var es = envs.filter(function (e) { return e.loja === s.code; });
      var tot = es.reduce(function (a, e) { return a + (e.itens || []).length; }, 0), adj = es.reduce(function (a, e) { return a + (e.ajustados || 0); }, 0);
      return { name: s.code + ' · ' + s.name, value: tot ? Math.round(100 * adj / tot) : 0, tot: tot, tip: fmt(adj) + ' de ' + fmt(tot) + ' itens', has: tot > 0 };
    }).filter(function (x) { return x.has; }).sort(function (a, b) { return b.value - a.value; });
    barH(document.getElementById('ahAj'), aj, { fmt: function (v) { return v + '%'; }, unit: '', labelWidth: 150 });

    // reincidência
    var seq = Object.create(null);
    envs.slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (e) {
      (e.itens || []).forEach(function (i) {
        if (!(i.e > 0)) return;
        var k = e.loja + '|' + i.c;
        (seq[k] || (seq[k] = { loja: e.loja, c: i.c, n: i.n, ts: [], un: 0 })).ts.push(e.ts);
        seq[k].un += i.e;
      });
    });
    var re = Object.keys(seq).map(function (k) {
      var s = seq[k], times = s.ts, close = 0;
      for (var x = 1; x < times.length; x++) if (times[x] - times[x - 1] <= 14 * 86400000) close++;
      return { loja: s.loja, c: s.c, n: s.n, vezes: times.length, close: close, un: s.un, last: times[times.length - 1] };
    }).filter(function (x) { return x.close > 0; }).sort(function (a, b) { return b.close - a.close || b.un - a.un; }).slice(0, 8);
    document.getElementById('ahRe').innerHTML = re.length
      ? '<table class="mini"><thead><tr><th>Loja</th><th>Produto</th><th class="r">Vezes</th><th class="r">Unidades</th><th>Último</th></tr></thead><tbody>' +
        re.map(function (x) { return '<tr><td class="c-store"><b>' + esc(x.loja) + '</b></td><td><span class="c-code">' + esc(x.c) + '</span> ' + esc(trunc(x.n, 40)) + '</td><td class="r c-num">' + x.vezes + '</td><td class="r c-num">' + fmt(x.un) + '</td><td>' + esc(ctx.fmtStamp(x.last).slice(0, 5)) + '</td></tr>'; }).join('') + '</tbody></table>'
      : '<p class="muted">Nenhum item foi reenviado para a mesma loja em menos de 15 dias.</p>';
  }

  /* ---------- entrada ---------- */
  function render(box, ctx) {
    root.__esc = ctx.esc;
    disposeAll(); bindResize();
    box.innerHTML = '';
    var head = '<div class="view-head"><div><h2>Análise</h2><p>O que está sendo pedido neste ciclo e o que o time já enviou para as lojas.</p></div>' +
      '<div class="filters"><label class="muted" for="anaDias">Período do histórico</label><select id="anaDias" aria-label="Período do histórico">' +
      [30, 90, 365].map(function (d) { return '<option value="' + d + '"' + (d === state.days ? ' selected' : '') + '>' + (d === 365 ? 'Último ano' : 'Últimos ' + d + ' dias') + '</option>'; }).join('') + '</select></div></div>';
    box.insertAdjacentHTML('beforeend', head);
    document.getElementById('anaDias').addEventListener('change', function (e) { state.days = Number(e.target.value); render(box, ctx); });

    var cycleTitle = ctx.sample ? 'Ciclo atual <span class="badge">exemplo</span>' : 'Ciclo atual' + (ctx.meta.cycle ? ' <span class="badge">' + ctx.fmtDate(ctx.meta.cycle) + '</span>' : '');
    box.insertAdjacentHTML('beforeend', '<h3 class="ana-h">' + cycleTitle + '</h3>');
    if (ctx.rows.length) renderCycle(box, ctx);
    else box.insertAdjacentHTML('beforeend', '<div class="empty"><b>Nenhum item carregado</b>Carregue o arquivo de reposição na aba Reposição.</div>');

    box.insertAdjacentHTML('beforeend', '<h3 class="ana-h">Histórico de envios</h3>');
    if (ctx.histOk) {
      if (ctx.histError) box.insertAdjacentHTML('beforeend', '<div class="empty"><b>Não consegui carregar o histórico</b>' + ctx.esc(ctx.histError) + '</div>');
      else if (ctx.histLoading) box.insertAdjacentHTML('beforeend', '<div class="empty"><b>Carregando histórico…</b>Buscando os envios registrados.</div>');
      else renderHistory(box, ctx);
    } else {
      var logos = '<span class="empty-logos"><img src="assets/logo_abracadabra.png" alt="" width="44" height="44"><img src="assets/logo_abracasa.png" alt="" width="44" height="44"></span>';
      box.insertAdjacentHTML('beforeend', ctx.cloudBlocked
        ? '<div class="empty">' + logos + '<b>Nuvem indisponível</b>' + ctx.esc(ctx.cloudBlocked) + '</div>'
        : '<div class="empty">' + logos + '<b>Entre para ver o que já foi enviado</b>O histórico fica guardado na nuvem para todo o time.<button type="button" class="btn btn-primary" id="anaLogin">' + ctx.icon('lock') + 'Entrar</button></div>');
      var b = document.getElementById('anaLogin'); if (b) b.addEventListener('click', ctx.onLogin);
    }
  }

  root.Analysis = { render: render };
})(window);
