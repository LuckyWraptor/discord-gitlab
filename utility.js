const PATTERN_URLSPLITTER =/(.+:\/\/)?([^\/]+)(\/.*)*/i;
class Utility {
    static GetHostnameSplit(tData)
    {
      return PATTERN_URLSPLITTER.exec(tData.project.web_url);
    }
    static GetAvatarURL(str, sDomain) {
        if (str == null) return "";
        if (str.startsWith('/')) return sDomain + str;
        return str;
    }


    static IsHostnameAllowed(sUrl, tUrls) {
        if(sUrl == null || tUrls == null) {
            return false;
        }

        if (tUrls.length == 1) {
            return (tUrls[0] == '*' || tUrls[0].toLowerCase() == sUrl.toLowerCase())
        }

        for (var i = 0; i < (tUrls.length); i++) {
            if (tUrls[i] == '*' || tUrls[i].toLowerCase() == sUrl)
                return true;
        }
        return false;
    }
    static IsPathAllowed(sPath, tPaths) {
        if(sPath == null || tPaths == null) {
            return false;
        }


        let tSpecifiedPath = sPath.split('/');


        for (let i = 0; i < tPaths.length; i++) {
            let tPath = tPaths[i].split('/');
            
            for(let iPath = 0; iPath < tPath.length; iPath++)
            {
                // Allow all next values
                if(tPath[iPath] == '*')
                {
                    return true;
                }

                // Path does not equal, deny
                if (tPath[iPath].toLowerCase() != tSpecifiedPath[iPath].toLowerCase()) {
                    break;
                }
                else if( (tPath.length -iPath) == -1) {
                    return true;
                }
            }
        }
        return false;
    }

    static IsEventAllowed(tData, tEvents, bConfidential) {
        if(tData == null || tEvents == null) {
            return false;
        }

        switch (tData.event_name || tData.object_kind) {
            case this.HookType.REPOSITORY_UPDATE:
            case this.HookType.COMMIT:
                return (tEvents.commit != null && tEvents.commit === true);
            case this.HookType.TAG_COMMIT:
                return (tEvents.tag != null && tEvents.tag === true);
            case this.HookType.WIKI:
                return (tEvents.wiki != null && tEvents.wiki === true);
            case this.HookType.ISSUE_CONFIDENTIAL:
                if (!bConfidential)
                    return false;
            case this.HookType.ISSUE:
                if (tEvents.issue != null) {
                    if (tData.object_attributes != null && tData.object_attributes.action != null) {
                        for (let i = 0; i < tEvents.issue.length; i++) {
                            let sType = tEvents.issue[i];
                            if (sType == '*' || tData.object_attributes.action.toLowerCase() == sType.toLowerCase())
                                return true;
                        }
                    }
                }
                break;
            case this.HookType.NOTE:
                if (tEvents.note != null) {
                    if (tData.object_attributes != null && tData.object_attributes.noteable_type != null) {
                        for (let i = 0; i < tEvents.note.length; i++) {
                            if (tEvents.note[i] == '*' || tEvents.note[i].toLowerCase() == tData.object_attributes.noteable_type.toLowerCase())
                                return true;
                        }
                    }
                }
                break;
            case this.HookType.MERGE:
                if (tEvents.merge != null) {
                    if (tData.object_attributes != null && tData.object_attributes.state != null) {
                        for (let i = 0; i < tEvents.merge.length; i++) {
                            if (tEvents.merge[i] == '*' || tEvents.merge[i].toLowerCase() == tData.object_attributes.state.toLowerCase())
                                return true;
                        }
                    }
                }
            case this.HookType.PIPELINE:
                if(tEvents.pipeline != null)
                {
                    if (tData.object_attributes != null && tData.object_attributes.detailed_status != null) {
                        for (let i = 0; i < tEvents.pipeline.length; i++) {
                            if (tEvents.pipeline[i] == '*' || tEvents.pipeline[i].toLowerCase() == tData.object_attributes.detailed_satus.toLowerCase())
                                return true;
                        }
                    }
                }
                break;
            case this.HookType.BUILD:
                if (tEvents.build != null) {
                    if (tData.object_attributes != null && tData.object_attributes.detailed_status != null) {
                        for (let i = 0; i < tEvents.build.length; i++) {
                            if (tEvents.build[i] == '*' || tEvents.build[i].toLowerCase() == tData.object_attributes.detailed_status.toLowerCase())
                                return true;
                        }
                    }
                }
                break;
        }
        return false;
    }


    static msToTime(s) {
        var pad = (n, z = 2) => ('00' + n).slice(-z);
        return pad(s / 3.6e6 | 0) + 'h:' + pad((s % 3.6e6) / 6e4 | 0) + 'm:' + pad((s % 6e4) / 1000 | 0) + '.' + pad(s % 1000, 3) + 's';
    }
    static Truncate(str, count, noElipses, noNewLines) {
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
};
Utility.HookType = {
    COMMIT: "push",
    TAG_COMMIT: "tag_push",
    ISSUE: "issue",
    ISSUE_CONFIDENTIAL: "confidential_issue",
    NOTE: "note",
    MERGE: "merge_request",
    WIKI: "wiki_page",
    PIPELINE: "pipeline",
    BUILD: "build",
    REPOSITORY_UPDATE: "repository_update"
};
Utility.NoteType = {
    COMMIT: "Commit",
    MERGE: "MergeRequest",
    ISSUE: "Issue",
    SNIPPET: "Snippet"
};
Utility.ColorCodes = {
    ORANGE: 15426592,       // issue_opened
    GREY: 5198940,          // issue_closed, default
    PALE_ORANGE: 15109472,  // issue_comment
    BLUE: 7506394,          // commit
    GREEN: 2530048,         // release
    RED: 12856621,          // merge_request_opened
    GREEN: 2530048,         // merge_request_closed
    PINK: 15749300,         // merge_request_comment
    YELLOW: 16773120,       // error
};
Utility.StringLimits = {
    TITLE: 128,
    DESCRIPTION: 128,
    FIELD_NAME: 128,
    FIELD_VALUE: 128,
    COMMIT_ID: 8,
    COMMIT_MSG: 32,
    JSON: 256,
    SNIPPET_CODE: 256,
    USERNAME: 18
};

module.exports = Utility;