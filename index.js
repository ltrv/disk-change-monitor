'use strict';

const {app, BrowserWindow, ipcMain, dialog} = require('electron')
    , cp = require('child_process')
    , fs = require('fs')
    , path = require('path')
    , url = require('url')
    , locals = {/* ...*/}
    , pug = require('electron-pug')({pretty: true}, locals);


const maxProcesses = 10;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow = null
  , progressWindow = null;

let children = [];

let folderQueue = [];

let appState = "Idle";

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
  , selectedDriveList = {}
  , ttlBytesProcessed = 0
  , ttlFolders = 0
  , ttlFiles = 0;

function resetData() {
  existingStructure = {};
  newStructure = {};
  ttlBytesProcessed = 0;
  ttlFolders = 0;
  ttlFiles = 0;
  appState = "Idle";
  folderQueue = [];
}

function getObjPathObject(path) {
  const parts = path.split( "\\" )
      , length = parts.length 

  let property = newStructure;

  for ( let i = 0; i < length; i++ ) {
    property = property[parts[i]];
  }

  return property;
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
    mainWindow.webContents.send('message', {command: 'init'});
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

  for (let x = 0; x < maxProcesses; x++) {
    const aChild = {
      child: cp.fork(`${__dirname}/child.js`, ["--debug"]),
      isReady: false,
      isActive: false
    }

    children[x] = aChild;

    console.log(`Starting child process: ${x}`)

    children[x].child.on('message', (m) => {
      // console.log(`PARENT got message: `, m);

      if (m.index || m.index == 0) {
        switch(m.command) {
          case "ready":
          children[m.index].isReady = true;
          children[m.index].isActive = false;
          break;

          case "doDirectoryComplete":
          children[m.index].isActive = false;

          if (m.data) {
            let objPath = getObjPathObject(m.data.path);

            for (let key in m.data.objPath) {
              objPath[key] = m.data.objPath[key];

              if (objPath[key].type == 1) {
                ttlBytesProcessed += objPath[key].size;
                newStructure[m.data.driveListKey].ttlFiles += 1;
              } else {
                newStructure[m.data.driveListKey].ttlFolders += 1;
                
                folderQueue.push({folder: `${objPath[key].path}\\`, driveListKey: m.data.driveListKey, path: `${m.data.path}\\${key}\\subFolders`});
              }
            }

            if (progressWindow) {
              progressWindow.webContents.send('message', {command: "updateProgress", data: ttlBytesProcessed});
            }
          }

          checkFolderQueue();
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

function onDone() {
  if (progressWindow) {
    progressWindow.close();

    const thePath = path.join(__dirname, "data",  'previousDriveInfo.json')

    fs.writeFile(thePath, JSON.stringify(newStructure), (err) => {
      console.log("Done");
      appState = "idle";
    });
    // mainWindow.webContents.send('message', {command: "displayResults", data: ""});
    // console.log("Results: " + JSON.stringify(newStructure, null, 4));
  }
}

function checkFolderQueue() {
  if (appState == "running" && folderQueue.length > 0) {
    for (let x = 0; x < maxProcesses; x++) {
      if (children[x].isReady && !children[x].isActive) {
        children[x].isActive = true;

        const folderQueueData = folderQueue.shift();

        children[x].child.send({ command: 'doDirectory', data: folderQueueData});
        checkFolderQueue();
        break;
      }
    }
  } else if (appState == "running" && folderQueue.length == 0) {
    // Check to see if there's any children running.  If not, assume we're done

    let foundOne = false;
    for (let x = 0; x < maxProcesses; x++) {
      if (children[x].isReady && children[x].isActive) {
        foundOne = true;
        break;
      }
    }

    if (!foundOne) {
      // Assume we're done

      // newStructure[driveList[curIndex]]["ttlFiles"] = ttlFiles;
      // newStructure[driveList[curIndex]]["ttlFolders"] = ttlFolders;

      // ttlFiles = 0;
      // ttlFolders = 0;

      onDone();
    }
  }
}

ipcMain.on('mainWindow', (event, message) => {
  // console.log(JSON.stringify(message));

  switch(message.command) {
    case "analyze":
    if (message.data && message.data.selectedDriveList && message.data.selectedDriveList.length > 0 && 
        message.data.drivesObj && Object.keys(message.data.drivesObj).length > 0 ||
        appState == "Idle") {

      resetData();

      newStructure = message.data.drivesObj;

      createProgressWindow(() => {
        progressWindow.webContents.send('message', {command: "init", data: message.data});

        appState = "running";

        selectedDriveList = message.data.selectedDriveList;

        message.data.selectedDriveList.forEach((aDrive) => {
          newStructure[aDrive]["folders"] = {};
          folderQueue.push({folder: `${aDrive}\\`, driveListKey: aDrive, path: `${aDrive}\\folders`});
        });

        checkFolderQueue();
      });
    } else if (!message.data.drivesObj || Object.keys(message.data.drivesObj).length == 0) {
      dialog.showMessageBox({type: "none", title: "Error", message: "Unable to obtain disk information"});
    } else if (appState != "idle") {
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

