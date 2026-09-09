'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { CallOrchestrator } = require('../src/call-orchestrator');

test('orquestra chamada recebida no WhatsApp até a mídia ativa', async () => {
  const fixture = createFixture();

  await fixture.call.startWhatsAppIncoming({ sipUri: 'sip:9001@127.0.0.1' });
  await fixture.call.onSipEvent('CALL_ESTABLISHED');
  await fixture.call.onWhatsAppState('active');
  await fixture.call.onMediaStarted();

  assert.deepEqual(fixture.calls, [
    'sip.dial',
    'whatsapp.accept',
    'media.start'
  ]);
  assert.equal(fixture.call.snapshot().state, 'active');
  assert.equal(fixture.call.snapshot().mode, 'whatsapp_inbound');
});

test('orquestra chamada recebida no SIP até a mídia ativa', async () => {
  const fixture = createFixture();

  await fixture.call.startSipIncoming({ whatsappTarget: '5511999999999@c.us' });
  await fixture.call.onWhatsAppState('ringing');
  await fixture.call.onWhatsAppState('active');
  await fixture.call.onSipEvent({ type: 'CALL_ESTABLISHED' });
  await fixture.call.onMediaStarted();

  assert.deepEqual(fixture.calls, [
    'whatsapp.offer',
    'sip.accept',
    'media.start'
  ]);
  assert.equal(fixture.call.snapshot().state, 'active');
  assert.equal(fixture.call.snapshot().mode, 'sip_inbound');
});

test('executa a limpeza em ordem quando o WhatsApp encerra', async () => {
  const fixture = createFixture();
  await activateWhatsappInbound(fixture.call);
  fixture.calls.length = 0;

  await fixture.call.onWhatsAppState('ended');

  assert.deepEqual(fixture.calls, ['media.stop', 'sip.hangup']);
  assert.equal(fixture.call.snapshot().state, 'ending');
});

test('serializa eventos enquanto uma ação assíncrona está pendente', async () => {
  let releaseDial;
  const fixture = createFixture({
    'sip.dial': () => new Promise(resolve => { releaseDial = resolve; })
  });

  const started = fixture.call.startWhatsAppIncoming({ sipUri: 'sip:9001@127.0.0.1' });
  const established = fixture.call.onSipEvent('CALL_ESTABLISHED');
  await Promise.resolve();

  assert.deepEqual(fixture.calls, ['sip.dial']);
  releaseDial();
  await Promise.all([started, established]);
  assert.deepEqual(fixture.calls, ['sip.dial', 'whatsapp.accept']);
});

test('falha de adaptador encerra a máquina e executa compensação', async () => {
  const secretTarget = 'sip:9001@127.0.0.1';
  const adapterError = Object.assign(new Error(`não chamou ${secretTarget}`), {
    code: 'SIP_DIAL_FAILED'
  });
  const fixture = createFixture({
    'sip.dial': async () => { throw adapterError; }
  });
  const failures = [];
  fixture.call.on('actionFailure', event => failures.push(event));

  await assert.rejects(
    fixture.call.startWhatsAppIncoming({ sipUri: secretTarget }),
    adapterError
  );

  assert.deepEqual(fixture.calls, ['sip.dial', 'whatsapp.reject']);
  assert.deepEqual(failures, [{ action: 'dial_sip', code: 'SIP_DIAL_FAILED' }]);
  assert.equal(JSON.stringify(failures).includes(secretTarget), false);
  assert.equal(fixture.call.snapshot().state, 'failed');
  assert.equal(fixture.call.snapshot().terminalReason, 'sip_failed');
});

test('timeout dispara limpeza sem depender de relógio real', async () => {
  let timeoutCallback;
  let cleared = false;
  const fixture = createFixture({}, {
    setTimeout(callback) {
      timeoutCallback = callback;
      return 7;
    },
    clearTimeout(handle) {
      assert.equal(handle, 7);
      cleared = true;
    }
  });

  await fixture.call.startWhatsAppIncoming({ sipUri: 'sip:9001@127.0.0.1' });
  timeoutCallback();
  await fixture.call.whenIdle();

  assert.deepEqual(fixture.calls, ['sip.dial', 'whatsapp.reject']);
  assert.equal(fixture.call.snapshot().terminalReason, 'timeout');
  assert.equal(cleared, true);
});

test('cancela timeout de estabelecimento quando a chamada fica ativa', async () => {
  let clearedHandle = null;
  const fixture = createFixture({}, {
    setTimeout() {
      return 11;
    },
    clearTimeout(handle) {
      clearedHandle = handle;
    }
  });

  await activateWhatsappInbound(fixture.call);

  assert.equal(clearedHandle, 11);
  assert.equal(fixture.call.snapshot().state, 'active');
});

test('recusa segunda chamada e valida destinos antes de executar adaptadores', async () => {
  const fixture = createFixture();

  assert.throws(
    () => fixture.call.startSipIncoming({ whatsappTarget: 'destino-invalido' }),
    /Destino WhatsApp inválido/
  );
  await fixture.call.startWhatsAppIncoming({ sipUri: 'sip:9001@127.0.0.1' });
  await assert.rejects(
    fixture.call.startSipIncoming({ whatsappTarget: '5511999999999@c.us' }),
    error => error.code === 'CALL_ALREADY_STARTED'
  );
});

test('eventos públicos não expõem destinos', async () => {
  const fixture = createFixture();
  const events = [];
  fixture.call.on('transition', event => events.push(event));
  fixture.call.on('action', event => events.push(event));

  await fixture.call.startSipIncoming({ whatsappTarget: '5511999999999@c.us' });

  const serialized = JSON.stringify(events);
  assert.equal(serialized.includes('5511999999999'), false);
  assert.equal(serialized.includes('@c.us'), false);
});

async function activateWhatsappInbound(call) {
  await call.startWhatsAppIncoming({ sipUri: 'sip:9001@127.0.0.1' });
  await call.onSipEvent('CALL_ESTABLISHED');
  await call.onWhatsAppState('active');
  await call.onMediaStarted();
}

function createFixture(overrides = {}, timers) {
  const calls = [];
  const action = (name, fallback = async () => true) => async (...args) => {
    calls.push(name);
    const override = overrides[name];
    return (override || fallback)(...args);
  };
  const whatsapp = {
    offer: action('whatsapp.offer'),
    accept: action('whatsapp.accept'),
    reject: action('whatsapp.reject'),
    end: action('whatsapp.end')
  };
  const sip = {
    dial: action('sip.dial'),
    accept: action('sip.accept'),
    hangup: action('sip.hangup')
  };
  const media = {
    start: action('media.start'),
    stop: action('media.stop')
  };
  const options = { whatsapp, sip, media, timeoutMs: 1000 };
  if (timers) options.timers = timers;
  return { call: new CallOrchestrator(options), calls };
}
