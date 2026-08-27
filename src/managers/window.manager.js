const { app, BrowserWindow, screen, desktopCapturer, dialog } = require('electron');
const path = require('path');
const logger = require('../core/logger').createServiceLogger('WINDOW');
const config = require('../core/config');

const ALWAYS_ON_TOP_ENFORCE_MS = Number(process.env.VYSPER_ALWAYS_ON_TOP_ENFORCE_MS || 0);
const SCREEN_SHARING_WATCH_ENABLED = process.env.VYSPER_SCREEN_SHARING_WATCH === '1';
const SCREEN_SHARING_WATCH_MS = Number(process.env.VYSPER_SCREEN_SHARING_WATCH_MS || 30000);
const SCREEN_WATCH_MS = Number(process.env.VYSPER_SCREEN_WATCH_MS || 5000);
const DESKTOP_WATCH_MS = Number(process.env.VYSPER_DESKTOP_WATCH_MS || 30000);

class WindowManager {
  constructor() {
    this.windows = new Map();
    this.activeWindow = 'main';
    this.isInteractive = false;
    this.isVisible = false;
    this.currentDisplay = null;
    this.screenWatcher = null;
    this.desktopWatcher = null;
    this.lastActiveSpace = null;
    this.screenSharingWatcher = null;
    this.isScreenBeingShared = false;
    this.wasVisibleBeforeSharing = false;
    this.isInitialized = false;
    this.isInitializing = false;
    this.isRecording = false;
    this.selectionOverlayWindows = [];
    this.displayPickerPromise = null;
    this.displayPickerActive = false;
    this.preCaptureVisibleWindows = null;
    this.pinnedDisplayMode = false;
    this.pinnedDisplayId = null;
    this.pinnedDisplay = null;
    
    // Add debouncing to prevent excessive operations
    this.lastEnforceTime = 0;
    this.enforceDebounceMs = 1000; // Only enforce once per second
    this.focusLocked = false; // Prevent focus loops
    
    // Window binding properties
    this.bindWindows = true; // Enable window binding by default
    this.windowGap = 10; // Small gap between windows
    this.boundWindowsPosition = { x: 0, y: 0 }; // Track position of bound windows
    
    this.windowConfigs = {
      main: {
        width: 520,
        height: 35,
        useContentSize: true,
        file: 'index.html',
        title: 'Vysper'
      },
      chat: {
        width: 500,
        height: 700,
        file: 'chat.html',
        title: 'Chat'
      },
      guide: {
        file: 'reference-guide.html',
        title: 'Terminal'
      },
      llmResponse: {
        width: 250,
        height: 350,
        file: 'llm-response.html',
        title: 'AI Response',
        alwaysOnTop: true
      },
      settings: {
        width: 400,
        height: 380,
        file: 'settings.html',
        title: 'Settings',
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        skipTaskbar: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        alwaysOnTop: true,
        visibleOnAllWorkspaces: true,
        fullscreenable: false
      },
      selectionOverlay: {
        file: 'selection-overlay.html',
        title: 'Region Select'
      }
    };

    this.init();
  }

  init() {
    // ... existing initialization code ...
  }

  async initializeWindows() {
    if (this.isInitialized || this.isInitializing) {
      logger.warn('Windows already initialized or initializing');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing application windows');
    
    try {
      logger.debug('Creating main window');
      await this.createMainWindow();
      logger.debug('Creating chat window');
      await this.createChatWindow();
      logger.debug('Creating LLM response window');
      await this.createLLMResponseWindow();
      logger.debug('Creating settings window');
      await this.createSettingsWindow();

      // Reposicionar con todas las ventanas ya registradas para fijar main arriba-derecha
      // (durante la creacion individual llmResponse aun no estaba en el mapa).
      if (this.bindWindows) {
        this.positionBoundWindows();
      }

      this.setupWindowEventHandlers();
      this.setupScreenTracking();
      this.setupScreenSharingDetection();
      
      this.isInitialized = true;
      this.isInitializing = false;
      logger.info('All windows initialized successfully');
    } catch (error) {
      this.isInitializing = false;
      logger.error('Failed to initialize windows', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async createMainWindow() {
    if (this.windows.has('main')) {
      return this.windows.get('main');
    }
    const window = await this.createWindow('main', false); // Don't show during creation
    this.windows.set('main', window);
    this.isVisible = true;
    
    // Immediate always-on-top enforcement for main window
    if (process.platform === 'darwin') {
      try {
        window.setAlwaysOnTop(true, 'screen-saver', 2);
      } catch (error) {
        window.setAlwaysOnTop(true, 'floating', 2);
      }
    } else {
      window.setAlwaysOnTop(true);
    }
    
    // DevTools can be opened manually if needed for debugging
    // window.webContents.openDevTools({ mode: 'detach' });
    
    // Wait for app to fully initialize and detect current desktop
    setTimeout(() => {
      this.showOnCurrentDesktop(window);
      
      // Additional enforcement after showing
      setTimeout(() => {
        if (!window.isDestroyed()) {
          if (process.platform === 'darwin') {
            try {
              window.setAlwaysOnTop(true, 'screen-saver', 2);
            } catch (error) {
              window.setAlwaysOnTop(true, 'floating', 2);
            }
          } else {
            window.setAlwaysOnTop(true);
          }
        }
      }, 200);
    }, 100);
    
    return window;
  }

  async createChatWindow() {
    if (this.windows.has('chat')) {
      return this.windows.get('chat');
    }
    const window = await this.createWindow('chat');
    this.windows.set('chat', window);
    window.hide();
    return window;
  }

  async createLLMResponseWindow() {
    if (this.windows.has('llmResponse')) {
      return this.windows.get('llmResponse');
    }
    const window = await this.createWindow('llmResponse');
    this.windows.set('llmResponse', window);
    window.hide();
    return window;
  }

  async createSettingsWindow() {
    if (this.windows.has('settings')) {
      return this.windows.get('settings');
    }
    const window = await this.createWindow('settings');
    this.windows.set('settings', window);
    window.hide();
    return window;
  }

  async createWindow(type, showOnCreate = false) {
    const windowConfig = this.windowConfigs[type];
    if (!windowConfig) {
      throw new Error(`Unknown window type: ${type}`);
    }

    // Base options
    const baseOptions = {
      width: windowConfig.width,
      height: windowConfig.height,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: true,
        devTools: true, // Enable DevTools for debugging
      },
      show: false, // Never show during creation, use showOnCurrentDesktop instead
      title: windowConfig.title,
      skipTaskbar: true,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      fullscreenable: false,
      // Platform-specific always-on-top settings
      ...(process.platform === 'darwin' && {
        level: 'floating' // Start with floating level for macOS
      })
    };

    // Type-specific window configurations
    let browserWindowOptions;
    
    if (type === 'settings') {
      // Completely minimal settings window - no decorations at all
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        backgroundColor: '#00000000',
        level: process.platform === 'darwin' ? 'floating' : undefined,
        // Additional macOS flags for better always-on-top behavior
        ...(process.platform === 'darwin' && {
          type: 'panel',
          acceptFirstMouse: true,
          disableAutoHideCursor: true
        })
      };
    } else if (type === 'main') {
      // Main window configuration - fit to content, completely frameless
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        titleBarOverlay: false,
        transparent: true,
        backgroundColor: '#00000000',
        resizable: false,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        useContentSize: windowConfig.useContentSize || false,
        thickFrame: false,
        focusable: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          acceptFirstMouse: true,
          disableAutoHideCursor: true,
          type: 'panel'
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'llmResponse') {
      // LLM Response window - completely frameless, just content
      browserWindowOptions = {
        ...baseOptions,
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        backgroundColor: '#00000000',
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: false,
        thickFrame: false,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          type: 'panel',
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else if (type === 'chat') {
      // Chat window - frameless without window controls
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: false,
        titleBarStyle: 'hidden',
        transparent: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        closable: false,
        hasShadow: true,
        ...(process.platform === 'darwin' && {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: -100, y: -100 },
          type: 'panel',
          acceptFirstMouse: true
        }),
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    } else {
      // Other windows (skills)
      browserWindowOptions = {
        ...baseOptions,
        minWidth: config.get('window.minWidth'),
        minHeight: config.get('window.minHeight'),
        maxWidth: config.get('window.maxWidth'),
        maxHeight: config.get('window.maxHeight'),
        frame: true,
        titleBarStyle: 'default',
        transparent: false,
        resizable: true,
        minimizable: false,
        maximizable: true,
        closable: true,
        hasShadow: true,
        level: process.platform === 'darwin' ? 'floating' : undefined,
      };
    }

    // Windows-specific settings
    if (process.platform === 'win32') {
      browserWindowOptions = {
        ...browserWindowOptions,
        parent: null,
        modal: false,
        thickFrame: false,
      };
    }

    browserWindowOptions.kiosk = false;
    browserWindowOptions.simpleFullscreen = false;

    browserWindowOptions = this.sanitizeBrowserWindowOptions(browserWindowOptions);
    logger.debug('Creating BrowserWindow with options', {
      type,
      options: {
        x: browserWindowOptions.x,
        y: browserWindowOptions.y,
        width: browserWindowOptions.width,
        height: browserWindowOptions.height,
        minWidth: browserWindowOptions.minWidth,
        minHeight: browserWindowOptions.minHeight,
        maxWidth: browserWindowOptions.maxWidth,
        maxHeight: browserWindowOptions.maxHeight
      }
    });

    const window = new BrowserWindow(browserWindowOptions);
    
    // Load the HTML file
    await window.loadFile(windowConfig.file);
    
    // Position the window
    this.positionWindow(window, type);
    
    // Apply simplified stealth measures
    this.applyStealthMeasures(window, type);
    
    // Initialize interaction mode based on current state for ALL windows
    if (this.isInteractive) {
      window.setIgnoreMouseEvents(false);
    } else {
      window.setIgnoreMouseEvents(true, { forward: true });
    }
    
    // Show window on current desktop if requested
    if (showOnCreate) {
      this.showOnCurrentDesktop(window);
    }

    logger.debug('Window created successfully', {
      type,
      title: windowConfig.title,
      dimensions: `${windowConfig.width}x${windowConfig.height}`,
      showOnCreate: showOnCreate
    });

    return window;
  }

  applyStealthMeasures(window, type) {
    // Enhanced always-on-top enforcement for all platforms
    if (process.platform === 'darwin') {
      // macOS: Use native window level constants for maximum effectiveness
      try {
        // Try the most aggressive levels first
        const levels = [
          'screen-saver',    // Highest level
          'pop-up-menu',     // Menu level
          'modal-panel',     // Modal panel level
          'floating',        // Floating level
          'normal'           // Fallback to normal with alwaysOnTop
        ];
        
        let levelSet = false;
        for (const level of levels) {
          try {
            window.setAlwaysOnTop(true, level, 1);
            levelSet = true;
            logger.debug(`Successfully set always-on-top with level: ${level}`, { type });
            break;
          } catch (levelError) {
            logger.debug(`Failed to set level: ${level}`, { error: levelError.message });
          }
        }
        
        if (!levelSet) {
          // Final fallback
          window.setAlwaysOnTop(true);
        }
        
        // Additional macOS-specific enforcement
        setTimeout(() => {
          if (!window.isDestroyed()) {
            try {
              // Force re-application of always-on-top
              window.setAlwaysOnTop(false);
              setTimeout(() => {
                if (!window.isDestroyed()) {
                  window.setAlwaysOnTop(true, 'floating', 1);
                }
              }, 50);
            } catch (error) {
              logger.warn('Error in macOS re-enforcement', { error: error.message });
            }
          }
        }, 200);
        
      } catch (error) {
        logger.warn('Error setting always-on-top for macOS', { error: error.message });
        // Absolute fallback
        window.setAlwaysOnTop(true);
      }
    } else if (process.platform === 'win32') {
      // Windows: Multiple enforcement attempts
      window.setAlwaysOnTop(true);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 100);
      
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true);
        }
      }, 500);
      
    } else {
      // Linux and other platforms
      window.setAlwaysOnTop(true);
    }

    // Ensure window appears on all workspaces/desktops initially
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Hide from taskbar to maintain stealth
    window.setSkipTaskbar(true);
    
    // Make window undetectable by screen capture (if supported)
    try {
      window.setContentProtection(true);
    } catch (error) {
      logger.debug('Content protection not supported on this platform');
    }
    
    // More aggressive event listeners to maintain always-on-top behavior
    const enforceAlwaysOnTop = () => {
      if (!window.isDestroyed()) {
        if (this.displayPickerActive) {
          // El dialogo nativo de seleccion de monitor (showDisplayPicker)
          // roba el foco de las 4 ventanas de la app a la vez -> cada una
          // dispara su listener de 'blur' -> enforceAlwaysOnTop en las 4,
          // ~200ms despues, que entierra el dialogo recien abierto detras
          // de las ventanas de Vysper (siempre-encima). Sin este guard, el
          // atajo Ctrl+Shift+0 parece "no hacer nada" -- el dialogo si se
          // abre, pero queda invisible detras de la app (confirmado en
          // vivo: "success": true en el registro del shortcut, pero nunca
          // se ve ni se puede interactuar con el).
          return;
        }
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels on macOS
            window.setAlwaysOnTop(true, 'floating', 1);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 50);
          } else {
            window.setAlwaysOnTop(true);
          }
        } catch (error) {
          logger.debug('Error in enforceAlwaysOnTop', { error: error.message });
        }
      }
    };
    
    // Event-based enforcement. One retry per event is enough to catch a
    // dropped always-on-top flag; stacking several timers per event across
    // 4 windows is what let a single interaction burst turn into dozens of
    // native WM calls (see incident 2026-08-25).
    window.on('blur', () => {
      setTimeout(enforceAlwaysOnTop, 200);
    });

    window.on('show', () => {
      setTimeout(enforceAlwaysOnTop, 100);
    });
    
    window.on('focus', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    window.on('restore', () => {
      setTimeout(enforceAlwaysOnTop, 50);
    });
    
    if (ALWAYS_ON_TOP_ENFORCE_MS > 0) {
      const periodicEnforcement = setInterval(() => {
        if (window.isDestroyed()) {
          clearInterval(periodicEnforcement);
          return;
        }
        enforceAlwaysOnTop();
      }, ALWAYS_ON_TOP_ENFORCE_MS);
      periodicEnforcement.unref?.();
    }
    
    logger.debug('Applied enhanced stealth measures with aggressive always-on-top', {
      type,
      platform: process.platform,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      skipTaskbar: true
    });
  }

  getStealthWindowTitle() {
    return (process.title || 'Terminal').trim() || 'Terminal';
  }

  lockStealthWindowTitle(window, type) {
    window.setTitle(this.getStealthWindowTitle());

    window.on('page-title-updated', (event) => {
      event.preventDefault();
      window.setTitle(this.getStealthWindowTitle());
      logger.debug('Prevented identifying page title update', { type });
    });
  }

  sanitizeBrowserWindowOptions(options) {
    const sanitized = { ...options };
    const integerKeys = ['x', 'y', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight'];

    for (const key of integerKeys) {
      if (sanitized[key] === undefined || sanitized[key] === null || sanitized[key] === '') {
        delete sanitized[key];
        continue;
      }

      const value = Number(sanitized[key]);
      if (!Number.isFinite(value)) {
        delete sanitized[key];
        continue;
      }

      sanitized[key] = Math.round(value);
    }

    return sanitized;
  }

  positionWindow(window, type) {
    const display = this.getTargetDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    
    if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
      // Position bound windows together
      this.positionBoundWindows();
      return;
    }

    // All windows positioned at top of screen with small margin
    const topMargin = 20;

    // Clamp window size to fit in the current display's work area
    const [currentWidth, currentHeight] = window.getSize();
    const clampedWidth  = Math.min(currentWidth,  screenWidth  - 100);
    const clampedHeight = Math.min(currentHeight, screenHeight - topMargin - 10);
    if (clampedWidth !== currentWidth || clampedHeight !== currentHeight) {
      window.setSize(Math.round(clampedWidth), Math.round(clampedHeight));
    }

    const [windowWidth] = window.getSize();
    
    if (type === 'llmResponse') {
      this.positionLLMBottomLeft(window);
      return;
    }

    const positions = {
      main: { x: displayX + screenWidth - windowWidth - 20, y: displayY + topMargin },
      chat: { x: displayX + screenWidth - windowWidth - 50, y: displayY + topMargin },
      settings: { x: displayX + (screenWidth - windowWidth) / 2, y: displayY + topMargin }
    };

    const position = positions[type] || { x: displayX + 100, y: displayY + topMargin };
    this.setWindowPosition(window, position.x, position.y, type);
    
    logger.debug('Positioned window at top', {
      type,
      position: `${position.x},${position.y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  toValidInteger(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : fallback;
  }

  normalizeBounds(bounds, fallback = {}) {
    return {
      x: this.toValidInteger(bounds?.x, fallback.x || 0),
      y: this.toValidInteger(bounds?.y, fallback.y || 0),
      width: Math.max(1, this.toValidInteger(bounds?.width, fallback.width || 1)),
      height: Math.max(1, this.toValidInteger(bounds?.height, fallback.height || 1))
    };
  }

  setWindowPosition(window, x, y, type = 'unknown') {
    const position = {
      x: this.toValidInteger(x),
      y: this.toValidInteger(y)
    };

    logger.debug('Setting window position', { type, position });
    window.setPosition(position.x, position.y);
  }

  setWindowBounds(window, bounds, type = 'unknown') {
    const normalizedBounds = this.normalizeBounds(bounds);

    logger.debug('Setting window bounds', { type, bounds: normalizedBounds });
    window.setBounds(normalizedBounds);
  }

  getTargetDisplay() {
    if (this.pinnedDisplayMode) {
      const pinnedDisplay = this.findDisplayById(this.pinnedDisplayId) || this.pinnedDisplay;
      if (pinnedDisplay) {
        this.pinnedDisplay = pinnedDisplay;
        this.currentDisplay = pinnedDisplay;
        return pinnedDisplay;
      }

      logger.warn('Pinned display is no longer available; disabling pinned display mode', {
        pinnedDisplayId: this.pinnedDisplayId
      });
      this.disablePinnedDisplayMode();
    }

    return this.currentDisplay || screen.getPrimaryDisplay();
  }

  // New method to position bound windows (vertical column layout) - Always at top
  positionBoundWindows() {
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');

    // Posicionar main aunque llmResponse aun no exista (durante la creacion inicial
    // positionWindow corre antes de registrar llmResponse en el mapa).
    if (!mainWindow) return;

    const display = this.getTargetDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;

    const [mainWidth, mainHeight] = mainWindow.getSize();

    // Position main window at top-right (casi el extremo superior derecho)
    const topMargin = 20;
    const rightMargin = 20;
    const mainX = displayX + screenWidth - mainWidth - rightMargin;
    const mainY = displayY + topMargin;
    this.setWindowPosition(mainWindow, mainX, mainY, 'main');

    // Position LLM response window at the bottom-left edge of the gray overlay (si existe).
    if (llmWindow) {
      this.positionLLMBottomLeft(llmWindow);
    }

    // Update stored position (use main window position as reference)
    this.boundWindowsPosition = { x: mainX, y: mainY };

    logger.debug('Positioned bound windows: main top-right', {
      mainPosition: `${mainX},${mainY}`,
      llmPositioned: Boolean(llmWindow),
      display: display.id
    });
  }

  // New method to move bound windows (column layout) - Maintains top positioning preference
  moveBoundWindows(deltaX, deltaY) {
    if (!this.bindWindows) return;
    
    const mainWindow = this.windows.get('main');
    const llmWindow = this.windows.get('llmResponse');
    
    if (!mainWindow || !llmWindow) return;
    
    const display = this.getTargetDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea;
    
    // Get current positions and sizes
    const [mainX, mainY] = mainWindow.getPosition();
    const [llmX, llmY] = llmWindow.getPosition();
    const [mainWidth, mainHeight] = mainWindow.getSize();
    const [llmWidth, llmHeight] = llmWindow.getSize();
    
    // Calculate total height for bounds checking
    const totalHeight = mainHeight + this.windowGap + llmHeight;
    const topMargin = 20;
    const minY = displayY + topMargin;
    
    // Calculate new positions with bounds checking
    const newMainX = Math.max(displayX, Math.min(displayX + screenWidth - mainWidth, mainX + deltaX));
    // Ensure we don't go above the top margin or below screen bounds
    const newMainY = Math.max(minY, Math.min(displayY + screenHeight - totalHeight, mainY + deltaY));
    
    // LLM window follows the same horizontal movement but maintains vertical relationship
    const newLlmX = Math.max(displayX, Math.min(displayX + screenWidth - llmWidth, llmX + deltaX));
    const newLlmY = newMainY + mainHeight + this.windowGap;
    
    // Move both windows
    this.setWindowPosition(mainWindow, newMainX, newMainY, 'main');
    this.setWindowPosition(llmWindow, newLlmX, newLlmY, 'llmResponse');
    
    // Update stored position (use main window as reference)
    this.boundWindowsPosition.x = newMainX;
    this.boundWindowsPosition.y = newMainY;
    
    logger.debug('Moved bound windows (maintaining top preference)', {
      delta: `${deltaX},${deltaY}`,
      newMainPosition: `${newMainX},${newMainY}`,
      newLlmPosition: `${newLlmX},${newLlmY}`,
      topMargin: topMargin,
      totalHeight: totalHeight
    });
  }

  getDisplayUnderCursor() {
    if (this.pinnedDisplayMode) {
      return this.getTargetDisplay();
    }

    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);

    if (!this.currentDisplay || this.currentDisplay.id !== display.id) {
      logger.debug('Active display refreshed from cursor', {
        displayId: display.id,
        cursorPosition: cursorPoint,
        bounds: display.bounds
      });
    }

    this.currentDisplay = display;
    return display;
  }

  findDisplayById(displayId) {
    return screen.getAllDisplays().find(display => display.id === displayId) || null;
  }

  setTaskbarIconHidden(hidden) {
    this.windows.forEach((window, type) => {
      if (!window || window.isDestroyed()) return;

      try {
        window.setSkipTaskbar(Boolean(hidden));
      } catch (error) {
        logger.debug('Unable to update taskbar visibility', { type, hidden, error: error.message });
      }
    });

    if (process.platform === 'darwin' && app.dock) {
      try {
        if (hidden) {
          app.dock.hide();
        } else {
          app.dock.show();
        }
      } catch (error) {
        logger.debug('Unable to update dock visibility', { hidden, error: error.message });
      }
    }
  }

  async togglePinnedDisplayMode() {
    if (this.pinnedDisplayMode) {
      return this.disablePinnedDisplayMode();
    }

    return this.promptForPinnedDisplay();
  }

  disablePinnedDisplayMode() {
    this.pinnedDisplayMode = false;
    this.pinnedDisplayId = null;
    this.pinnedDisplay = null;
    this.setTaskbarIconHidden(false);
    this.getDisplayUnderCursor();
    this.moveWindowsToActiveScreen();

    logger.info('Pinned display mode disabled');
    return { enabled: false };
  }

  async promptForPinnedDisplay() {
    this.setTaskbarIconHidden(true);
    const display = await this.showDisplayPicker();
    if (!display) {
      this.setTaskbarIconHidden(false);
      logger.info('Pinned display selection cancelled');
      return { enabled: false, cancelled: true };
    }

    this.enablePinnedDisplayMode(display);
    return { enabled: true, display };
  }

  enablePinnedDisplayMode(display) {
    const selectedDisplay = this.findDisplayById(display.id) || display;
    this.pinnedDisplayMode = true;
    this.pinnedDisplayId = selectedDisplay.id;
    this.pinnedDisplay = selectedDisplay;
    this.currentDisplay = selectedDisplay;
    this.setTaskbarIconHidden(true);
    this.moveWindowsToActiveScreen();

    logger.info('Pinned display mode enabled', {
      displayId: selectedDisplay.id,
      bounds: selectedDisplay.bounds
    });
  }

  async showDisplayPicker() {
    if (this.displayPickerPromise) {
      logger.debug('Display picker already active; reusing pending selection');
      return this.displayPickerPromise;
    }

    const displays = screen.getAllDisplays();
    if (displays.length <= 1) {
      return displays[0] || null;
    }

    // Antes esto abria una ventana invisible, always-on-top y con content
    // protection POR MONITOR (screen.getAllDisplays().length ventanas
    // cubriendo cada pantalla completa) esperando un click para detectar
    // en cual display estaba el cursor. En vivo esto colgo el sistema
    // completo (el proceso de Vysper tuvo que reiniciarse -- PID distinto
    // en los logs antes/despues del intento) -- probablemente esas
    // ventanas fullscreen siempre-encima con proteccion de contenido
    // pelearon con el compositor de la ventana. Un dialog.showMessageBox
    // nativo, numerado, es simple: no hay ventanas propias que crear,
    // posicionar ni pelear por el tope -- el SO lo maneja como cualquier
    // otro dialogo modal.
    this.displayPickerPromise = (async () => {
      const buttons = displays.map((display, index) => {
        const isPrimary = display.id === screen.getPrimaryDisplay().id;
        return `${index + 1}. ${display.bounds.width}x${display.bounds.height}` +
          (isPrimary ? ' (principal)' : '') +
          ` @ (${display.bounds.x}, ${display.bounds.y})`;
      });
      const cancelLabel = 'Cancelar';
      buttons.push(cancelLabel);
      const cancelId = buttons.length - 1;

      // Evita que los listeners de 'blur' de las 4 ventanas de la app
      // (que el dialogo nativo dispara al robarles el foco) entierren el
      // dialogo reafirmando always-on-top sobre la app -- ver el guard en
      // enforceAlwaysOnTop()/enforceAlwaysOnTopForAllWindows().
      this.displayPickerActive = true;
      const identifierWindows = this.showDisplayIdentifiers(displays);
      try {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          title: 'Fijar ventanas a un monitor',
          message: `Hay ${displays.length} monitores conectados. Elige el numero al que quieres fijar las ventanas de Vysper (el numero grande en cada pantalla indica cual es cual):`,
          buttons,
          defaultId: 0,
          cancelId,
          noLink: true
        });

        const display = response === cancelId ? null : displays[response];
        logger.debug('Display picker finished', {
          reason: display ? 'selected' : 'cancelled',
          displayId: display?.id
        });
        return display;
      } catch (error) {
        logger.warn('Display picker dialog failed', { error: error.message });
        return null;
      } finally {
        this.hideDisplayIdentifiers(identifierWindows);
        this.displayPickerActive = false;
        this.displayPickerPromise = null;
      }
    })();

    return this.displayPickerPromise;
  }

  // Un numero grande centrado en cada pantalla mientras el dialogo del
  // selector de monitor esta abierto, para que sea obvio cual fisico es
  // cual (con monitores de resolucion parecida, "1536x864 @ (3072, 0)" no
  // dice nada a simple vista). A diferencia del picker viejo que este
  // archivo eliminaba (ver showDisplayPicker arriba), estas ventanas:
  //   - ignoran el mouse (setIgnoreMouseEvents(true)) -- nunca capturan
  //     clicks ni pueden bloquear nada, a diferencia del click-catcher
  //     fullscreen que colgo el sistema.
  //   - son chicas (no fullscreen) y sin proteccion de contenido.
  //   - alwaysOnTop se fija UNA vez al crearlas, sin loop de refuerzo ni
  //     moveTop() -- no compiten con enforceAlwaysOnTop.
  //   - nunca se agregan a this.windows, asi que no heredan los listeners
  //     de blur/show que reintentan el always-on-top de las ventanas
  //     reales de la app.
  showDisplayIdentifiers(displays) {
    const badgeSize = 220;
    return displays.map((display, index) => {
      try {
        const bounds = display.bounds;
        const options = this.sanitizeBrowserWindowOptions({
          x: Math.round(bounds.x + bounds.width / 2 - badgeSize / 2),
          y: Math.round(bounds.y + bounds.height / 2 - badgeSize / 2),
          width: badgeSize,
          height: badgeSize,
          title: this.getStealthWindowTitle(),
          frame: false,
          transparent: true,
          backgroundColor: '#00000000',
          alwaysOnTop: true,
          show: false,
          skipTaskbar: true,
          focusable: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          closable: true,
          hasShadow: false,
          fullscreenable: false,
          webPreferences: {
            ...config.get('window.webPreferences'),
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: true,
            devTools: false
          }
        });

        const badgeWindow = new BrowserWindow(options);
        badgeWindow.setIgnoreMouseEvents(true);

        const label = `${index + 1}`;
        const html = encodeURIComponent(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${this.getStealthWindowTitle()}</title>
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .badge {
        width: 160px;
        height: 160px;
        border-radius: 50%;
        background: rgba(17, 24, 39, 0.82);
        border: 3px solid rgba(255, 255, 255, 0.85);
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        font-size: 84px;
        font-weight: 700;
        color: #ffffff;
      }
    </style>
  </head>
  <body>
    <div class="badge">${label}</div>
  </body>
</html>`);

        badgeWindow.loadURL(`data:text/html;charset=utf-8,${html}`).catch((error) => {
          logger.debug('Unable to load display identifier badge', { error: error.message });
        });

        if (process.platform === 'darwin') {
          badgeWindow.setAlwaysOnTop(true, 'screen-saver', 1);
          badgeWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        } else {
          badgeWindow.setAlwaysOnTop(true);
        }
        badgeWindow.show();

        return badgeWindow;
      } catch (error) {
        logger.debug('Unable to create display identifier badge', { error: error.message, displayId: display.id });
        return null;
      }
    }).filter(Boolean);
  }

  hideDisplayIdentifiers(identifierWindows) {
    for (const badgeWindow of identifierWindows || []) {
      if (badgeWindow && !badgeWindow.isDestroyed()) {
        badgeWindow.close();
      }
    }
  }

  getWindowType(targetWindow) {
    for (const [type, window] of this.windows.entries()) {
      if (window === targetWindow) {
        return type;
      }
    }

    return null;
  }

  showOnCurrentDesktop(win) {
    if (!win || win.isDestroyed()) return;

    const windowType = this.getWindowType(win);
    const shouldPositionWindow = windowType && windowType !== 'selectionOverlay' && windowType !== 'guide';
    const enforceTargetPosition = () => {
      if (!shouldPositionWindow || win.isDestroyed()) return;
      this.getTargetDisplay();
      this.positionWindow(win, windowType);
    };

    if (shouldPositionWindow) {
      enforceTargetPosition();
    }
    
    if (process.platform === 'darwin') {
      // More aggressive approach for macOS to prevent space switching
      
      // First, ensure the window is hidden
      win.hide();
      
      // Set up the window to appear on all workspaces temporarily
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      // Enforce highest level always-on-top for macOS using multiple attempts
      const setMacOSAlwaysOnTop = () => {
        if (!win.isDestroyed()) {
          try {
            // Try screen-saver level first (highest)
            win.setAlwaysOnTop(true, 'screen-saver', 2);
          } catch (error) {
            try {
              // Fallback to pop-up-menu level
              win.setAlwaysOnTop(true, 'pop-up-menu', 2);
            } catch (error2) {
              try {
                // Final fallback to floating level
                win.setAlwaysOnTop(true, 'floating', 2);
              } catch (error3) {
                // Absolute fallback
                win.setAlwaysOnTop(true);
              }
            }
          }
        }
      };
      
      setMacOSAlwaysOnTop();
      
      // Small delay to ensure settings take effect
      setTimeout(() => {
        if (!win.isDestroyed()) {
          // Show the window (should appear on current space without switching)
          win.show();
          enforceTargetPosition();
          
          // Focus without switching spaces
          win.focus();
          
          // Re-enforce always-on-top after showing
          setMacOSAlwaysOnTop();
          
          // Additional enforcement
          setTimeout(() => {
            if (!win.isDestroyed()) {
              enforceTargetPosition();
              setMacOSAlwaysOnTop();
            }
          }, 100);
          
          // After window is shown, remove from all workspaces to prevent clutter
          setTimeout(() => {
            if (!win.isDestroyed()) {
              enforceTargetPosition();
              win.setVisibleOnAllWorkspaces(false);
              // Final always-on-top enforcement
              setMacOSAlwaysOnTop();
            }
          }, 300);
        }
      }, 50);
    } else {
      // For non-macOS platforms, simpler approach with enhanced always-on-top
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setAlwaysOnTop(true);
      win.show();
      enforceTargetPosition();
      win.focus();
      
      setTimeout(() => {
        if (!win.isDestroyed()) {
          enforceTargetPosition();
          win.setVisibleOnAllWorkspaces(false);
          // Ensure always-on-top is maintained
          win.setAlwaysOnTop(true);
        }
      }, 500);
    }
    
    logger.debug('Showing window on current desktop with enhanced always-on-top', {
      platform: process.platform,
      windowId: win.id,
      isDestroyed: win.isDestroyed()
    });
  }
  
  setupWindowEventHandlers() {
    this.windows.forEach((window, type) => {
      window.on('closed', () => {
        logger.debug('Window closed', { type });
        this.windows.delete(type);
      });

      window.on('focus', () => {
        this.activeWindow = type;
        logger.debug('Window focused', { type });
      });

      // SIMPLIFIED blur handler - no aggressive re-focusing
      window.on('blur', () => {
        // Only log, don't force focus back
        logger.debug('Window blurred', { type });
      });

      window.on('show', () => {
        logger.debug('Window shown', { type });
      });

      window.on('hide', () => {
        logger.debug('Window hidden', { type });
      });

      // Handle window minimize attempts
      window.on('minimize', (event) => {
        event.preventDefault();
        logger.debug('Prevented window minimize', { type });
      });

      window.on('restore', () => {
        // Simplified restore handling
        logger.debug('Window restored', { type });
      });
    });
  }

  setupScreenSharingDetection() {
    if (!SCREEN_SHARING_WATCH_ENABLED) {
      logger.info('Screen sharing detection disabled for lower idle CPU use');
      return;
    }

    this.screenSharingWatcher = setInterval(async () => {
      await this.checkScreenSharingStatus();
    }, SCREEN_SHARING_WATCH_MS);
    this.screenSharingWatcher.unref?.();

    logger.info('Screen sharing detection initialized');
  }

  async checkScreenSharingStatus() {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 1, height: 1 }
      });

      const wasSharing = this.isScreenBeingShared;
      
      if (wasSharing !== this.isScreenBeingShared) {
        if (this.isScreenBeingShared) {
          this.handleScreenSharingStarted();
        } else {
          this.handleScreenSharingStopped();
        }
      }
    } catch (error) {
      logger.debug('Screen sharing detection error', { error: error.message });
    }
  }

  startScreenSharingMode() {
    if (!this.isScreenBeingShared) {
      this.isScreenBeingShared = true;
      this.wasVisibleBeforeSharing = this.isVisible;
      this.handleScreenSharingStarted();
    }
  }

  stopScreenSharingMode() {
    if (this.isScreenBeingShared) {
      this.isScreenBeingShared = false;
      this.handleScreenSharingStopped();
    }
  }

  handleScreenSharingStarted() {
    logger.info('Screen sharing detected - hiding windows');
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.hide();
        this.setWindowPosition(window, -10000, -10000, type);
      }
    });
  }

  handleScreenSharingStopped() {
    logger.info('Screen sharing ended - restoring windows');
    
    if (this.wasVisibleBeforeSharing) {
      this.moveWindowsToActiveScreen();
      this.showAllWindows();
    }
  }

  switchToWindow(windowType) {
    if (this.windows.has('chat') && this.windows.get('chat').isVisible()) {
      this.hideChatWindow();
      return;
    }

    if (!this.windowConfigs[windowType]) {
      logger.warn('Attempted to switch to unknown window type', { windowType });
      return;
    }

    if (this.isScreenBeingShared) {
      return;
    }

    const targetWindow = this.windows.get(windowType);
    if (targetWindow) {
      this.showOnCurrentDesktop(targetWindow);
      if (windowType === 'chat') {
        targetWindow.focus();
        targetWindow.webContents.focus();
        targetWindow.webContents.send('focus-chat-input');
      }

      this.activeWindow = windowType;
      
      logger.info('Switched to window', {
        windowType,
        isVisible: this.isVisible
      });
    }
  }

  showAllWindows() {
    if (this.isScreenBeingShared) {
      return;
    }

    this.getTargetDisplay();

    this.windows.forEach((window, type) => {
      // llmResponse: solo se muestra cuando tiene contenido.
      // settings: solo se abre explícitamente (Ctrl+Shift+X), nunca en toggle.
      if (type !== 'llmResponse' && type !== 'settings') {
        this.showOnCurrentDesktop(window);
      }
    });
    
    this.isVisible = true;
    const activeWindow = this.windows.get(this.activeWindow);
    if (activeWindow) {
      activeWindow.focus();
    }
    
    logger.info('All windows shown on current desktop', { 
      activeWindow: this.activeWindow,
      windowCount: this.windows.size 
    });
  }

  hideAllWindows() {
    this.windows.forEach((window, type) => {
      if (type !== 'llmResponse') {
        window.hide();
      }
    });
    
    this.isVisible = false;
    logger.info('All windows hidden');
  }

  hideWindowsForScreenshotCapture() {
    this.preCaptureVisibleWindows = new Set();

    this.windows.forEach((window, type) => {
      if (!window || window.isDestroyed() || type === 'selectionOverlay') return;

      if (window.isVisible()) {
        this.preCaptureVisibleWindows.add(type);
      }

      window.hide();
    });

    this.isVisible = false;
    logger.info('Application windows hidden for screenshot capture', {
      hiddenWindowTypes: Array.from(this.preCaptureVisibleWindows)
    });
  }

  restoreWindowsAfterScreenshotCapture() {
    const previouslyVisible = this.preCaptureVisibleWindows;
    this.preCaptureVisibleWindows = null;

    if (!previouslyVisible || previouslyVisible.size === 0 || this.isScreenBeingShared) {
      return;
    }

    previouslyVisible.forEach(type => {
      const window = this.windows.get(type);
      if (!window || window.isDestroyed() || type === 'selectionOverlay') return;
      if (type === 'llmResponse') return;
      this.showOnCurrentDesktop(window);
    });

    this.isVisible = true;
    logger.info('Application windows restored after screenshot capture', {
      restoredWindowTypes: Array.from(previouslyVisible).filter(type => type !== 'llmResponse')
    });
  }

  toggleVisibility() {
    if (this.isScreenBeingShared) {
      return this.isVisible;
    }

    if (this.isVisible) {
      this.hideAllWindows();
      // hideAllWindows excluye llmResponse intencionalmente para otros flujos;
      // al hacer toggle manual sí debemos ocultarla también.
      const llmWindow = this.windows.get('llmResponse');
      if (llmWindow && !llmWindow.isDestroyed() && llmWindow.isVisible()) {
        llmWindow.hide();
      }
    } else {
      this.showAllWindows();
    }

    return this.isVisible;
  }

  setInteractive(interactive) {
    this.isInteractive = interactive;
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        if (interactive) {
          // Interactive mode: allow mouse events for all windows
          window.setIgnoreMouseEvents(false);
        } else {
          // Non-interactive mode: enable click-through with forwarding for all windows
          window.setIgnoreMouseEvents(true, { forward: true });
        }
        window.webContents.send('interaction-mode-changed', interactive);
      }
    });

    if (interactive) {
      const chatWindow = this.windows.get('chat');
      if (chatWindow && !chatWindow.isDestroyed() && chatWindow.isVisible()) {
        chatWindow.focus();
        chatWindow.webContents.focus();
        chatWindow.webContents.send('focus-chat-input');
      }
    }
    
    logger.info('Window interaction mode changed', { 
      interactive,
      clickThrough: !interactive,
      affectedWindows: Array.from(this.windows.keys())
    });
  }

  toggleInteraction() {
    this.setInteractive(!this.isInteractive);
    
    // Ensure all windows remain always-on-top after interaction mode change
    this.enforceAlwaysOnTopForAllWindows();
    
    return this.isInteractive;
  }

  // New method to enforce always-on-top for all windows
  enforceAlwaysOnTopForAllWindows() {
    if (this.displayPickerActive) {
      // No enterrar el dialogo nativo de seleccion de monitor -- ver el
      // mismo guard en enforceAlwaysOnTop() arriba.
      return;
    }

    // Debounced: repeated calls within enforceDebounceMs (e.g. a double
    // shortcut press, OS key-repeat while holding Alt+A, or this running
    // right after a per-window blur/show/focus listener already did it)
    // are no-ops. Each call fires several native setAlwaysOnTop calls per
    // window; without this guard they can burst fast enough to trip a
    // GNOME Shell/Mutter GC-reentrancy freeze (see incident 2026-08-25).
    const now = Date.now();
    if (now - this.lastEnforceTime < this.enforceDebounceMs) {
      return;
    }
    this.lastEnforceTime = now;

    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          if (process.platform === 'darwin') {
            // Try multiple levels for macOS
            window.setAlwaysOnTop(true, 'pop-up-menu', 1);

            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'floating', 1);
              }
            }, 100);

            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'screen-saver', 1);
              }
            }, 200);
          } else {
            // Windows and Linux
            window.setAlwaysOnTop(true);
          }
        } catch (error) {
          logger.warn('Error enforcing always-on-top', { 
            type, 
            error: error.message 
          });
          // Fallback to basic always-on-top
          try {
            window.setAlwaysOnTop(true);
          } catch (fallbackError) {
            logger.error('Fallback always-on-top failed', { 
              type, 
              error: fallbackError.message 
            });
          }
        }
      }
    });
    
    logger.debug('Enforced always-on-top for all windows with aggressive strategy', {
      platform: process.platform,
      windowCount: this.windows.size
    });
  }

  // Public method to manually enforce always-on-top for all windows
  forceAlwaysOnTopForAllWindows() {
    this.enforceAlwaysOnTopForAllWindows();
    logger.info('Manually enforced always-on-top for all windows');
  }

  // Debug method to test and verify always-on-top functionality
  testAlwaysOnTopForAllWindows() {
    const results = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        try {
          const isAlwaysOnTop = window.isAlwaysOnTop();
          
          if (process.platform === 'darwin') {
            // Test different levels on macOS
            window.setAlwaysOnTop(true, 'screen-saver', 2);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true, 'pop-up-menu', 2);
                setTimeout(() => {
                  if (!window.isDestroyed()) {
                    window.setAlwaysOnTop(true, 'floating', 2);
                  }
                }, 50);
              }
            }, 50);
          } else {
            // For other platforms
            window.setAlwaysOnTop(true);
            setTimeout(() => {
              if (!window.isDestroyed()) {
                window.setAlwaysOnTop(true);
              }
            }, 50);
          }
          
          results[type] = {
            success: true,
            isAlwaysOnTop: isAlwaysOnTop,
            isVisible: window.isVisible(),
            isDestroyed: window.isDestroyed()
          };
          
        } catch (error) {
          results[type] = {
            success: false,
            error: error.message,
            isDestroyed: window.isDestroyed()
          };
        }
      } else {
        results[type] = {
          success: false,
          error: 'Window is destroyed'
        };
      }
    });
    
    logger.info('Always-on-top test results', { 
      platform: process.platform,
      results 
    });
    
    return results;
  }

  showLLMResponse(content, metadata = {}) {
    logger.debug('showLLMResponse called', {
      isScreenBeingShared: this.isScreenBeingShared,
      contentLength: content.length,
      skill: metadata.skill
    });

    if (this.isScreenBeingShared) {
      logger.warn('LLM response blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow) {
      logger.error('LLM response window not available');
      return;
    }

    if (llmWindow.isDestroyed()) {
      logger.error('LLM response window is destroyed');
      return;
    }

    this.resetLLMWindowToDefaultSize();

    const useCompactLayout = this.shouldUseCompactOcrLayout(metadata);
    logger.debug('Layout decision for LLM response', {
      useCompactLayout,
      isOCRPreview: metadata.isOCRPreview,
      isContextAck: metadata.isContextAck,
      skill: metadata.skill
    });

    logger.debug('Sending display-llm-response event to window');
    llmWindow.webContents.send('display-llm-response', {
      content,
      metadata,
      timestamp: new Date().toISOString()
    });

    logger.debug('Showing and focusing LLM window');
    this.showOnCurrentDesktop(llmWindow);

    // Position bound windows when LLM response is shown
    if (this.bindWindows) {
      this.positionBoundWindows();
    }

    // Always position at bottom-left.
    // Se llama dos veces: inmediato + 150ms diferido para cubrir WMs que reposicionan al hacer show().
    this.positionLLMBottomLeft(llmWindow);
    setTimeout(() => {
      if (!llmWindow.isDestroyed()) this.positionLLMBottomLeft(llmWindow);
    }, 150);

    logger.info('LLM response displayed', {
      contentLength: content.length,
      skill: metadata.skill,
      windowVisible: llmWindow.isVisible(),
      boundWindows: this.bindWindows,
      useCompactLayout
    });
  }


  showLLMLoading() {
    if (this.isScreenBeingShared) {
      logger.warn('LLM loading blocked due to screen sharing mode');
      return;
    }

    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      logger.debug('Showing LLM loading state');
      this.resetLLMWindowToDefaultSize();
      llmWindow.webContents.send('show-loading');
      this.showOnCurrentDesktop(llmWindow);
      
      // Position bound windows when LLM loading is shown
      if (this.bindWindows) {
        this.positionBoundWindows();
      }
      this.positionLLMBottomLeft(llmWindow);
      setTimeout(() => {
        if (!llmWindow.isDestroyed()) this.positionLLMBottomLeft(llmWindow);
      }, 150);

      logger.debug('LLM loading window shown');
    } else {
      logger.error('LLM window not available for loading state');
    }
  }

  hideLLMResponse() {
    const llmWindow = this.windows.get('llmResponse');
    if (llmWindow) {
      llmWindow.hide();
    }
  }

  showSettings() {
    if (this.isScreenBeingShared) return;

    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      this.showOnCurrentDesktop(settingsWindow);
      this.centerWindow(settingsWindow); // This now positions at top-center
      
      // Notify that settings window is shown
      setTimeout(() => {
        settingsWindow.webContents.send('settings-window-shown');
      }, 50);
      
      logger.info('Settings window displayed at top');
    }
  }

  hideSettings() {
    const settingsWindow = this.windows.get('settings');
    if (settingsWindow) {
      settingsWindow.hide();
    }
  }

  expandLLMWindow(contentMetrics = null) {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || this.isScreenBeingShared) return;

    const optimalSize = this.calculateOptimalWindowSize(contentMetrics);
    
    // Ensure we have valid numbers for setSize
    const defaultSize = this.getDefaultLLMResponseSize();
    const width = Math.round(Number(optimalSize.width)) || defaultSize.width;
    const height = Math.round(Number(optimalSize.height)) || defaultSize.height;
    
    llmWindow.setSize(this.toValidInteger(width, defaultSize.width), this.toValidInteger(height, defaultSize.height));
    
    // If windows are bound, position them together; otherwise center the LLM window
    if (this.bindWindows) {
      this.positionBoundWindows();
    } else {
      this.centerWindow(llmWindow);
    }
    
    logger.debug('LLM window resized', { 
      newSize: `${width}x${height}`,
      basedOnContent: !!contentMetrics,
      boundWindows: this.bindWindows
    });
  }

  calculateOptimalWindowSize(contentMetrics) {
    const display = this.getTargetDisplay();
    const { width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const defaultSize = this.getDefaultLLMResponseSize();
    
    let width = defaultSize.width;
    let height = defaultSize.height;
    
    if (contentMetrics && typeof contentMetrics === 'object') {
      const lineCount = Number(contentMetrics.lineCount) || 20;
      const avgLineLength = Number(contentMetrics.avgLineLength) || 80;
      
      width = Math.min(Math.max(avgLineLength * 8, 500), screenWidth * 0.8);
      height = Math.min(Math.max(lineCount * 25 + 100, 300), screenHeight * 0.8);
    }
    
    return { 
      width: Math.round(Number(width)) || defaultSize.width, 
      height: Math.round(Number(height)) || defaultSize.height 
    };
  }

  getDefaultLLMResponseSize() {
    const chatWindow = this.windows.get('chat');
    const fallbackChatWidth = this.windowConfigs.chat.width || 500;
    const fallbackChatHeight = this.windowConfigs.chat.height || 700;
    const [chatWidth, chatHeight] = chatWindow && !chatWindow.isDestroyed()
      ? chatWindow.getSize()
      : [fallbackChatWidth, fallbackChatHeight];

    return {
      width: Math.max(1, Math.round(chatWidth / 2)),
      height: Math.max(1, Math.round(chatHeight / 2))
    };
  }

  resetLLMWindowToDefaultSize() {
    const llmWindow = this.windows.get('llmResponse');
    if (!llmWindow || llmWindow.isDestroyed()) return;

    const defaultSize = this.getDefaultLLMResponseSize();
    llmWindow.setSize(defaultSize.width, defaultSize.height);

    logger.debug('LLM window reset to default half-chat size', {
      defaultSize,
      chatSize: this.windows.get('chat') && !this.windows.get('chat').isDestroyed()
        ? this.windows.get('chat').getSize()
        : [this.windowConfigs.chat.width, this.windowConfigs.chat.height]
    });
  }

  centerWindow(window) {
    const display = this.getTargetDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = display.workArea || display.workAreaSize;
    const [windowWidth, windowHeight] = window.getSize();
    
    // Center horizontally but position at top
    const topMargin = 20;
    const x = displayX + Math.round((screenWidth - windowWidth) / 2);
    const y = displayY + topMargin;
    
    this.setWindowPosition(window, x, y, 'centered');
    
    logger.debug('Positioned window at top-center', {
      position: `${x},${y}`,
      topMargin,
      display: display.id || 'primary'
    });
  }

  normalizeSkill(skill) {
    return String(skill || '').trim().toLowerCase();
  }

  isCodingAccumulationSkill(skill) {
    return ['programming', 'dsa'].includes(this.normalizeSkill(skill));
  }

  shouldUseCompactOcrLayout(metadata = {}) {
    if (metadata.isOCRPreview) return true;
    if (metadata.isContextAck && this.isCodingAccumulationSkill(metadata.skill)) return true;
    return false;
  }

  positionLLMBottomLeft(llmWindow) {
    if (!llmWindow || llmWindow.isDestroyed()) return;
    const display = this.getTargetDisplay();
    const { x: displayX, y: displayY, height: screenHeight } = display.workArea || display.workAreaSize;
    const [, winHeight] = llmWindow.getSize();
    const bottomMargin = 10;
    const x = displayX;
    const y = displayY + screenHeight - winHeight - bottomMargin;
    this.setWindowPosition(llmWindow, x, y, 'llmResponse-bottom-left');
    logger.debug('LLM window positioned bottom-left', { x, y });
  }

  broadcastToAllWindows(channel, data) {
    const windowStates = {};
    
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
        windowStates[type] = {
          isVisible: window.isVisible(),
          isDestroyed: window.isDestroyed(),
          hasWebContents: !!window.webContents
        };
      } else {
        windowStates[type] = { isDestroyed: true };
      }
    });
    
    logger.info('Broadcast sent to all windows', { 
      channel, 
      windowCount: this.windows.size,
      windowStates,
      dataKeys: data ? Object.keys(data) : [],
      // Fixed: Check for 'content' instead of 'response' to match actual data structure
      dataPreview: data && data.content ? data.content.substring(0, 50) + '...' : 
                   data && data.response ? data.response.substring(0, 50) + '...' : 'No response'
    });
  }

  getWindow(type) {
    return this.windows.get(type);
  }

  getActiveWindow() {
    return this.windows.get(this.activeWindow);
  }

  getWindowStats() {
    const stats = {};
    
    this.windows.forEach((window, type) => {
      stats[type] = {
        isVisible: window.isVisible(),
        isFocused: window.isFocused(),
        position: window.getPosition(),
        size: window.getSize()
      };
    });
    
    return {
      windows: stats,
      activeWindow: this.activeWindow,
      isInteractive: this.isInteractive,
      isVisible: this.isVisible,
      isScreenBeingShared: this.isScreenBeingShared
    };
  }

  destroyAllWindows() {
    this.windows.forEach((window, type) => {
      logger.debug('Destroying window', { type });
      if (!window.isDestroyed()) {
        window.destroy();
      }
    });
    
    this.windows.clear();
    
    // Clean up all watchers
    if (this.screenWatcher) {
      clearInterval(this.screenWatcher);
      this.screenWatcher = null;
    }
    
    if (this.desktopWatcher) {
      clearInterval(this.desktopWatcher);
      this.desktopWatcher = null;
    }

    if (this.screenSharingWatcher) {
      clearInterval(this.screenSharingWatcher);
      this.screenSharingWatcher = null;
    }
    
    logger.info('All windows destroyed');
  }

  setupScreenTracking() {
    // Initialize with current cursor position to get the active display
    const cursorPoint = screen.getCursorScreenPoint();
    this.currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    
    screen.on('display-added', () => {
      logger.debug('Display added');
      this.handleDisplayChange();
    });

    screen.on('display-removed', () => {
      logger.debug('Display removed');
      this.handleDisplayChange();
    });

    screen.on('display-metrics-changed', () => {
      logger.debug('Display metrics changed');
      this.handleDisplayChange();
    });

    this.screenWatcher = setInterval(() => {
      this.trackActiveScreen();
    }, SCREEN_WATCH_MS);
    this.screenWatcher.unref?.();

    // SIMPLIFIED desktop tracking
    this.setupDesktopTracking();

    logger.info('Screen and desktop tracking initialized', {
      currentDisplay: this.currentDisplay.id,
      cursorPosition: cursorPoint
    });
  }

  handleDisplayChange() {
    setTimeout(() => {
      if (this.pinnedDisplayMode) {
        const pinnedDisplay = this.findDisplayById(this.pinnedDisplayId);
        if (!pinnedDisplay) {
          this.disablePinnedDisplayMode();
          return;
        }

        this.pinnedDisplay = pinnedDisplay;
        this.currentDisplay = pinnedDisplay;
      }

      this.moveWindowsToActiveScreen();
    }, 500);
  }

  trackActiveScreen() {
    if (this.isScreenBeingShared || this.pinnedDisplayMode) return;

    const previousDisplayId = this.currentDisplay?.id;
    const activeDisplay = this.getDisplayUnderCursor();
    
    if (!previousDisplayId || activeDisplay.id !== previousDisplayId) {
      this.moveWindowsToActiveScreen();
      
      logger.debug('Active screen changed', {
        displayId: activeDisplay.id,
        bounds: activeDisplay.bounds
      });
    }
  }

  moveWindowsToActiveScreen() {
    if (this.isScreenBeingShared) return;

    const display = this.getTargetDisplay();
    if (!display) return;

    const { x: displayX, y: displayY, width: displayWidth, height: displayHeight } = display.workArea;
    
    // Handle bound windows specially
    if (this.bindWindows) {
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow && !mainWindow.isDestroyed() && !llmWindow.isDestroyed()) {
        // Position bound windows on the new screen and ensure they appear on current desktop
        this.positionBoundWindows();
        if (mainWindow.isVisible()) this.showOnCurrentDesktop(mainWindow);
        if (llmWindow.isVisible()) this.showOnCurrentDesktop(llmWindow);
      }
    }
    
    this.windows.forEach((window, type) => {
      if (window && !window.isDestroyed()) {
        if (type === 'selectionOverlay' || type === 'guide') {
          return;
        }

        // Skip main and llmResponse if they're bound (already handled above)
        if (this.bindWindows && (type === 'main' || type === 'llmResponse')) {
          return;
        }
        
        const [windowWidth, windowHeight] = window.getSize();
        
        let newX, newY;
        
        // All windows positioned at top of screen
        const topMargin = 20;
        
        switch (type) {
          case 'main':
            newX = displayX + 50;
            newY = displayY + topMargin;
            break;
          case 'chat':
            newX = displayX + displayWidth - windowWidth - 50;
            newY = displayY + topMargin;
            break;
          case 'skills':
            newX = displayX + 50;
            newY = displayY + topMargin + 100; // Slightly lower to avoid overlap
            break;
          case 'llmResponse':
            newX = displayX + (displayWidth - windowWidth) / 2;
            newY = displayY + topMargin;
            break;
          case 'settings':
            newX = displayX + (displayWidth - windowWidth) / 2;
            newY = displayY + topMargin;
            break;
          default:
            newX = displayX + 100;
            newY = displayY + topMargin;
        }
        
        this.setWindowPosition(window, newX, newY, type);
        
        // Ensure always-on-top is maintained after moving
        if (process.platform === 'darwin') {
          window.setAlwaysOnTop(true, 'screen-saver', 1);
        } else {
          window.setAlwaysOnTop(true);
        }
        
        // Ensure window appears on current desktop if it's visible
        if (window.isVisible()) {
          this.showOnCurrentDesktop(window);
        }
        
        logger.debug('Window moved to active screen and shown on current desktop', {
          type,
          position: `${newX},${newY}`,
          isVisible: window.isVisible(),
          displayId: display.id
        });
      }
    });
  }

  setupDesktopTracking() {
    this.desktopWatcher = setInterval(() => {
      this.trackDesktopChanges();
    }, DESKTOP_WATCH_MS);
    this.desktopWatcher.unref?.();

    logger.info('Desktop tracking initialized');
  }

  trackDesktopChanges() {
    if (this.isScreenBeingShared) return;

    // Simplified tracking - just log changes
    if (process.platform === 'darwin') {
      const cursorPoint = screen.getCursorScreenPoint();
      const currentSpaceSignature = `${cursorPoint.x}_${cursorPoint.y}`;
      
      if (this.lastActiveSpace && this.lastActiveSpace !== currentSpaceSignature) {
        logger.debug('Desktop space might have changed');
      }
      
      this.lastActiveSpace = currentSpaceSignature;
    }
  }

  // REMOVED all the aggressive enforcement methods that were causing flickering:
  // - handlePossibleSpaceChange()
  // - handleSpaceChange() 
  // - ensureWindowVisibility()
  // - enforceWindowProperties()
  // - enforceAllWindowProperties()
  // - enforceAlwaysOnTop()

  // Public methods for manual screen sharing control
  enableScreenSharingMode() {
    this.startScreenSharingMode();
  }

  disableScreenSharingMode() {
    this.stopScreenSharingMode();
  }

  isInScreenSharingMode() {
    return this.isScreenBeingShared;
  }

  // Window binding management methods
  setWindowBinding(enabled) {
    this.bindWindows = enabled;
    
    if (enabled) {
      // Position bound windows when binding is enabled
      const mainWindow = this.windows.get('main');
      const llmWindow = this.windows.get('llmResponse');
      
      if (mainWindow && llmWindow) {
        this.positionBoundWindows();
      }
      
      logger.info('Window binding enabled');
    } else {
      logger.info('Window binding disabled');
    }
    
    return this.bindWindows;
  }

  toggleWindowBinding() {
    return this.setWindowBinding(!this.bindWindows);
  }

  getWindowBindingStatus() {
    return {
      enabled: this.bindWindows,
      gap: this.windowGap,
      position: this.boundWindowsPosition
    };
  }

  setWindowGap(gap) {
    this.windowGap = Math.max(0, gap);
    
    // Re-position if currently bound
    if (this.bindWindows) {
      this.positionBoundWindows();
    }
    
    logger.debug('Window gap updated', { gap: this.windowGap });
    return this.windowGap;
  }

  showChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      this.showOnCurrentDesktop(chatWindow);
      logger.debug('Chat window shown');
    }
  }

  hideChatWindow() {
    const chatWindow = this.windows.get('chat');
    if (chatWindow && !chatWindow.isDestroyed()) {
      chatWindow.hide();
      logger.debug('Chat window hidden');
    }
  }

  async showGuideWindow() {
    const existingWindow = this.windows.get('guide');
    if (existingWindow && !existingWindow.isDestroyed()) {
      existingWindow.setTitle(this.getStealthWindowTitle());
      this.positionGuideWindow(existingWindow);
      existingWindow.setIgnoreMouseEvents(false);
      this.showOnCurrentDesktop(existingWindow);
      existingWindow.focus();
      logger.debug('Guide window shown');
      return existingWindow;
    }

    const display = this.getTargetDisplay();
    const { x, y, width, height } = this.normalizeBounds(display.bounds);

    const guideOptions = this.sanitizeBrowserWindowOptions({
      x,
      y,
      width,
      height,
      title: this.getStealthWindowTitle(),
      frame: false,
      titleBarStyle: 'hidden',
      transparent: false,
      backgroundColor: '#020617',
      alwaysOnTop: true,
      show: false,
      skipTaskbar: true,
      focusable: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: true,
        devTools: true
      },
      ...(process.platform === 'darwin' && {
        type: 'panel',
        acceptFirstMouse: true,
        disableAutoHideCursor: true,
        level: 'screen-saver'
      })
    });
    const guideWindow = new BrowserWindow(guideOptions);
    this.lockStealthWindowTitle(guideWindow, 'guide');

    guideWindow.on('closed', () => {
      if (this.windows.get('guide') === guideWindow) {
        this.windows.delete('guide');
      }
    });

    guideWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') {
        this.hideGuideWindow();
        event.preventDefault();
      }
    });

    await guideWindow.loadFile(this.windowConfigs.guide.file);
    guideWindow.setTitle(this.getStealthWindowTitle());
    this.windows.set('guide', guideWindow);

    try {
      guideWindow.setContentProtection(true);
    } catch (error) {
      logger.debug('Guide content protection not supported on this platform');
    }

    guideWindow.setIgnoreMouseEvents(false);
    this.applyStealthMeasures(guideWindow, 'guide');
    this.positionGuideWindow(guideWindow);
    this.showOnCurrentDesktop(guideWindow);

    logger.info('Guide window created and shown', {
      displayId: display.id,
      bounds: display.bounds
    });

    return guideWindow;
  }

  hideGuideWindow() {
    const guideWindow = this.windows.get('guide');
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.hide();
      logger.debug('Guide window hidden');
    }
  }

  toggleGuideWindow() {
    const guideWindow = this.windows.get('guide');
    if (guideWindow && !guideWindow.isDestroyed() && guideWindow.isVisible()) {
      this.hideGuideWindow();
      return;
    }
    this.showGuideWindow();
  }

  positionGuideWindow(guideWindow) {
    if (!guideWindow || guideWindow.isDestroyed()) return;

    const display = this.getTargetDisplay();
    this.setWindowBounds(guideWindow, display.bounds, 'guide');

    if (process.platform === 'darwin') {
      guideWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      guideWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      guideWindow.setAlwaysOnTop(true);
    }
  }

  async showSelectionOverlay() {
    this.hideSelectionOverlay();
    this.hideWindowsForScreenshotCapture();

    const displays = screen.getAllDisplays();
    const minX = Math.min(...displays.map(display => display.bounds.x));
    const minY = Math.min(...displays.map(display => display.bounds.y));
    const maxX = Math.max(...displays.map(display => display.bounds.x + display.bounds.width));
    const maxY = Math.max(...displays.map(display => display.bounds.y + display.bounds.height));
    const virtualBounds = this.normalizeBounds({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    });

    let overlayOptions = {
      x: virtualBounds.x,
      y: virtualBounds.y,
      width: virtualBounds.width,
      height: virtualBounds.height,
      title: this.windowConfigs.selectionOverlay.title,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      show: false,
      skipTaskbar: true,
      focusable: true,
      fullscreen: false,
      fullscreenable: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: true,
      hasShadow: false,
      webPreferences: {
        ...config.get('window.webPreferences'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: true,
        devTools: true
      },
      ...(process.platform === 'darwin' && {
        type: 'panel',
        acceptFirstMouse: true,
        disableAutoHideCursor: true,
        level: 'screen-saver'
      })
    };
    overlayOptions = this.sanitizeBrowserWindowOptions(overlayOptions);

    const window = new BrowserWindow(overlayOptions);
    window.__selectionDisplay = {
      id: 'virtual-desktop',
      bounds: virtualBounds,
      workArea: virtualBounds,
      scaleFactor: 1,
      isVirtual: true,
      displays: displays.map(display => ({
        id: display.id,
        bounds: this.normalizeBounds(display.bounds),
        workArea: this.normalizeBounds(display.workArea || display.bounds),
        scaleFactor: display.scaleFactor
      }))
    };

    window.on('closed', () => {
      this.selectionOverlayWindows = this.selectionOverlayWindows.filter(item => item !== window);
      if (this.windows.get('selectionOverlay') === window) {
        this.windows.delete('selectionOverlay');
      }
    });

    await window.loadFile(this.windowConfigs.selectionOverlay.file, {
      query: { stealth: this.pinnedDisplayMode ? '1' : '0' }
    });

    if (process.platform === 'darwin') {
      window.setAlwaysOnTop(true, 'screen-saver', 1);
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } else {
      window.setAlwaysOnTop(true);
    }

    try {
      window.setContentProtection(true);
    } catch (error) {
      logger.debug('Content protection not supported on this platform', { error: error.message });
    }

    window.setIgnoreMouseEvents(false);
    this.setWindowBounds(window, virtualBounds, 'selectionOverlay');
    window.show();
    window.focus();
    window.webContents.focus();

    this.selectionOverlayWindows = [window];
    this.windows.set('selectionOverlay', window);

    if (process.platform === 'darwin') {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.setAlwaysOnTop(true, 'screen-saver', 1);
        }
      }, 100);
    }

    logger.info('Selection overlay shown on virtual desktop', {
      displayCount: displays.length,
      virtualBounds,
      displays: displays.map(display => ({
        id: display.id,
        bounds: display.bounds,
        scaleFactor: display.scaleFactor
      }))
    });

    return [window.__selectionDisplay];
  }

  hideSelectionOverlay() {
    for (const window of this.selectionOverlayWindows) {
      if (window && !window.isDestroyed()) {
        window.close();
      }
    }
    this.selectionOverlayWindows = [];
    this.windows.delete('selectionOverlay');
    logger.debug('Selection overlay hidden');
  }

  getSelectionOverlayDisplay(sender = null) {
    const senderWindow = sender ? BrowserWindow.fromWebContents(sender) : null;
    if (senderWindow && !senderWindow.isDestroyed()) {
      return senderWindow.__selectionDisplay || null;
    }

    const window = this.selectionOverlayWindows[0] || this.windows.get('selectionOverlay');
    if (!window || window.isDestroyed()) {
      return null;
    }
    return window.__selectionDisplay || null;
  }

  handleRecordingStarted() {
    this.isRecording = true;
    this.showChatWindow();
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-started');
    logger.debug('Recording started, chat window shown');
  }

  handleRecordingStopped() {
    this.isRecording = false;
    this.hideChatWindow();
    // Notify all windows about recording state
    this.broadcastToAllWindows('recording-stopped');
    logger.debug('Recording stopped, chat window hidden');
  }

  broadcastSkillChange(skill) {
    this.windows.forEach((window, type) => {
      if (!window.isDestroyed()) {
        window.webContents.send('skill-changed', { skill });
      }
    });
    
    logger.info('Skill change broadcasted to all windows', { 
      skill,
      windowCount: this.windows.size 
    });
    }
}

module.exports = new WindowManager();
