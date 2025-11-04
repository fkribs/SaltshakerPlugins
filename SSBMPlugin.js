const { SlpStream, SlpStreamEvent, SlpParser } = require('@slippi/slippi-js');
const { DolphinConnection, Ports, ConnectionEvent, ConnectionStatus, DolphinMessageType } = require('@slippi/slippi-js');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const log = require('electron-log');

const SSBMPlugin = {

    onInit() {
        this.slpStream = new SlpStream();
        this.parser = new SlpParser();
        this.dolphinConnection = new DolphinConnection();
        this.setupListeners();
        setTimeout(() => this.readUserInfo(), 1000);
        this.connect();
        console.log("SSBM Plugin initialized.");
    },

    setupListeners() {
        this.slpStream.on(SlpStreamEvent.COMMAND, (event) => {
            this.parser.handleCommand(event.command, event.payload);
            switch (event.command) {
                case 54: // 54 is the command for game start
                    log.info("54");
                    pluginEvents.emit('connect', this.parser.getSettings());
                    break;
                case 57: // 57 is the command for game end
                    log.info("57");
                    pluginEvents.emit('disconnect', this.sessionId); // Emit event on disconnect
                    break;
            }
        });

        this.dolphinConnection.on(ConnectionEvent.STATUS_CHANGE, (status) => {
            log.info(status);
            switch (status) {
                case ConnectionStatus.DISCONNECTED:
                    //this.webContents.send('disconnected-event', 'disconnected');
                    this.connect(); // Auto-reconnect
                    break;
                case ConnectionStatus.CONNECTED:
                    //this.webContents.send('connected-event', 'connected');
                    break;
                case ConnectionStatus.CONNECTING:
                    //this.webContents.send('connecting-event', 'connecting');
                    break;
            }
        });

        this.dolphinConnection.on(ConnectionEvent.MESSAGE, (message) => {
            switch (message.type) {
                case DolphinMessageType.CONNECT_REPLY:
                    console.log('Connected: ' + message);
                    break;
                case DolphinMessageType.GAME_EVENT:
                    var decoded = Buffer.from(message.payload, 'base64');
                    this.writeToStream(decoded);
                    break;
            }
        });

    },

    writeToStream(data) {
        log.info(data);
        this.slpStream.write(data);
    },

    async readUserInfo() {
        const homeDir = os.homedir();
        const userJsonPath = path.join(homeDir, 'AppData', 'Roaming', 'Slippi Launcher', 'netplay', 'User', 'Slippi', 'user.json');

        try {
            const data = await fs.readFile(userJsonPath, 'utf-8');
            const userInfo = JSON.parse(data);
            log.info('User Info:', userInfo);
            pluginEvents.emit('setSession', userInfo.connectCode); // Emit event on disconnect
        } catch (error) {
            log.error('Error reading user info:', error);
            // Optionally, you can send the error to the renderer process
            if (this.windowManager.getWebContents()) {
                //this.windowManager.getWebContents().send('user-retrieved-error', error.message);
            }
        }
    },

    connect() {
        //this.webContents.send('disconnected-event', 'disconnected');
        if (this.dolphinConnection.getStatus() === ConnectionStatus.DISCONNECTED) {
            // Now try connect to our local Dolphin instance
            this.dolphinConnection.connect('127.0.0.1', Ports.DEFAULT);
        }
    },

    disconnect() {
        this.dolphinConnection.disconnect();
    }


}

module.exports = SSBMPlugin;
