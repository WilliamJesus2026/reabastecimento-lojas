'use strict';
importScripts('parser.core.js');

var xlsxLib = null;
function getXLSX() {
  if (!xlsxLib) {
    importScripts('vendor/xlsx.full.min.js');
    xlsxLib = self.XLSX;
  }
  return xlsxLib;
}

self.onmessage = function (e) {
  var d = e.data;
  try {
    var result = ParserCore.processFile(d.kind, d.name, new Uint8Array(d.buffer), getXLSX);
    self.postMessage({ id: d.id, ok: true, kind: d.kind, name: d.name, result: result });
  } catch (err) {
    self.postMessage({
      id: d.id, ok: false, kind: d.kind, name: d.name,
      error: err && err.userFacing ? err.message : 'Não consegui ler este arquivo (' + (err && err.message ? err.message : err) + '). Confirme se é um .xlsx ou .csv exportado do sistema.'
    });
  }
};
