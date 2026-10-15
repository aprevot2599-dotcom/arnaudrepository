#!/bin/bash
# Double-click on a Mac to start O.T.T.E.R. as a small helper window.
# First time: in Terminal, run  chmod +x "OTTER Helper.command"
cd "$(dirname "$0")/.."
# Your API key lives outside this folder: put  export ANTHROPIC_API_KEY=sk-ant-...  in ~/.otter-env
[ -f "$HOME/.otter-env" ] && source "$HOME/.otter-env"
[ -d node_modules ] || npm install
npm run helper
