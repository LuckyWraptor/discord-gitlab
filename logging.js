const logTypes = [
    "Debug",
    "Info",
    "Warning",
    "Error"
];
const dateFormat = {hour12:false,hour:'numeric', minute:'numeric',second:'numeric'};

class Logger {
    static log(iType, sText) {
        console.log(`${new Date().toLocaleString('UTC', dateFormat)} | [${logTypes[iType]}] ${sText}`);
    }

    static error(sText) {
        console.error(`${new Date().toLocaleString('UTC', dateFormat)} | [${logTypes[3]}] ${sText}`)
    }

    static noteError(sContext) {
        return function(e)
        {
            Logger.error("Context: " + sContext);
            console.error(e);
            CLIENT.users.get(MAIN.Config.bot.master_user_id).send(`Someone encountered an error from DiscordAPI...\nContext: ${context}\nError: ${e.message}`)
                .then(() => Logger.log(1, 'Notified master about the error'))
                .catch(console.error);
        }
    }
}
module.exports = Logger;

const MAIN = require('./server');
const CLIENT = require('./client');