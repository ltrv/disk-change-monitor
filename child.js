'use strict';

const fs = require('fs')
    , path = require('path')
    , url = require('url');

let index = 0;

function getEachFolderItem(fileList, curIndex, data) {
  if (!fileList || curIndex >= fileList.length) {
    process.send({ command: 'doDirectoryComplete', index: index, data: data});
  } else {
    fs.lstat(`${data.folder}${fileList[curIndex]}`, (err, statObj) => {
      if (err) {
        console.error(`Unable to lstat: ${data.folder}${fileList[curIndex]}.  Error: `, err);
        getEachFolderItem(fileList, curIndex + 1, data);
      } else {
        if (statObj.isDirectory()) {
          data.objPath[fileList[curIndex]] = {name: fileList[curIndex], type: 0, path: `${data.folder}${fileList[curIndex]}`, subFolders: {}};

          getEachFolderItem(fileList, curIndex + 1, data);
        } else if (statObj.isSymbolicLink()) {
          // do nothing

          getEachFolderItem(fileList, curIndex + 1, data);
        } else if (statObj.isFile()) {
          data.objPath[fileList[curIndex]] = {name: fileList[curIndex], type: 1, size: statObj.size};

          getEachFolderItem(fileList, curIndex + 1, data);
        } else {
          console.error(`Got unknown directory entry: ${data.folder}${fileList[curIndex]}`);

          getEachFolderItem(fileList, curIndex + 1, data);
        }
      }
    });
  }
}

// Note that folder must always end with "\"

function getFolderContents(data) {
  fs.readdir(data.folder, (err, files) => {
    if (err) {
      console.error(`Unable to read folder ${data.folder}.  Error: `, err);
      process.send({ command: 'doDirectoryComplete', index: index});
    } else {
      // console.log(`Got files: ${JSON.stringify(files)} in folder: ${data.folder} with objPath: ${JSON.stringify(data.objPath)}`);
      data.objPath = {};
      getEachFolderItem(files, 0, data, {});
    }
  });
}


process.on('message', (m) => {
  // console.log('CHILD got message:', m);

  switch(m.command) {
    case "init":
    index = m.data;
    process.send({ command: 'ready', index: index, data: "" });
    break;

    case "doDirectory":
    if (m.data) {
      getFolderContents(m.data);
    } else {
      process.send({ command: 'doDirectoryComplete', index: index});
    }
    break;
  }
});

