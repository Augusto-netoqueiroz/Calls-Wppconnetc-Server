#!/usr/bin/env bash
set -u

if ! command -v asterisk >/dev/null 2>&1; then
  echo "Asterisk não encontrado."
  exit 1
fi

asterisk -rx "core show version"
asterisk -rx "module show like chan_sip.so"
asterisk -rx "module show like codec_opus.so"
asterisk -rx "module show like codec_ulaw.so"
asterisk -rx "module show like codec_alaw.so"
asterisk -rx "rtp show settings"

echo
echo "Configuração RTP ativa (sem comentários)"
if [ -r /etc/asterisk/rtp.conf ]; then
  grep -vE '^[[:space:]]*(;|#|$)' /etc/asterisk/rtp.conf || true
else
  echo "/etc/asterisk/rtp.conf não está legível."
fi

echo
echo "Resumo SIP sem credenciais"
asterisk -rx "sip show settings" 2>/dev/null |
grep -Ei "UDP Bindaddress|TCP Bindaddress|Realm|NAT|Extern|Localnet|RTP" || true
