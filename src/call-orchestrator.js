'use strict';

const { EventEmitter } = require('node:events');
const {
  ACTIONS,
  EVENTS,
  STATES,
  CallStateMachine
} = require('./call-state-machine');

const TERMINAL_STATES = new Set([STATES.ENDED, STATES.FAILED]);
const WHATSAPP_TARGET_PATTERN = /^\d{5,20}@c\.us$/;
const SIP_URI_PATTERN = /^sips?:[^\s]+$/i;

class CallOrchestrator extends EventEmitter {
  constructor({
    whatsapp,
    sip,
    media,
    timeoutMs = 60000,
    timers = { setTimeout, clearTimeout }
  } = {}) {
    super();
    requireMethods('whatsapp', whatsapp, ['offer', 'accept', 'reject', 'end']);
    requireMethods('sip', sip, ['dial', 'accept', 'hangup']);
    requireMethods('media', media, ['start', 'stop']);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100) {
      throw new TypeError('Timeout da chamada inválido.');
    }
    requireMethods('timers', timers, ['setTimeout', 'clearTimeout']);

    this.whatsapp = whatsapp;
    this.sip = sip;
    this.media = media;
    this.timeoutMs = timeoutMs;
    this.timers = timers;
    this.machine = new CallStateMachine();
    this.queue = Promise.resolve();
    this.timeoutHandle = null;
    this.sipUri = null;
    this.whatsappTarget = null;
  }

  startWhatsAppIncoming({ sipUri } = {}) {
    validateSipUri(sipUri);
    return this.enqueue(async () => {
      this.requireIdle();
      this.sipUri = sipUri;
      this.armTimeout();
      return this.process(EVENTS.WHATSAPP_INCOMING);
    });
  }

  startSipIncoming({ whatsappTarget } = {}) {
    validateWhatsappTarget(whatsappTarget);
    return this.enqueue(async () => {
      this.requireIdle();
      this.whatsappTarget = whatsappTarget;
      this.armTimeout();
      return this.process(EVENTS.SIP_INCOMING);
    });
  }

  onWhatsAppState(state) {
    const event = {
      ringing: EVENTS.WHATSAPP_RINGING,
      active: EVENTS.WHATSAPP_ACTIVE,
      ended: EVENTS.WHATSAPP_ENDED,
      failed: EVENTS.WHATSAPP_FAILED
    }[state];
    if (!event) return Promise.reject(new TypeError('Estado WhatsApp desconhecido.'));
    return this.handleEvent(event);
  }

  onSipEvent(event) {
    const type = typeof event === 'string' ? event : event?.type;
    const mapped = {
      CALL_ESTABLISHED: EVENTS.SIP_ESTABLISHED,
      CALL_CLOSED: EVENTS.SIP_CLOSED,
      CALL_FAILED: EVENTS.SIP_FAILED
    }[type];
    if (!mapped) return Promise.reject(new TypeError('Evento SIP desconhecido.'));
    return this.handleEvent(mapped);
  }

  onMediaStarted() {
    return this.handleEvent(EVENTS.MEDIA_STARTED);
  }

  onMediaStopped() {
    return this.handleEvent(EVENTS.MEDIA_STOPPED);
  }

  onMediaFailed() {
    return this.handleEvent(EVENTS.MEDIA_FAILED);
  }

  handleEvent(event) {
    return this.enqueue(() => this.process(event));
  }

  whenIdle() {
    return this.queue;
  }

  snapshot() {
    return this.machine.snapshot();
  }

  enqueue(operation) {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  async process(event) {
    const transition = this.machine.dispatch(event);
    this.emit('transition', cloneTransition(transition));

    for (const action of transition.actions) {
      try {
        await this.execute(action);
        this.emit('action', { action, ok: true });
      } catch (error) {
        await this.handleActionFailure(action, error);
        throw error;
      }
    }

    if (transition.state === STATES.ACTIVE || TERMINAL_STATES.has(transition.state)) {
      this.clearTimeout();
    }
    return cloneTransition(transition);
  }

  async execute(action) {
    switch (action) {
      case ACTIONS.DIAL_SIP:
        return this.sip.dial(this.sipUri);
      case ACTIONS.OFFER_WHATSAPP:
        return this.whatsapp.offer(this.whatsappTarget);
      case ACTIONS.ACCEPT_WHATSAPP:
        return this.whatsapp.accept();
      case ACTIONS.ACCEPT_SIP:
        return this.sip.accept();
      case ACTIONS.START_MEDIA:
        return this.media.start();
      case ACTIONS.STOP_MEDIA:
        return this.media.stop();
      case ACTIONS.END_WHATSAPP:
        return this.whatsapp.end();
      case ACTIONS.REJECT_WHATSAPP:
        return this.whatsapp.reject();
      case ACTIONS.HANGUP_SIP:
      case ACTIONS.REJECT_SIP:
        return this.sip.hangup();
      default:
        throw new TypeError('Ação de chamada desconhecida.');
    }
  }

  async handleActionFailure(action, error) {
    this.emit('actionFailure', {
      action,
      code: sanitizeErrorCode(error?.code)
    });

    const failureEvent = failureEventFor(action);
    const transition = this.machine.dispatch(failureEvent);
    this.emit('transition', cloneTransition(transition));
    this.clearTimeout();

    for (const cleanupAction of transition.actions) {
      try {
        await this.execute(cleanupAction);
        this.emit('action', { action: cleanupAction, ok: true });
      } catch (cleanupError) {
        this.emit('actionFailure', {
          action: cleanupAction,
          code: sanitizeErrorCode(cleanupError?.code)
        });
      }
    }
  }

  armTimeout() {
    this.clearTimeout();
    this.timeoutHandle = this.timers.setTimeout(() => {
      this.handleEvent(EVENTS.TIMEOUT).catch(() => undefined);
    }, this.timeoutMs);
    this.timeoutHandle?.unref?.();
  }

  clearTimeout() {
    if (this.timeoutHandle === null) return;
    this.timers.clearTimeout(this.timeoutHandle);
    this.timeoutHandle = null;
  }

  requireIdle() {
    if (this.machine.state !== STATES.IDLE) {
      const error = new Error('O orquestrador já possui uma chamada.');
      error.code = 'CALL_ALREADY_STARTED';
      throw error;
    }
  }
}

function failureEventFor(action) {
  if ([
    ACTIONS.OFFER_WHATSAPP,
    ACTIONS.ACCEPT_WHATSAPP,
    ACTIONS.END_WHATSAPP,
    ACTIONS.REJECT_WHATSAPP
  ].includes(action)) return EVENTS.WHATSAPP_FAILED;
  if ([
    ACTIONS.DIAL_SIP,
    ACTIONS.ACCEPT_SIP,
    ACTIONS.HANGUP_SIP,
    ACTIONS.REJECT_SIP
  ].includes(action)) return EVENTS.SIP_FAILED;
  return EVENTS.MEDIA_FAILED;
}

function requireMethods(name, value, methods) {
  if (!value || methods.some(method => typeof value[method] !== 'function')) {
    throw new TypeError(`Adaptador ${name} inválido.`);
  }
}

function validateSipUri(uri) {
  if (typeof uri !== 'string' || !SIP_URI_PATTERN.test(uri) || uri.length > 512) {
    throw new TypeError('URI SIP inválida.');
  }
}

function validateWhatsappTarget(target) {
  if (typeof target !== 'string' || !WHATSAPP_TARGET_PATTERN.test(target)) {
    throw new TypeError('Destino WhatsApp inválido.');
  }
}

function sanitizeErrorCode(code) {
  return typeof code === 'string' && /^[A-Z0-9_]{1,64}$/.test(code)
    ? code
    : 'ADAPTER_ACTION_FAILED';
}

function cloneTransition(transition) {
  return { ...transition, actions: [...transition.actions] };
}

module.exports = { CallOrchestrator };
