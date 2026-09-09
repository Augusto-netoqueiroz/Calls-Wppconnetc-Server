'use strict';

const STATES = Object.freeze({
  IDLE: 'idle',
  OFFERING: 'offering',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  ACTIVE: 'active',
  ENDING: 'ending',
  ENDED: 'ended',
  FAILED: 'failed'
});

const EVENTS = Object.freeze({
  WHATSAPP_INCOMING: 'whatsapp_incoming',
  SIP_INCOMING: 'sip_incoming',
  WHATSAPP_RINGING: 'whatsapp_ringing',
  WHATSAPP_ACTIVE: 'whatsapp_active',
  SIP_ESTABLISHED: 'sip_established',
  MEDIA_STARTED: 'media_started',
  WHATSAPP_ENDED: 'whatsapp_ended',
  SIP_CLOSED: 'sip_closed',
  MEDIA_STOPPED: 'media_stopped',
  WHATSAPP_FAILED: 'whatsapp_failed',
  SIP_FAILED: 'sip_failed',
  TIMEOUT: 'timeout'
});

const ACTIONS = Object.freeze({
  DIAL_SIP: 'dial_sip',
  OFFER_WHATSAPP: 'offer_whatsapp',
  ACCEPT_WHATSAPP: 'accept_whatsapp',
  ACCEPT_SIP: 'accept_sip',
  START_MEDIA: 'start_media',
  STOP_MEDIA: 'stop_media',
  END_WHATSAPP: 'end_whatsapp',
  REJECT_WHATSAPP: 'reject_whatsapp',
  HANGUP_SIP: 'hangup_sip',
  REJECT_SIP: 'reject_sip'
});

const KNOWN_EVENTS = new Set(Object.values(EVENTS));
const TERMINAL_STATES = new Set([STATES.ENDED, STATES.FAILED]);

class CallTransitionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CallTransitionError';
    this.code = 'INVALID_CALL_TRANSITION';
  }
}

class CallStateMachine {
  constructor() {
    this.state = STATES.IDLE;
    this.mode = null;
    this.whatsapp = 'none';
    this.sip = 'none';
    this.media = 'stopped';
    this.terminalReason = null;
    this.requestedActions = new Set();
    this.sequence = 0;
    this.history = [];
  }

  dispatch(event) {
    if (!KNOWN_EVENTS.has(event)) throw new TypeError(`Evento desconhecido: ${event}.`);

    const previousState = this.state;
    const actions = [];
    let ignored = false;

    if (TERMINAL_STATES.has(this.state)) {
      ignored = true;
    } else if (event === EVENTS.WHATSAPP_INCOMING) {
      this.requireIdle(event);
      this.mode = 'whatsapp_inbound';
      this.whatsapp = 'ringing';
      this.state = STATES.RINGING;
      this.request(ACTIONS.DIAL_SIP, actions);
    } else if (event === EVENTS.SIP_INCOMING) {
      this.requireIdle(event);
      this.mode = 'sip_inbound';
      this.sip = 'ringing';
      this.state = STATES.OFFERING;
      this.request(ACTIONS.OFFER_WHATSAPP, actions);
    } else if (event === EVENTS.WHATSAPP_RINGING) {
      if (this.mode !== 'sip_inbound' || this.whatsapp !== 'none') ignored = true;
      else {
        this.whatsapp = 'ringing';
        this.state = STATES.RINGING;
      }
    } else if (event === EVENTS.WHATSAPP_ACTIVE) {
      if (!this.mode || this.whatsapp === 'ended') ignored = true;
      else {
        this.whatsapp = 'active';
        this.state = STATES.CONNECTING;
        if (this.mode === 'sip_inbound' && this.sip === 'ringing') {
          this.request(ACTIONS.ACCEPT_SIP, actions);
        } else if (this.sip === 'active') {
          this.request(ACTIONS.START_MEDIA, actions);
        }
      }
    } else if (event === EVENTS.SIP_ESTABLISHED) {
      if (!this.mode || this.sip === 'ended') ignored = true;
      else {
        this.sip = 'active';
        this.state = STATES.CONNECTING;
        if (this.mode === 'whatsapp_inbound' && this.whatsapp === 'ringing') {
          this.request(ACTIONS.ACCEPT_WHATSAPP, actions);
        } else if (this.whatsapp === 'active') {
          this.request(ACTIONS.START_MEDIA, actions);
        }
      }
    } else if (event === EVENTS.MEDIA_STARTED) {
      if (this.whatsapp !== 'active' || this.sip !== 'active') {
        throw new CallTransitionError('A mídia exige WhatsApp e SIP ativos.');
      }
      this.media = 'active';
      this.state = STATES.ACTIVE;
    } else if (event === EVENTS.WHATSAPP_ENDED) {
      this.whatsapp = 'ended';
      this.terminalReason = this.terminalReason || 'whatsapp_ended';
      this.requestCleanup(actions);
      this.finishIfClean();
    } else if (event === EVENTS.SIP_CLOSED) {
      this.sip = 'ended';
      this.terminalReason = this.terminalReason || 'sip_closed';
      this.requestCleanup(actions);
      this.finishIfClean();
    } else if (event === EVENTS.MEDIA_STOPPED) {
      this.media = 'stopped';
      if (this.state === STATES.ENDING) this.finishIfClean();
      else ignored = true;
    } else if (event === EVENTS.WHATSAPP_FAILED) {
      this.whatsapp = 'ended';
      this.fail('whatsapp_failed', actions);
    } else if (event === EVENTS.SIP_FAILED) {
      this.sip = 'ended';
      this.fail('sip_failed', actions);
    } else if (event === EVENTS.TIMEOUT) {
      this.fail('timeout', actions);
    }

    const transition = {
      sequence: ++this.sequence,
      event,
      previousState,
      state: this.state,
      actions,
      ignored
    };
    this.history.push(transition);
    return { ...transition, actions: [...actions] };
  }

  requestCleanup(actions) {
    this.state = STATES.ENDING;
    if (this.media === 'active') this.request(ACTIONS.STOP_MEDIA, actions);
    if (this.whatsapp !== 'none' && this.whatsapp !== 'ended') {
      this.request(ACTIONS.END_WHATSAPP, actions);
    }
    if (this.sip !== 'none' && this.sip !== 'ended') {
      this.request(ACTIONS.HANGUP_SIP, actions);
    }
  }

  fail(reason, actions) {
    this.terminalReason = reason;
    if (this.media === 'active') this.request(ACTIONS.STOP_MEDIA, actions);
    if (this.whatsapp === 'ringing') this.request(ACTIONS.REJECT_WHATSAPP, actions);
    else if (this.whatsapp === 'active') this.request(ACTIONS.END_WHATSAPP, actions);
    if (this.sip === 'ringing') this.request(ACTIONS.REJECT_SIP, actions);
    else if (this.sip === 'active') this.request(ACTIONS.HANGUP_SIP, actions);
    this.state = STATES.FAILED;
  }

  finishIfClean() {
    const whatsappFinished = this.whatsapp === 'none' || this.whatsapp === 'ended';
    const sipFinished = this.sip === 'none' || this.sip === 'ended';
    if (whatsappFinished && sipFinished && this.media === 'stopped') {
      this.state = STATES.ENDED;
    }
  }

  request(action, actions) {
    if (this.requestedActions.has(action)) return;
    this.requestedActions.add(action);
    actions.push(action);
  }

  requireIdle(event) {
    if (this.state !== STATES.IDLE) {
      throw new CallTransitionError(`${event} exige o estado idle.`);
    }
  }

  snapshot() {
    return {
      state: this.state,
      mode: this.mode,
      whatsapp: this.whatsapp,
      sip: this.sip,
      media: this.media,
      terminalReason: this.terminalReason,
      sequence: this.sequence
    };
  }
}

module.exports = { ACTIONS, EVENTS, STATES, CallStateMachine, CallTransitionError };
