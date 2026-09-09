#!/usr/bin/env bash
set -u

echo "Identidade de execução"
id
echo "XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-não definido}"

echo
echo "Pacotes"
for package_name in pulseaudio pulseaudio-utils baresip baresip-core libasound2-plugins; do
  package_status=$(dpkg-query -W -f='${Status} ${Version}' "$package_name" 2>/dev/null || true)
  candidate=$(apt-cache policy "$package_name" 2>/dev/null | awk '/Candidato:/ {print $2; exit}')
  if [[ "$package_status" == "install ok installed "* ]]; then
    installed=${package_status#install ok installed }
  else
    installed="não instalado"
  fi
  [ -n "$candidate" ] || candidate="indisponível"
  printf '%-22s instalado="%s" candidato="%s"\n' "$package_name" "$installed" "$candidate"
done

echo
echo "Binários"
for command_name in pactl pulseaudio baresip aplay arecord chromium chromium-browser google-chrome; do
  command_path=$(command -v "$command_name" 2>/dev/null || true)
  [ -n "$command_path" ] && echo "$command_name=$command_path" || echo "$command_name=não encontrado"
done

echo
echo "Módulos necessários"
for module_path in \
  /usr/lib/baresip/modules/alsa.so \
  /usr/lib/baresip/modules/ctrl_tcp.so \
  /usr/lib/baresip/modules/g711.so \
  /usr/lib/baresip/modules/pulse.so \
  /usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so; do
  [ -f "$module_path" ] && echo "$module_path=presente" || echo "$module_path=ausente"
done

echo
echo "Servidor PulseAudio"
if command -v pactl >/dev/null 2>&1; then
  pactl info 2>&1 | sed -n '1,25p'

  echo
  echo "Sinks"
  pactl list short sinks 2>&1 || true

  echo
  echo "Sources"
  pactl list short sources 2>&1 || true
else
  echo "pactl não instalado"
fi

echo
echo "Variáveis de roteamento"
echo "PULSE_SERVER=${PULSE_SERVER:-não definido}"
echo "PULSE_SINK=${PULSE_SINK:-não definido}"
echo "PULSE_SOURCE=${PULSE_SOURCE:-não definido}"
