'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { CallSessionController } = require('../src/call-session-controller');

test('inicia e encerra os adaptadores na ordem esperada', async () => {
  const fixture = createFixture();

  assert.deepEqual(await fixture.controller.start(), {
    started: true,
    whatsappIncomingEvent: true
  });
  assert.deepEqual(fixture.calls, ['sip.connect', 'whatsapp.start']);

  await fixture.controller.stop();
  assert.deepEqual(fixture.calls, [
    'sip.connect',
    'whatsapp.start',
    'whatsapp.stop',
    'sip.disconnect'
  ]);
});

test('conecta chamada recebida no WhatsApp ao fluxo SIP e mídia', async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  fixture.calls.length = 0;

  fixture.whatsapp.emit('incoming', { isVideo: false });
  fixture.whatsapp.emit('state', { state: 'ringing' });
  await fixture.controller.whenIdle();
  fixture.sip.emit('baresipEvent', { type: 'CALL_ESTABLISHED' });
  await fixture.controller.whenIdle();
  fixture.whatsapp.emit('state', { state: 'active' });
  await fixture.controller.whenIdle();
  fixture.media.emit('started');
  await fixture.controller.whenIdle();

  assert.deepEqual(fixture.calls, [
    'sip.dial',
    'whatsapp.accept',
    'media.start'
  ]);
  assert.equal(fixture.controller.snapshot().call.state, 'active');
  assert.equal(fixture.controller.snapshot().call.mode, 'whatsapp_inbound');
});

test('conecta solicitação SIP ao fluxo WhatsApp e mídia', async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  fixture.calls.length = 0;

  await fixture.controller.startSipIncoming({ whatsappTarget: '5511999999999@c.us' });
  fixture.whatsapp.emit('state', { state: 'active' });
  await fixture.controller.whenIdle();
  fixture.sip.emit('baresipEvent', { type: 'CALL_ESTABLISHED' });
  await fixture.controller.whenIdle();
  fixture.media.emit('started');
  await fixture.controller.whenIdle();

  assert.deepEqual(fixture.calls, [
    'whatsapp.offer',
    'sip.accept',
    'media.start'
  ]);
  assert.equal(fixture.controller.snapshot().call.state, 'active');
  assert.equal(fixture.controller.snapshot().call.mode, 'sip_inbound');
});

test('propaga encerramento SIP para mídia e WhatsApp', async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  await activateWhatsappInbound(fixture);
  fixture.calls.length = 0;

  fixture.sip.emit('baresipEvent', { type: 'CALL_CLOSED' });
  await fixture.controller.whenIdle();

  assert.deepEqual(fixture.calls, ['media.stop', 'whatsapp.end']);
  assert.equal(fixture.controller.snapshot().call.state, 'ending');
});

test('evento SIP entrante aguarda destino explícito sem iniciar chamada', async () => {
  const fixture = createFixture();
  const events = [];
  fixture.controller.on('sipIncoming', event => events.push(event));
  await fixture.controller.start();
  fixture.calls.length = 0;

  fixture.sip.emit('baresipEvent', {
    type: 'CALL_INCOMING',
    callAlias: 'sip-call-1'
  });
  await fixture.controller.whenIdle();

  assert.deepEqual(events, [{ direction: 'incoming' }]);
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.controller.snapshot().call.state, 'idle');
});

test('falha de mídia encerra WhatsApp e SIP', async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  await activateWhatsappInbound(fixture);
  fixture.calls.length = 0;

  fixture.media.emit('failure', { code: 'MEDIA_DEVICE_LOST' });
  await fixture.controller.whenIdle();

  assert.deepEqual(fixture.calls, ['whatsapp.end', 'sip.hangup']);
  assert.equal(fixture.controller.snapshot().call.state, 'failed');
  assert.equal(fixture.controller.snapshot().call.terminalReason, 'media_failed');
});

test('não permite parar o controlador durante chamada', async () => {
  const fixture = createFixture();
  await fixture.controller.start();
  await fixture.controller.startSipIncoming({ whatsappTarget: '5511999999999@c.us' });

  await assert.rejects(
    fixture.controller.stop(),
    error => error.code === 'CALL_SESSION_ACTIVE'
  );
  assert.equal(fixture.controller.snapshot().started, true);
});

test('falhas publicadas são sanitizadas e não incluem destinos', async () => {
  const fixture = createFixture({
    'sip.dial': async () => {
      throw new Error('falha ao chamar sip:segredo@127.0.0.1');
    }
  });
  const failures = [];
  fixture.controller.on('controllerFailure', event => failures.push(event));
  await fixture.controller.start();
  fixture.calls.length = 0;

  fixture.whatsapp.emit('incoming');
  await fixture.controller.whenIdle();

  assert.equal(failures.length, 1);
  assert.deepEqual(failures[0], {
    source: 'whatsapp_incoming',
    code: 'CALL_CONTROLLER_FAILED'
  });
  assert.equal(JSON.stringify(failures).includes('segredo'), false);
});

async function activateWhatsappInbound(fixture) {
  fixture.whatsapp.emit('incoming');
  await fixture.controller.whenIdle();
  fixture.sip.emit('baresipEvent', { type: 'CALL_ESTABLISHED' });
  await fixture.controller.whenIdle();
  fixture.whatsapp.emit('state', { state: 'active' });
  await fixture.controller.whenIdle();
  fixture.media.emit('started');
  await fixture.controller.whenIdle();
}

function createFixture(overrides = {}) {
  const calls = [];
  const action = (name, result = true) => async (...args) => {
    calls.push(name);
    if (overrides[name]) return overrides[name](...args);
    return result;
  };
  const whatsapp = Object.assign(new EventEmitter(), {
    start: action('whatsapp.start', { incomingEvent: true }),
    stop: action('whatsapp.stop'),
    offer: action('whatsapp.offer'),
    accept: action('whatsapp.accept'),
    reject: action('whatsapp.reject'),
    end: action('whatsapp.end')
  });
  const sip = Object.assign(new EventEmitter(), {
    connect: action('sip.connect'),
    disconnect: () => { calls.push('sip.disconnect'); },
    dial: action('sip.dial'),
    accept: action('sip.accept'),
    hangup: action('sip.hangup')
  });
  const media = Object.assign(new EventEmitter(), {
    start: action('media.start'),
    stop: action('media.stop')
  });
  const controller = new CallSessionController({
    whatsapp,
    sip,
    media,
    sipUri: 'sip:9001@127.0.0.1',
    timeoutMs: 5000
  });
  return { controller, whatsapp, sip, media, calls };
}
