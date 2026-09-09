'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  WhatsappCallAdapter,
  browserCallOperation
} = require('../src/whatsapp-call-adapter');

test('inicia observação, detecta chamada recebida e sanitiza os eventos', async () => {
  const page = new FakePage();
  page.observation = {
    active: true,
    state: 3,
    outgoing: false,
    isVideo: false,
    isGroup: false,
    id: 'id-que-nao-pode-sair'
  };
  const timers = fakeTimers();
  const adapter = new WhatsappCallAdapter({ page, timers, pollIntervalMs: 250 });
  const events = [];
  adapter.on('incoming', event => events.push(event));
  adapter.on('state', event => events.push(event));

  const result = await adapter.start();

  assert.deepEqual(result, { started: true, incomingEvent: true });
  assert.equal(events.some(event => event.state === 'ringing'), true);
  assert.equal(events.filter(event => event.isVideo === false).length, 1);
  assert.equal(JSON.stringify(events).includes('id-que-nao-pode-sair'), false);
  await adapter.stop();
  assert.equal(timers.wasCleared(), true);
  assert.equal(page.removedBindings.length, 1);
});

test('mapeia estado nativo 6 e desaparecimento da activeCall', async () => {
  const page = new FakePage();
  const adapter = new WhatsappCallAdapter({ page });
  const states = [];
  adapter.on('state', event => states.push(event.state));

  adapter.handleObservation({ active: true, state: 6, outgoing: true }, 'test');
  adapter.handleObservation({ active: false }, 'test');

  assert.deepEqual(states, ['active', 'ended']);
});

test('não transforma estado desconhecido em ação automática', () => {
  const adapter = new WhatsappCallAdapter({ page: new FakePage() });
  const observations = [];
  const states = [];
  adapter.on('observation', event => observations.push(event));
  adapter.on('state', event => states.push(event));

  adapter.handleObservation({ active: true, state: 999, outgoing: true }, 'test');

  assert.equal(observations[0].state, null);
  assert.deepEqual(states, []);
});

test('executa ações sem expor o identificador da chamada ao Node', async () => {
  const page = new FakePage();
  const adapter = new WhatsappCallAdapter({ page });

  await adapter.offer('5511999999999@c.us');
  await adapter.accept();
  await adapter.reject();
  await adapter.end();

  assert.deepEqual(page.operations.map(item => item.operation), [
    'offer',
    'accept',
    'reject',
    'end'
  ]);
  assert.equal(page.operations.some(item => Object.hasOwn(item, 'callId')), false);
});

test('normaliza falha do navegador sem propagar mensagem sensível', async () => {
  const page = new FakePage();
  page.resultFor.offer = { ok: false, code: 'CONTACT_NOT_FOUND' };
  const adapter = new WhatsappCallAdapter({ page });

  await assert.rejects(
    adapter.offer('5511999999999@c.us'),
    error => error.code === 'CONTACT_NOT_FOUND' && !error.message.includes('5511999999999')
  );
});

test('offer considera sucesso mesmo quando WPP.call.offer retorna undefined', async () => {
  const calls = [];
  await withBrowserWindow({
    WPP: {
      whatsapp: { CallStore: { activeCall: null } },
      call: {
        async offer(target, options) {
          calls.push({ target, options });
          return undefined;
        }
      }
    }
  }, async () => {
    const result = await browserCallOperation({
      operation: 'offer',
      target: '5511999999999@c.us'
    });
    assert.deepEqual(result, { ok: true });
  });

  assert.deepEqual(calls, [{
    target: '5511999999999@c.us',
    options: { isVideo: false }
  }]);
});

test('accept usa o id somente dentro do contexto do navegador', async () => {
  const accepted = [];
  await withBrowserWindow({
    WPP: {
      whatsapp: { CallStore: { activeCall: { id: 'browser-only-id' } } },
      call: { async accept(id) { accepted.push(id); } }
    }
  }, async () => {
    assert.deepEqual(
      await browserCallOperation({ operation: 'accept' }),
      { ok: true }
    );
  });
  assert.deepEqual(accepted, ['browser-only-id']);
});

test('evento incoming_call é marcado como entrante mesmo sem outgoing', async () => {
  let handler;
  const received = [];
  await withBrowserWindow({
    __bridge: observation => received.push(observation),
    WPP: {
      whatsapp: { CallStore: { activeCall: null } },
      on(event, callback) {
        assert.equal(event, 'call.incoming_call');
        handler = callback;
      }
    }
  }, async () => {
    assert.deepEqual(
      await browserCallOperation({ operation: 'subscribe', bindingName: '__bridge' }),
      { ok: true, incomingEvent: true }
    );
    handler({ id: 'browser-only-id', isVideo: false, isGroup: false });
  });

  assert.deepEqual(received, [{
    active: true,
    state: null,
    outgoing: false,
    isVideo: false,
    isGroup: false
  }]);
  assert.equal(JSON.stringify(received).includes('browser-only-id'), false);
});

test('reject e end são idempotentes quando a chamada já desapareceu', async () => {
  await withBrowserWindow({
    WPP: {
      whatsapp: { CallStore: { activeCall: null } },
      call: {}
    }
  }, async () => {
    assert.deepEqual(
      await browserCallOperation({ operation: 'reject' }),
      { ok: true, noop: true }
    );
    assert.deepEqual(
      await browserCallOperation({ operation: 'end' }),
      { ok: true, noop: true }
    );
  });
});

class FakePage {
  constructor() {
    this.operations = [];
    this.bindings = new Map();
    this.removedBindings = [];
    this.observation = { active: false };
    this.resultFor = {};
  }

  async exposeFunction(name, callback) {
    this.bindings.set(name, callback);
  }

  async removeExposedFunction(name) {
    this.removedBindings.push(name);
    this.bindings.delete(name);
  }

  async evaluate(_fn, request) {
    this.operations.push(request);
    if (request.operation === 'observe') {
      return { ok: true, observation: this.observation };
    }
    if (request.operation === 'subscribe') {
      return { ok: true, incomingEvent: true };
    }
    return this.resultFor[request.operation] || { ok: true };
  }
}

function fakeTimers() {
  let cleared = false;
  return {
    setInterval() {
      return 10;
    },
    clearInterval(handle) {
      assert.equal(handle, 10);
      cleared = true;
    },
    wasCleared() {
      return cleared;
    }
  };
}

async function withBrowserWindow(value, callback) {
  const previous = global.window;
  global.window = value;
  try {
    await callback();
  } finally {
    if (previous === undefined) delete global.window;
    else global.window = previous;
  }
}
