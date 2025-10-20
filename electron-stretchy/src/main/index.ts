import {
  app, shell, BrowserWindow, ipcMain, Tray, Menu, Notification, nativeImage, screen
} from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';

let mainWindow: BrowserWindow | null = null;
let widgetWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// -------- 위젯 위치 계산(우측 하단/상단) --------
function calcWidgetPos(pos: 'bottom-right' | 'top-right', W: number, H: number) {
  const { workArea } = screen.getPrimaryDisplay();
  const margin = 12;
  const x = workArea.x + workArea.width - W - margin;
  const y =
    pos === 'bottom-right'
      ? workArea.y + workArea.height - H - margin
      : workArea.y + margin;
  return { x, y };
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    frame: false,              // 커스텀 타이틀바 사용
    transparent: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());

  // 닫기(X) → 숨김 + 위젯 표시
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow?.hide();
      showWidget();
    }
  });

  // 외부 링크는 브라우저로
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' as const };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

function createWidget() {
  const W = 280;
  const H = 120;
  const { x, y } = calcWidgetPos('bottom-right', W, H);

  widgetWindow = new BrowserWindow({
    width: W,
    height: H,
    x,
    y,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: true, // 위에 떠 있게
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  });

  // 렌더러에서 위젯용 라우트 사용(예: #/widget)
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    widgetWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/widget');
  } else {
    widgetWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'widget' });
  }
}

function showWidget() {
  if (!widgetWindow) createWidget();
  widgetWindow?.showInactive(); // 포커스 훔치지 않게
}

function hideWidget() {
  widgetWindow?.hide();
}

function createTray() {
  const trayImage = nativeImage.createFromPath(icon);
  tray = new Tray(trayImage);

  const menu = Menu.buildFromTemplate([
    { label: '설정 열기', click: () => { hideWidget(); mainWindow?.show(); } },
    { label: '위젯 보이기', click: () => showWidget() },
    {
      label: '지금 알림',
      click: () => new Notification({ title: '스트레칭', body: '1분 스트레칭 타임!' }).show()
    },
    { type: 'separator' },
    { label: '종료', click: () => { quitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Stretchy');
  tray.setContextMenu(menu);
  tray.on('click', () => { // 좌클릭 토글
    if (mainWindow?.isVisible()) mainWindow.hide();
    else { hideWidget(); mainWindow?.show(); }
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.example.stretchy');

  app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w));
  app.once('before-quit', () => { quitting = true; });

  // IPC: 렌더러 커스텀 버튼 → 동작
  ipcMain.handle('app:closeToWidget', () => { mainWindow?.hide(); showWidget(); });
  ipcMain.handle('app:minimizeToWidget', () => { mainWindow?.hide(); showWidget(); });
  ipcMain.handle('app:openSettings', () => { hideWidget(); mainWindow?.show(); });

  createMainWindow();
  createWidget();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) { createMainWindow(); createWidget(); }
  else { hideWidget(); mainWindow?.show(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
