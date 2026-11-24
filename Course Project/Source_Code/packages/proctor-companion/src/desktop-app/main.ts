/**
 * Electron Main Process for AURA Proctor Desktop Companion
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { app, BrowserWindow, screen, ipcMain } from "electron";
import path from "path";

let mainWindow: BrowserWindow | null = null;
let currentChallenge: string | null = null;
let currentAttemptId: string | null = null;

// Register custom protocol aura-proctor://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("aura-proctor", process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient("aura-proctor");
}

function parseCustomUrl(urlStr: string) {
  try {
    const url = new URL(urlStr);
    if (url.protocol === "aura-proctor:") {
      currentChallenge = url.searchParams.get("challenge") || currentChallenge;
      currentAttemptId = url.searchParams.get("attemptId") || currentAttemptId;
    }
  } catch {}
}

// Windows single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event: any, commandLine: string[]) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const uri = commandLine.find((arg: string) => arg.startsWith("aura-proctor://"));
    if (uri) {
      parseCustomUrl(uri);
      mainWindow?.webContents.send("proctor:url-challenge", {
        challenge: currentChallenge,
        attemptId: currentAttemptId,
      });
    }
  });
}

function createWindow() {
  const displays = screen.getAllDisplays();
  const isSingleDisplay = displays.length === 1;

  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: "AURA Proctor Companion — KLE Technological University",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webgl: true,
    },
    backgroundColor: "#0f172a",
  });

  mainWindow.loadFile(path.join(__dirname, "renderer.html"));

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("proctor:init-data", {
      isSingleDisplay,
      displayCount: displays.length,
      challenge: currentChallenge,
      attemptId: currentAttemptId,
      os: `${process.platform}-${process.arch}`,
      version: "1.0.0",
    });
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle("proctor:check-displays", () => {
  const displays = screen.getAllDisplays();
  return {
    displayCount: displays.length,
    isSingleDisplay: displays.length === 1,
  };
});

app.whenReady().then(() => {
  // Check CLI args for protocol URL or flags
  process.argv.forEach((arg) => {
    if (arg.startsWith("aura-proctor://")) {
      parseCustomUrl(arg);
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
