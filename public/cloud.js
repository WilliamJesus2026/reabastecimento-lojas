(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.Cloud = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  // Domínios aceitos no login. A regra que vale de verdade está em firestore.rules (mantenha as duas iguais).
  var ALLOWED_DOMAINS = ['abracadabra.com.br'];
  var LOCAL_KEY = 'reab_local_cloud_v1';
  var UNDO_MS = 15 * 60 * 1000;

  var state = { mode: 'firebase', ready: false, user: null, error: null, busy: false };
  var listeners = [];
  var fb = null, auth = null, db = null, initPromise = null;

  function snapshot() {
    return { mode: state.mode, ready: state.ready, user: state.user, error: state.error };
  }
  function emit() { var s = snapshot(); listeners.slice().forEach(function (fn) { try { fn(s); } catch (e) { /* ouvinte com erro não derruba os demais */ } }); }

  function domainOk(email) {
    var m = /@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
    return !!m && ALLOWED_DOMAINS.indexOf(m[1]) !== -1;
  }

  function makeError(message, code) { var e = new Error(message); e.code = code || 'cloud'; e.userFacing = true; return e; }
  function needLogin() { return makeError('Entre com sua conta corporativa para usar o histórico.', 'auth-required'); }

  function friendlyAuthError(e) {
    var c = e && e.code || '';
    var map = {
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/wrong-password': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'E-mail ou senha incorretos.',
      'auth/invalid-email': 'Esse e-mail não parece válido.',
      'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Entrar" ou "Esqueci a senha".',
      'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
      'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
      'auth/network-request-failed': 'Sem conexão com a internet. Confira a rede e tente de novo.',
      'auth/operation-not-allowed': 'O login por e-mail e senha ainda não foi ativado no Firebase (Authentication > Sign-in method).',
      'auth/missing-password': 'Digite a senha.',
      'permission-denied': 'Esta conta não tem acesso ao histórico. Peça a liberação do seu e-mail ao administrador do painel.'
    };
    return makeError(map[c] || ('Não foi possível concluir (' + (c || (e && e.message) || 'erro') + ').'), c || 'auth');
  }

  /* ---------------- adaptador LOCAL (reserva e testes: tudo fica só neste navegador) ---------------- */
  function lsRead() {
    try { var d = JSON.parse(root.localStorage.getItem(LOCAL_KEY)); if (d && d.envios && d.emails) return d; } catch (e) { /* vazio */ }
    return { envios: [], emails: {}, seq: 0 };
  }
  function lsWrite(d) { try { root.localStorage.setItem(LOCAL_KEY, JSON.stringify(d)); } catch (e) { throw makeError('Sem espaço para guardar o histórico neste navegador.', 'quota'); } }

  var localApi = {
    init: function () {
      state.mode = 'local'; state.ready = true;
      state.user = { email: 'modo local', verified: true, allowed: true, local: true };
      emit();
      return Promise.resolve(snapshot());
    },
    signIn: function () { return Promise.resolve(); },
    signUp: function () { return Promise.resolve(); },
    resetPassword: function () { return Promise.resolve(); },
    resendVerification: function () { return Promise.resolve(); },
    refresh: function () { return Promise.resolve(snapshot()); },
    signOut: function () { return Promise.resolve(); },
    loadEmails: function () {
      var d = lsRead(), out = {};
      Object.keys(d.emails).forEach(function (k) { out[k] = d.emails[k].v; });
      return Promise.resolve(out);
    },
    saveEmail: function (code, value) {
      var d = lsRead(); d.emails[code] = { v: value, t: Date.now(), por: 'modo local' }; lsWrite(d);
      return Promise.resolve();
    },
    addEnvio: function (data) {
      var d = lsRead(); d.seq = (d.seq || 0) + 1;
      var rec = Object.assign({}, data, { id: 'local-' + d.seq, seq: d.seq, ts: Date.now(), por: 'modo local' });
      d.envios.push(rec); lsWrite(d);
      return Promise.resolve(rec);
    },
    listEnvios: function (opts) {
      var since = Date.now() - ((opts && opts.sinceDays) || 365) * 86400000;
      var rows = lsRead().envios.filter(function (e) { return e.ts >= since; }).sort(function (a, b) { return (b.ts - a.ts) || ((b.seq || 0) - (a.seq || 0)); });
      return Promise.resolve(opts && opts.limit ? rows.slice(0, opts.limit) : rows);
    },
    removeEnvio: function (id) {
      var d = lsRead();
      var rec = d.envios.filter(function (e) { return e.id === id; })[0];
      if (!rec) return Promise.reject(makeError('Envio não encontrado.', 'not-found'));
      if (Date.now() - rec.ts > UNDO_MS) return Promise.reject(makeError('Só é possível desfazer em até 15 minutos.', 'undo-expired'));
      d.envios = d.envios.filter(function (e) { return e.id !== id; }); lsWrite(d);
      return Promise.resolve();
    }
  };

  /* ---------------- adaptador FIREBASE (login + Firestore) ---------------- */
  function setUser(u) {
    if (!u) { state.user = null; }
    else {
      state.user = { email: u.email, verified: !!u.emailVerified, allowed: domainOk(u.email), local: false };
    }
    state.ready = true;
    emit();
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Falha ao carregar ' + src)); };
      root.document.head.appendChild(s);
    });
  }

  function requireAllowed() {
    if (!state.user || !state.user.allowed) return Promise.reject(needLogin());
    return Promise.resolve();
  }

  var fbApi = {
    init: function () {
      state.mode = 'firebase';
      return api._loadScript('vendor/firebase-app-compat.js')
        .then(function () { return Promise.all([api._loadScript('vendor/firebase-auth-compat.js'), api._loadScript('vendor/firebase-firestore-compat.js')]); })
        .then(function () {
          fb = root.firebase;
          fb.initializeApp(root.FIREBASE_CONFIG);
          auth = fb.auth(); auth.languageCode = 'pt-BR';
          db = fb.firestore();
          return new Promise(function (resolve) {
            var first = true;
            auth.onAuthStateChanged(function (u) { setUser(u); if (first) { first = false; resolve(snapshot()); } });
          });
        })
        .catch(function (e) {
          state.ready = true; state.error = 'Não foi possível conectar à nuvem. O painel funciona, mas o histórico fica indisponível.';
          emit();
          return snapshot();
        });
    },
    signIn: function (email, pass) {
      return auth.signInWithEmailAndPassword(String(email || '').trim(), pass).then(function () {}, function (e) { throw friendlyAuthError(e); });
    },
    signUp: function (email, pass) {
      email = String(email || '').trim();
      if (!domainOk(email)) return Promise.reject(makeError('Use seu e-mail corporativo (@' + ALLOWED_DOMAINS.join(' ou @') + ').', 'domain'));
      return auth.createUserWithEmailAndPassword(email, pass)
        .then(function () { setUser(auth.currentUser); }, function (e) { throw friendlyAuthError(e); });
    },
    resetPassword: function (email) {
      return auth.sendPasswordResetEmail(String(email || '').trim()).then(function () {}, function (e) { throw friendlyAuthError(e); });
    },
    resendVerification: function () {
      if (!auth.currentUser) return Promise.reject(needLogin());
      return auth.currentUser.sendEmailVerification().then(function () {}, function (e) { throw friendlyAuthError(e); });
    },
    refresh: function () {
      if (!auth.currentUser) return Promise.resolve(snapshot());
      return auth.currentUser.reload()
        .then(function () { return auth.currentUser.getIdToken(true); })
        .then(function () { setUser(auth.currentUser); return snapshot(); }, function (e) { throw friendlyAuthError(e); });
    },
    signOut: function () { return auth.signOut(); },
    loadEmails: function () {
      return requireAllowed().then(function () { return db.collection('config').doc('emails').get(); }).then(function (snap) {
        var out = {}, d = snap.exists ? snap.data() : {};
        Object.keys(d).forEach(function (k) { if (d[k] && typeof d[k].v === 'string') out[k] = d[k].v; });
        return out;
      });
    },
    saveEmail: function (code, value) {
      return requireAllowed().then(function () {
        var patch = {}; patch[code] = { v: value, t: Date.now(), por: state.user.email };
        return db.collection('config').doc('emails').set(patch, { merge: true });
      });
    },
    addEnvio: function (data) {
      return requireAllowed().then(function () {
        var doc = Object.assign({}, data, { por: state.user.email, ts: Date.now(), enviadoEm: fb.firestore.FieldValue.serverTimestamp() });
        return db.collection('envios').add(doc).then(function (ref) { return Object.assign({}, doc, { id: ref.id, enviadoEm: undefined }); });
      });
    },
    listEnvios: function (opts) {
      opts = opts || {};
      return requireAllowed().then(function () {
        var since = Date.now() - (opts.sinceDays || 365) * 86400000;
        var q = db.collection('envios').where('ts', '>=', since).orderBy('ts', 'desc');
        if (opts.limit) q = q.limit(opts.limit);
        return q.get();
      }).catch(function (e) { throw e && e.code === 'permission-denied' ? friendlyAuthError(e) : e; }).then(function (snap) {
        var rows = [];
        snap.forEach(function (d) { var x = d.data(); x.id = d.id; delete x.enviadoEm; rows.push(x); });
        return rows;
      });
    },
    removeEnvio: function (id) {
      return requireAllowed().then(function () { return db.collection('envios').doc(id).delete(); })
        .then(function () {}, function (e) {
          throw makeError(e && e.code === 'permission-denied' ? 'Só é possível desfazer em até 15 minutos, e apenas o envio que você mesmo registrou.' : 'Não foi possível desfazer o envio.', 'undo');
        });
    }
  };

  /* ---------------- fachada ---------------- */
  var impl = fbApi;
  var api = {
    ALLOWED_DOMAINS: ALLOWED_DOMAINS, UNDO_MS: UNDO_MS,
    _loadScript: loadScript,
    domainOk: domainOk,
    friendlyAuthError: friendlyAuthError,
    getState: snapshot,
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    init: function (opts) {
      if (initPromise) return initPromise;
      var forceLocal = opts && opts.local;
      var hasCfg = !!(root.FIREBASE_CONFIG && root.FIREBASE_CONFIG.projectId);
      impl = forceLocal || !hasCfg ? localApi : fbApi;
      initPromise = impl.init();
      return initPromise;
    },
    signIn: function (e, p) { return impl.signIn(e, p); },
    signUp: function (e, p) { return impl.signUp(e, p); },
    resetPassword: function (e) { return impl.resetPassword(e); },
    resendVerification: function () { return impl.resendVerification(); },
    refresh: function () { return impl.refresh(); },
    signOut: function () { return impl.signOut(); },
    loadEmails: function () { return impl.loadEmails(); },
    saveEmail: function (c, v) { return impl.saveEmail(c, v); },
    addEnvio: function (d) { return impl.addEnvio(d); },
    listEnvios: function (o) { return impl.listEnvios(o); },
    removeEnvio: function (id) { return impl.removeEnvio(id); },
    _reset: function () { initPromise = null; listeners = []; state = { mode: 'firebase', ready: false, user: null, error: null, busy: false }; fb = auth = db = null; }
  };
  return api;
});
