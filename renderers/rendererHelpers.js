'use strict';

/**
 * Helper functions for the renderer
 */

exports.getWinDrives = function(successCB, errorCB) {
  let stdout = ''
    , spawn = require('child_process').spawn
    , list  = spawn('cmd');

  list.stdout.on('data', function (data) {
    stdout += data;
  });

  list.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  list.on('exit', function (code) {
    if (code == 0) {
        var data = stdout.split('\r\n');
        data = data.splice(4,data.length - 7);
        data = data.map(Function.prototype.call, String.prototype.trim);
        successCB(data);
    } else {
        console.log('child process exited with code ' + code);
        errorCB();
    }
  });

  list.stdin.write('wmic logicaldisk get Caption\n');
  list.stdin.end();
}

exports.getWinDisksize = function(successCB, errorCB) {
  let stdout = ''
    , spawn = require('child_process').spawn
    , list  = spawn('cmd');

  list.stdout.on('data', function (data) {
    stdout += data;
  });

  list.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  list.on('exit', function (code) {
    if (code == 0) {
        var data = stdout.split('\r\n');
        data = data.splice(4,data.length - 7);
        data = data.map(Function.prototype.call, String.prototype.trim);
        successCB(data);
    } else {
        console.log('child process exited with code ' + code);
        errorCB();
    }
  });

  list.stdin.write('wmic logicaldisk get Size\n');
  list.stdin.end();
}

exports.getWinFreeSpace = function(successCB, errorCB) {
  let stdout = ''
    , spawn = require('child_process').spawn
    , list  = spawn('cmd');

  list.stdout.on('data', function (data) {
    stdout += data;
  });

  list.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  list.on('exit', function (code) {
    if (code == 0) {
        var data = stdout.split('\r\n');
        data = data.splice(4,data.length - 7);
        data = data.map(Function.prototype.call, String.prototype.trim);
        successCB(data);
    } else {
        console.log('child process exited with code ' + code);
        errorCB();
    }
  });

  list.stdin.write('wmic logicaldisk get FreeSpace\n');
  list.stdin.end();
}

