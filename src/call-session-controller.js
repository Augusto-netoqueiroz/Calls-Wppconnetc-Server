'use strict';

const { EventEmitter } = require('node:events');
const { CallOrchestrator } = require('./call-orchestrator');
const { STATES } = require('./call-state-machine');

const STOPPABLE_STATES = new Set([STATES.IDLE, STATES.ENDED, STATES.FAILED]);

class CallSessionController extends EventEmitter {
  constructor({ whatsapp, sip, media, sipUri, timeoutMs = 60000 } = {}) {
    super();
    requireEmitter('whatsapp', whatsapp);
    requireEmitter('sip', sip);
    requireEmitter('media', media);
    requireMethods('whatsapp', whatsapp, ['start', 'stop', 'offer', 'accept', 'reject', 'end']);
    requireMethods('sip', sip, ['connect', 'disconnect', 'dial', 'accept', 'hangup']);
    requireMethods('media', media, ['start', 'stop']);
    validateSipUri(sipUri);

    this.whatsapp = whatsapp;
    this.sip = sip;
    this.media = media;
    this.sipUri = sipUri;
    this.orchestrator = new CallOrchestrator({ whatsapp, sip, media, timeoutMs });
    this.started = false;
    this.callStarted = false;
    this.queue = Promise.resolve();
    this.listeners = [];
    this.forwardOrchestratorEvents();
  }

  async start() {
    if (this.started) return { started: true };
    this.attachAdapterEvents();
    try {
      await this.sip.connect();
      const whatsappResult = await this.whatsapp.start();
      this.started = true;
      return {
        started: true,
        whatsappIncomingEvent: whatsappResult?.incomingEvent === true
      };
    } catch (error) {
      this.detachAdapterEvents();
      this.sip.disconnect();
      throw error;
    }
  }

  async stop() {
    if (!this.started) return { stopped: true };
    if (!STOPPABLE_STATES.has(this.orchestrator.snapshot().state)) {
      const error = new Error('Existe uma chamada em andamento.');
      error.code = 'CALL_SESSION_ACTIVE';
      throw error;
    }
    this.detachAdapterEvents();
    await this.whatsapp.stop();
    this.sip.disconnect();
    this.started = false;
    return { stopped: true };
  }

  startSipIncoming({ whatsappTarget } = {}) {
    this.requireStarted();
    return this.beginCall('sip_incoming', () => (
      this.orchestrator.startSipIncoming({ whatsappTarget })
    ));
  }

  snapshot() {
    return {
      started: this.started,
      call: this.orchestrator.snapshot()
    };
  }

  whenIdle() {
    return this.queue.then(() => this.orchestrator.whenIdle());
  }

  attachAdapterEvents() {
    this.listen(this.whatsapp, 'incoming', () => {
      this.beginCall('whatsapp_incoming', () => (
        this.orchestrator.startWhatsAppIncoming({ sipUri: this.sipUri })
      )).catch(() => undefined);
    });
    this.listen(this.whatsapp, 'state', event => {
      this.submit('whatsapp_state', () => (
        this.orchestrator.onWhatsAppState(event?.state)
      )).catch(() => undefined);
    });
    this.listen(this.whatsapp, 'adapterFailure', event => {
      this.emitFailure('whatsapp_adapter', event?.code);
    });
    this.listen(this.sip, 'baresipEvent', event => this.handleSipEvent(event));
    this.listen(this.sip, 'disconnected', () => {
      if (!this.callStarted) return;
      this.submit('sip_disconnected', () => (
        this.orchestrator.onSipEvent('CALL_FAILED')
      )).catch(() => undefined);
    });
    this.listen(this.sip, 'transportError', event => {
      this.emitFailure('sip_transport', event?.code);
    });
    this.listen(this.sip, 'protocolError', event => {
      this.emitFailure('sip_protocol', event?.code);
    });
    this.listen(this.media, 'started', () => {
      this.submit('media_started', () => this.orchestrator.onMediaStarted())
        .catch(() => undefined);
    });
    this.listen(this.media, 'stopped', () => {
      this.submit('media_stopped', () => this.orchestrator.onMediaStopped())
        .catch(() => undefined);
    });
    this.listen(this.media, 'failure', event => {
      this.emitFailure('media_adapter', event?.code);
      this.submit('media_failed', () => this.orchestrator.onMediaFailed())
        .catch(() => undefined);
    });
  }

  handleSipEvent(event) {
    if (event?.type === 'CALL_INCOMING' && !this.callStarted) {
      this.emit('sipIncoming', { direction: 'incoming' });
      return;
    }
    if (!this.callStarted) return;
    this.submit('sip_event', () => this.orchestrator.onSipEvent(event))
      .catch(() => undefined);
  }

  beginCall(source, operation) {
    if (this.callStarted) {
      const error = new Error('A sessão já possui uma chamada.');
      error.code = 'CALL_ALREADY_STARTED';
      return Promise.reject(error);
    }
    this.callStarted = true;
    return this.submit(source, operation).catch(error => {
      if (this.orchestrator.snapshot().state === STATES.IDLE) this.callStarted = false;
      throw error;
    });
  }

  submit(source, operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(error => {
      this.emitFailure(source, error?.code);
    });
    return result;
  }

  listen(emitter, event, handler) {
    emitter.on(event, handler);
    this.listeners.push({ emitter, event, handler });
  }

  detachAdapterEvents() {
    for (const { emitter, event, handler } of this.listeners) {
      emitter.off(event, handler);
    }
    this.listeners = [];
  }

  forwardOrchestratorEvents() {
    for (const event of ['transition', 'action', 'actionFailure']) {
      this.orchestrator.on(event, value => this.emit(event, value));
    }
  }

  emitFailure(source, code) {
    this.emit('controllerFailure', {
      source,
      code: sanitizeCode(code)
    });
  }

  requireStarted() {
    if (!this.started) {
      const error = new Error('Controlador de sessão não iniciado.');
      error.code = 'CALL_SESSION_NOT_STARTED';
      throw error;
    }
  }
}

function requireEmitter(name, value) {
  requireMethods(name, value, ['on', 'off']);
}

function requireMethods(name, value, methods) {
  if (!value || methods.some(method => typeof value[method] !== 'function')) {
    throw new TypeError(`Adaptador ${name} inválido.`);
  }
}

function validateSipUri(uri) {
  if (typeof uri !== 'string' || !/^sips?:[^\s]+$/i.test(uri) || uri.length > 512) {
    throw new TypeError('URI SIP inválida.');
  }
}

function sanitizeCode(code) {
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
    ? code
    : 'CALL_CONTROLLER_FAILED';
}

module.exports = { CallSessionController };
