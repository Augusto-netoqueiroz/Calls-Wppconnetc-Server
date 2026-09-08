#!/usr/bin/env bash
set -u

PROJECT_DIR="${1:-/home/liguetalk/wppconnect-master}"

echo "Sistema"
cat /etc/os-release 2>/dev/null || true
node -v 2>/dev/null || true
npm -v 2>/dev/null || true

echo
echo "Dependências resolvidas"
if [ -d "$PROJECT_DIR" ]; then
  (
    cd "$PROJECT_DIR" || exit 1
    node -e "
for (const name of ['@wppconnect-team/wppconnect', '@wppconnect/wa-js', 'puppeteer']) {
  try { console.log(name + ': ' + require.resolve(name)); }
  catch (error) { console.log(name + ': não encontrado'); }
}
"
    npm ls @wppconnect-team/wppconnect @wppconnect/wa-js puppeteer puppeteer-core --depth=0 2>/dev/null || true
  )
else
  echo "Diretório não encontrado: $PROJECT_DIR"
fi

echo
echo "Processos WPP no PM2"
pm2 jlist 2>/dev/null |
node -e "
let input='';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const rows = JSON.parse(input)
      .filter(item => /^wpp-/.test(item.name))
      .map(item => ({
        name: item.name,
        status: item.pm2_env && item.pm2_env.status,
        port: item.pm2_env && item.pm2_env.env && item.pm2_env.env.PORT,
        script: item.pm2_env && item.pm2_env.pm_exec_path,
        cwd: item.pm2_env && item.pm2_env.pm_cwd
      }));
    console.log(JSON.stringify(rows, null, 2));
  } catch (_) {
    console.log('Não foi possível ler a lista do PM2.');
  }
});
" || true

echo
echo "Ferramentas de áudio/SIP"
for command_name in pactl pulseaudio pipewire pw-cli baresip pjsua; do
  command -v "$command_name" 2>/dev/null || echo "$command_name: não instalado"
done
