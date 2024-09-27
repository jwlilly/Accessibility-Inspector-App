/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { Client, Device } from 'adb-ts';
import { IDevice } from 'adb-ts/lib/util';
import log from 'electron-log';
import { execFile } from 'child_process';
// @ts-ignore
import * as mDnsSd from 'node-dns-sd';
import { nanoid } from 'nanoid';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;
let adb: Client | null = null;
let ADB_PATH = '';

const deviceNetworkForward = {
  local: 'tcp:38301',
  remote: 'tcp:38301',
};

const ADB_BIN = process.platform === 'darwin' ? 'adb' : 'adb.exe';

async function adbListDevices(): Promise<IDevice[] | null> {
  if (adb) {
    const devices = await adb.listDevices();
    return devices;
  }
  return null;
}

async function adbScreencap(device: IDevice): Promise<string> {
  if (adb) {
    const screencap = await adb.screenshot(device.id);
    return screencap.toString('base64');
  }
  return '';
}

async function adbRemoveForward(): Promise<boolean> {
  if (adb) {
    execFile(
      path.join(ADB_PATH, ADB_BIN),
      ['forward', '--list'],
      (err, stdout) => {
        if (stdout) {
          const lines = stdout.trim().split('\n');
          // eslint-disable-next-line no-restricted-syntax, guard-for-in
          for (const index in lines) {
            const device = lines[index].split(' ');
            execFile(
              path.join(ADB_PATH, ADB_BIN),
              ['-s', device[0], 'forward', '--remove-all'],
              (err1: any, stdout1: string, stderr1: any) => {
                if (err1) {
                  console.log(err1);
                }
                if (stderr1 && !stdout1) {
                  console.log(
                    stderr1.trim(),
                    ['-s', device[0], 'forward', '--remove-all'].join(' '),
                  );
                }
                if (/Error/.test(stdout1)) {
                  console.log(
                    stdout1.trim(),
                    ['-s', device[0], 'forward', '--remove-all'].join(' '),
                  );
                }
                console.log('clearing forwards', stdout1);
              },
            );
          }
        }
        console.log(stdout.trim().split('\n'));
      },
    );
  }
  return false;
}

async function adbStartService(device: IDevice): Promise<boolean> {
  if (adb) {
    execFile(
      path.join(ADB_PATH, ADB_BIN),
      [
        '-s',
        `${device.id}`,
        'shell',
        'am',
        'start-foreground-service',
        'com.jwlilly.accessibilityinspector/.SocketService',
      ],
      (err1: any, stdout1: string, stderr1: any) => {
        if (err1) {
          console.log(err1);
        }
        if (stderr1 && !stdout1) {
          console.log(
            stderr1.trim(),
            [
              'shell',
              'am',
              'start-foreground-service',
              'com.jwlilly.accessibilityinspector/.SocketService',
            ].join(' '),
          );
          return true;
        }
        if (/Error/.test(stdout1)) {
          console.log(
            stdout1.trim(),
            [
              'shell',
              'am',
              'start-foreground-service',
              'com.jwlilly.accessibilityinspector/.SocketService',
            ].join(' '),
          );
          return false;
        }
        console.log('starting service', stdout1);
        return false;
      },
    );
  }
  return false;
}

async function adbStartAccService(device: IDevice): Promise<boolean> {
  const accServiceName =
    'com.jwlilly.accessibilityinspector/com.jwlilly.accessibilityinspector.AccessibilityInspector';
  const secure = 'secure';
  const settingName = 'enabled_accessibility_services';
  if (adb) {
    const settings = await adb.getSetting(device.id, secure, settingName);
    if (settings) {
      const settingsList = settings.toString().split(':');
      if (!settingsList.includes(accServiceName)) {
        settingsList.push(accServiceName);
        try {
          await adb.putSetting(
            device.id,
            secure,
            settingName,
            settingsList.join(':'),
          );
          return true;
        } catch (error: any) {
          console.log(error);
          return false;
        }
      }
    } else {
      try {
        await adb.putSetting(device.id, secure, settingName, accServiceName);
        return true;
      } catch (error: any) {
        console.log(error);
        return false;
      }
    }
  }
  return false;
}

async function adbIsAppInstalled(device: IDevice): Promise<boolean> {
  if (adb) {
    const packages = await adb.listPackages(device.id);
    return packages.includes('com.jwlilly.accessibilityinspector');
  }
  return true;
}

async function adbForward(device: IDevice): Promise<boolean> {
  if (adb) {
    try {
      const selectedDevice = new Device(adb, device);
      await adbRemoveForward();
      setTimeout(async () => {
        await selectedDevice.forward(
          deviceNetworkForward.local,
          deviceNetworkForward.remote,
        );
      }, 1000);
      return true;
    } catch (error: any) {
      console.log(error);
    }
  }
  return false;
}

let wifiName = '';
let password = '';

function getDevice(service: any) {
  return {
    address: service.address,
    port: service.service.port,
  };
}

function connect({ address, port }: any) {
  if (adb) {
    execFile(
      path.join(ADB_PATH, ADB_BIN),
      ['pair', `${address}:${port}`, password],
      (err1: any, stdout1: string, stderr1: any) => {
        if (err1) {
          console.log(err1);
        }
        if (stderr1 && !stdout1) {
          console.log(
            stderr1.trim(),
            ['pair', `${address}:${port}`, password].join(' '),
          );
        }
        if (/Error/.test(stdout1)) {
          console.log(
            stdout1.trim(),
            ['pair', `${address}:${port}`, password].join(' '),
          );
        }
        console.log('connected over network', stdout1);
      },
    );
  }
}

let continueDiscover = true;

function stopDiscover() {
  continueDiscover = false;
  return true;
}

async function startDiscover() {
  if (continueDiscover) {
    const deviceList = await mDnsSd.discover({
      name: '_adb-tls-pairing._tcp.local',
    });
    if (deviceList.length === 0) {
      return startDiscover();
    }
    const item = getDevice(deviceList[0]);
    connect(item);
  }
  return stopDiscover();
}

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('adb-list-devices', async () => {
  return adbListDevices();
});

ipcMain.handle('adb-screencap', async (_event, args) => {
  return adbScreencap(args[0]);
});

ipcMain.handle('adb-forward', async (_event, args) => {
  return adbForward(args[0]);
});

ipcMain.handle('adb-app-installed', async (_event, args) => {
  return adbIsAppInstalled(args[0]);
});

ipcMain.handle('adb-start-service', async (_event, args) => {
  await adbStartAccService(args[0]);
  return adbStartService(args[0]);
});

ipcMain.handle('wifi-connect-start', async () => {
  wifiName = `ADB_WIFI_${nanoid()}`;
  password = nanoid();
  continueDiscover = true;
  startDiscover();
  return `WIFI:T:ADB;S:${wifiName};P:${password};;`;
});

ipcMain.handle('wifi-connect-stop', async () => {
  stopDiscover();
  return [true];
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  ADB_PATH = path.join(getAssetPath(), 'adb');
  adb = new Client({ bin: path.join(ADB_PATH, ADB_BIN) });

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath(path.join('png', '128x128.png')),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
