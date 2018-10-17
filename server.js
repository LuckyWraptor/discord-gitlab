const VERSION = "1.0.3";
console.log(`======================================\r\n   'Gitlab -> Discord' bot\r\n   Version ${VERSION}\r\n   Fork:\r\n     From: FlyingKatsu-Discord-Bots\r\n     By:   FlyingWraptor\r\n======================================`);

// Load configuration
var args = process.argv.slice(2);
var fileName = 'config.json';
if(args.length >= 1)
{
    fileName = args[0];
}
const CONFIG = require(`./require/${fileName}`);
module.exports = { Config: CONFIG };

const CRYPTO = require('crypto');
const HTTP = require('http');
const SEMVER = require('semver');

// Static
const Logger = require('./logging');
const Client = require('./client');
const Processor = require('./processing');

// Instanceable <kek>
const WebHook = require('./webhook');


// Ignore certificate validation (if enabled)
if(CONFIG.application.ignoreSslCerts === true)
{
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}


function CustomError(message) {
  this.name = 'CustomError';
  this.message = message || 'Default Message';
  this.stack = (new Error()).stack;
}
CustomError.prototype = Object.create(Error.prototype);
CustomError.prototype.constructor = CustomError;



/* Webhooks */
Logger.log(0, "Creating Discord webhook clients.");
let HOOKS = {};
if(CONFIG.webhooks != null)
{
  for(let sWebhookID in CONFIG.webhooks) {
    if(CONFIG.webhooks.hasOwnProperty(sWebhookID)) 
    {
      HOOKS[sWebhookID] = new WebHook(sWebhookID);
    }
  }
}
else
{
  Logger.log(3, "No webhooks configured!");
  process.exit();
}
module.exports.Hooks = HOOKS;
Logger.log(1, "Created Discord webhook clients.");

/* Tokens */
let TOKENS = {};
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
    Logger.log(3, "Invalid listener configuration for the " + sErrorString, true);
}
else
{
  Logger.log(3, "No listener configuration!", true);
  process.exit();
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

/* Listener */
Logger.log(0, "Initializing listener...");
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
    Logger.log(0, "Incoming post request.");

    req.on('data', function(chunk) {
      Logger.log(0, 'Reading post data');

      if (passChecked === false) { // this data is already determined to be invalid
        Logger.log(3, 'Received invalid data, ignoring...');
      } else if (passChecked != null) {
        data += chunk;
      } else {
        let sErrorString;
        if(CONFIG.listener.force_host_match != null && req.headers.hasOwnProperty('host') && req.headers['host'] != CONFIG.listener.force_host_match) {
          Logger.log(2, 'Provided wrong host header: ' + req.headers['host']);
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
            Logger.log(2, "Attempted hook post with invalid token: \r\n" + req.headers['x-gitlab-token'] + "\r\n");
            sErrorString = "Invalid access token!";
          }
        } else {
          Logger.log(2, 'Invalid, non-gitlab request received');
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
      Logger.log(0, 'Finishing request handling...');

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
          Logger.log(3, 'Error for received context: Data is not formatted as JSON');
          console.error(e);
          return;
        }
        Processor.ProcessData(data, tToken);
      }
      Logger.log(0, 'Finished request');
    });

    // Error Handler
    req.on('error', function(e) {
      Logger.error('Error Context: handling an HTTP request');
      console.error(e);
    });
  }
}

HTTPListener.listen(
  { port: CONFIG.listener.port, host: CONFIG.listener.address, exclusive: true },
  () => {
    Logger.log(1, `HTTP Listening at: ${(HTTPListener.address().family == 'IPv6') ? `[${HTTPListener.address().address}]` : HTTPListener.address().address}:${HTTPListener.address().port} ${HTTPListener.address().family}`);
    if(CONFIG.listener.force_host_match)
    {
      Logger.log(1, `Host match enforcement enabled, requests to host(name) '${CONFIG.listener.force_host_match}' only are allowed.`);
    }
  }
);
setInterval(() => {
  if(!HTTPListener.listening)
  {
    HTTPListener.listen(
      { port: CONFIG.listener.port, host: CONFIG.listener.address, exclusive: true },
      () => {
        print(2, "Restarted listener.");
      }
    );
  }
}, 500);
Logger.log(1, "Initialized listener.");


function exitHandler(iExitCode) {
  HTTPListener.close(() => {
    for(var v in HOOKS)
    {
      if(!HOOKS.hasOwnProperty(v))
        continue;
  
      v.SendQueue(true);
    }
  });
  
  
  Client.destroy();
  process.exit(iExitCode);
}

// Close handling
process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('uncaughtException', exitHandler);