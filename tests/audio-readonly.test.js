'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const scriptPath = path.join(__dirname, '..', 'scripts', 'diagnostics', 'audio-readonly.sh');

test('diagnóstico não classifica pacote ausente como instalado', () => {
  const output = execFileSync(scriptPath, { encoding: 'utf8' });

  assert.match(output, /Pacotes/);
  assert.doesNotMatch(output, /instalado="unknown ok not-installed/);
});
