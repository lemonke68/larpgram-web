#!/usr/bin/env bash
# Two private localhost origins, both using the same synthetic Matrix state.
set -euo pipefail
web=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
scratch=$(mktemp -d)
before_pid=''
after_pid=''
trap 'for child in "$before_pid" "$after_pid"; do if [[ -n $child ]]; then kill "$child" 2>/dev/null || :; fi; done; rm -rf -- "$scratch"' EXIT
for version in before after; do
 mkdir "$scratch/$version"
 git -C "$web" archive c2b6713 | tar -x -C "$scratch/$version"
 ln -s "$web/node_modules" "$scratch/$version/node_modules"
 if [[ $version == after ]]; then cp -a "$web/src/." "$scratch/$version/src/"; fi
 cp "$web/scripts/fixtures/design-session.ts" "$scratch/$version/src/session.ts"
 cat > "$scratch/$version/vite.config.ts" <<'CONFIG'
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{alias:[{find:/^matrix-js-sdk\/lib\/matrixrtc$/,replacement:fileURLToPath(new URL('./src/matrixrtc-shim.ts',import.meta.url))}]}});
CONFIG
done
"$web/node_modules/.bin/vite" "$scratch/before" --host 127.0.0.1 --port 4201 --strictPort &
before_pid=$!
"$web/node_modules/.bin/vite" "$scratch/after" --host 127.0.0.1 --port 4202 --strictPort &
after_pid=$!
wait -n "$before_pid" "$after_pid"
