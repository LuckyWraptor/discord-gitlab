const DISCORD = require('discord.js');
const FS = require('fs');
const HTTP = require('http');
const HTTPS = require('https');

var Main = require('./server');
const Logger = require('./logging');
const Util = require('./utility');
const Markdown = require('./markdown');
const Processor = require('./processing');


function messageReply(msg, sReply)
{
  msg.reply(sReply)
    .catch(Logger.noteError(`[EMBED] Couldn't send a reply to ${msg.author} in ${msg.channel}(${msg.channel.type})`));
}


///
/// Initialization
///
Logger.log(0, "Initializing Bot client...");
const Client = new DISCORD.Client();
setInterval(
    () => {
        //Logger.log(0, '### Routine check Client.ws.status: ' + Client.ws.status + '; uptime: ' + Client.uptime + "."); // Debugging, only if necessary
        if (Client != null && Client.ws.status == 5) {
            Client.login(Main.Config.bot.credentials.token || process.env.DG_BOT_TOKEN);
        }
    },
    3000
);

    /* Event handling */
Logger.log(0, "Creating Bot client event handling...");
Client.on('ready', () => {
    Logger.log(1, `${Main.Config.bot.nickname} is ready.`);
    Client.user.setActivity('gitlab calls', { type: 'LISTENING'});
});
Client.on('disconnect', closeEvent => {
    Logger.log(2, `${Main.Config.bot.nickname} went offline with ${(closeEvent != null ? `code ${closeEvent.code}: ${closeEvent.reason}` : "unknown code")}`);
});

Client.on('reconnecting', () => {
    Logger.log(1, `${Main.Config.bot.nickname} is attempting to reconnect`);
});

Client.on('warn', warn => {
    Logger.log(2, `${Main.Config.bot.nickname} received a warning: ${(warn != null) ? warn : "unknown"}`);
});

Client.on('error', error => {
    Logger.error(`${Main.Config.bot.nickname} has an error: ${(error != null) ? error.message : "unknown"}`);
});

/* Command handling */
const SAMPLE = {
    build: { type: Util.HookType.BUILD, filename: 'sample/build.json' },
    issue: { type: Util.HookType.ISSUE, filename: 'sample/issue.json' },
    merge: { type: Util.HookType.MERGE, filename: 'sample/merge.json' },
    merge_request: { type: Util.HookType.MERGE, filename: 'sample/merge.json' },
    commit_comment: { type: Util.HookType.NOTE, filename: 'sample/note-commit.json' },
    issue_comment: { type: Util.HookType.NOTE, filename: 'sample/note-issue.json' },
    merge_comment: { type: Util.HookType.NOTE, filename: 'sample/note-merge.json' },
    snippet: { type: Util.HookType.NOTE, filename: 'sample/note-snippet.json' },
    pipeline: { type: Util.HookType.PIPELINE, filename: 'sample/pipeline.json' },
    push: { type: Util.HookType.COMMIT, filename: 'sample/push.json' },
    tag: { type: Util.HookType.TAG_COMMIT, filename: 'sample/tag.json' },
    wiki: { type: Util.HookType.WIKI, filename: 'sample/wiki.json' }
};
const COMMANDS = {
    gl_bind: function (msg, arg) {
        if (msg.channel.type !== 'dm') {
            messageReply(msg, "I'm sorry but I don't handle binds outside of private messages.");
            return;
        }
        if (arg.length < 2) {
            messageReply(msg, "Please use the following syntax: gl_bind <url> <access_token>");
            return;
        }
        let url;
        try {
            url = new URL(arg[0]);
        }
        catch (e) {
            messageReply(msg, "The url specified is invalid.");
            return;
        }

        let sUrl = url.hostname + url.pathname;
        if (Markdown.Members.hasOwnProperty(sUrl)) {
            messageReply(msg, `That gitlab account already is bound to ${(Markdown.Members[sUrl] == msg.author.id) ? 'you' : 'someone'}.`);
            return;
        }

        let httpClient;
        if (url.protocol == 'https') {
            httpClient = HTTP;
        } else {
            httpClient = HTTPS;
        }

        try {
            httpClient.get({ hostname: url.hostname, path: '/api/v4/user', headers: { 'PRIVATE-TOKEN': arg[1] } }, (res) => {
                switch (res.statusCode) {
                    case 200:
                        if (!/^application\/json/.test(res.headers['content-type'])) {
                            messageReply(msg, "Couldn't verify your access, invalid gitlab response.");
                            break;
                        }

                        res.setEncoding('utf8');
                        let sData = '';
                        res.on('data', (chunk) => { sData += chunk; });
                        res.on('end', () => {
                            let jsonResult;
                            try {
                                jsonResult = JSON.parse(sData);
                            } catch (e) {
                                Logger.log(3, `Couldn't json-parse the received data for ${msg.author}'s bind.`);
                                console.error(e.message);
                                messageReply(msg, "Something wents wrong when parsing the received request.");
                                return;
                            }

                            if (jsonResult.web_url == null) {
                                Logger.log(3, `${msg.author}'s gitlab response when binding didn't contain a profile url`);
                                messageReply(msg, "No profile url provided by gitlab, binding failed.");
                                return;
                            }
                            if (jsonResult.web_url != arg[0]) {
                                Logger.log(3, `${msg.author}'s gitlab response when binding didn't contain a profile url`);
                                messageReply(msg, "Verification failed, is the link correct?");
                                return;
                            }

                            let url;
                            try {
                                url = new URL(jsonResult.web_url);
                            } catch (e) {
                                Logger.log(3, `${msg.author}'s gitlab response profile url is invalid`);
                                messageReply(msg, "Verification failed, the gitlab-returned profile url is invalid");
                            }

                            Markdown.Members[url.hostname +url.pathname] = msg.author.id;
                            Markdown.saveMemberBinds();
                            messageReply(msg, "Success, gitlab has been bound!\r\nPlease make sure to distrust the token on gitlab.");
                        });
                        break;
                    case 401:
                        Logger.log(2, `${msg.author} attempted gitlab bind using an invalid token.`);
                        messageReply(msg, "Token invalid, please try again");
                        break;
                    default:
                        Logger.log(2, `${msg.author} attempted gitlab bind but received an unhandled error (${res.statusCode}: ${res.statusMessage})`);
                        messageReply(msg, "An unknown/unhandled error occured.");
                        break;
                }
                res.resume();
            }).on('error', (e) => {
                Logger.log(3, `An error occured when verifying ${msg.author}'s bind.`);
                console.error(e.message);
                messageReply(msg, "Something wents wrong when sending a verification request.");
            });
        } catch (e) {
            Logger.log(3, `A HTTP request to '${url.origin}/api/v4/user' resulted in the error:`);
            console.error(e);
            messageReply(msg, "An error occured, please contact my master if the issue persists.");
        }
    },
    gl_unbind: function (msg, arg) {
        if (arg.length < 1) {
            messageReply(msg, "Please provide the gitlab profile url to remove, or use '*' to remove all binds to your account.");
            return;
        }

        let url = arg[0];

        if (url == '*') {
            let arrRemoved = Markdown.RemoveAllMemberBinds(msg.author.id);

            if (arrRemoved.length > 0) {
                messageReply(msg, `Removed \r\n * ${arrRemoved.join("\r\n * ")} \r\n from your binds.`);
            }
            else {
                messageReply(msg, "You currently have no binds to your discord account.");
            }
        } else {
            // Strip protocol types.
            if (url.startsWith("http://") || url.startsWith("https://")) {
                try {
                    url = new URL(url);
                    url = url.hostname + url.pathname;
                } catch (e) {
                    messageReply(msg, "The url specified is invalid.");
                    return;
                }
            }

            if(Markdown.RemoveMemberBind(url, msg.author.id)) {
                messageReply(msg, "The link has been unbound.");
            } else {
                messageReply(msg, "Sorry, that link isn't bound to you.");
            }
        }
        delete url;
    },
    embed: function (msg, arg) {
        if (msg.author.id !== Main.Config.bot.master_user_id) {
            return;
        }

        let key = (arg[1]) ? arg[1] : '';
        if (!arg[0] || !Main.Hooks.hasOwnProperty(arg[0])) {
            messageReply(msg, "Specified hook not found!");
        }
        if (key != '' && SAMPLE.hasOwnProperty(key)) {
            FS.readFile(SAMPLE[key].filename, 'utf8', function (err, data) {
                if (err) {
                    Logger.log(3, 'Error Context: Reading a file ' + key);
                    console.error(err);
                    messageReply(msg, `There was a problem loading the sample data: ${key}`);
                } else {
                    messageReply(msg, `Sending a sample embed: ${key}`);

                    let tData = JSON.parse(data);
                    let tOutput = Processor.processGitlab(tData, Util.GetHostnameSplit(tData));
                    Processor.sendData(tOutput, arg[0]);
                }
            });
        } else {
            messageReply(msg, `Not a sample argument`);
        }
    },
    disconnect: function (msg, arg) {
        let time = (arg[0]) ? parseInt(arg[0]) : 5000;
        time = (isNaN(time)) ? 5000 : time;
        time = Math.min(Math.max(time, 5000), 3600000);

        // Verify that this user is allowed to disconnect the bot
        if (msg.author.id !== Main.Config.bot.master_user_id) {
            return;
        }

        messageReply(msg, `Taking bot offline for ${time} ms.  Any commands will be ignored until after that time, but the server will still attempt to listen for HTTP requests.`);

        Client.destroy()
            .then(() => {
                setTimeout(() => {
                    Logger.log(1, 'Finished user-specified timeout');
                }, time);
            })
            .catch(Logger.noteError(`[DISCONNECT] Destroying the client session`));
    },
    test: function (msg, arg) {
        // Verify that this user is allowed to disconnect the bot
        if (msg.author.id !== Main.Config.bot.master_user_id) {
            return;
        }

        if (!arg[0] || !Main.Hooks.hasOwnProperty(arg[0])) {
            messageReply(msg, "Couldn't find the provided webhook.");
            return;
        }

        messageReply(msg, 'Sending a sample embed');

        let embed = {
            color: 3447003,
            author: {
                name: Client.user.username,
                icon_url: Client.user.avatarURL
            },
            title: 'This is an embed',
            url: 'http://google.com',
            description: `[abcdef](http://google.com 'A title') A commit message... -Warped2713`,
            fields: [{
                name: 'Fields',
                value: 'They can have different fields with small headlines.'
            },
            {
                name: 'Masked links',
                value: 'You can put [masked links](http://google.com) inside of rich embeds.'
            },
            {
                name: 'Markdown',
                value: 'You can put all the *usual* **__Markdown__** inside of them.'
            }
            ],
            timestamp: new Date(),
            footer: {
                icon_url: Client.user.avatarURL,
                text: '© Example'
            }
        };

        Main.Hooks[arg[0]].Send(embed);
    }
};
Client.on('message', msg => {
    if(msg.channel.type == 'dm' || (msg.channel.type == 'text' && msg.mentions.members.get(Main.Config.bot.credentials.id) != null))
    {
        let content = msg.content.replace(/<@([A-Z0-9])\w+>/g, '').replace(/<@!([A-Z0-9])\w+>/g, '');
        let [cmd, ...arg] = content.trim().split(' ');
    
        if(!cmd || cmd.length <= 0)
        {
            messageReply(msg, "Sorry, I'm not following...");
            return;
        }
        cmd = cmd.toLowerCase();
        // Only process command if it is recognized
        if (COMMANDS.hasOwnProperty(cmd)) {
            COMMANDS[cmd](msg, arg);
        }
    }
});

Logger.log(1, "Initialized Bot client.");


///
/// Logging in
///
Logger.log(0, 'Logging in Bot client...');
Client.login(Main.Config.bot.credentials.token || process.env.DG_BOT_TOKEN);
Logger.log(1, 'Logged in Bot client.');

module.exports = Client;