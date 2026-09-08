(() => {
  if (window.__wppCallObserver) {
    console.warn('Observador já está ativo. Execute window.__wppCallObserver.stop().');
    return window.__wppCallObserver;
  }

  const timeline = [];
  let lastFingerprint = null;
  let sequence = 0;
  let unsubscribe = null;

  const getStore = () =>
    window.WPP &&
    window.WPP.whatsapp &&
    window.WPP.whatsapp.CallStore;

  const sanitize = (call, source) => {
    if (!call) {
      return {
        at: new Date().toISOString(),
        source,
        sequence: ++sequence,
        active: false
      };
    }

    let state = null;
    try {
      state = typeof call.getState === 'function'
        ? call.getState()
        : call.state ?? null;
    } catch (_) {}

    return {
      at: new Date().toISOString(),
      source,
      sequence: ++sequence,
      active: true,
      state,
      outgoing: call.outgoing ?? null,
      isVideo: call.isVideo ?? null,
      isGroup: call.isGroup ?? null
    };
  };

  const record = (call, source) => {
    const entry = sanitize(call, source);
    const fingerprint = JSON.stringify({
      active: entry.active,
      state: entry.state,
      outgoing: entry.outgoing,
      isVideo: entry.isVideo,
      isGroup: entry.isGroup
    });

    if (fingerprint === lastFingerprint && source === 'poll') return;
    lastFingerprint = fingerprint;
    timeline.push(entry);
    console.log('[WPP CALL OBSERVER]', entry);
  };

  const timer = setInterval(() => {
    const store = getStore();
    record(store && store.activeCall, 'poll');
  }, 250);

  if (window.WPP && typeof window.WPP.on === 'function') {
    const handler = call => record(call, 'call.incoming_call');
    const result = window.WPP.on('call.incoming_call', handler);

    if (result && typeof result.dispose === 'function') {
      unsubscribe = () => result.dispose();
    } else if (typeof window.WPP.off === 'function') {
      unsubscribe = () => window.WPP.off('call.incoming_call', handler);
    }
  }

  window.__wppCallObserver = {
    timeline,
    snapshot() {
      return JSON.parse(JSON.stringify(timeline));
    },
    stop() {
      clearInterval(timer);
      if (unsubscribe) unsubscribe();
      delete window.__wppCallObserver;
      console.log('[WPP CALL OBSERVER] encerrado');
    }
  };

  console.log('Observador somente leitura iniciado.');
  console.log('Use __wppCallObserver.snapshot() e __wppCallObserver.stop().');
  return window.__wppCallObserver;
})();
