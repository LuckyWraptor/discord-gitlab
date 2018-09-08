const DEDENT = require('dedent-js');

const Main = require('./server');
const Logger = require('./logging');
const Markdown = require('./markdown');
const Util = require('./utility');

const dateOptions = {
    hour12: true,
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    timeZoneName: "short"
};

class Processor {
    static ProcessData(data, tToken) {
        Logger.log(0, 'Processing result...');
        if (data.length <= 2) {
            return;
        }

        if ((data.event_name || data.object_kind) == null) {
            Logger.log(2, "No (Hook-type) provided in request, discarding");
            return;
        }

        let tDomain = Util.GetHostnameSplit(data);
        if (tDomain == null) {
            Logger.log(2, "No gitlab url specified, discarding.");
            return;
        }


        let bHyperlinkFiltered = false;
        let bConfidentialFiltered = false;
        if (Main.Config.filters) {
            bHyperlinkFiltered = Main.Config.filters.hyperlinks || false;
            bConfidentialFiltered = Main.Config.filters.confidential || false;
        }
        if (tToken != null) {
            if (tToken.filters != null && tToken.filters.hyperlinks != null) {
                bHyperlinkFiltered = tToken.filters.hyperlinks === true;
                bConfidentialFiltered = tToken.filters.confidential === true;
            }

            // Allow all if none specified (Default behaviour).
            if (tToken.gitlabs != null || tToken.gitlabs.length <= 0) {
                if (!Util.IsHostnameAllowed(tDomain[2], tToken.gitlabs)) {
                    Logger.log(2, "Gitlab url specified isn't allowed to post using this token.");
                    return;
                }
            }
            if (tToken.paths != null && tToken.paths.length <= 0) {
                if (!Util.IsPathAllowed(data.project.path_with_namespace, tToken.paths)) {
                    Logger.log(2, "Project path specified isn't allowed to post using this token.");
                    return;
                }
            }
            if (tToken.events != null && tToken.events.length <= 0) {
                if (!Util.IsEventAllowed(data, tToken.events, bConfidentialFiltered)) {
                    Logger.log(2, "Project event-specific type specified for the event isn't allowed to post using this token.");
                    return;
                }
            }
            if (tToken.webhooks == null && tToken.webhooks.length <= 0) {
                Logger.log(3, "No webhooks specified for token: " + sToken);
                return;
            }
        }

        let tOutput = this.processGitlab(data, tDomain, bHyperlinkFiltered, bConfidentialFiltered);
        /// Send to allowing hooks
        for (let i = 0; i < tToken.webhooks.length; i++) {
            if (tToken.webhooks[i].length > 0) {
                if (!Main.Hooks.hasOwnProperty(tToken.webhooks[i])) {
                    Logger.log(3, "Webhook " + tToken.webhooks[i] + " called but non-existant!");
                    continue;
                }
                // Send data via webhook
                this.sendData(tOutput, tToken.webhooks[i]);
            }
        }
    }

    static processGitlab(data, tDomain, bHyperlinkFiltered, bConfidentialFiltered) {
        /// Generate tOutput
        let tOutput = {
            COLOR: Util.ColorCodes.GREY,
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
            tOutput.AVATAR_URL = data.user.avatar_url;
        } else {
            tOutput.USERNAME = data.user_username || data.user_name;
            tOutput.AVATAR_URL = data.user_avatar;
        }
        //Util.GetAvatarURL(tOutput.AVATAR_URL, (tDomain[1] +tDomain[2]));

        try {
            switch (data.event_name || data.object_kind) {
                case Util.HookType.COMMIT:
                    tOutput.COLOR = Util.ColorCodes.BLUE;

                    if (data.commits.length < 1) {
                        Logger.noteError(JSON.stringify(data));
                    } else if (data.commits.length == 1) {
                        tOutput.DESCRIPTION = DEDENT `
                            ${Markdown.GetMarkdownUrlFiltered(data.commits[0].url, Util.Truncate(data.commits[0].id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered)} ${data.commits[0].message}\n
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
                            tOutput.DESCRIPTION += `${Markdown.GetMarkdownUrlFiltered(data.commits[i].url, Util.Truncate(data.commits[i].id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered, changelog)} ${Util.Truncate(data.commits[i].message, Util.StringLimits.commit_msg, false, true)} - ${Markdown.GetUserString(tDomain[2], data.commits[i].author.name)}\n`;
                        }
                    }
                    break;
                case Util.HookType.TAG_COMMIT:
                    tOutput.DESCRIPTION = `**Tag ${data.ref.substring(10)}**\n`; // refs/tags/ = 10 characters long
                    if (!bHyperlinkFiltered)
                        tOutput.URL = `${data.project.web_url}/${data.ref}`;

                    // Commit Stuff
                    if (data.commits.length < 1) {
                        Logger.noteError(JSON.stringify(data));
                    } else if (data.commits.length == 1) {
                        tOutput.DESCRIPTION += DEDENT `
                            ${Markdown.GetMarkdownUrlFiltered(data.commits[0].url, bHyperlinkFiltered)} ${data.commits[0].message}\n
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
                            tOutput.DESCRIPTION += `${Markdown.GetMarkdownUrlFiltered(data.commits[i].url, Util.Truncate(data.commits[i].id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered, changelog)} ${Util.Truncate(data.commits[i].message,  Util.StringLimits.COMMIT_MSG)} - ${Markdown.GetUserString(tDomain[2], data.commits[i].author.name)}\n`;
                        }
                    }
                    // Tag Stuff
                    tOutput.FIELDS.push({
                        inline: true,
                        name: 'Previous',
                        value: `${Util.Truncate(data.before, Util.StringLimits.COMMIT_ID, true)}`
                    });
                    tOutput.FIELDS.push({
                        inline: true,
                        name: 'Current',
                        value: `${Util.Truncate(data.after, Util.StringLimits.COMMIT_ID, true)}`
                    });

                    break;
                case Util.HookType.ISSUE:
                case Util.HookType.ISSUE_CONFIDENTIAL:
                    if (!bHyperlinkFiltered)
                        tOutput.URL = data.object_attributes.url;

                    let action = '❌';
                    switch (data.object_attributes.action) {
                        case 'open':
                            tOutput.COLOR = Util.ColorCodes.ORANGE;
                            action = '✋';
                            break;
                        case 'reopen':
                            tOutput.COLOR = Util.ColorCodes.ORANGE;
                            action = '↪️';
                            break;
                        case 'update':
                            tOutput.COLOR = Util.ColorCodes.ORANGE;
                            action = '✏';
                            break;
                        case 'close':
                            tOutput.COLOR = Util.ColorCodes.GREEN;
                            action = '✅';
                            break;
                        default:
                            tOutput.COLOR = Util.ColorCodes.PALE_ORANGE;
                            console.log('## Unhandled case for Issue Hook ', data.object_attributes.action);
                            break;
                    }
                    action += ' Issue:';

                    if (bConfidentialFiltered && data.object_attributes.confidential) { // TODO support multiple hooks for private and public updates
                        tOutput.DESCRIPTION = `**${action} [CONFIDENTIAL]**\n`;
                    } else {
                        tOutput.DESCRIPTION += `**${action} #${data.object_attributes.iid} ${data.object_attributes.title}**\n`;
                        tOutput.DESCRIPTION += Util.Truncate(data.object_attributes.description, Util.StringLimits.DESCRIPTION);

                        if (data.assignees && data.assignees.length > 0) {
                            let assignees = { inline: true, name: 'Assigned To:', value: '' };
                            for (let i = 0; i < data.assignees.length; i++) {
                                assignees.value += `${Markdown.GetUserString(tDomain[2], data.assignees[i].username)}\n`;
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
                case Util.HookType.NOTE:
                    if (!bHyperlinkFiltered)
                        tOutput.URL = data.object_attributes.url;

                    tOutput.FIELDS.push({
                        name: 'Comment',
                        value: Util.Truncate(data.object_attributes.note, Util.StringLimits.FIELD_VALUE)
                    });

                    switch (data.object_attributes.noteable_type) {
                        case Util.HookType.COMMIT:
                        case Util.NoteType.COMMIT:
                            let commitid = Util.Truncate(data.commit.id, Util.StringLimits.COMMIT_ID, true);
                            tOutput.COLOR = Util.ColorCodes.BLUE;
                            tOutput.DESCRIPTION = `**New Comment on Commit ${commitid}**\n`;

                            let commit_info = `${Markdown.GetMarkdownUrlFiltered(data.commit.url, Util.Truncate(data.commit.id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered)} `;
                            commit_info += `${Util.Truncate(data.commit.message, Util.StringLimits.COMMIT_MSG, false, true)} - ${Markdown.GetUserString(tDomain[2], data.commit.author.name)}`;
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
                        case Util.HookType.MERGE:
                        case Util.NoteType.MERGE:
                            tOutput.COLOR = Util.ColorCodes.PINK;

                            let mr_state = (data.merge_request.state) ? `[${data.merge_request.state}]` : '';
                            tOutput.DESCRIPTION = DEDENT `
                                **New Comment on Merge Request #${data.merge_request.iid}**
                                *Merge Status: ${data.merge_request.merge_status}* ${mr_state}
                                ${data.merge_request.title}`;

                            let last_commit_info = `${Markdown.GetMarkdownUrlFiltered(data.merge_request.last_commit.url, Util.Truncate(data.merge_request.last_commit.id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered)} `;
                            last_commit_info += `${Util.Truncate(data.merge_request.last_commit.message, Util.StringLimits.COMMIT_MSG, false, true)} - ${Markdown.GetUserString(tDomain[2], data.merge_request.last_commit.author.name)}`;
                            tOutput.FIELDS.push({
                                name: 'Latest Commit',
                                value: last_commit_info
                            });

                            tOutput.FIELDS.push({
                                name: 'Assigned To',
                                value: Markdown.GetUserString(tDomain[2], data.merge_request.assignee.username)
                            });

                            let mr_date = new Date(data.merge_request.created_at);
                            tOutput.FIELDS.push({
                                name: 'Merge Request Timestamp',
                                value: mr_date.toLocaleString('UTC', dateOptions)
                            });
                            break;
                        case Util.HookType.ISSUE:
                        case Util.NoteType.ISSUE:
                            tOutput.COLOR = Util.ColorCodes.PALE_ORANGE;

                            let issue_state = (data.issue.state) ? ` [${data.issue.state}]` : '';
                            tOutput.DESCRIPTION = `**New Comment on Issue #${data.issue.iid} ${data.issue.title} ${issue_state}**\n`;

                            let issue_date = new Date(data.issue.created_at);
                            tOutput.FIELDS.push({
                                name: 'Issue Timestamp',
                                value: issue_date.toLocaleString('UTC', dateOptions)
                            });

                            break;
                        case Util.NoteType.SNIPPET:
                            tOutput.DESCRIPTION = `**New Comment on Code Snippet**\n`;

                            tOutput.FIELDS.push({
                                inline: true,
                                name: 'Title',
                                value: Util.Truncate(data.snippet.title, Util.StringLimits.FIELD_VALUE)
                            });

                            tOutput.FIELDS.push({
                                inline: true,
                                name: 'File Name',
                                value: Util.Truncate(data.snippet.file_name, Util.StringLimits.FIELD_VALUE)
                            });

                            let snip_filetype = data.snippet.file_name.substr(data.snippet.file_name.lastIndexOf('.') + 1);
                            tOutput.FIELDS.push({
                                name: 'Code Snippet',
                                value: '```' + snip_filetype + '\n' + Util.Truncate(data.snippet.content, Util.StringLimits.SNIPPET_CODE) + '\n```'
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
                case Util.HookType.MERGE:
                    if (!bHyperlinkFiltered)
                        tOutput.URL = data.object_attributes.url;
                    switch (data.object_attributes.state) {
                        case 'opened':
                            tOutput.COLOR = Util.ColorCodes.RED;
                            tOutput.DESCRIPTION = `✋`;
                            break;
                        case 'merged':
                            tOutput.COLOR = Util.ColorCodes.GREEN;
                            tOutput.DESCRIPTION = `↪️`;
                            break;
                        case 'closed':
                            tOutput.COLOR = Util.ColorCodes.merge_request_closed;
                            tOutput.DESCRIPTION = `✅`;
                            break;
                        default:
                            tOutput.COLOR = Util.ColorCodes.merge_request_comment;
                            console.log('## Unhandled case for Merge Request Hook ', data.object_attributes.action);
                            break;
                    }
                    tOutput.DESCRIPTION += ` **Merge Request: #${data.object_attributes.iid} ${data.object_attributes.title}**\n`;

                    tOutput.DESCRIPTION += DEDENT `
                        *Merge Status: ${data.object_attributes.merge_status}* [${data.object_attributes.state}]
                        ${Util.Truncate(data.object_attributes.description, Util.StringLimits.DESCRIPTION)}
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
                            value: `${Markdown.GetUserString(tDomain[2], data.object_attributes.assignee.username)}`
                        });
                    }

                    if (data.assignees && data.assignees.length > 0) {
                        let assignees = { inline: true, name: 'Assigned To:', value: '' };
                        for (let i = 0; i < data.assignees.length; i++) {
                            assignees.value += `${Markdown.GetUserString(tDomain[2], data.assignees[i].username)}\n`;
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
                case Util.HookType.WIKI:
                    if (!bHyperlinkFiltered)
                        tOutput.URL = data.object_attributes.url;
                    tOutput.DESCRIPTION = `**Wiki Action: ${data.object_attributes.action}**\n`;
                    tOutput.DESCRIPTION += Util.Truncate(data.object_attributes.message, Util.StringLimits.DESCRIPTION);

                    tOutput.FIELDS.push({
                        name: 'Page Title',
                        value: data.object_attributes.title
                    });

                    if (data.object_attributes.content) {
                        tOutput.FIELDS.push({
                            name: 'Page Content',
                            value: Util.Truncate(data.object_attributes.content, 128)
                        });
                    }
                    break;
                case Util.HookType.PIPELINE:
                    tOutput.DESCRIPTION = `**Pipeline Status Change** [${data.object_attributes.status}]\n`;

                    let status_emote = '❌';
                    switch (data.object_attributes.status) {
                        case 'failed':
                            tOutput.COLOR = Util.ColorCodes.RED;
                            break;
                        case 'created':
                            tOutput.COLOR = Util.ColorCodes.ORANGE;
                            status_emote = '✋';
                            break;
                        case 'success':
                            tOutput.COLOR = Util.ColorCodes.GREEN;
                            status_emote = '✅';
                            break;
                        default:
                            tOutput.COLOR = Util.ColorCodes.GREY;
                            break;
                    }

                    tOutput.FIELDS.push({
                        name: 'Duration',
                        value: Util.msToTime(Util.Truncate(data.object_attributes.duration * 1000))
                    });

                    let commit_info = `${status_emote} ${Markdown.GetMarkdownUrlFiltered(data.commit.url, Util.Truncate(data.commit.id, Util.StringLimits.COMMIT_ID, true), bHyperlinkFiltered)} `;
                    commit_info += `${Util.Truncate(data.commit.message, Util.StringLimits.COMMIT_MSG, false, true)} - ${Markdown.GetUserString(data.commit.author.name)}`;
                    tOutput.FIELDS.push({
                        name: 'Commit',
                        value: commit_info
                    });

                    if (data.builds && data.builds.length > 0) {
                        for (let i = 0; i < data.builds.length; i++) {
                            let dates = {
                                create: new Date(data.builds[i].created_at),
                                start: new Date(data.builds[i].started_at),
                                finish: new Date(data.builds[i].finished_at)
                            };

                            let build_link = `${Markdown.GetMarkdownUrlFiltered(tOutput.URL, Util.Truncate(data.builds[i].id), bHyperlinkFiltered)}`;
                            let build_details = `*Skipped Build ID ${build_link}*`;
                            if (data.builds[i].status != 'skipped') {
                                build_details = DEDENT `
                                    - **Build ID**: ${build_link}
                                    - **User**: [${Markdown.GetUserString(data.builds[i].user.username)}](_blank)
                                    - **Created**: ${dates.create.toLocaleString('UTC', dateOptions)}
                                    - **Started**: ${dates.start.toLocaleString('UTC', dateOptions)}
                                    - **Finished**: ${dates.finish.toLocaleString('UTC', dateOptions)}`;
                            }

                            let emote = '';
                            if (data.builds[i].status == 'failed') emote = '❌';
                            if (data.builds[i].status == 'skipped') emote = '↪️';
                            if (data.builds[i].status == 'success' || data.builds[i].status == 'created') emote = '✅';
                            tOutput.FIELDS.push({
                                //inline: true,
                                name: `${emote} ${Util.Truncate(data.builds[i].stage)}: ${Util.Truncate(data.builds[i].name)}`,
                                value: build_details
                            });
                        }
                    }
                    break;
                // case Util.HookType.BUILD:
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
                //     value: Util.msToTime(Util.Truncate(data.build_duration * 1000))
                //   });

                //   let build_commit_info = `[${Util.Truncate(data.commit.sha,Util.StringLimits.COMMIT_ID,true)}](_blank) `;
                //   build_commit_info += `${Util.Truncate(data.commit.message,Util.StringLimits.COMMIT_MSG, false, true)} - ${Markdown.GetUserString(tDomain[2], data.commit.author_name)}`;
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
                //       tOutput.COLOR = Util.ColorCodes.RED;
                //       build_emote = '❌';
                //       break;
                //     case 'created':
                //     case 'success':
                //       tOutput.COLOR = Util.ColorCodes.GREEN;
                //       build_emote = '✅';
                //       break;
                //     case 'skipped':
                //       tOutput.COLOR = Util.ColorCodes.GREY;
                //       build_emote = '↪️';
                //       break;
                //     default:
                //       tOutput.COLOR = Util.ColorCodes.GREY;
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
                //     name: `${build_emote} ${Util.Truncate(data.build_stage)}: ${Util.Truncate(data.build_name)}`,
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
                        value: Util.Truncate(JSON.stringify(data), Util.StringLimits.JSON)
                    });

                    break;
            }
        } catch (e) {
            Logger.log(3, 'Context: processing data of an HTTP request. Type: ' + (data.event_name || data.object_kind));
            console.error(e);

            tOutput.COLOR = Util.ColorCodes.YELLOW;
            tOutput.TITLE = 'Reading HTTP Request Data: ' + (data.event_name || data.object_kind);
            tOutput.DESCRIPTION = e.message;
        }

        if (bHyperlinkFiltered) {
            tOutput.URL = '#';
        }
        else if (tOutput.URL == null) {
            tOutput.URL = data.project.web_url;
        }

        return tOutput;
    }
    static sendData(input, sWebhook) {
        Logger.log(0, 'Sending result.');
      
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
            text: (Main.Config.webhooks[sWebhook].name || 'James')
          }
        };
        if(input.URL != null && input.URL.length > 10)
        {
          embed.url = input.URL;
        }

        // Only send data if client is ready and hook exists
        if (Main.Hooks[sWebhook] != null) {
            Main.Hooks[sWebhook].Send(embed);
        }
        else
        {
            Logger.noteError(`Webhook ${sWebhook} non-existant in Hooks table, could not send embed through it.`);
        }
    }
}

module.exports = Processor;