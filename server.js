/* General */
console.log("'Gitlab -> Discord' bot\r\nVersion 1.0.0\r\nForked by: Wraptor\r\nOriginal creator: FlyingKatsu Discord Bots");

const FS = require('fs');
const CRYPTO = require('crypto');
const HTTP = require('http');
const DISCORD = require('discord.js');
const DEDENT = require('dedent-js');

var PATTERN_URLSPLITTER =/(.+:\/\/)?([^\/]+)(\/.*)*/i;

const HookType = {
  COMMIT: "push",
  TAG_COMMIT: "tag_push",
  ISSUE: "issue",
  ISSUE_CONFIDENTIAL: "confidential_issue",
  NOTE: "note",
  MERGE: "merge_request",
  WIKI: "wiki_page",
  PIPELINE: "pipeline",
  BUILD: "build",
};
const NodeType = {
  COMMIT: "Commit",
  MERGE: "MergeRequest",
  ISSUE: "Issue",
  SNIPPET: "Snippet"
};
const colorCodes = {
  issue_opened: 15426592, // orange
  issue_closed: 5198940, // grey
  issue_comment: 15109472, // pale orange
  commit: 7506394, // blue
  release: 2530048, // green
  merge_request_opened: 12856621, // red
  merge_request_closed: 2530048, // green
  merge_request_comment: 15749300, // pink
  default: 5198940, // grey
  error: 16773120, // yellow
  red: 12856621,
  green: 2530048,
  grey: 5198940
};
const stringLengths = {
  title: 128,
  description: 128,
  field_name: 128,
  field_value: 128,
  commit_id: 8,
  commit_msg: 32,
  json: 256,
  snippet_code: 256
};
const dateOptions = {
   //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toLocaleString
  hour12: true,
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "numeric",
  timeZoneName: "short"
};
function CustomError(message) {
  this.name = 'CustomError';
  this.message = message || 'Default Message';
  this.stack = (new Error()).stack;
}
CustomError.prototype = Object.create(Error.prototype);
CustomError.prototype.constructor = CustomError;

// Import CONFIG file
const CONFIG = require('./require/config.json');
var MEMBERS = require('./require/member-binds.json');


/* Logging */
const logTypes = [
  "Debug",
  "Info",
  "Warning",
  "Error"
];
function print(iType, sString, bErrorExit)
{
  if(iType > 0 || (CONFIG.application != null && CONFIG.application.debug)) {
    console.log("[" + logTypes[iType] + "] " + sString);
  }

  if(bErrorExit)
    process.exit(1);
}



/* Webhooks */
print(0, "Creating Discord webhook clients.");
var HOOKS = {};
var HOOKS_embedsQueues = {};
if(CONFIG.webhooks)
{
  for(let webhookId in CONFIG.webhooks) {
    if(CONFIG.webhooks.hasOwnProperty(webhookId)) 
    {
      try {
        HOOKS[webhookId]  = new DISCORD.WebhookClient(CONFIG.webhooks[webhookId].credentials.id, CONFIG.webhooks[webhookId].credentials.token);
      }
      catch(ex)
      {
        print(3, "Invalid credentials for webhook: " + webhookId, true);
        print(0, "Webhook error: " + ex);
      }
    }
  }
}
else
{
  print(3, "No webhooks configured!", true);
}
print(1, "Created Discord webhook clients.");

/* Listener */
print(0, "Initializing listener");
var TOKENS = {};
if(CONFIG.listener != null)
{
  let sErrorString;
  if(CONFIG.listener.address == null || typeof CONFIG.listener.address != 'string')
    sErrorString = "address";
  else if(CONFIG.listener.port == null || isNaN(CONFIG.listener.port))
    sErrorString = "port";
  
  else if(CONFIG.listener.access_tokens != null)
  {
    for(let token in CONFIG.listener.access_tokens) {
      if(CONFIG.listener.access_tokens.hasOwnProperty(token)) 
      {
        TOKENS[token] = CONFIG.listener.access_tokens[token];
        TOKENS[token].TOKEN_BUFFER = Buffer.from(token);
      }
    }
  }

  if(sErrorString != null)
    print(3, "Invalid listener configuration for the " + sErrorString, true);
}
else
{
  print(3, "No listener configuration!", true);
}
function retrieveToken(sProvidedToken)
{
  let buffProvidedToken = Buffer.from(sProvidedToken);
  for(let sToken in TOKENS)
  {
    let tToken = TOKENS[sToken];
    if((tToken.TOKEN_BUFFER.length - buffProvidedToken.length) == 0 && CRYPTO.timingSafeEqual(tToken.TOKEN_BUFFER, buffProvidedToken))
    {
      return tToken;
    }
  }
}

var HTTPListener = HTTP.createServer(appHandler);
function appHandler(req, res)
{
  let data = '';
  let passChecked = null;
  let tToken = null;

  let headers = req.headers;
  let method = req.method;
  let url = req.url;
  let body = '';

  if (req.method == 'POST') {
    print(0, "Incoming post request.");

    req.on('data', function(chunk) {
      print(0, 'Reading post data');

      if (passChecked === false) { // this data is already determined to be invalid
        print(3, 'Received invalid data, ignoring...');
      } else if (passChecked != null) {
        data += chunk;
      } else {
        let sErrorString;
        if(CONFIG.listener.force_host_match != null && req.headers.hasOwnProperty('host') && req.headers['host'] != CONFIG.listener.force_host_match) {
          print(2, 'Provided wrong host header: ' + req.headers['host']);
          sErrorString = "Provided host header is incorrect!";
        }
        else if (req.headers.hasOwnProperty('x-gitlab-token')) {
          tToken = retrieveToken(req.headers['x-gitlab-token']);
          if (tToken != null) {
            passChecked = true;
            data += chunk;
            return;
          }
          else
          {
            print(2, "Attempted hook post with invalid token: \r\n" + req.headers['x-gitlab-token'] + "\r\n");
            sErrorString = "Invalid access token!";
          }
        } else {
          print(2, 'Invalid, non-gitlab request received');
          sErrorString = "Invalid, non-gitlab request!";
        }

        passChecked = false;
        res.writeHead(400, {'Content-Type': 'application/json'});
        res.write(JSON.stringify({ headers: headers, method: method, url: url, body: body }));
        res.end();
        res.destroy(new CustomError(sErrorString));
      }
    });

    // Completion handler
    req.on('end', function() {
      print(0, 'Finishing request handling...');

      if (passChecked) {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({ headers: headers, method: method, url: url, body: body }));

        try {
          // To accept everything as a string
          //data = JSON.parse(JSON.stringify(data));
          // To read JSON as JSON and everything else as a string
          //data = (headers['content-type'] == 'application/json') ? JSON.parse(data) : ''+data;
          // Assume only JSON formatting, and let all else be caught as an error and read as a string
          data = JSON.parse(data);
        } catch (e) {
          print(3, 'Error for received context: Data is not formatted as JSON');
          console.error(e);
          return;
        }
        processData(data, tToken);
      }
      print(0, 'Finished request');
    });

    // Error Handler
    req.on('error', function(e) {
      print(3, 'Error Context: handling an HTTP request');
      console.error(e);
    });
  }
}
function processData(data, tToken) {
  print(0, 'Processing result...');
  if(data.length <= 2)
  {
    return;
  }

  let type = data.event_name || data.object_kind;
  if(type == null)
  {
    print(2, "No (Hook-type) provided in request, discarding");
    return;
  }

  let tDomain = getHostnameSplit(data);
  let sUrl = tDomain[1] + tDomain[2] + "/";
  if(tDomain == null)
  {
    print(2, "No gitlab url specified, discarding.");
    return;
  }

  
  let bHyperlinkFiltered = false;
  let bConfidentialFiltered = false;
  if(CONFIG.filters)
  {
    bHyperlinkFiltered = CONFIG.filters.hyperlinks || false;
    bConfidentialFiltered = CONFIG.filters.confidential || false;
  }
  if(tToken.filters != null && tToken.filters.hyperlinks != null)
  {
    bHyperlinkFiltered = tToken.filters.hyperlinks === true;
    bConfidentialFiltered = tToken.filters.confidential === true;
  }

  // Allow all if none specified (Default behaviour).
  if(tToken.gitlabs != null || tToken.gitlabs.length <= 0)
  {
    if(!getIsHostnameAllowed(tDomain[2], tToken.gitlabs))
    {
      print(2, "Gitlab url specified isn't allowed to post using this token.");
      return;
    }
  }
  if(tToken.paths != null && tToken.paths.length <= 0)
  {
    if(!getIsPathAllowed(data.project.path_with_namespace, tToken.paths))
    {
      print(2, "Project path specified isn't allowed to post using this token.");
      return;
    }
  }
  if(tToken.events != null && tToken.events.length <= 0)
  {
    if(!getIsEventAllowed(data, tToken.events, bConfidentialFiltered))
    {
      print(2, "Project event-specific type specified for the event isn't allowed to post using this token.");
      return;
    }
  }
  if(tToken.webhooks == null && tToken.webhooks.length <= 0)
  {
    print(3, "No webhooks specified for token: " + sToken);
    return;
  }

  /// Generate tOutput
  let tOutput = {
    COLOR: colorCodes.default,
    TITLE: '',
    USERNAME: '',
    AVATAR_URL: '',
    URL: '',
    DESCRIPTION: '',
    FIELDS: [],
    TIME: new Date()
  };

  if (data.project) {
    tOutput.TITLE = `[${data.project.path_with_namespace}]`;
  }
  // Set up common values, if they exist
  if (data.user) {
    tOutput.USERNAME = data.user.username || data.user.name;
    tOutput.AVATAR_URL = getAvatarURL(data.user.avatar_url, (tDomain[1] + tDomain[2]));
  } else {
    tOutput.USERNAME = data.user_username || data.user_name;
    tOutput.AVATAR_URL = getAvatarURL(data.user_avatar, (tDomain[1] + tDomain[2]));
  }

  try {
    switch (type) {
      case HookType.COMMIT:
        tOutput.COLOR = colorCodes.commit;

        if (data.commits.length < 1) {
          debugData(JSON.stringify(data));
        } else if (data.commits.length == 1) {
          tOutput.DESCRIPTION = DEDENT `
          ${getTextMarkdownUrlFiltered(truncate(data.commits[0].id, stringLengths.commit_id, true), data.commits[0].url, bHyperlinkFiltered)} ${data.commits[0].message}\n
          ${data.commits[0].modified.length} change(s)\n
          ${data.commits[0].added.length} addition(s)\n
          ${data.commits[0].removed.length} deletion(s)
          `;
        } else {
          tOutput.DESCRIPTION = `**${data.total_commits_count} New Commits**\n`;
          for (let i = 0; i < Math.min(data.commits.length, 5); i++) {
            let changelog = DEDENT `
            ${data.commits[i].modified.length} change(s)
            ${data.commits[i].added.length} addition(s)
            ${data.commits[i].removed.length} deletion(s)
            `;
            tOutput.DESCRIPTION += `${getTextMarkdownUrlFiltered(truncate(data.commits[i].id, stringLengths.commit_id, true), data.commits[i].url, bHyperlinkFiltered, changelog)} ${truncate(data.commits[i].message,stringLengths.commit_msg, false, true)} - ${getUser(tDomain[2], data.commits[i].author.name)}\n`;
          }
        }
      break;
      case HookType.TAG_COMMIT:
        tOutput.DESCRIPTION = `**Tag ${data.ref.substring(10)}**\n`; // refs/tags/ = 10 characters long
        if(!bHyperlinkFiltered)
          tOutput.URL = `${data.project.web_url}/${data.ref}`;

        // Commit Stuff
        if (data.commits.length < 1) {
          debugData(JSON.stringify(data));
        } else if (data.commits.length == 1) {
          tOutput.DESCRIPTION += DEDENT `
          ${getTextMarkdownUrlFiltered(truncate(data.commits[0].id, stringLengths.commit_id, true), data.commits[0].url, bHyperlinkFiltered)} ${data.commits[0].message}\n
          ${data.commits[0].modified.length} change(s)\n
          ${data.commits[0].added.length} addition(s)\n
          ${data.commits[0].removed.length} deletion(s)
          `;
        } else {
          for (let i = 0; i < Math.min(data.commits.length, 5); i++) {
            let changelog = DEDENT `
            ${data.commits[i].modified.length} change(s)
            ${data.commits[i].added.length} addition(s)
            ${data.commits[i].removed.length} deletion(s)
            `;
            tOutput.DESCRIPTION += `${getTextMarkdownUrlFiltered(truncate(data.commits[i].id, stringLengths.commit_id, true), data.commits[i].url, bHyperlinkFiltered, changelog)} ${truncate(data.commits[i].message,stringLengths.commit_msg)} - ${getUser(tDomain[2], data.commits[i].author.name)}\n`;
          }
        }
        // Tag Stuff
        tOutput.FIELDS.push({
          inline: true,
          name: 'Previous',
          value: `${truncate(data.before, stringLengths.commit_id, true)}`
        });
        tOutput.FIELDS.push({
          inline: true,
          name: 'Current',
          value: `${truncate(data.after, stringLengths.commit_id, true)}`
        });

      break;
      case HookType.ISSUE:
      case HookType.ISSUE_CONFIDENTIAL:
        if(!bHyperlinkFiltered)
          tOutput.URL = data.object_attributes.url;

        let action = '';
        switch (data.object_attributes.action) {
          case 'open':
            tOutput.COLOR = colorCodes.issue_opened;
            action = '✋ ';
            break;
          case 'reopen':
            tOutput.COLOR = colorCodes.issue_opened;
            action = '↪️ ';
            break;
          case 'update':
            tOutput.COLOR = colorCodes.issue_opened;
            action = '✏ ';
            break;
          case 'close':
            tOutput.COLOR = colorCodes.issue_closed;
            action = '✅ ';
            break;
          default:
            tOutput.COLOR = colorCodes.issue_comment;
            console.log('## Unhandled case for Issue Hook ', data.object_attributes.action);
            break;
        }
        action += 'Issue:';

        if (bConfidentialFiltered && data.object_attributes.confidential) { // TODO support multiple hooks for private and public updates
          tOutput.DESCRIPTION = `**${action} [CONFIDENTIAL]**\n`;
        } else {
          tOutput.DESCRIPTION += `**${action} #${data.object_attributes.iid} ${data.object_attributes.title}**\n`;
          tOutput.DESCRIPTION += truncate(data.object_attributes.description, stringLengths.description);

          if (data.assignees && data.assignees.length > 0) {
            let assignees = { inline: true, name: 'Assigned To:', value: '' };
            for (let i=0;i<data.assignees.length;i++) {
              assignees.value += `${getUser(tDomain[2], data.assignees[i].username)}\n`;
            }
            tOutput.FIELDS.push(assignees);
          }

          if (data.labels && data.labels.length > 0) {
            let labels = { inline: true, name: 'Labeled As:', value: '' };
            for (let i = 0; i < data.labels.length; i++) {
              labels.value += `${data.labels[i].title}\n`;
            }
            tOutput.FIELDS.push(labels);
          }
        }
      break;
      case HookType.NOTE:
        if(!bHyperlinkFiltered)
          tOutput.URL = data.object_attributes.url;

        tOutput.FIELDS.push({
          name: 'Comment',
          value: truncate(data.object_attributes.note, stringLengths.field_value)
        });

        switch (data.object_attributes.noteable_type) {
          case 'commit':
          case 'Commit':
            let commitid = truncate(data.commit.id,stringLengths.commit_id,true);
            tOutput.COLOR = colorCodes.commit;
            tOutput.DESCRIPTION = `**New Comment on Commit ${commitid}**\n`;

            let commit_info = `${getTextMarkdownUrlFiltered(truncate(data.commit.id, stringLengths.commit_id, true), data.commit.url, bHyperlinkFiltered)} `;
            commit_info += `${truncate(data.commit.message,stringLengths.commit_msg, false, true)} - ${getUser(tDomain[2], data.commit.author.name)}`;
            tOutput.FIELDS.push({
              name: 'Commit',
              value: commit_info
            });

            let commit_date = new Date(data.commit.timestamp);
            tOutput.FIELDS.push({
              name: 'Commit Timestamp',
              value: commit_date.toLocaleString('UTC', dateOptions)
            });
          break;
          case 'merge_request':
          case 'MergeRequest':
            tOutput.COLOR = colorCodes.merge_request_comment;

            let mr_state = (data.merge_request.state) ? `[${data.merge_request.state}]` : '';
            tOutput.DESCRIPTION = DEDENT `
              **New Comment on Merge Request #${data.merge_request.iid}**
              *Merge Status: ${data.merge_request.merge_status}* ${mr_state}
              ${data.merge_request.title}`;

            let last_commit_info = `${getTextMarkdownUrlFiltered(truncate(data.merge_request.last_commit.id, stringLengths.commit_id, true), data.merge_request.last_commit.url, bHyperlinkFiltered)} `;
            last_commit_info += `${truncate(data.merge_request.last_commit.message,stringLengths.commit_msg, false, true)} - ${getUser(tDomain[2], data.merge_request.last_commit.author.name)}`;
            tOutput.FIELDS.push({
              name: 'Latest Commit',
              value: last_commit_info
            });

            tOutput.FIELDS.push({
              name: 'Assigned To',
              value: getUser(tDomain[2], data.merge_request.assignee.username)
            });

            let mr_date = new Date(data.merge_request.created_at);
            tOutput.FIELDS.push({
              name: 'Merge Request Timestamp',
              value: mr_date.toLocaleString('UTC', dateOptions)
            });
          break;
          case 'issue':
          case 'Issue':
            tOutput.COLOR = colorCodes.issue_comment;

            let issue_state = (data.issue.state) ? ` [${data.issue.state}]` : '';
            tOutput.DESCRIPTION = `**New Comment on Issue #${data.issue.iid} ${data.issue.title} ${issue_state}**\n`;

            let issue_date = new Date(data.issue.created_at);
            tOutput.FIELDS.push({
              name: 'Issue Timestamp',
              value: issue_date.toLocaleString('UTC', dateOptions)
            });

          break;
          case 'snippet':
          case 'Snippet':
            tOutput.DESCRIPTION = `**New Comment on Code Snippet**\n`;

            tOutput.FIELDS.push({
              inline: true,
              name: 'Title',
              value: truncate(data.snippet.title, stringLengths.field_value)
            });

            tOutput.FIELDS.push({
              inline: true,
              name: 'File Name',
              value: truncate(data.snippet.file_name, stringLengths.field_value)
            });

            let snip_filetype = data.snippet.file_name.substr(data.snippet.file_name.lastIndexOf('.') + 1);
            tOutput.FIELDS.push({
              name: 'Code Snippet',
              value: '```' + snip_filetype + '\n' + truncate(data.snippet.content, stringLengths.snippet_code) + '\n```'
            });

            let snip_date = new Date(data.snippet.created_at);
            tOutput.FIELDS.push({
              name: 'Snippet Timestamp',
              value: snip_date.toLocaleString('UTC', dateOptions)
            });
          break;
          default:
            console.log('## Unhandled case for Note Hook ', data.object_attributes.noteable_type);
            break;
        }
      break;
      case HookType.merge:
        if(!bHyperlinkFiltered)
          tOutput.URL = data.object_attributes.url;
        switch (data.object_attributes.state)
        {
          case 'opened':
            tOutput.COLOR = colorCodes.merge_request_opened;
            tOutput.DESCRIPTION = `❌`;
          break;
          case 'merged':
            tOutput.COLOR = colorCodes.merge_request_closed;
            tOutput.DESCRIPTION = `↪️`;
          break;
          case 'closed':
            tOutput.COLOR = colorCodes.merge_request_closed;
            tOutput.DESCRIPTION = `✅`;
          break;
          default:
            tOutput.COLOR = colorCodes.merge_request_comment;
            console.log('## Unhandled case for Merge Request Hook ', data.object_attributes.action);
          break;
        }
        tOutput.DESCRIPTION += ` **Merge Request: #${data.object_attributes.iid} ${data.object_attributes.title}**\n`;

        tOutput.DESCRIPTION += DEDENT `
          *Merge Status: ${data.object_attributes.merge_status}* [${data.object_attributes.state}]
          ${truncate(data.object_attributes.description, stringLengths.description)}
          `;

        tOutput.FIELDS.push({
          inline: true,
          name: 'Merge From',
          value: DEDENT `
            ${data.object_attributes.source.namespace}/
            ${data.object_attributes.source.name}:
            ${data.object_attributes.source_branch}`
        });

        tOutput.FIELDS.push({
          inline: true,
          name: 'Merge Into',
          value: DEDENT `
            ${data.object_attributes.target.namespace}/
            ${data.object_attributes.target.name}:
            ${data.object_attributes.target_branch}`
        });

        /*if (data.object_attributes.source) {
          tOutput.FIELDS.push({
            name: 'Source:',
            value: `[${data.object_attributes.source.path_with_namespace}: ${data.object_attributes.source_branch}](${data.object_attributes.source.web_url} '${data.object_attributes.source.name}')`
          });
        } 

        if (data.object_attributes.target) {
          tOutput.FIELDS.push({
            name: 'Target:',
            value: `[${data.object_attributes.target.path_with_namespace}: ${data.object_attributes.target_branch}](${data.object_attributes.target.web_url} '${data.object_attributes.target.name}')`
          });
        }*/

        if (data.object_attributes.assignee) {
          tOutput.FIELDS.push({
            inline: true,
            name: 'Assigned To',
            value: `${getUser(tDomain[2], data.object_attributes.assignee.username)}`
          });
        }

        if (data.assignees && data.assignees.length > 0) {
          let assignees = { inline: true, name: 'Assigned To:', value: '' };
          for (let i = 0; i < data.assignees.length; i++) {
            assignees.value += `${getUser(tDomain[2], data.assignees[i].username)}\n`;
          }
          tOutput.FIELDS.push(assignees);
        }

        if (data.labels && data.labels.length > 0) {
          let labels = { inline: true, name: 'Labeled As:', value: '' };
          for (let i = 0; i < data.labels.length; i++) {
            labels.value += `${data.labels[i].title}\n`;
          }
          tOutput.FIELDS.push(labels);
        }
      break;
      case HookType.WIKI:
        if(!bHyperlinkFiltered)
          tOutput.URL = data.object_attributes.url;
        tOutput.DESCRIPTION = `**Wiki Action: ${data.object_attributes.action}**\n`;
        tOutput.DESCRIPTION += truncate(data.object_attributes.message, stringLengths.description);

        tOutput.FIELDS.push({
          name: 'Page Title',
          value: data.object_attributes.title
        });

        if (data.object_attributes.content) {
          tOutput.FIELDS.push({
            name: 'Page Content',
            value: truncate(data.object_attributes.content, 128)
          });
        }
      break;
      case HookType.PIPELINE:
        tOutput.DESCRIPTION = `**Pipeline Status Change** [${data.object_attributes.status}]\n`;

        let status_emote = '❌';
        switch (data.object_attributes.status) {
          case 'failed':
            tOutput.COLOR = colorCodes.red;
          break;
          case 'created':
            tOutput.COLOR = colorCodes.issue_opened;
            status_emote = '✋';
          break;
          case 'success':
            tOutput.COLOR = colorCodes.green;
            status_emote = '✅';
          break;
          default:
            tOutput.COLOR = colorCodes.grey;
          break;
        }

        tOutput.FIELDS.push({
          name: 'Duration',
          value: msToTime(truncate(data.object_attributes.duration * 1000))
        });

        let commit_info = `${status_emote} ${getTextMarkdownUrlFiltered(truncate(data.commit.id,stringLengths.commit_id,true), data.commit.url, bHyperlinkFiltered)} `;
        commit_info += `${truncate(data.commit.message,stringLengths.commit_msg, false, true)} - ${getUser(data.commit.author.name)}`;
        tOutput.FIELDS.push({
          name: 'Commit',
          value: commit_info
        });

        if (data.builds && data.builds.length > 0) {
          for (let i=0;i<data.builds.length;i++) {
            let dates = {
              create: new Date(data.builds[i].created_at),
              start: new Date(data.builds[i].started_at),
              finish: new Date(data.builds[i].finished_at)
            };

            let build_link = `${getTextMarkdownUrlFiltered(truncate(data.builds[i].id), tOutput.URL, bHyperlinkFiltered)}`;
            let build_details = `*Skipped Build ID ${build_link}*`;
            if (data.builds[i].status != 'skipped') {
              build_details = DEDENT `
              - **Build ID**: ${build_link}
              - **User**: [${getUser(data.builds[i].user.username)}](_blank)
              - **Created**: ${dates.create.toLocaleString('UTC',dateOptions)}
              - **Started**: ${dates.start.toLocaleString('UTC',dateOptions)}
              - **Finished**: ${dates.finish.toLocaleString('UTC',dateOptions)}`;
            }

            let emote = '';
            if (data.builds[i].status == 'failed') emote = '❌';
            if (data.builds[i].status == 'skipped') emote = '↪️';
            if (data.builds[i].status == 'success' || data.builds[i].status == 'created') emote = '✅';
            tOutput.FIELDS.push({
              //inline: true,
              name: `${emote} ${truncate(data.builds[i].stage)}: ${truncate(data.builds[i].name)}`,
              value: build_details
            });
          }
        }
      break;
      // case HookType.BUILD:
      //   // For some reason GitLab doesn't send user data to job hooks, so set username/avatar to empty
      //   tOutput.USERNAME = '';
      //   tOutput.AVATAR_URL = '';
      //   // It also doesn't include the project web_url ??? or the path with namespace ???
      //   let canon_url = data.repository.git_http_url.slice(0, -'.git'.length);
      //   let namespace = canon_url.substr(sUrl.length + 1);

      //   tOutput.DESCRIPTION = `**Job: ${data.build_name}**\n`;
      //   tOutput.URL = `${canon_url}/-/jobs/${data.build_id}`;

      //   tOutput.FIELDS.push({
      //     name: 'Duration',
      //     value: msToTime(truncate(data.build_duration * 1000))
      //   });

      //   let build_commit_info = `[${truncate(data.commit.sha,stringLengths.commit_id,true)}](_blank) `;
      //   build_commit_info += `${truncate(data.commit.message,stringLengths.commit_msg, false, true)} - ${data.commit.author_name}`;
      //   tOutput.FIELDS.push({
      //     name: 'Commit',
      //     value: build_commit_info
      //   });

      //   let build_dates = {
      //     start: new Date(data.build_started_at),
      //     finish: new Date(data.build_finished_at)
      //   };

      //   let build_emote = '';
      //   switch (data.build_status) {
      //     case 'failed':
      //       tOutput.COLOR = colorCodes.red;
      //       build_emote = '❌';
      //       break;
      //     case 'created':
      //     case 'success':
      //       tOutput.COLOR = colorCodes.green;
      //       build_emote = '✅';
      //       break;
      //     case 'skipped':
      //       tOutput.COLOR = colorCodes.grey;
      //       build_emote = '↪️';
      //       break;
      //     default:
      //       tOutput.COLOR = colorCodes.grey;
      //       break;
      //   }

      //   let build_link = `[${data.build_id}](_blank)`;
      //   let build_details = `*Skipped Build ID ${build_link}*`;
      //   if (data.build_status != 'skipped') {
      //     build_details = DEDENT `
      //     - **Build ID**: ${build_link}
      //     - **Commit Author**: [${data.commit.author_name}](_blank)
      //     - **Started**: ${build_dates.start.toLocaleString('UTC',dateOptions)}
      //     - **Finished**: ${build_dates.finish.toLocaleString('UTC',dateOptions)}`;
      //   }
      //   tOutput.FIELDS.push({
      //     name: `${build_emote} ${truncate(data.build_stage)}: ${truncate(data.build_name)}`,
      //     value: build_details
      //   });
      // break;
      default:
        // TODO
        console.log('# Unhandled case! ', type);
        tOutput.TITLE = `Type: ${type}`;
        tOutput.DESCRIPTION = `This feature is not yet implemented`;

        tOutput.FIELDS.push({
          name: 'Received Data',
          value: truncate(JSON.stringify(data), stringLengths.json)
        });

        break;
    }
  } catch (e) {
    print(3, 'Context: processing data of an HTTP request. Type: ' + (data.event_name || data.object_kind));
    console.error(e);

    tOutput.COLOR = colorCodes.error;
    tOutput.TITLE = 'Reading HTTP Request Data: ' + (data.event_name || data.object_kind);
    tOutput.DESCRIPTION = e.message;
  }

  if(bHyperlinkFiltered)
  {
    tOutput.URL = '#';
  }
  else if(tOutput.URL == null || tOutput.URL.length < 12)
  {
    tOutput.URL = data.project.web_url;
  }

  /// Send to allowing hooks
  for(let i=0;i<tToken.webhooks.length;i++)
  {
    if(tToken.webhooks[i].length > 0)
    {
      if(!HOOKS.hasOwnProperty(tToken.webhooks[i]))
      {
        print(3, "Webhook " + tToken.webhooks[i] + " called but non-existant!");
        continue;
      }
      // Send data via webhook
      sendData(tOutput, tToken.webhooks[i]);
    }
  }
  
  // Return before legacy code is called.
  return;
}
function sendData(input, sWebhook) {
  print(0, 'Sending result.');

  let embed = {
    color: input.COLOR,
    author: {
      name: input.USERNAME,
      icon_url: input.AVATAR_URL
    },
    title: input.TITLE,
    description: input.DESCRIPTION,
    fields: input.FIELDS || {},
    timestamp: input.TIME || new Date(),
    footer: {
      icon_url: CLIENT.user.avatarURL,
      text: CONFIG.bot.nickname
    }
  };
  if(input.URL != null && input.URL.length > 10)
  {
    embed.url = input.URL;
  }

  // Only send data if client is ready
  if (CLIENT != null && CLIENT.status == 0 && HOOKS[sWebhook] != null) {
    HOOKS[sWebhook].send('', { embeds: [embed] })
      .catch(shareDiscordError(`[sendData] Sending an embed via WebHook: ${CONFIG.webhooks[sWebhook].name}`));
  } else {
    if(!HOOKS_embedsQueues.hasOwnProperty(sWebhook))
    {
      HOOKS_embedsQueues[sWebhook] = [];
    }
    HOOKS_embedsQueues[sWebhook].push(embed);
  }
}
print(1, "Initialized listener");



/* Utilities */

function truncate(str, count, noElipses, noNewLines) {
  if (noNewLines) str = str.split('\n').join(' ');
  if (!count && str) return str;
  if (count && str && noElipses) {
    return str.substring(0, count);
  } else if (str && str.length > 0) {
    if (str.length <= count) return str;
    return str.substring(0, count - 3) + '...';
  } else {
    return "";
  }
}
function msToTime(s) {
  var pad = (n, z = 2) => ('00' + n).slice(-z);
  return pad(s / 3.6e6 | 0) + 'h:' + pad((s % 3.6e6) / 6e4 | 0) + 'm:' + pad((s % 6e4) / 1000 | 0) + '.' + pad(s % 1000, 3) + 's';
}

function getAvatarURL(str, sDomain) {
  if (str == null) return "";
  if (str.startsWith('/')) return sDomain + str;
  return str;
}
function getIsHostnameAllowed(sUrl, tUrls)
{
  if(tUrls.length == 1)
  {
    return (tUrls[0] == '*' || tUrls[0].toLowerCase() == sUrl.toLowerCase())
  }

  for(var i = 0; i < (tUrls.length); i++)
  {
    if(tUrls[i] == '*' || tUrls[i].toLowerCase() == sUrl)
      return true;
  }
  return false;
}
function getHostnameSplit(tData)
{
  return PATTERN_URLSPLITTER.exec(tData.project.web_url);
}
function getIsPathAllowed(sPath, tPaths)
{
  let tSpecifiedPath = sPath.split('/');

  for(let i = 0;i < tPaths.length;i++)
  {
    let tPath = tPaths[i].split('/');
    if(tPath[0] == '*')
    {
      return true;
    }
    else if(tPath[0] == tSpecifiedPath[0])
    {
      if(tPath[1] == '*' || tPath[1] == tSpecifiedPath[1])
      {
        return true;
      }
    }    
  }
  return false;
}
function getIsEventAllowed(tData, tEvents, bConfidential)
{
  switch(tData.event_name || tData.object_kind)
  {
    case HookType.COMMIT:
        return (tEvents.commit != null && tEvents.commit == true);
    case HookType.TAG_COMMIT:
      return (tEvents.tag != null && tEvents.tag == true);
    case HookType.WIKI:
      return (tEvents.wiki != null && tEvents.wiki == true);
    case HookType.ISSUE_CONFIDENTIAL:
      if(!bConfidential)
        return false;
    case HookType.ISSUE:
      if(tEvents.issue != null)
      {
        if(tData.object_attributes != null && tData.object_attributes.action != null)
        {
          for(let i=0;i<tEvents.issue.length;i++)
          {
            let sType = tEvents.issue[i];
            if(sType == '*' || tData.object_attributes.action.toLowerCase() == sType.toLowerCase())
              return true;
          }
        }
      }
    break;
    case HookType.NOTE:
      if(tEvents.note != null)
      {
        if(tData.object_attributes != null && tData.object_attributes.noteable_type != null)
        {
          for(let i=0;i<tEvents.note.length;i++)
          {
            if(tEvents.note[i] == '*' || tEvents.note[i].toLowerCase() == tData.object_attributes.noteable_type.toLowerCase())
              return true;
          }
        }
      }
    break;
    case HookType.MERGE:
      if(tEvents.merge != null)
      {
        if(tData.object_attributes != null && tData.object_attributes.state != null)
        {
          for(let i=0;i<tEvents.merge.length;i++)
          {
            if(tEvents.merge[i] == '*' || tEvents.merge[i].toLowerCase() == tData.object_attributes.state.toLowerCase())
              return true;
          }
        }
      }
    case HookType.PIPELINE:
    case HookType.BUILD:
      if(tEvents.build != null)
      {
        if(tData.object_attributes != null && tData.object_attributes.detailed_satus != null)
        {
          for(let i=0;i<tEvents.build.length;i++)
          {
            if(tEvents.build[i] == '*' || tEvents.build[i].toLowerCase() == tData.object_attributes.detailed_satus.toLowerCase())
              return true;
          }
        }
      }
    break;
  }
  return false;
}
function getTextMarkdownUrlFiltered(sText, sUrl, bFiltered, sHoverText)
{
  return `[${sText}](${(bFiltered ? '#' : sUrl)} ` + (sHoverText != null && sHoverText.length > 0 ? "'" + sHoverText + "'" : '') + ')';
}
function getUser(sUrl, sUser)
{
  if(sUrl == null || sUser == null)
    return;

  sUrl = (sUrl+"/"+sUser).toLowerCase();
  if(MEMBERS.hasOwnProperty(sUrl))
  {
    return `<@${MEMBERS[sUrl]}>`;
  }
  return sUser;
}

/* ============================================
 * Bot Commands
 * ========================================= */
const SAMPLE = {
  build: { type: HookType.BUILD, filename: 'sample/build.json' },
  issue: { type: HookType.ISSUE, filename: 'sample/issue.json' },
  merge: { type: HookType.MERGE, filename: 'sample/merge.json' },
  merge_request: { type: HookType.MERGE, filename: 'sample/merge.json' },
  commit_comment: { type: HookType.NOTE, filename: 'sample/note-commit.json' },
  issue_comment: { type: HookType.NOTE, filename: 'sample/note-issue.json' },
  merge_comment: { type: HookType.NOTE, filename: 'sample/note-merge.json' },
  snippet: { type: HookType.NOTE, filename: 'sample/note-snippet.json' },
  pipeline: { type: HookType.PIPELINE, filename: 'sample/pipeline.json' },
  push: { type: HookType.COMMIT, filename: 'sample/push.json' },
  tag: { type: HookType.TAG_COMMIT, filename: 'sample/tag.json' },
  wiki: { type: HookType.WIKI, filename: 'sample/wiki.json' }
};

// Custom Error Handlers for DiscordAPI
// Reply to the message with an error report
function replyWithDiscordError(msg) {
  // Return a function so that we can simply replace console.error with replyWithDiscordError(msg)
  return function(e) {
    if (msg) {
      msg.reply(`encountered an error from DiscordAPI: ${e.message}`)
        .then((m) => { console.log(`Informed ${msg.author} of the API error: ${e.message}`) })
        .catch(console.error);
    }
    console.error(e);
  };
}
// Mention send report to master user
function shareDiscordError(context) {
  return function(e) {
    print(3, 'Context: ' + context);
    console.error(e);
    CLIENT.users.get(CONFIG.bot.master_user_id).send(`Someone encountered an error from DiscordAPI...\nContext: ${context}\nError: ${e.message}`)
      .catch(shareDiscordErrorFromSend(e, context, `[ERROR] Sending error message to <@${CONFIG.bot.master_user_id}>`));
  }
}
// In case we cannot send messages, try going through the webhook
function shareDiscordErrorFromSend(originalError, originalContext, context) {
  return function(e) {
    print(3, 'context: ' + context);
    console.error(e);
    if (CLIENT) {
      CLIENT.users.get(CONFIG.bot.master_user_id).send(`[${CONFIG.bot.nickname}] encountered an error...\nInitial Context: ${originalContext}\nInitial Error: ${originalError.message}\nSubsequent Context: ${context}\nSubsequent Error: ${e.message}`)
        .then((m) => print(3, `Sent an error report via webhook`))
        .catch(console.error);
    }
  }
}


const COMMANDS = {
  gl_bind: function(msg, arg) {

  },
  embed: function(msg, arg) {
    let key = (arg[1]) ? arg[1] : '';
    if(!arg[0] || !HOOKS.hasOwnProperty(arg[0]))
    {
      msg.reply("Specified hook not found!")
        .catch(shareDiscordError(msg.author, `[EMBED] Couldn't send a reply to ${msg.author} in ${msg.channel}`));
    }

    if (key != '' && SAMPLE.hasOwnProperty(key)) {
      FS.readFile(SAMPLE[key].filename, 'utf8', function(err, data) {
        if (err) {
          console.log('Error Context: Reading a file ' + key);
          console.error(err);
          msg.reply(`There was a problem loading the sample data: ${key}`)
            .catch(shareDiscordError(msg.author, `[EMBED:${key}] Sending a reply [Error Reading File] to ${msg.author} in ${msg.channel}`));
        } else {
          msg.reply(`Sending a sample embed: ${key}`)
            .catch(shareDiscordError(msg.author, `[EMBED:${key}] Sending a reply [Success] to ${msg.author} in ${msg.channel}`));
          processData(SAMPLE[key].type, JSON.parse(data));
        }
      });
    } else {
      msg.reply(`Not a sample argument`)
        .catch(shareDiscordError(msg.author, `[EMBED:null] Sending a reply [Invalid Argument] to ${msg.author} in ${msg.channel}`));
    }
  },

  disconnect: function(msg, arg) {
    let time = (arg[0]) ? parseInt(arg[0]) : 5000;
    time = (isNaN(time)) ? 5000 : time;
    time = Math.min(Math.max(time, 5000), 3600000);

    // Verify that this user is allowed to disconnect the bot
    if (msg.author.id == CONFIG.bot.master_user_id) {
      userTimerEnabled = true;

      msg.reply(`Taking bot offline for ${time} ms.  Any commands will be ignored until after that time, but the server will still attempt to listen for HTTP requests.`)
        .catch(shareDiscordError(msg.author, `[DISCONNECT:${time}] Sending a reply [Success] to ${msg.author} in ${msg.channel}`));

      CLIENT.destroy()
        .then(() => {
          setTimeout(() => {
            userTimerEnabled = false;
            print(1, 'Finished user-specified timeout');
          }, time);
        })
        .catch(shareDiscordError(msg.author, `[DISCONNECT] Destroying the client session`));
    } else {
      msg.reply(`You're not allowed to disconnect the bot!`)
        .catch(shareDiscordError(msg.author, `[DISCONNECT] Sending a reply [Not Permitted] to ${msg.author} in ${msg.channel}`));
    }
  },

  test: function(msg, arg) {
    if(!arg[0] || !HOOKS.hasOwnProperty(arg[0]))
    {
      msg.reply("Couldn't find the provided webhook.")
        .catch(shareDiscordError(msg.author, `[TEST] Couldn't send a reply to ${msg.author} in ${msg.channel}`));
      return;
    }

    msg.reply('Sending a sample embed')
      .catch(shareDiscordError(msg.author, `[TEST] Sending a reply to ${msg.author} in ${msg.channel}`));

    let embed = {
      color: 3447003,
      author: {
        name: CLIENT.user.username,
        icon_url: CLIENT.user.avatarURL
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
        icon_url: CLIENT.user.avatarURL,
        text: '© Example'
      }
    };

    HOOKS[arg[0]].send('', { embeds: [embed] })
      .catch(shareDiscordError(msg.author, `[TEST] Sending a message via WebHook ${HOOKS[arg[0]].name}`));
  }
};

print(0, "Initializing Discord client.");
const CLIENT = new DISCORD.Client();
var CLIENT_userTimerEnabled = false;
var CLIENT_disconnectHandled = false;
var CLIENT_readyStatus = 'ready';
var keepAlive = function() {
  //print(0, '### Routine check client.status: ' + CLIENT.status + '; uptime: ' + CLIENT.uptime + ".");

  if (!CLIENT_userTimerEnabled && !CLIENT_disconnectHandled
    && CLIENT != null && CLIENT.status == 5) {
      CLIENT_disconnectHandled = true;

    // set ready message to 'Recovering from unexpected shutdown'
    CLIENT_readyStatus = 'rebooted';
    CLIENT.login(CONFIG.bot.credentials.token || process.env.DG_BOT_TOKEN);
  }
};
var CLIENT_keepAlive = setInterval(keepAlive, 3000);
print(0, "Initialized Discord client's keepalive interval.");

CLIENT.on('ready', () => {
  print(1, `${CONFIG.bot.nickname} is ready.`);

  if (CLIENT_disconnectHandled) {
    CLIENT_disconnectHandled = false;

    // Process stored data
    for(var sHook in HOOKS_embedsQueues)
    {
      if(!HOOKS.hasOwnProperty(sHook))
        continue;

      HOOKS[sHook].send('', { embeds: HOOKS_embedsQueues[sHook]})
        .then(() => print(1, `Handled queued requests`))
        .catch(shareDiscordError(null, `[onReady] Sending recovered embeds via WebHook: ${CONFIG.webhooks[sHook].name}`));
    }
  }

  if (!HTTPListener.listening) {
    // Start listening for HTTP requests
    HTTPListener.listen(
      {port: CONFIG.listener.port, host: CONFIG.listener.address, exclusive: true},
      () => { console.log('[Info] HTTP Listening at', HTTPListener.address()); }
    );
  }
});

// Create an event listener for messages
CLIENT.on('message', msg => {
  if(msg.channel.type == 'dm' || (msg.channel.type == 'text' && msg.mentions.members.get(CONFIG.bot.credentials.id) != null))
  {
    let content = msg.content.replace(/<@([A-Z0-9])\w+>/g, '').replace(/<@!([A-Z0-9])\w+>/g, '');
    let [cmd, ...arg] = content.trim().split(' ');

    // Only process command if it is recognized
    if (COMMANDS.hasOwnProperty(cmd)) {
      COMMANDS[cmd](msg, arg);
    }
  }
});

CLIENT.on('disconnect', closeEvent => {
  print(2, `${CONFIG.bot.nickname} went offline with ${(closeEvent != null ? `code ${closeEvent.code}: ${closeEvent.reason}` : "unknown code")}`);
});

CLIENT.on('reconnecting', () => {
  print(1, `${CONFIG.bot.nickname} is attempting to reconnect`);
});

CLIENT.on('warn', warn => {
  if (warn) {
    print(2, `${CONFIG.bot.nickname} received a warning: ${warn}`);
  }
});

CLIENT.on('error', error => {
  if (error) {
    print(2, `${CONFIG.bot.nickname} has an error: ${error.message}`);
  } else {
    print(2, `${CONFIG.bot.nickname} has an unknown error`);
  }
});
print(1, "Initialized Discord client.");


/* ============================================
 * Log our bot into Discord
 * ========================================= */
print(0, 'Logging in Discord client...');
// Log our bot in
CLIENT.login(CONFIG.bot.credentials.token || process.env.DG_BOT_TOKEN);
print(1, 'Logged in Discord client...');