'use strict';

const fs = require('fs')
    , url = require('url')
    , path = require('path')
    , ipc = require('electron').ipcRenderer
    , remote = require('electron').remote
    , progressWindow = remote.BrowserWindow
    , parentWindow = remote.getCurrentWindow().id;

const {getWinDrives, getWinDisksize, getWinFreeSpace} = require('./rendererHelpers')

let drivesObj = {}
  , previousDrivesObj = {};

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

function init(callback) {
  // Get Drive Info

  getWinDrives((data) => {
    const driveListArray = data;

    getWinDisksize((data) => {
      const driveSizeArray = data;

      getWinFreeSpace((data) => {
        const freeSpaceArray = data;

        drivesObj.date = new Date();

        for (let x = 0; x < driveListArray.length; x++) {
          // Don't offer drives that have no size (i.e. Empty CD Roms)

          if (parseInt(driveSizeArray[x]) > 0) {
            const aDrive = {
              drive: driveListArray[x],
              driveSize: parseInt(driveSizeArray[x]),
              freeSpace: parseInt(freeSpaceArray[x]),
              usedSpace: parseInt(driveSizeArray[x]) - parseInt(freeSpaceArray[x])
            };

            drivesObj[aDrive.drive] = aDrive;
          }
        }

        const displayListSelect = document.getElementById('driveList');

        for (let key in drivesObj) {
          if (key != "date") {
            let option = document.createElement("option");

            option.value = drivesObj[key].drive;
            option.text = `${drivesObj[key].drive} - ${drivesObj[key].usedSpace.toLocaleString()} bytes used`;
            displayListSelect.add(option);
          }
        };

        // Get Previous Info if it exists

        fs.readFile("./data/previousDriveInfo.json", (err, data) => {
          if (!err) {
            previousDrivesObj = JSON.parse(data);

            document.getElementById('previousInfoList').innerHTML = `Previous Information - ${new Date(previousDrivesObj.date).toString()}`;

            const previousDisplayListSelect = document.getElementById('previousInfoList');

            for (let key in previousDrivesObj) {
              if (key.indexOf(":") != -1) {
                let option = document.createElement("option")
                  , bytesChanged = 0;

                // Get the number of bytes changed since last run

                if (drivesObj[key]) {
                  bytesChanged = previousDrivesObj[key].usedSpace - drivesObj[key].usedSpace;
                } else {
                  bytesChanged = previousDrivesObj[key].usedSpace;
                }

                option.value = previousDrivesObj[key].drive;
                option.text = `${previousDrivesObj[key].drive} - ${previousDrivesObj[key].usedSpace.toLocaleString()} bytes used :: ${bytesChanged.toLocaleString()} bytes changed`;
                previousDisplayListSelect.add(option);
              }
            };
          }

          callback();
        });
      });
    });
  });
}

init(() => {
  document.getElementById("analyze").addEventListener("click", function() {
    const displayListSelect = document.getElementById('driveList');

    const driveList = Array.prototype.slice.call(document.querySelectorAll('#driveList option:checked'), 0).map(function(v, i, a) { 
        return v.value; 
    });

    ipc.send('mainWindow', {command: "analyze", data: {drivesObj: drivesObj, selectedDriveList: driveList}});
  });  
});

ipc.on('message', (event, message) => {
  console.log(JSON.stringify(message, null, 4));

  switch(message.command) {
    case "displayResults":
    const data = ipc.sendSync("mainWindow", {command: "getResults", data: ""});

    console.log("Results: " + JSON.stringify(data, null, 4));

    document.getElementById("results").text = JSON.stringify(data, null, 4);
    break;
  }
});

