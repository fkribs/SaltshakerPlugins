const {
  SlpStream,
  SlpStreamEvent,
  SlpParser,
  DolphinConnection,
  Ports,
  ConnectionEvent,
  ConnectionStatus,
  DolphinMessageType
} = require('@slippi/slippi-js');

const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const log = require('electron-log');

const SSBMPlugin = {
  onInit() {
    this.slpStream = new SlpStream();
    this.parser = new SlpParser();
    this.dolphinConnection = new DolphinConnection();
    this.webContents = pluginEvents?.webContents || null;

    this.setupDolphinListeners();
    this.setupSlpListeners();

    setTimeout(() => this.readUserInfo(), 1000);
    this.connect();

    console.log('[SSBMPlugin] Initialized.');
  },

  // -------------------- Dolphin connection handling --------------------
  setupDolphinListeners() {
    this.dolphinConnection.on(ConnectionEvent.STATUS_CHANGE, (status) => {
      log.info('[Dolphin Status]', status);

      switch (status) {
        case ConnectionStatus.DISCONNECTED:
          this.notifyRenderer('disconnected-event', 'disconnected');
          this.connect(); // Auto-reconnect
          break;

        case ConnectionStatus.CONNECTED:
          this.notifyRenderer('connected-event', 'connected');
          break;

        case ConnectionStatus.CONNECTING:
          this.notifyRenderer('connecting-event', 'connecting');
          break;
      }
    });

    this.dolphinConnection.on(ConnectionEvent.MESSAGE, (message) => {
      switch (message.type) {
        case DolphinMessageType.CONNECT_REPLY:
          console.log('[Dolphin] Connected:', message);
          break;

        case DolphinMessageType.GAME_EVENT:
          const decoded = Buffer.from(message.payload, 'base64');
          this.writeToStream(decoded);
          break;
      }
    });

    this.dolphinConnection.on(ConnectionEvent.ERROR, (err) => {
      console.error('[Dolphin Error]', err);
      this.notifyRenderer('error-event', err.toString());
    });
  },

  connect() {
    this.notifyRenderer('disconnected-event', 'disconnected');
    if (this.dolphinConnection.getStatus() === ConnectionStatus.DISCONNECTED) {
      this.dolphinConnection.connect('127.0.0.1', Ports.DEFAULT);
    }
  },

  disconnect() {
    this.dolphinConnection.disconnect();
  },

  // -------------------- SLP parsing --------------------
  setupSlpListeners() {
    this.slpStream.on(SlpStreamEvent.COMMAND, (event) => {
      this.parser.handleCommand(event.command, event.payload);

      switch (event.command) {
        case 54: // Game start
          log.info('[Slippi] Game start (cmd 54)');
          pluginEvents.emit('connect', this.parser.getSettings());
          break;

        case 57: // Game end
          log.info('[Slippi] Game end (cmd 57)');
          pluginEvents.emit('disconnect', this.sessionId);
          break;
      }
    });
  },

  writeToStream(data) {
    this.slpStream.write(data);
  },

  // -------------------- User info --------------------
  async readUserInfo() {
    const homeDir = os.homedir();
    const userJsonPath = path.join(
      homeDir,
      'AppData',
      'Roaming',
      'Slippi Launcher',
      'netplay',
      'User',
      'Slippi',
      'user.json'
    );

    try {
      const data = await fs.readFile(userJsonPath, 'utf-8');
      const userInfo = JSON.parse(data);
      log.info('[User Info]', userInfo);
      this.sessionId = userInfo.connectCode;
      pluginEvents.emit('setSession', this.sessionId);
    } catch (error) {
      log.error('[User Info Error]', error);
      this.notifyRenderer('user-retrieved-error', error.message);
    }
  },

  // -------------------- Helpers --------------------
  notifyRenderer(event, payload) {
    if (this.webContents) {
      try {
        this.webContents.send(event, payload);
      } catch (err) {
        log.warn('[Renderer Notify Error]', err);
      }
    }
  },
};

module.exports = SSBMPlugin;
