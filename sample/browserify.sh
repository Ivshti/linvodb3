#!/usr/bin/env bash
./node_modules/browserify/bin/cmd.js \
	-r ./index.js:linvodb \
	-r ./node_modules/memdown/memdown.js:memdown \
	-r ./node_modules/level-js/index.js:level-js \
	> sample/bundle.js
