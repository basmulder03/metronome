#!/usr/bin/env bash
# Ship a new build to the server (see README, "Deploying"). Needs ssh access as a user that may restart the service.
# usage: DEPLOY_HOST=root@your-server scripts/deploy.sh
set -euo pipefail
: "${DEPLOY_HOST:?set DEPLOY_HOST, for example root@203.0.113.7}"
cd "$(dirname "$0")/.."
npm run build
rsync -a --delete dist/ "$DEPLOY_HOST:/opt/metronome/pb_public/"
rsync -a --delete server/pb_hooks/ "$DEPLOY_HOST:/opt/metronome/pb_hooks/"
rsync -a --delete server/pb_migrations/ "$DEPLOY_HOST:/opt/metronome/pb_migrations/"
ssh "$DEPLOY_HOST" 'systemctl restart metronome && sleep 2 && curl -fsS http://127.0.0.1:8090/api/health'
