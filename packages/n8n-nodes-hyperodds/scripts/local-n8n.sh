#!/bin/sh
# A local n8n with this package installed the way Settings > Community nodes installs it, for
# trying the nodes before they are on npm. Everything lives in $N8N_DEMO_DIR (default
# /tmp/hyperodds-n8n); nothing touches ~/.n8n.
#
#   scripts/local-n8n.sh setup     install n8n 2.46.3 (pinned, packages published before 2026-11-01)
#   scripts/local-n8n.sh install   build and pack this package, install it (n8n must be stopped)
#   scripts/local-n8n.sh start     run n8n on http://localhost:5679 in the foreground
#   scripts/local-n8n.sh seed      with n8n running: owner account, credential, the two example workflows
#
# First run: setup, start (once, to create the database), stop it, install, start, seed.
set -eu

DIR=${N8N_DEMO_DIR:-/tmp/hyperodds-n8n}
PORT=${N8N_DEMO_PORT:-5679}
PKG=$(cd "$(dirname "$0")/.." && pwd)
EXAMPLES=$PKG/../../examples/n8n
NODES=$DIR/data/.n8n/nodes
DB=$DIR/data/.n8n/database.sqlite
EMAIL=owner@example.com
PASSWORD=Hyperodds-n8n-demo-1

case ${1:-} in
setup)
  mkdir -p "$DIR/app"
  cd "$DIR/app"
  [ -f package.json ] || npm init -y >/dev/null
  # --force: n8n-nodes-base lists a Linux-only canvas binary that npm refuses on macOS otherwise.
  npm install --before=2026-11-01 --no-audit --no-fund --force n8n@2.46.3
  ;;

install)
  [ -f "$DB" ] || { echo "start n8n once first, so its database exists" >&2; exit 1; }
  cd "$PKG"
  npm run build >/dev/null
  mkdir -p "$DIR/pack" && rm -f "$DIR"/pack/*.tgz
  TGZ=$DIR/pack/$(npm pack --pack-destination "$DIR/pack" 2>/dev/null | tail -1)
  DEST=$NODES/node_modules/n8n-nodes-hyperodds
  rm -rf "$DEST" && mkdir -p "$DEST"
  tar -xzf "$TGZ" -C "$DEST" --strip-components=1
  # As n8n's installer does: no dev or peer dependencies, the package listed in nodes/package.json.
  node -e '
    const fs = require("fs");
    const [pkgPath, rootPath] = process.argv.slice(1);
    const { devDependencies, peerDependencies, optionalDependencies, ...pkg } = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    const root = fs.existsSync(rootPath) ? JSON.parse(fs.readFileSync(rootPath, "utf8")) : { name: "installed-nodes", private: true };
    root.dependencies = { ...root.dependencies, "n8n-nodes-hyperodds": pkg.version };
    fs.writeFileSync(rootPath, JSON.stringify(root, null, 2));
  ' "$DEST/package.json" "$NODES/package.json"
  VERSION=$(node -p "require('$DEST/package.json').version")
  sqlite3 "$DB" <<SQL
DELETE FROM installed_nodes WHERE package = 'n8n-nodes-hyperodds';
DELETE FROM installed_packages WHERE packageName = 'n8n-nodes-hyperodds';
INSERT INTO installed_packages (packageName, installedVersion, authorName, authorEmail, createdAt, updatedAt)
  VALUES ('n8n-nodes-hyperodds', '$VERSION', 'Hyperodds', 'dev@usehyperodds.com',
          STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'), STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'));
INSERT INTO installed_nodes (name, type, latestVersion, package) VALUES
  ('Hyperodds', 'n8n-nodes-hyperodds.hyperodds', 1, 'n8n-nodes-hyperodds'),
  ('Hyperodds Trigger', 'n8n-nodes-hyperodds.hyperoddsTrigger', 1, 'n8n-nodes-hyperodds');
SQL
  echo "installed n8n-nodes-hyperodds@$VERSION into $NODES"
  ;;

start)
  export N8N_USER_FOLDER=$DIR/data
  export N8N_PORT=$PORT
  export N8N_RUNNERS_BROKER_PORT=$((PORT + 10))
  export N8N_HOST=localhost N8N_PROTOCOL=http N8N_LISTEN_ADDRESS=127.0.0.1
  export N8N_WEBHOOK_URL=http://localhost:$PORT/
  export N8N_UNVERIFIED_PACKAGES_ENABLED=true N8N_SECURE_COOKIE=false
  export N8N_DIAGNOSTICS_ENABLED=false N8N_PERSONALIZATION_ENABLED=false
  export N8N_VERSION_NOTIFICATIONS_ENABLED=false N8N_TEMPLATES_ENABLED=false
  export N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
  exec "$DIR/app/node_modules/.bin/n8n" start
  ;;

seed)
  BASE=http://localhost:$PORT
  JAR=$DIR/cookies.txt
  rest() { curl -sf -b "$JAR" -c "$JAR" -H 'browser-id: hyperodds-demo' -H 'content-type: application/json' "$@"; }
  rest -X POST "$BASE/rest/owner/setup" \
    -d "{\"email\":\"$EMAIL\",\"firstName\":\"Demo\",\"lastName\":\"Owner\",\"password\":\"$PASSWORD\"}" >/dev/null \
    || rest -X POST "$BASE/rest/login" -d "{\"emailOrLdapLoginId\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
  SECRET=${HYPERODDS_SIGNING_SECRET:-hyperodds_sig_$(node -p 'require("crypto").randomBytes(32).toString("base64url")')}
  CRED=$(rest -X POST "$BASE/rest/credentials" \
    -d "{\"name\":\"Hyperodds alerts (demo)\",\"type\":\"hyperoddsWebhookApi\",\"data\":{\"signingSecret\":\"$SECRET\"}}" \
    | node -p 'JSON.parse(require("fs").readFileSync(0)).data.id')
  rest -X POST "$BASE/rest/workflows" -d @"$EXAMPLES/top-edges.json" >/dev/null
  WF=$(node -e '
    const wf = require(process.argv[1]);
    wf.nodes[0].credentials = { hyperoddsWebhookApi: { id: process.argv[2], name: "Hyperodds alerts (demo)" } };
    wf.nodes[0].webhookId = require("crypto").randomUUID();
    console.log(JSON.stringify(wf));
  ' "$EXAMPLES/alert-trigger.json" "$CRED" | rest -X POST "$BASE/rest/workflows" -d @-)
  ID=$(echo "$WF" | node -p 'JSON.parse(require("fs").readFileSync(0)).data.id')
  ACTIVATE=$(echo "$WF" | node -p 'const { data } = JSON.parse(require("fs").readFileSync(0)); JSON.stringify({ versionId: data.versionId, expectedChecksum: data.checksum })')
  rest -X POST "$BASE/rest/workflows/$ID/activate" -d "$ACTIVATE" >/dev/null
  WEBHOOK=$(echo "$WF" | node -p 'JSON.parse(require("fs").readFileSync(0)).data.nodes[0].webhookId')
  echo "sign in at $BASE as $EMAIL / $PASSWORD"
  echo "trigger URL: $BASE/webhook/$WEBHOOK/webhook"
  echo "signing secret: $SECRET"
  ;;

*)
  sed -n '2,13p' "$0"
  exit 2
  ;;
esac
