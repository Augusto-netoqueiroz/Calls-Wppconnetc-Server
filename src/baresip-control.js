'use strict';

const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const net = require('node:net');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const ALLOWED_COMMANDS = new Set(['accept', 'callstat', 'dial', 'hangup', 'reginfo']);
const MAX_FRAME_BYTES = 1024 * 1024;

function encodeNetstring(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  return Buffer.concat([
    Buffer.from(`${payload.length}:`, 'ascii'),
    payload,
    Buffer.from(',', 'ascii')
  ]);
}

class NetstringDecoder {
  constructor(maxFrameBytes = MAX_FRAME_BYTES) {
    this.buffer = Buffer.alloc(0);
    this.maxFrameBytes = maxFrameBytes;
  }

  push(chunk) {
    if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk);
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];

    for (;;) {
      const colon = this.buffer.indexOf(58);
      if (colon === -1) {
        if (this.buffer.length > 16) throw new Error('Cabeçalho netstring inválido.');
        break;
      }

      const lengthText = this.buffer.subarray(0, colon).toString('ascii');
      if (!/^(0|[1-9]\d*)$/.test(lengthText)) throw new Error('Tamanho netstring inválido.');

      const length = Number(lengthText);
      if (!Number.isSafeInteger(length) || length > this.maxFrameBytes) {
        throw new Error('Frame netstring excede o limite.');
      }

      const payloadStart = colon + 1;
      const frameEnd = payloadStart + length;
      if (this.buffer.length < frameEnd + 1) break;
      if (this.buffer[frameEnd] !== 44) throw new Error('Terminador netstring inválido.');

      frames.push(this.buffer.subarray(payloadStart, frameEnd));
      this.buffer = this.buffer.subarray(frameEnd + 1);
    }

    return frames;
  }
}

class BaresipCommandError extends Error {
  constructor(command) {
    super(`Comando Baresip recusado: ${command}.`);
    this.name = 'BaresipCommandError';
    this.code = 'BARESIP_COMMAND_FAILED';
    this.command = command;
  }
}

class BaresipControlClient extends EventEmitter {
  constructor({ host = '127.0.0.1', port = 4444, timeoutMs = 5000 } = {}) {
    super();
    if (!LOOPBACK_HOSTS.has(host)) throw new Error('ctrl_tcp deve usar somente loopback.');
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new TypeError('Porta inválida.');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100) throw new TypeError('Timeout inválido.');

    this.host = host;
    this.port = port;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.decoder = new NetstringDecoder();
    this.pending = new Map();
    this.callAliases = new Map();
    this.callSequence = 0;
  }

  connect() {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      socket.setNoDelay(true);

      const onInitialError = error => {
        socket.off('connect', onConnect);
        reject(error);
      };
      const onConnect = () => {
        socket.off('error', onInitialError);
        socket.on('error', error => this.emit('transportError', error));
        resolve();
      };

      socket.once('error', onInitialError);
      socket.once('connect', onConnect);
      socket.on('data', chunk => this.handleData(chunk));
      socket.on('close', () => this.handleClose());
    });
  }

  disconnect() {
    if (this.socket) this.socket.destroy();
  }

  async dial(uri) {
    if (typeof uri !== 'string' || !/^sips?:[^\s]+$/i.test(uri) || uri.length > 512) {
      throw new TypeError('URI SIP inválida.');
    }
    await this.command('dial', uri);
    return true;
  }

  async accept() {
    await this.command('accept');
    return true;
  }

  async hangup() {
    await this.command('hangup');
    return true;
  }

  callStatus() {
    return this.command('callstat');
  }

  registrationInfo() {
    return this.command('reginfo');
  }

  command(command, params) {
    if (!ALLOWED_COMMANDS.has(command)) {
      return Promise.reject(new Error('Comando Baresip não permitido.'));
    }
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error('Cliente ctrl_tcp desconectado.'));
    }

    const token = randomUUID();
    const message = { command, token };
    if (params !== undefined) message.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(token);
        const error = new Error(`Timeout no comando Baresip: ${command}.`);
        error.code = 'BARESIP_TIMEOUT';
        reject(error);
      }, this.timeoutMs);

      this.pending.set(token, { command, resolve, reject, timer });
      this.socket.write(encodeNetstring(message), error => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(token);
        reject(error);
      });
    });
  }

  handleData(chunk) {
    let frames;
    try {
      frames = this.decoder.push(chunk);
    } catch (error) {
      this.emit('protocolError', error);
      this.disconnect();
      return;
    }

    for (const frame of frames) {
      try {
        this.handleMessage(JSON.parse(frame.toString('utf8')));
      } catch (error) {
        this.emit('protocolError', error);
        this.disconnect();
        return;
      }
    }
  }

  handleMessage(message) {
    if (message?.response === true && typeof message.token === 'string') {
      const pending = this.pending.get(message.token);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.token);
      if (message.ok === true) pending.resolve(message.data ?? '');
      else pending.reject(new BaresipCommandError(pending.command));
      return;
    }

    if (message?.event === true) {
      this.emit('baresipEvent', this.sanitizeEvent(message));
    }
  }

  sanitizeEvent(message) {
    let callAlias = null;
    if (typeof message.id === 'string' && message.id) {
      if (!this.callAliases.has(message.id)) {
        this.callAliases.set(message.id, `sip-call-${++this.callSequence}`);
      }
      callAlias = this.callAliases.get(message.id);
    }

    const eventClass = typeof message.class === 'string' && /^[a-z0-9_]{1,32}$/.test(message.class)
      ? message.class
      : null;
    const eventType = typeof message.type === 'string' && /^[A-Z0-9_]{1,64}$/.test(message.type)
      ? message.type
      : null;
    const event = {
      at: new Date().toISOString(),
      class: eventClass,
      type: eventType,
      direction: ['incoming', 'outgoing'].includes(message.direction) ? message.direction : null,
      callAlias
    };

    if (event.type === 'CALL_CLOSED' && typeof message.id === 'string') {
      this.callAliases.delete(message.id);
    }
    return event;
  }

  handleClose() {
    const error = new Error('Conexão ctrl_tcp encerrada.');
    error.code = 'BARESIP_DISCONNECTED';
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.socket = null;
    this.emit('disconnected');
  }
}

module.exports = {
  BaresipCommandError,
  BaresipControlClient,
  NetstringDecoder,
  encodeNetstring
};
