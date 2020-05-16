const DISCORD = require('discord.js');

var Main = require('./server');
const Logger = require('./logging');
const Client = require('./client');

class Webhook {
    constructor(sWebhookID) {
        this.Queue = [];
        this.ID = sWebhookID;

        this.Initialize();
    }
    Initialize() {
        try {
            this._webHook = new DISCORD.WebhookClient(Main.Config.webhooks[this.ID].credentials.id, Main.Config.webhooks[this.ID].credentials.token);
            Logger.log(1, `Webhook '${Main.Config.webhooks[this.ID].name}' is ready.`);
        } catch(ex) {
            Logger.log(3, "Invalid credentials for webhook: " + this.ID);
            Logger.error("Webhook error: " + ex);
            return;
        }
    }

    Send(tEmbed) {
        if(this._webHook == null) {
            this.Initialize();
            this.Queue.push(tEmbed);
            return;
        }
        if(Client.ws.status == 0 && !Main.IntentionalDisconnect) {
            this._webHook.send('', { embeds: [tEmbed] })
                .catch(Logger.noteError(`[sendData] Sending an embed via WebHook: ${Main.Config.webhooks[this.ID].name}`));
            Logger.log(0, `Webhook '${Main.Config.webhooks[this.ID].name}' has send an embed.`);
        }
        else
        {
            if(!Main.IntentionalDisconnect)
                Logger.log(2, `Webhook '${Main.Config.webhooks[this.ID].name}' isn't ready for sending messages, queuing...`);
            this.Queue.push(tEmbed);
        }
    }
    SendQueue(bDestroy)
    {
        if(Client.ws.status == 0) {
            this._webHook.send('', { embeds: this.Queue })
                .then(() => {
                    this.Queue = [];

                    if(bDestroy) {
                        this.destroy();
                    }
                })
                .catch(Logger.noteError(`[sendData] Sending an embed via WebHook: ${Main.Config.webhooks[this.ID].name}`));
            Logger.log(1, `Webhook '${Main.Config.webhooks[this.ID].name}' has send all queued embeds`);
        }
        else
        {
            if(!Main.IntentionalDisconnect)
                Logger.log(3, `Webhook '${Main.Config.webhooks[this.ID].name}' isn't ready for sending messages, couldn't send queued embeds.`);
            this.destroy();
        }
    }

    destroy()
    {
        this._webHook.destroy();
    }
}

module.exports = Webhook;