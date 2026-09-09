'use strict';

const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

const TARGET_PATTERN = /^\d{5,20}@c\.us$/;
const TEXT_STATES = new Set([
  'INCOMING_RING',
  'OUTGOING_RING',
  'OUTGOING_CALLING',
  'CONNECTING',
  'CONNECTION_LOST',
  'ACTIVE',
  'HANDLED_REMOTELY',
  'ENDED',
  'REJECTED',
  'REMOTE_CALL_IN_PROGRESS',
  'FAILED',
  'NOT_ANSWERED'
]);
const RINGING_STATES = new Set([
  'INCOMING_RING',
  'OUTGOING_RING',
  'OUTGOING_CALLING',
  1,
  2,
  3,
  8,
  12,
  14
]);
const ACTIVE_STATES = new Set(['ACTIVE', 6]);
const FAILED_STATES = new Set(['CONNECTION_LOST', 'FAILED']);
const ENDED_STATES = new Set([
  'HANDLED_REMOTELY',
  'ENDED',
  'REJECTED',
  'NOT_ANSWERED',
  'REMOTE_CALL_IN_PROGRESS',
  0,
  7,
  13
]);

class WhatsappCallAdapterError extends Error {
  constructor(code) {
    super('A operação de chamada do WhatsApp falhou.');
    this.name = 'WhatsappCallAdapterError';
    this.code = sanitizeCode(code);
  }
}

class WhatsappCallAdapter extends EventEmitter {
  constructor({
    page,
    pollIntervalMs = 250,
    timers = { setInterval, clearInterval }
  } = {}) {
    super();
    if (!page || typeof page.evaluate !== 'function') {
      throw new TypeError('Página Puppeteer inválida.');
    }
    if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 50) {
      throw new TypeError('Intervalo de observação inválido.');
    }
    requireMethods('timers', timers, ['setInterval', 'clearInterval']);

    this.page = page;
    this.pollIntervalMs = pollIntervalMs;
    this.timers = timers;
    this.bindingName = `__callsWppBridge_${randomUUID().replaceAll('-', '')}`;
    this.intervalHandle = null;
    this.started = false;
    this.polling = false;
    this.lastFingerprint = null;
    this.lastMappedState = null;
    this.hadActiveCall = false;
    this.incomingEmitted = false;
  }

  async start() {
    if (this.started) return { started: true };
    if (typeof this.page.exposeFunction !== 'function') {
      throw new TypeError('Página Puppeteer sem exposeFunction.');
    }

    await this.page.exposeFunction(this.bindingName, observation => {
      this.handleObservation(observation, 'wpp_event');
    });

    try {
      const result = await this.request('subscribe', { bindingName: this.bindingName });
      this.started = true;
      await this.observe();
      this.intervalHandle = this.timers.setInterval(() => {
        this.observe().catch(error => this.emitFailure('poll', error));
      }, this.pollIntervalMs);
      this.intervalHandle?.unref?.();
      return { started: true, incomingEvent: result.incomingEvent === true };
    } catch (error) {
      await this.removeBinding();
      throw error;
    }
  }

  async stop() {
    if (this.intervalHandle !== null) {
      this.timers.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    if (this.started) {
      try {
        await this.request('unsubscribe', { bindingName: this.bindingName });
      } catch (error) {
        this.emitFailure('unsubscribe', error);
      }
    }
    await this.removeBinding();
    this.started = false;
  }

  async offer(target) {
    validateTarget(target);
    await this.request('offer', { target });
    return true;
  }

  async accept() {
    await this.request('accept');
    return true;
  }

  async reject() {
    await this.request('reject');
    return true;
  }

  async end() {
    await this.request('end');
    return true;
  }

  async observe() {
    if (this.polling) return null;
    this.polling = true;
    try {
      const result = await this.request('observe');
      return this.handleObservation(result.observation, 'active_call');
    } finally {
      this.polling = false;
    }
  }

  async request(operation, details = {}) {
    let result;
    try {
      result = await this.page.evaluate(browserCallOperation, { operation, ...details });
    } catch (_) {
      throw new WhatsappCallAdapterError('WHATSAPP_PAGE_EVALUATION_FAILED');
    }
    if (!result || result.ok !== true) {
      throw new WhatsappCallAdapterError(result?.code);
    }
    return result;
  }

  handleObservation(value, source) {
    const observation = sanitizeObservation(value);
    const fingerprint = JSON.stringify(observation);
    if (fingerprint !== this.lastFingerprint) {
      this.lastFingerprint = fingerprint;
      this.emit('observation', { source, ...observation });
    }

    if (observation.active) {
      this.hadActiveCall = true;
      if (observation.outgoing === false && !this.incomingEmitted) {
        this.incomingEmitted = true;
        this.emit('incoming', {
          source,
          isVideo: observation.isVideo,
          isGroup: observation.isGroup
        });
      }
    }

    const mappedState = classifyState(observation, this.hadActiveCall);
    if (mappedState && mappedState !== this.lastMappedState) {
      this.lastMappedState = mappedState;
      this.emit('state', { source, state: mappedState });
    }

    if (!observation.active && this.hadActiveCall) {
      this.hadActiveCall = false;
      this.incomingEmitted = false;
    }
    return observation;
  }

  emitFailure(operation, error) {
    this.emit('adapterFailure', {
      operation,
      code: sanitizeCode(error?.code)
    });
  }

  async removeBinding() {
    if (typeof this.page.removeExposedFunction !== 'function') return;
    try {
      await this.page.removeExposedFunction(this.bindingName);
    } catch (_) {}
  }
}

async function browserCallOperation(request) {
  const sanitizeState = state => {
    if (typeof state === 'number' && Number.isInteger(state) && state >= 0 && state <= 99) {
      return state;
    }
    if (typeof state === 'string' && /^[A-Z0-9_]{1,64}$/.test(state)) return state;
    return null;
  };
  const observation = call => {
    if (!call) {
      return { active: false, state: null, outgoing: null, isVideo: null, isGroup: null };
    }
    let state = null;
    try {
      state = typeof call.getState === 'function' ? call.getState() : call.state;
    } catch (_) {}
    return {
      active: true,
      state: sanitizeState(state),
      outgoing: typeof call.outgoing === 'boolean' ? call.outgoing : null,
      isVideo: typeof call.isVideo === 'boolean' ? call.isVideo : null,
      isGroup: typeof call.isGroup === 'boolean' ? call.isGroup : null
    };
  };
  const failure = (code, error) => {
    const source = typeof error?.code === 'string' ? error.code : code;
    const normalized = String(source || code)
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .slice(0, 64);
    return { ok: false, code: normalized || code };
  };

  try {
    const wpp = window.WPP;
    const store = wpp?.whatsapp?.CallStore;
    const activeCall = store?.activeCall || null;
    const registryName = '__callsWppconnectServerBindings';

    if (request.operation === 'observe') {
      return { ok: true, observation: observation(activeCall) };
    }
    if (request.operation === 'subscribe') {
      if (typeof wpp?.on !== 'function' || typeof window[request.bindingName] !== 'function') {
        return { ok: true, incomingEvent: false };
      }
      window[registryName] ||= {};
      const handler = call => {
        const value = observation(call);
        value.outgoing = false;
        window[request.bindingName](value);
      };
      window[registryName][request.bindingName] = handler;
      wpp.on('call.incoming_call', handler);
      return { ok: true, incomingEvent: true };
    }
    if (request.operation === 'unsubscribe') {
      const handler = window[registryName]?.[request.bindingName];
      if (handler && typeof wpp?.off === 'function') {
        wpp.off('call.incoming_call', handler);
      }
      if (window[registryName]) delete window[registryName][request.bindingName];
      return { ok: true };
    }
    if (!wpp?.call) return failure('WPP_CALL_API_UNAVAILABLE');
    if (request.operation === 'offer') {
      if (activeCall) return failure('WPP_CALL_ALREADY_ACTIVE');
      if (typeof wpp.call.offer !== 'function') return failure('WPP_CALL_OFFER_UNAVAILABLE');
      await wpp.call.offer(request.target, { isVideo: false });
      return { ok: true };
    }
    if (request.operation === 'accept') {
      if (!activeCall) return failure('WPP_CALL_NOT_FOUND');
      if (typeof wpp.call.accept !== 'function') return failure('WPP_CALL_ACCEPT_UNAVAILABLE');
      await wpp.call.accept(activeCall.id);
      return { ok: true };
    }
    if (request.operation === 'reject') {
      if (!activeCall) return { ok: true, noop: true };
      if (typeof wpp.call.reject !== 'function') return failure('WPP_CALL_REJECT_UNAVAILABLE');
      await wpp.call.reject(activeCall.id);
      return { ok: true };
    }
    if (request.operation === 'end') {
      if (!activeCall) return { ok: true, noop: true };
      if (typeof wpp.call.end !== 'function') return failure('WPP_CALL_END_UNAVAILABLE');
      await wpp.call.end();
      return { ok: true };
    }
    return failure('WPP_CALL_OPERATION_UNKNOWN');
  } catch (error) {
    return failure('WPP_CALL_OPERATION_FAILED', error);
  }
}

function sanitizeObservation(value) {
  const state = typeof value?.state === 'number' && Number.isInteger(value.state) && value.state >= 0 && value.state <= 99
    ? value.state
    : typeof value?.state === 'string' && TEXT_STATES.has(value.state)
      ? value.state
      : null;
  return {
    active: value?.active === true,
    state,
    outgoing: typeof value?.outgoing === 'boolean' ? value.outgoing : null,
    isVideo: typeof value?.isVideo === 'boolean' ? value.isVideo : null,
    isGroup: typeof value?.isGroup === 'boolean' ? value.isGroup : null
  };
}

function classifyState(observation, hadActiveCall) {
  if (!observation.active) return hadActiveCall ? 'ended' : null;
  if (RINGING_STATES.has(observation.state)) return 'ringing';
  if (ACTIVE_STATES.has(observation.state)) return 'active';
  if (FAILED_STATES.has(observation.state)) return 'failed';
  if (ENDED_STATES.has(observation.state)) return 'ended';
  return null;
}

function validateTarget(target) {
  if (typeof target !== 'string' || !TARGET_PATTERN.test(target)) {
    throw new TypeError('Destino WhatsApp inválido.');
  }
}

function sanitizeCode(code) {
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
    ? code
    : 'WHATSAPP_CALL_FAILED';
}

function requireMethods(name, value, methods) {
  if (!value || methods.some(method => typeof value[method] !== 'function')) {
    throw new TypeError(`Adaptador ${name} inválido.`);
  }
}

module.exports = {
  WhatsappCallAdapter,
  WhatsappCallAdapterError,
  browserCallOperation
};
