const FS = require('fs');
const LOGGER = require('./logging');
const Util = require('./utility');

const PATTERN_USER = /@(\w+)/g;
const PATTERN_COMMENT = /<!--.*-->/g;

var MEMBERS = require('./require/member-binds.json');

class Markdown
{
    static ConvertMarkdownToDiscord(sUrl, sInput) {
      let sOutput = sInput.replace(PATTERN_USER, function(sMatch, sUsername) {
          return getUser(sUrl, sUsername) || sMatch;
      });

      sOutput = sOutput.replace(PATTERN_COMMENT, () => { return ''; });
    
      return sOutput;
    }
    static GetMarkdownUrlFiltered(sUrl, sText, bFiltered, sHoverText)
    {
        return `[${sText}](${(bFiltered ? '#' : sUrl)} ${(sHoverText != null && sHoverText.length > 0) ? "'" + sHoverText + "'" : ""})`;
    }
    static GetUserString(sUrl, sUser)
    {
        return this.getUser(sUrl, sUser) || Util.Truncate(sUser, Util.StringLimits.USERNAME);
    }
    static RemoveAllMemberBinds(sID)
    {
        let arrRemoved = [];
        for (var k in MEMBERS) {
            if (MEMBERS.hasOwnProperty(k) && MEMBERS[k] == sID) {
                arrRemoved.push(k);
                delete MEMBERS[k];
            }
        }

        if(arrRemoved.length > 0)
        {
            this.saveMemberBinds();
        }

        return arrRemoved;
    }
    static RemoveMemberBind(sUrl, sID)
    {
        if (MEMBERS.hasOwnProperty(sUrl)) {
            if (MEMBERS[sUrl] == sID) {
                delete MEMBERS[sUrl];
                this.saveMemberBinds();
                return true;
            }
        }
        return false;
    }

    
    static getUser(sUrl, sUser)
    {
        if(sUrl == null || sUser == null)
            return;

        sUrl = (sUrl+"/"+sUser).toLowerCase();
        if(MEMBERS.hasOwnProperty(sUrl))
        {
            return `<@${MEMBERS[sUrl]}>`;
        }
    }
    static saveMemberBinds()
    {
      FS.writeFile('./require/member-binds.json', JSON.stringify(MEMBERS), (err) => {
        if(err)
        {
            LOGGER.error("Error occured when saving member binds:", err);
            return;
        }

        LOGGER.log(0, "Member binds have been saved to disk.");
      });
    }
}

module.exports = Markdown;
module.exports.Members = MEMBERS;