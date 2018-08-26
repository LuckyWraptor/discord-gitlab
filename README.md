# Discord-GitLab Webhook Bot

A Discord bot for using webhooks with GitLab (and extendable for other custom webhooks not yet built into Discord).
Unlike it's parent fork this project allows you to integrate multiple gitlabs, multiple access-tokens (not related to the webhook's access-tokens) with specific source restriction, hyperlink, confidentiality and event filtering. To top it all off it now supports multiple webhooks instead of 1 for each bot instance.

![Preview of embed messages sent via webhook](preview.png "WebHook Embed Preview")

## GitLab Event Support
* Push Events
* Issue Events
* Comment Events
    * Commits
    * Merge Requests
    * Issues
    * Code Snippets
* Merge Request Events
* Wiki Page Events
* Tag Events (Not yet)
* Pipeline Events (Not yet)
* Build Events (Not yet)


## Installation

1. Clone this repo
2. Install [NodeJS](https://nodejs.org/en/download/)
3. Navigate to the cloned repo
4. Initialize the NodeJS app with npm install
5. All of the dependencies listed in **package.json** should automatically be installed to **node_modules/**
6. Install [pm2](http://pm2.keymetrics.io/) using `npm install pm2@latest -g`
7. Update pm2

### Command Line Summary

```
# make a parent directory for containing the repo, if desired
mkdir my_bots
# navigate to your desired directory
cd my_bots
# either clone via HTTPS
git clone https://github.com/FlyingWraptor/discord-gitlab.git
# ... or clone via SSH
git clone git@github.com:FlyingWraptor/discord-gitlab.git
# navigate to the cloned repo
cd discord-gitlab
# install the app via NodeJS, using package.json
npm install
# install pm2
npm install pm2@latest -g
# update pm2
pm2 update
```

### Dependencies

The **package.json** file includes the following dependencies:
* [discordJS](https://github.com/hydrabolt/discord.js/) for integrating with Discord
    * [erlpack](https://github.com/hammerandchisel/erlpack) for much faster websockets
* [pm2](http://pm2.keymetrics.io/docs/usage/quick-start/#cheat-sheet) for monitoring and maintaining uptime


## Configuration

1. Create your Discord Bot at https://discordapp.com/developers/applications/me Keep this tab open so you can easily access Client ID and Client Secret
2. Make your Discord app a Bot User by clicking the "Create Bot User" button in your app page settings.
3. Calculated the desired permissions for your bot at https://discordapi.com/permissions.html (or use the default 536964096)
4. Authorize your Discord Bot for your server using `https://discordapp.com/oauth2/authorize?client_id={YOUR_CLIENT_ID}&scope=bot&permissions={YOUR_CALCULATED_PERMISSIONS}` NOTE: if you get "Unexpected Error" then you probably forgot to turn your Discord App into a Bot User in Step 2.
5. In your local bot repo, copy the dev/require/config-example.json to dev/require/config.json and fill in the data according to the instructions
6. In your local GitLab server, set up a new webhook using your chosen URL (server.address:server.port), and the webhook's token specified in your config file.
7. Run the bot using `pm2 start server.js --name dg-bot` or simply `node server.js` if you don't want to use pm2
8. Test the webhook by clicking the 'Test' button in GitLab's integrations page

### Update notifier

Notify the master-user about new releases, to enable add the key 'application.updates': 'true'

### Debug mode

Debug mode can be configured in the config file under the application key (application.debug)

### Using Environment Variables for Secret Tokens (optional)

Instead of keeping your secret bot-token in a file, you can choose to set up an environment variable and export it for use with the bot script.

```
echo $DG_BOT_TOKEN
export DG_BOT_TOKEN=MySecretDiscordBotToken
echo $DG_BOT_TOKEN
```

## Sending Test HTTP Requests

### Use GitLab's Tests

In your GitLab instance (either on the web or on your own server), go to `Settings > Integrations` and find (or create) your webhook. Use the drop-down menu next to your webhook's details to test different event types.

Note that some events will require additional setup on your GitLab instance, such as a `.gitlab-ci.yml` script for your Pipeline and Job events, and an initial wiki page for your wiki events.

## Bot Commands

Calling the bot is as easy as simply mentioning him with your command, this can be done in a channel readable by the bot, or simply in a private message.

<!--
### Binding gitlab user

`@botname gl_bind <url> <access_token>`

This command may only be send in a private-message to the bot, the user is required to post it's user gitlab-url aswell as an access-token for the specified user on the gitlab platform with 'read_user' access for verification purposes only, after the bind has been completed the user may (and is advised to) delete the token.

### Unbinding gitlab user

`@botname gl_unbind <url>`

This command will remove the gitlab user from your discord account meaning you will not be quoted anymore if you are mentioned in tasks.

-->
### Disconnect Bot

`@botname disconnect`

Tell the bot to stay logged out for TIME milliseconds (default is 5 seconds, max is 1 hour).  The bot should automatically log itself back in after TIME is up.  Only the configured master user is allowed to use this command. No commands will be processed during the timeout, but the server will still attempt to listen for incoming HTTP requests (which the bot will process when it logs back in).


### Embed Sample Data

`@botname embed TYPE`

Sends an embedded message via webhook, using data read from the specified sample file. Also replies to the user to acknowledge receiving the command.

TYPE must be one of the properties of the SAMPLE object:
* `build`  Reads from `sample/build.json`, which is the body of a [GitLab Build Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#build-events)
* `issue`  Reads from `sample/issue.json`, which is the body of a [GitLab Issue Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#issues-events)
* `merge`  Reads from `sample/merge.json`, which is the body of a [GitLab Merge Request Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#merge-request-events)
* `commit_comment`  Reads from `sample/note-commit.json`, which is the body of a [GitLab Note Hook for Commits](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#comment-on-commit)
* `issue_comment`  Reads from `sample/note-comment.json`, which is the body of a [GitLab Note Hook for Issues](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#comment-on-issue)
* `merge_comment`  Reads from `sample/note-merge.json`, which is the body of a [GitLab Note Hook for Merge Requests](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#comment-on-merge-request)
* `snippet`  Reads from `sample/note-snippet.json`, which is the body of a [GitLab Note Hook for Code Snippets](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#comment-on-code-snippet)
* `pipeline`  Reads from `sample/pipeline.json`, which is the body of a [GitLab Pipeline Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#pipeline-events)
* `push`  Reads from `sample/push.json`, which is the body of a [GitLab Push Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#push-events)
* `tag`  Reads from `sample/tag.json`, which is the body of a [GitLab Tag Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#tag-events)
* `wiki`  Reads from `sample/wiki.json`, which is the body of a [GitLab Wiki Page Hook](https://docs.gitlab.com/ce/user/project/integrations/webhooks.html#wiki-page-events)

### Test Embed

`@botname test`
Sends an embedded message via webhook, using some placeholder RichEmbed data with Markdown formatting. Also replies to the user to acknowledge receiving the command.
