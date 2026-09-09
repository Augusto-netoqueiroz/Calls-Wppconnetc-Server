'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ACTIONS,
  EVENTS,
  STATES,
  CallStateMachine
} = require('../src/call-state-machine');

test('completa chamada recebida no WhatsApp', () => {
  const call = new CallStateMachine();

  assert.deepEqual(call.dispatch(EVENTS.WHATSAPP_INCOMING).actions, [ACTIONS.DIAL_SIP]);
  assert.equal(call.state, STATES.RINGING);
  assert.deepEqual(call.dispatch(EVENTS.SIP_ESTABLISHED).actions, [ACTIONS.ACCEPT_WHATSAPP]);
  assert.deepEqual(call.dispatch(EVENTS.WHATSAPP_ACTIVE).actions, [ACTIONS.START_MEDIA]);
  call.dispatch(EVENTS.MEDIA_STARTED);

  assert.deepEqual(call.snapshot(), {
    state: STATES.ACTIVE,
    mode: 'whatsapp_inbound',
    whatsapp: 'active',
    sip: 'active',
    media: 'active',
    terminalReason: null,
    sequence: 4
  });
});

test('completa chamada originada pelo lado SIP', () => {
  const call = new CallStateMachine();

  assert.deepEqual(call.dispatch(EVENTS.SIP_INCOMING).actions, [ACTIONS.OFFER_WHATSAPP]);
  call.dispatch(EVENTS.WHATSAPP_RINGING);
  assert.deepEqual(call.dispatch(EVENTS.WHATSAPP_ACTIVE).actions, [ACTIONS.ACCEPT_SIP]);
  assert.deepEqual(call.dispatch(EVENTS.SIP_ESTABLISHED).actions, [ACTIONS.START_MEDIA]);
  call.dispatch(EVENTS.MEDIA_STARTED);

  assert.equal(call.state, STATES.ACTIVE);
  assert.equal(call.mode, 'sip_inbound');
});

test('encerramento pelo WhatsApp limpa mídia e SIP uma única vez', () => {
  const call = activeWhatsappInboundCall();

  const ending = call.dispatch(EVENTS.WHATSAPP_ENDED);
  assert.equal(ending.state, STATES.ENDING);
  assert.deepEqual(ending.actions, [ACTIONS.STOP_MEDIA, ACTIONS.HANGUP_SIP]);
  assert.deepEqual(call.dispatch(EVENTS.WHATSAPP_ENDED).actions, []);

  call.dispatch(EVENTS.MEDIA_STOPPED);
  call.dispatch(EVENTS.SIP_CLOSED);
  assert.equal(call.state, STATES.ENDED);
  assert.equal(call.snapshot().terminalReason, 'whatsapp_ended');
});

test('encerramento pelo SIP encerra WhatsApp e mídia', () => {
  const call = activeWhatsappInboundCall();
  const ending = call.dispatch(EVENTS.SIP_CLOSED);

  assert.deepEqual(ending.actions, [ACTIONS.STOP_MEDIA, ACTIONS.END_WHATSAPP]);
  call.dispatch(EVENTS.MEDIA_STOPPED);
  call.dispatch(EVENTS.WHATSAPP_ENDED);
  assert.equal(call.state, STATES.ENDED);
  assert.equal(call.snapshot().terminalReason, 'sip_closed');
});

test('timeout rejeita os lados ainda tocando sem duplicar ações', () => {
  const call = new CallStateMachine();
  call.dispatch(EVENTS.WHATSAPP_INCOMING);

  const failed = call.dispatch(EVENTS.TIMEOUT);
  assert.equal(failed.state, STATES.FAILED);
  assert.deepEqual(failed.actions, [ACTIONS.REJECT_WHATSAPP]);
  assert.equal(call.dispatch(EVENTS.TIMEOUT).ignored, true);
});

test('impede mídia antes dos dois lados estarem ativos', () => {
  const call = new CallStateMachine();
  call.dispatch(EVENTS.WHATSAPP_INCOMING);

  assert.throws(
    () => call.dispatch(EVENTS.MEDIA_STARTED),
    error => error.code === 'INVALID_CALL_TRANSITION'
  );
});

function activeWhatsappInboundCall() {
  const call = new CallStateMachine();
  call.dispatch(EVENTS.WHATSAPP_INCOMING);
  call.dispatch(EVENTS.SIP_ESTABLISHED);
  call.dispatch(EVENTS.WHATSAPP_ACTIVE);
  call.dispatch(EVENTS.MEDIA_STARTED);
  return call;
}
