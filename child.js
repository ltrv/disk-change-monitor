'use strict';

const fs = require('fs')
    , path = require('path')
    , url = require('url');

let index = 0;

process.on('message', (m) => {
  console.log('CHILD got message:', m);

  switch(m.command) {
    case "init":
    index = m.data;
    process.send({ command: 'ready', index: index, data: "" });
    break;
  }
});

