'use strict';

const {app, BrowserWindow, ipcMain, dialog} = require('electron')
    , cp = require('child_process')
    , fs = require('fs')
    , path = require('path')
    , url = require('url')
    , locals = {/* ...*/}
    , pug = require('electron-pug')({pretty: true}, locals);


// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null
  , progressWindow = null;

let children = [];

/**
 * existingStructure and newStructure are objects to hold disk information  They contain:
 * 
 * drive - string
 * size - integer
 * date - date
 * ttlFiles - integer
 * ttlFolders - integer
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
  , currentStructure = {}
  , ttlBytesProcessed = 0
  , ttlFolders = 0
  , ttlFiles = 0;

function resetData() {
  existingStructure = {};
  newStructure = {};
  ttlBytesProcessed = 0;
  ttlFolders = 0;
  ttlFiles = 0;
}

function createMainWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({width: 800, height: 600, resizable: false, show: false})

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, "views",  'index.pug'),
    protocol: 'file:',
    slashes: true
  }))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  }); 

  // Open the DevTools.
  mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

function createProgressWindow(callback) {
  // Create the browser window.
  progressWindow = new BrowserWindow({width: 545, height: 235, parent: mainWindow, modal: true, resizable: false, show: false});

  progressWindow.setMenu(null);

  // and load the index.html of the app.
  progressWindow.loadURL(url.format({
    pathname: path.join(__dirname, "views",  'progressView.pug'),
    protocol: 'file:',
    slashes: true
  }))

  progressWindow.once('ready-to-show', () => {
    progressWindow.show();

    if (callback) callback();
  }); 

  progressWindow.webContents.openDevTools()

  progressWindow.on('closed', function () {
    progressWindow = null
  })
}

function initApp() {
  // Create fork'd processes

  for (let x = 0; x < 10; x++) {
    const aChild = {
      child: cp.fork(`${__dirname}/child.js`),
      isReady: false,
      isActive: false
    }

    children[x] = aChild;

    console.log(`Starting child process: ${x}`)

    children[x].child.on('message', (m) => {
      console.log(`PARENT got message: `, m);

      if (m.index || m.index == 0) {
        switch(m.command) {
          case "ready":
          children[m.index].isReady = true;
          children[m.index].isActive = false;
          break;
        }
      } else {
        console.error("Unable to process child message.  No index")
      }
    });

    children[x].child.send({ command: 'init', data: x });
  }

  createMainWindow();
}

app.on('ready', initApp)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow()
  }
})

function getEachFolderItem(fileList, curIndex, folder, objPath, callback) {
  if (!fileList || curIndex >= fileList.length) {
    callback();
  } else {
    fs.lstat(`${folder}${fileList[curIndex]}`, (err, statObj) => {
      if (err) {
        if (err.code == "EPERM" || err.code == "EBUSY" || err.code == "ENOENT") {
          console.error(`Unable to lstat: ${folder}${fileList[curIndex]}.  Error ${JSON.stringify(err, null, 4)}`);
          getEachFolderItem(fileList, curIndex + 1, folder, objPath, callback);
        } else {
          callback(err);
        }
      } else {
        if (statObj.isDirectory()) {
          ttlFolders += 1;

          objPath[fileList[curIndex]] = {name: fileList[curIndex], type: 0, path: `${folder}${fileList[curIndex]}`, subFolders: {}};

          getFolderContents(`${folder}${fileList[curIndex]}\\`, objPath[fileList[curIndex]]["subFolders"], (err) => {
            if (err) callback(err);
            else getEachFolderItem(fileList, curIndex + 1, folder, objPath, callback);
          });
        } else if (statObj.isSymbolicLink()) {
          // do nothing

          getEachFolderItem(fileList, curIndex + 1, folder, objPath, callback);
        } else if (statObj.isFile()) {
          ttlFiles += 1;

          objPath[fileList[curIndex]] = {name: fileList[curIndex], type: 1, size: statObj.size};

          ttlBytesProcessed += statObj.size;

          if (progressWindow) {
            progressWindow.webContents.send('message', {command: "updateProgress", data: ttlBytesProcessed});
          }
          getEachFolderItem(fileList, curIndex + 1, folder, objPath, callback);
        } else {
          console.error(`Got unknown directory entry: ${folder}${fileList[curIndex]}`);

          getEachFolderItem(fileList, curIndex + 1, folder, objPath, callback);
        }
      }
    });
  }
}

// Note that folder must always in in "\"

function getFolderContents(folder, objPath, callback) {
  if (progressWindow) {
    progressWindow.webContents.send('message', {command: "updateFolder", data: folder});

    fs.readdir(folder, (err, files) => {
      if (err) {
        callback(err);
      } else {
        getEachFolderItem(files, 0, folder, objPath, callback);
      }
    });
  } else {
    callback("Progress Window is null");
  }
}

function getEachDriveData(driveList, curIndex, callback) {
  if (!driveList || curIndex >= driveList.length) {
    callback();
  } else {
    newStructure[driveList[curIndex]]["folders"] = {};

    getFolderContents(`${driveList[curIndex]}\\`, newStructure[driveList[curIndex]]["folders"], (err) => {
      if (err) {
        callback(err);
      } else {
        newStructure[driveList[curIndex]]["ttlFiles"] = ttlFiles;
        newStructure[driveList[curIndex]]["ttlFolders"] = ttlFolders;

        ttlFiles = 0;
        ttlFolders = 0;

        getEachDriveData(driveList, curIndex + 1, callback);
      }
    });
  }
}

ipcMain.on('mainWindow', (event, message) => {
  // console.log(JSON.stringify(message));

  switch(message.command) {
    case "analyze":
    if (message.data && message.data.selectedDriveList && message.data.selectedDriveList.length > 0 && 
        message.data.drivesObj && Object.keys(message.data.drivesObj).length > 0) {

      resetData();

      newStructure = message.data.drivesObj;

      createProgressWindow(() => {
        progressWindow.webContents.send('message', {command: "init", data: message.data});

        getEachDriveData(message.data.selectedDriveList, 0, (err) => {
          if (err) {
            if (progressWindow) {
              progressWindow.close();
              dialog.showMessageBox({type: "none", title: "Error", message: `Error getting disk information.  Err: ${err}`});
            }
          } else {
            if (progressWindow) {
              progressWindow.close();

              const thePath = path.join(__dirname, "data",  'previousDriveInfo.json')

              fs.writeFile(thePath, JSON.stringify(newStructure), (err) => {
                console.log("Done");
              });
              // mainWindow.webContents.send('message', {command: "displayResults", data: ""});
              // console.log("Results: " + JSON.stringify(newStructure, null, 4));
            }
          }
        });
      });
    } else if (!message.data.drivesObj || Object.keys(message.data.drivesObj).length == 0) {
      dialog.showMessageBox({type: "none", title: "Error", message: "Unable to obtain disk information"});
    } else {
      dialog.showMessageBox({type: "none", title: "Error", message: "You did not select any drives to analyse"});
    }
    break;

    case "getResults":
    event.returnValue = newStructure;
    break;
  }
});

ipcMain.on('progressWindow', (event, message) => {
  console.log(JSON.stringify(message));

  switch(message.command) {
    case "cancel":
    progressWindow.close();
    break;
  }
});

