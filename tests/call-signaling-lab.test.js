'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'research', 'browser', 'call-signaling-lab.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function createLab() {
  const wppEvents = new Map();
  let legacyIncoming = null;
  const store = { activeCall: null };
  const calls = { offer: 0, accept: 0, reject: 0, end: 0 };

  const window = {
    WPP: {
      whatsapp: { CallStore: store },
      on(event, handler) { wppEvents.set(event, handler); },
      off(event, handler) {
        if (wppEvents.get(event) === handler) wppEvents.delete(event);
      },
      call: {
        async offer() { calls.offer += 1; },
        async accept() { calls.accept += 1; return true; },
        async reject() { calls.reject += 1; return true; },
        async end() { calls.end += 1; return true; }
      }
    },
    WAPI: {
      onIncomingCall(handler) { legacyIncoming = handler; }
    }
  };

  const context = vm.createContext({
    window,
    console: { log() {}, warn() {} },
    performance,
    setInterval,
    clearInterval,
    Date,
    JSON,
    Boolean,
    Error,
    TypeError
  });

  vm.runInContext(scriptSource, context);

  return {
    lab: window.__wppCallLab,
    store,
    calls,
    emitCurrent(call) { wppEvents.get('call.incoming_call')?.(call); },
    emitLegacy(call) { legacyIncoming?.(call); }
  };
}

test('bloqueia ações até o laboratório ser armado', async () => {
  const fixture = createLab();

  await assert.rejects(
    fixture.lab.offer('5511999999999@c.us'),
    /Ações bloqueadas/
  );
  assert.equal(fixture.calls.offer, 0);

  fixture.lab.arm('LABORATORIO');
  await fixture.lab.offer('5511999999999@c.us');
  assert.equal(fixture.calls.offer, 1);

  fixture.lab.stop();
});

test('exporta aliases sem telefone ou ID bruto', () => {
  const fixture = createLab();
  const call = {
    id: 'ID-SECRETO-DA-CHAMADA',
    outgoing: false,
    isVideo: false,
    isGroup: false,
    getState() { return 'INCOMING_RING'; }
  };

  fixture.store.activeCall = call;
  fixture.emitCurrent(call);
  fixture.emitLegacy(call);

  const exported = fixture.lab.exportJson();
  assert.match(exported, /call-1/);
  assert.doesNotMatch(exported, /ID-SECRETO-DA-CHAMADA/);
  assert.doesNotMatch(exported, /5511999999999/);

  fixture.lab.stop();
});
