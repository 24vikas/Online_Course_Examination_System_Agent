/**
 * Minimal Electron Ambient Declarations for AURA Proctor Companion
 */

declare module "electron" {
  export interface Display {
    id: number;
    bounds: { x: number; y: number; width: number; height: number };
  }

  export interface Screen {
    getAllDisplays(): Display[];
  }

  export interface WebContents {
    send(channel: string, ...args: any[]): void;
    on(event: string, listener: (...args: any[]) => void): void;
  }

  export interface BrowserWindowOptions {
    width?: number;
    height?: number;
    minWidth?: number;
    minHeight?: number;
    title?: string;
    webPreferences?: any;
    backgroundColor?: string;
  }

  export class BrowserWindow {
    constructor(options?: BrowserWindowOptions);
    webContents: WebContents;
    loadFile(filePath: string): Promise<void>;
    on(event: string, listener: (...args: any[]) => void): void;
    isMinimized(): boolean;
    restore(): void;
    focus(): void;
    static getAllWindows(): BrowserWindow[];
  }

  export interface App {
    requestSingleInstanceLock(): boolean;
    setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
    whenReady(): Promise<void>;
    quit(): void;
    on(event: string, listener: (...args: any[]) => void): void;
  }

  export interface IpcMain {
    handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
  }

  export const app: App;
  export const screen: Screen;
  export const ipcMain: IpcMain;
}

declare namespace NodeJS {
  interface Process {
    defaultApp?: boolean;
  }
}
