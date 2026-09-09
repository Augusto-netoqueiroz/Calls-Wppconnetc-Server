(() => {
  const GLOBAL_NAME = '__wppCallLab';
  const ARM_CODE = 'LABORATORIO';

  if (window[GLOBAL_NAME]) {
    console.warn(`${GLOBAL_NAME} já existe. Use ${GLOBAL_NAME}.stop() antes de recarregar.`);
    return window[GLOBAL_NAME];
  }

  const timeline = [];
  const aliases = new Map();
  let aliasSequence = 0;
  let eventSequence = 0;
  let armed = false;
  let stopped = false;
  let lastActiveFingerprint = null;
  let wppHandler = null;

  const now = () => new Date().toISOString();
  const getStore = () => window.WPP?.whatsapp?.CallStore;
  const getActiveCall = () => getStore()?.activeCall || null;

  const aliasFor = call => {
    const id = call?.id;
    if (!id) return null;
    if (!aliases.has(id)) aliases.set(id, `call-${++aliasSequence}`);
    return aliases.get(id);
  };

  const readState = call => {
    try {
      return typeof call?.getState === 'function' ? call.getState() : call?.state ?? null;
    } catch (_) {
      return null;
    }
  };

  const sanitizeCall = call => ({
    alias: aliasFor(call),
    active: Boolean(call),
    state: readState(call),
    outgoing: call?.outgoing ?? null,
    isVideo: call?.isVideo ?? null,
    isGroup: call?.isGroup ?? null
  });

  const record = (type, details = {}) => {
    const entry = { at: now(), sequence: ++eventSequence, type, ...details };
    timeline.push(entry);
    console.log('[CALL LAB]', entry);
    return entry;
  };

  const requireArmed = () => {
    if (!armed) {
      throw new Error(`Ações bloqueadas. Em laboratório, execute ${GLOBAL_NAME}.arm('${ARM_CODE}').`);
    }
  };

  const capabilities = {
    wppOn: typeof window.WPP?.on === 'function',
    wppOff: typeof window.WPP?.off === 'function',
    wapiIncoming: typeof window.WAPI?.onIncomingCall === 'function',
    callStore: Boolean(getStore()),
    offer: typeof window.WPP?.call?.offer === 'function',
    accept: typeof window.WPP?.call?.accept === 'function',
    reject: typeof window.WPP?.call?.reject === 'function',
    end: typeof window.WPP?.call?.end === 'function'
  };

  record('CAPABILITIES', capabilities);

  if (capabilities.wppOn) {
    wppHandler = call => record('INCOMING_EVENT', {
      source: 'wpp.incoming_call',
      call: sanitizeCall(call)
    });
    window.WPP.on('call.incoming_call', wppHandler);
  }

  if (capabilities.wapiIncoming) {
    window.WAPI.onIncomingCall(call => {
      if (stopped) return;
      record('INCOMING_EVENT', {
        source: 'wapi.onIncomingCall',
        call: sanitizeCall(call)
      });
    });
  }

  const timer = setInterval(() => {
    if (stopped) return;
    const call = getActiveCall();
    const sanitized = sanitizeCall(call);
    const fingerprint = JSON.stringify(sanitized);
    if (fingerprint === lastActiveFingerprint) return;
    lastActiveFingerprint = fingerprint;
    record('ACTIVE_CALL', { source: 'activeCall', call: sanitized });
  }, 250);

  const runAction = async (action, fn) => {
    requireArmed();
    const before = sanitizeCall(getActiveCall());
    const startedAt = performance.now();
    try {
      const result = await fn();
      record('ACTION_RESULT', {
        action,
        ok: true,
        durationMs: Math.round(performance.now() - startedAt),
        returnType: typeof result,
        before,
        after: sanitizeCall(getActiveCall())
      });
      return result;
    } catch (error) {
      record('ACTION_RESULT', {
        action,
        ok: false,
        durationMs: Math.round(performance.now() - startedAt),
        errorName: error?.name || 'Error',
        errorCode: error?.code || null,
        before,
        after: sanitizeCall(getActiveCall())
      });
      throw error;
    }
  };

  const api = {
    arm(code) {
      armed = code === ARM_CODE;
      record('ARM', { armed });
      return armed;
    },
    disarm() {
      armed = false;
      record('ARM', { armed: false });
    },
    offer(to, options = {}) {
      if (typeof to !== 'string' || !to.endsWith('@c.us')) {
        throw new TypeError('Informe um contato de laboratório no formato NUMERO@c.us.');
      }
      return runAction('offer', () => window.WPP.call.offer(to, {
        isVideo: options.isVideo === true
      }));
    },
    accept() {
      const call = getActiveCall();
      if (!call) throw new Error('Nenhuma chamada ativa para aceitar.');
      return runAction('accept', () => window.WPP.call.accept(call.id));
    },
    reject() {
      const call = getActiveCall();
      if (!call) throw new Error('Nenhuma chamada ativa para rejeitar.');
      return runAction('reject', () => window.WPP.call.reject(call.id));
    },
    end() {
      if (!getActiveCall()) throw new Error('Nenhuma chamada ativa para encerrar.');
      return runAction('end', () => window.WPP.call.end());
    },
    snapshot() {
      return JSON.parse(JSON.stringify(timeline));
    },
    exportJson() {
      return JSON.stringify({
        schemaVersion: 1,
        exportedAt: now(),
        capabilities,
        timeline
      }, null, 2);
    },
    stop() {
      armed = false;
      stopped = true;
      clearInterval(timer);
      if (wppHandler && capabilities.wppOff) {
        window.WPP.off('call.incoming_call', wppHandler);
      }
      delete window[GLOBAL_NAME];
      console.log('[CALL LAB] observador encerrado');
    }
  };

  window[GLOBAL_NAME] = api;
  console.log(`Laboratório carregado em modo somente leitura. Use ${GLOBAL_NAME}.arm('${ARM_CODE}') apenas na conta de teste.`);
  return api;
})();
