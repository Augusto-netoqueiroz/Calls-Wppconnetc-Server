'use strict';

function attachWppconnectIncomingObserver(client, write = console.log) {
  if (!client || typeof client.onIncomingCall !== 'function') {
    throw new TypeError('Cliente WPPConnect inválido ou sem onIncomingCall.');
  }

  let sequence = 0;
  const disposable = client.onIncomingCall(call => {
    write('[CALL LAB NODE]', {
      at: new Date().toISOString(),
      sequence: ++sequence,
      type: 'INCOMING_EVENT',
      source: 'client.onIncomingCall',
      isVideo: call?.isVideo ?? null,
      isGroup: call?.isGroup ?? null
    });
  });

  return {
    stop() {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    }
  };
}

module.exports = { attachWppconnectIncomingObserver };
