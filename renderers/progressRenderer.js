'use strict';

const fs = require('fs')
    , ipc = require('electron').ipcRenderer
    , remote = require('electron').remote
    , parentWindow = remote.getCurrentWindow().id;

const {getWinDrives, getWinDisksize, getWinFreeSpace} = require('./rendererHelpers')

/**
 * existingStructure and newStructure are objects to hold disk information  They contain:
 * 
 * drive - string
 * size - integer
 * date - date
 * folders - object containing
 *  folder / file name - object containing union of folder or file objects - app monitors array size changes and file deletions and additions.  Renaming is listed as a deletion and an addition
 *    name - string
 *    type - 0 = folder, 1 = file
 * 
 *    folder 
 *      path - string 
 *      subFolders - array of folder objects - app monitors array size changes and subfolder name changes
 *    
 *    file
 *      size - integer - app monitors size changes
 * 
 * changes
 *  objectPath - folders[x][y][z]...
 *  changeType - 0 = deleted, 1 - added, 2 = sizeDown, 3 = sizeUp
 */

let existingStructure = {}
  , newStructure = {}
  , drivesArray = []
  , previousDrivesArray = [];

function getFolderContents(folder, callback) {
  fs.readdir('/', (err, files) => {
    //if an error is thrown when reading the directory, we throw it. Otherwise we continue
    if (err) throw err;
    //the files parameter is an array of the files and folders in the path we passed. So we loop through the array, printing each file and folder
    for (let file of files) {
      console.log(file);
    }
  });
}

ipc.on('message', (event, message) => {
  // console.log(JSON.stringify(message));

  switch(message.command) {
    case "init":
    let ttlDiskUsed = 0;

    const drivesObj = message.data.drivesObj;

    message.data.selectedDriveList.forEach((aSelectedDrive) => {
      ttlDiskUsed += drivesObj[aSelectedDrive].usedSpace;
    });

    document.getElementById("progressBar").value = 0;
    document.getElementById("progressBar").max = ttlDiskUsed;
    break;

    case "updateFolder":
    document.getElementById("currentDirectory").innerHTML = message.data;
    break;

    case "updateProgress":
    document.getElementById("progressBar").value = message.data;
    break;
  }
});

document.getElementById("cancelButton").addEventListener("click", function() {
  ipc.send('progressWindow', {command: "cancel", data: {}});
});