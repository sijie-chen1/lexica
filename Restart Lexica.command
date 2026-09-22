#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
APP_ROOT="$PWD"
APP_PIDS=$(/usr/sbin/lsof -tiTCP:4173 -sTCP:LISTEN 2>/dev/null)
for APP_PID in ${(f)APP_PIDS}; do
  APP_CWD=$(/usr/sbin/lsof -a -p "$APP_PID" -d cwd -Fn 2>/dev/null | /usr/bin/sed -n 's/^n//p')
  if [[ "$APP_CWD" != "$APP_ROOT" ]]; then
    print 'Port 4173 belongs to another app. Close that app before starting Lexica.'
    read '?Press Return to close.'
    exit 1
  fi
  kill -TERM "$APP_PID" || exit 1
done
for APP_TRY in {1..30}; do
  if ! /usr/sbin/lsof -tiTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then break; fi
  sleep 0.1
done
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null; then
  print 'Node.js is needed to run Lexica.'
  read '?Press Return to close.'
  exit 1
fi
print 'Starting Lexica. Keep this window open while using the app.'
(sleep 2; open 'http://127.0.0.1:4173/') &
exec node --env-file-if-exists=.env server/index.js
