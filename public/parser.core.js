(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ParserCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function normKey(s) {
    return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function str(v) { return v == null ? '' : String(v).trim(); }

  function toNum(v) {
    if (typeof v === 'number') return v;
    var s = str(v);
    if (!s) return 0;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var n = Number(s);
    return isNaN(n) ? 0 : n;
  }

  function decodeBytes(bytes) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  function isZipOrOle(bytes) {
    if (bytes.length < 4) return false;
    var zip = bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
    var ole = bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
    return zip || ole;
  }

  function detectDelimiter(text) {
    var end = text.indexOf('\n');
    var line = text.slice(0, end < 0 ? Math.min(text.length, 4000) : end);
    var semi = 0, comma = 0, tab = 0;
    for (var i = 0; i < line.length; i++) {
      var c = line.charCodeAt(i);
      if (c === 59) semi++; else if (c === 44) comma++; else if (c === 9) tab++;
    }
    if (semi > 0 && semi >= comma && semi >= tab) return ';';
    if (tab > comma && tab > 0) return '\t';
    return ',';
  }

  // Aspas só abrem campo no INÍCIO do campo (como o csv do Python); aspas no meio do texto são literais.
  // keep = índices de coluna a guardar (null = todas). Cada linha devolvida segue a ordem de keep.
  function parseCsv(text, delim, keep, maxRecords) {
    var d = delim.charCodeAt(0);
    var n = text.length;
    var rows = [];
    var pos = null, outLen = 0;
    if (keep) {
      var maxCol = -1;
      for (var k = 0; k < keep.length; k++) if (keep[k] > maxCol) maxCol = keep[k];
      pos = new Array(maxCol + 1);
      for (var p = 0; p < pos.length; p++) pos[p] = -1;
      for (var q = 0; q < keep.length; q++) if (keep[q] >= 0) pos[keep[q]] = q;
      outLen = keep.length;
    }
    function newRow() {
      if (!keep) return [];
      var r = new Array(outLen);
      for (var z = 0; z < outLen; z++) r[z] = '';
      return r;
    }
    var row = newRow();
    var col = 0;
    function push(val) {
      if (!keep) row.push(val);
      else {
        var at = col < pos.length ? pos[col] : -1;
        if (at >= 0) row[at] = val;
      }
      col++;
    }
    var i = 0;
    while (i < n) {
      var c = text.charCodeAt(i);
      var val;
      if (c === 34) {
        var j = i + 1, segStart = j, buf = '';
        for (;;) {
          var qi = text.indexOf('"', j);
          if (qi === -1) { buf += text.slice(segStart); j = n; break; }
          if (text.charCodeAt(qi + 1) === 34) { buf += text.slice(segStart, qi + 1); j = qi + 2; segStart = j; continue; }
          buf += text.slice(segStart, qi); j = qi + 1; break;
        }
        i = j;
        while (i < n) {
          var cc0 = text.charCodeAt(i);
          if (cc0 === d || cc0 === 10 || cc0 === 13) break;
          buf += text.charAt(i); i++;
        }
        val = buf;
      } else {
        var e = i;
        while (e < n) {
          var cc1 = text.charCodeAt(e);
          if (cc1 === d || cc1 === 10 || cc1 === 13) break;
          e++;
        }
        val = text.slice(i, e);
        i = e;
      }
      push(val);
      if (i >= n) { rows.push(row); row = null; break; }
      var cc = text.charCodeAt(i);
      if (cc === d) {
        i++;
        if (i >= n) { push(''); rows.push(row); row = null; }
        continue;
      }
      if (cc === 13 && text.charCodeAt(i + 1) === 10) i += 2; else i++;
      rows.push(row);
      row = newRow(); col = 0;
      if (maxRecords && rows.length >= maxRecords) return rows;
    }
    return rows;
  }

  // ---- leitura de tabela (csv ou xlsx) devolvendo { header, rows } com rows alinhadas a "pick(headerNorm)" ----
  function readTable(bytes, name, pick, getXLSX) {
    var isCsv = /\.csv$/i.test(name || '') || !isZipOrOle(bytes);
    if (isCsv) {
      var text = decodeBytes(bytes);
      var delim = detectDelimiter(text);
      var header = parseCsv(text, delim, null, 1)[0] || [];
      var headerNorm = header.map(normKey);
      var cols = pick(headerNorm);
      var rows = parseCsv(text, delim, cols, 0);
      rows.shift();
      return { header: header, headerNorm: headerNorm, cols: cols, rows: rows, format: 'csv' };
    }
    var XLSX = getXLSX();
    var wb = XLSX.read(bytes, { type: 'array', dense: true, cellStyles: false, cellNF: false, cellHTML: false, cellFormula: false, cellText: false, sheetStubs: false });
    var sheetName = wb.SheetNames[0];
    for (var s = 0; s < wb.SheetNames.length; s++) {
      var nk = normKey(wb.SheetNames[s]);
      if (nk === 'ritmo posicao' || nk === 'onebeat' || nk === 'export') { sheetName = wb.SheetNames[s]; break; }
    }
    var ws = wb.Sheets[sheetName];
    var grid = Array.isArray(ws) ? ws : (ws['!data'] || []);
    var hdrRow = grid[0] || [];
    var header2 = [];
    for (var h = 0; h < hdrRow.length; h++) header2.push(hdrRow[h] ? str(hdrRow[h].v) : '');
    var headerNorm2 = header2.map(normKey);
    var cols2 = pick(headerNorm2);
    var out = new Array(Math.max(grid.length - 1, 0));
    for (var r = 1; r < grid.length; r++) {
      var gr = grid[r];
      var o = new Array(cols2.length);
      for (var k2 = 0; k2 < cols2.length; k2++) {
        var cell = gr && cols2[k2] >= 0 ? gr[cols2[k2]] : null;
        o[k2] = cell && cell.v != null ? cell.v : '';
      }
      out[r - 1] = o;
    }
    return { header: header2, headerNorm: headerNorm2, cols: cols2, rows: out, format: 'xlsx' };
  }

  function findCol(headerNorm, names) {
    for (var n = 0; n < names.length; n++) {
      var i = headerNorm.indexOf(names[n]);
      if (i !== -1) return i;
    }
    return -1;
  }

  // Ordem das colunas guardadas (índices em OB). Só loja, codigo e reposicao são obrigatórias:
  // o modelo novo (reposicao-AAAA-MM-DD.xlsx) traz tudo; o export antigo traz só parte.
  var OB = { LOJA: 0, CODIGO: 1, ROTULO: 2, POSICAO: 3, ALVO: 4, EST_LOJA: 5, TRANSITO: 6, NECESS: 7, EST_CD: 8, REPOS: 9, V1: 10, V7: 11, V30: 12, V45: 13, V60: 14, DSV: 15 };
  var OB_NAMES = [
    ['loja'], ['codigo'], ['rotulo'], ['posicaodevenda'], ['alvo final', 'alvo'], ['estoque loja'], ['transito'], ['necessidade'],
    ['estoque cd'], ['reposicao'], ['venda ontem'], ['vendas 7d'], ['vendas 30d'], ['vendas 45d'], ['vendas 60d'], ['dias sem venda']
  ];

  function pickOnebeat(headerNorm) {
    var cols = OB_NAMES.map(function (names) { return findCol(headerNorm, names); });
    var missing = [];
    if (cols[OB.LOJA] === -1) missing.push('Loja');
    if (cols[OB.CODIGO] === -1) missing.push('Codigo');
    if (cols[OB.REPOS] === -1) missing.push('Reposição');
    if (missing.length) {
      var msg = headerNorm.indexOf('recurso') !== -1
        ? 'Este arquivo parece ser o relatório Ritmo. Solte-o na caixa "Relatório Ritmo"; aqui vai o arquivo de reposição.'
        : 'Não encontrei as colunas ' + missing.join(', ') + ' neste arquivo. Confira se é o arquivo de reposição do OneBeat (reposicao-AAAA-MM-DD.xlsx), com Codigo, Loja e Reposição.';
      var err = new Error(msg);
      err.userFacing = true;
      throw err;
    }
    return cols;
  }

  function pickRitmo(headerNorm) {
    var recurso = findCol(headerNorm, ['recurso']);
    var classe = -1;
    for (var i = 0; i < headerNorm.length; i++) if (headerNorm[i].indexOf('classe') === 0) { classe = i; break; }
    var disp = findCol(headerNorm, ['disponivel']);
    var situ = findCol(headerNorm, ['situacao']);
    if (recurso === -1 || (classe === -1 && disp === -1 && situ === -1)) {
      var msg = headerNorm.indexOf('loja') !== -1 && headerNorm.indexOf('reposicao') !== -1
        ? 'Este arquivo parece ser o arquivo de reposição do OneBeat. Solte-o na caixa "Arquivo de reposição"; aqui vai o relatório Ritmo.'
        : 'Não encontrei a coluna "Recurso" (e Classe/Situação/Disponível) neste arquivo. Confira se é o relatório Ritmo.';
      var err = new Error(msg);
      err.userFacing = true;
      throw err;
    }
    return [recurso, disp, situ, classe];
  }

  function parseFilterLojas(footer) {
    if (!footer) return null;
    var lines = footer.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = /^\s*Nome Loja\s+\S+\s+(.*)$/i.exec(lines[i]);
      if (m) return m[1].split(/\s*,\s*|\s+ou\s+/i).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return null;
  }

  // Data do ciclo: linha "Data ..." do rodapé de filtros (primeira dd/mm/aaaa) ou, se não houver, aaaa-mm-dd no nome do arquivo.
  function parseCycleDate(footer, name) {
    if (footer) {
      var line = /^\s*Data\b.*$/im.exec(footer);
      var ds = line && line[0].match(/\d{2}\/\d{2}\/\d{4}/);
      if (ds) return ds[0].slice(6) + '-' + ds[0].slice(3, 5) + '-' + ds[0].slice(0, 2);
    }
    var n = /(\d{4})-(\d{2})-(\d{2})/.exec(name || '');
    return n ? n[0] : null;
  }

  function footerIn(r) {
    for (var k = 0; k < 3; k++) {
      var s = str(r[k]);
      if (/^filtros aplicados/i.test(s)) return s;
    }
    return null;
  }

  function optNum(v) { return v === '' || v == null ? null : toNum(v); }

  function extractOnebeat(table, name) {
    var out = [], seen = Object.create(null), totalRead = 0, footer = null;
    var rows = table.rows, c = table.cols;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var loja = str(r[OB.LOJA]), codigo = str(r[OB.CODIGO]);
      if (!loja || !codigo) {
        if (!footer) footer = footerIn(r);
        continue;
      }
      if (loja.toLowerCase() === 'total' || codigo.toLowerCase() === 'total') continue;
      totalRead++;
      var rep = toNum(r[OB.REPOS]);
      if (!(rep > 0)) continue;
      var key = loja + '|' + codigo;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push({
        loja: loja, codigo: codigo, rotulo: str(r[OB.ROTULO]), posicao: str(r[OB.POSICAO]),
        alvo: toNum(r[OB.ALVO]), estLoja: toNum(r[OB.EST_LOJA]), transito: toNum(r[OB.TRANSITO]),
        necessidade: optNum(r[OB.NECESS]), estCd: toNum(r[OB.EST_CD]), reposicao: rep,
        v1: toNum(r[OB.V1]), v7: toNum(r[OB.V7]), v30: toNum(r[OB.V30]), v45: toNum(r[OB.V45]), v60: toNum(r[OB.V60]),
        dsv: optNum(r[OB.DSV])
      });
    }
    return {
      rows: out, totalRead: totalRead, footer: footer, filterLojas: parseFilterLojas(footer),
      cycleDate: parseCycleDate(footer, name),
      hasVendas: c[OB.V30] !== -1, hasTransito: c[OB.TRANSITO] !== -1, hasNecessidade: c[OB.NECESS] !== -1,
      hasPosicao: c[OB.POSICAO] !== -1, hasDsv: c[OB.DSV] !== -1
    };
  }

  function extractRitmo(table) {
    var map = Object.create(null), count = 0;
    var c = table.cols;
    var rows = table.rows;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var codigo = str(r[0]);
      if (!codigo || map[codigo]) continue;
      var disp = r[1];
      if (typeof disp === 'string') {
        var t = disp.trim();
        disp = /^-?\d+$/.test(t) ? Number(t) : t;
      }
      map[codigo] = [disp, str(r[2]), str(r[3])];
      count++;
    }
    return { map: map, count: count, hasDisp: c[1] !== -1, hasSitu: c[2] !== -1, hasClasse: c[3] !== -1 };
  }

  function processFile(kind, name, bytes, getXLSX) {
    var t0 = Date.now();
    var table = readTable(bytes, name, kind === 'ritmo' ? pickRitmo : pickOnebeat, getXLSX);
    var result = kind === 'ritmo' ? extractRitmo(table) : extractOnebeat(table, name);
    result.format = table.format;
    result.ms = Date.now() - t0;
    return result;
  }

  return {
    normKey: normKey, toNum: toNum, decodeBytes: decodeBytes, detectDelimiter: detectDelimiter,
    parseCsv: parseCsv, readTable: readTable, parseFilterLojas: parseFilterLojas,
    extractOnebeat: extractOnebeat, extractRitmo: extractRitmo, processFile: processFile
  };
});
