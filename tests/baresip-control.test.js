'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const {
  BaresipControlClient,
  NetstringDecoder,
  encodeNetstring
} = require('../src/baresip-control');

test('decodifica frames fragmentados, múltiplos e UTF-8', () => {
  const decoder = new NetstringDecoder();
  const first = encodeNetstring({ text: 'áudio' });
  const second = encodeNetstring({ ok: true });

  assert.deepEqual(decoder.push(first.subarray(0, 4)), []);
  const frames = decoder.push(Buffer.concat([first.subarray(4), second]));

  assert.equal(frames.length, 2);
  assert.deepEqual(JSON.parse(frames[0]), { text: 'áudio' });
  assert.deepEqual(JSON.parse(frames[1]), { ok: true });
});

test('rejeita host fora do loopback', () => {
  assert.throws(
    () => new BaresipControlClient({ host: '192.0.2.10' }),
    /somente loopback/
  );
});

test('rejeita comando fora da API mínima', async () => {
  const client = new BaresipControlClient();
  await assert.rejects(client.command('quit'), /não permitido/);
});

test('envia comando e sanitiza evento de chamada', async t => {
  const server = net.createServer(socket => {
    const decoder = new NetstringDecoder();
    socket.on('data', chunk => {
      for (const frame of decoder.push(chunk)) {
        const command = JSON.parse(frame);
        assert.equal(command.command, 'dial');
        assert.equal(command.params, 'sip:teste@127.0.0.1');

        socket.write(encodeNetstring({
          event: true,
          class: 'call',
          type: 'CALL_OUTGOING',
          direction: 'outgoing',
          peeruri: 'sip:segredo@127.0.0.1',
          accountaor: 'sip:ramal-secreto@127.0.0.1',
          id: 'ID-SIP-SECRETO'
        }));
        socket.write(encodeNetstring({
          response: true,
          ok: true,
          data: '',
          token: command.token
        }));
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const address = server.address();
  const client = new BaresipControlClient({ port: address.port, timeoutMs: 1000 });
  t.after(() => client.disconnect());

  const eventPromise = new Promise(resolve => client.once('baresipEvent', resolve));
  await client.connect();
  assert.equal(await client.dial('sip:teste@127.0.0.1'), true);

  const event = await eventPromise;
  assert.equal(event.callAlias, 'sip-call-1');
  assert.equal(event.type, 'CALL_OUTGOING');
  assert.equal(event.direction, 'outgoing');
  assert.doesNotMatch(JSON.stringify(event), /segredo|ID-SIP-SECRETO/);
});

test('expira comando sem resposta', async t => {
  const server = net.createServer(socket => socket.on('data', () => {}));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const client = new BaresipControlClient({ port: server.address().port, timeoutMs: 100 });
  t.after(() => client.disconnect());
  await client.connect();

  await assert.rejects(client.callStatus(), error => error.code === 'BARESIP_TIMEOUT');
});
