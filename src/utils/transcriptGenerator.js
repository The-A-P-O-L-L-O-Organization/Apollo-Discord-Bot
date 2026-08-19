// Transcript Generator Utility
// Generates HTML and text transcripts for tickets

import { writeToSubDir } from './db.js';

/**
 * Generates an HTML transcript for a ticket
 * @param {object} transcript - Transcript data object
 * @returns {string} HTML content
 */
export function generateHtmlTranscript(transcript) {
    const { ticketNumber, guildName, channelName, createdBy, closedBy, reason, closeReason, createdAt, closedAt, messageCount, messages } = transcript;
    
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };
    
    const escapeHtml = (text) => {
        if (!text) {
            return '';
        }
        return text
            .replace(/&/g, '&')
            .replace(/</g, '<')
            .replace(/>/g, '>')
            .replace(/"/g, '"')
            .replace(/'/g, '&#039;')
            .replace(/\//g, '&#x2F;')
            .replace(/`/g, '&#x60;')
            .replace(/=/g, '&#x3D;');
    };
    
    const formatMessageContent = (msg) => {
        let content = escapeHtml(msg.content || '');
        
        // Handle attachments
        if (msg.attachments && msg.attachments.length > 0) {
            content += '\n\n[Attachments: ' + msg.attachments.map(a => `${a.name} (${formatBytes(a.size)})`).join(', ') + ']';
        }
        
        // Handle embeds
        if (msg.embeds && msg.embeds > 0) {
            content += `\n\n[${msg.embeds} embed(s)]`;
        }
        
        if (msg.edited) {
            content += ' *(edited)*';
        }
        
        return content;
    };
    
    const formatBytes = (bytes) => {
        if (bytes === 0) {
            return '0 B';
        }
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    const messagesHtml = messages.map(msg => {
        const isBot = msg.author.bot ? 'bot' : '';
        const authorClass = isBot ? 'message-bot' : 'message-user';
        const timestamp = formatDate(msg.timestamp);
        
        return `
        <div class="message ${authorClass}">
            <div class="message-header">
                <span class="message-author">${escapeHtml(msg.author.tag)}</span>
                <span class="message-timestamp">${timestamp}</span>
            </div>
            <div class="message-content">${formatMessageContent(msg).replace(/\n/g, '<br>')}</div>
        </div>`;
    }).join('\n');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket #${ticketNumber} Transcript</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Arial, sans-serif;
            background: #1e1f22;
            color: #dcddde;
            line-height: 1.5;
            padding: 20px;
        }
        
        .container {
            max-width: 900px;
            margin: 0 auto;
            background: #232428;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .header {
            background: #2b2d31;
            border-bottom: 1px solid #2f3136;
            padding: 24px;
        }
        
        .header h1 {
            color: #fff;
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        
        .meta-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }
        
        .meta-item {
            background: #1e1f22;
            border-radius: 4px;
            padding: 12px;
        }
        
        .meta-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #72767d;
            margin-bottom: 4px;
        }
        
        .meta-value {
            font-size: 14px;
            color: #dcddde;
            word-break: break-word;
        }
        
        .meta-value a {
            color: #00b0f4;
            text-decoration: none;
        }
        
        .meta-value a:hover {
            text-decoration: underline;
        }
        
        .messages {
            padding: 24px;
            max-height: 70vh;
            overflow-y: auto;
        }
        
        .message {
            margin-bottom: 20px;
            padding: 16px;
            background: #2b2d31;
            border-radius: 8px;
            border-left: 3px solid #5865f2;
        }
        
        .message-bot {
            border-left-color: #5865f2;
            opacity: 0.8;
        }
        
        .message-user {
            border-left-color: #43b581;
        }
        
        .message-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .message-author {
            font-weight: 600;
            font-size: 14px;
            color: #fff;
        }
        
        .message-bot .message-author::after {
            content: ' BOT';
            font-size: 10px;
            background: #5865f2;
            color: #fff;
            padding: 1px 4px;
            border-radius: 3px;
            margin-left: 8px;
        }
        
        .message-timestamp {
            font-size: 12px;
            color: #72767d;
            white-space: nowrap;
        }
        
        .message-content {
            font-size: 14px;
            color: #dcddde;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .footer {
            background: #2b2d31;
            border-top: 1px solid #2f3136;
            padding: 16px 24px;
            text-align: center;
            color: #72767d;
            font-size: 12px;
        }
        
        @media print {
            body { background: #fff; color: #000; }
            .container { box-shadow: none; }
            .message { break-inside: avoid; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Ticket Transcript #${ticketNumber}</h1>
            <div class="meta-grid">
                <div class="meta-item">
                    <div class="meta-label">Guild</div>
                    <div class="meta-value">${escapeHtml(guildName)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Channel</div>
                    <div class="meta-value">#${escapeHtml(channelName)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Created By</div>
                    <div class="meta-value">${escapeHtml(createdBy.tag)} (${escapeHtml(createdBy.id)})</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Closed By</div>
                    <div class="meta-value">${escapeHtml(closedBy.tag)} (${escapeHtml(closedBy.id)})</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Original Reason</div>
                    <div class="meta-value">${escapeHtml(reason)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Close Reason</div>
                    <div class="meta-value">${escapeHtml(closeReason)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Created At</div>
                    <div class="meta-value">${formatDate(createdAt)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Closed At</div>
                    <div class="meta-value">${formatDate(closedAt)}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">Message Count</div>
                    <div class="meta-value">${messageCount}</div>
                </div>
            </div>
        </div>
        
        <div class="messages">
            ${messagesHtml || '<p style="color: #72767d; text-align: center; padding: 40px;">No messages in this ticket.</p>'}
        </div>
        
        <div class="footer">
            Generated by Apollo Discord Bot on ${formatDate(Date.now())} | Ticket #${ticketNumber}
        </div>
    </div>
</body>
</html>`;
}

/**
 * Generates a plain text transcript for a ticket
 * @param {object} transcript - Transcript data object
 * @returns {string} Text content
 */
export function generateTextTranscript(transcript) {
    const { ticketNumber, guildName, channelName, createdBy, closedBy, reason, closeReason, createdAt, closedAt, messageCount, messages } = transcript;
    
    const formatDate = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    };
    
    const formatBytes = (bytes) => {
        if (bytes === 0) {
            return '0 B';
        }
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
    
    let output = '';
    output += '='.repeat(60) + '\n';
    output += `TICKET TRANSCRIPT #${ticketNumber}\n`;
    output += '='.repeat(60) + '\n\n';
    
    output += `Guild:        ${guildName}\n`;
    output += `Channel:      #${channelName}\n`;
    output += `Created By:   ${createdBy.tag} (${createdBy.id})\n`;
    output += `Closed By:    ${closedBy.tag} (${closedBy.id})\n`;
    output += `Reason:       ${reason}\n`;
    output += `Close Reason: ${closeReason}\n`;
    output += `Created At:   ${formatDate(createdAt)}\n`;
    output += `Closed At:    ${formatDate(closedAt)}\n`;
    output += `Messages:     ${messageCount}\n`;
    output += '\n' + '-'.repeat(60) + '\n\n';
    
    if (messages.length === 0) {
        output += '[No messages in this ticket]\n';
    } else {
        messages.forEach(msg => {
            const timestamp = formatDate(msg.timestamp);
            const authorTag = msg.author.bot ? `${msg.author.tag} [BOT]` : msg.author.tag;
            
            output += `[${timestamp}] ${authorTag}:\n`;
            
            let content = msg.content || '[No text content]';
            
            if (msg.attachments && msg.attachments.length > 0) {
                content += '\n  [Attachments: ' + msg.attachments.map(a => `${a.name} (${formatBytes(a.size)})`).join(', ') + ']';
            }
            
            if (msg.embeds && msg.embeds > 0) {
                content += `\n  [${msg.embeds} embed(s)]`;
            }
            
            if (msg.edited) {
                content += ' *(edited)*';
            }
            
            // Indent content
            content.split('\n').forEach(line => {
                output += `  ${line}\n`;
            });
            
            output += '\n';
        });
    }
    
    output += '-'.repeat(60) + '\n';
    output += `End of transcript | Generated: ${formatDate(Date.now())}\n`;
    
    return output;
}

/**
 * Saves both HTML and text transcripts for a ticket
 * @param {object} transcript - Transcript data object
 * @returns {Promise<{htmlFile: string, textFile: string}>} Filenames
 */
export async function saveTranscripts(transcript) {
    const timestamp = Date.now();
    const baseName = `ticket-${transcript.ticketNumber}-${transcript.guildId}-${timestamp}`;
    
    const htmlContent = generateHtmlTranscript(transcript);
    const textContent = generateTextTranscript(transcript);
    
    // Check transcript size (max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB
    if (htmlContent.length > MAX_SIZE || textContent.length > MAX_SIZE) {
        console.warn(`[TRANSCRIPT] Transcript for ticket #${transcript.ticketNumber} exceeds size limit, truncating`);
        // Truncate messages if too large
        const truncatedTranscript = { ...transcript, messages: transcript.messages.slice(-500) };
        const truncatedHtml = generateHtmlTranscript(truncatedTranscript);
        const truncatedText = generateTextTranscript(truncatedTranscript);
        
        const htmlFile = `${baseName}.html`;
        const textFile = `${baseName}.txt`;
        
        await writeToSubDir('transcripts', htmlFile, truncatedHtml);
        await writeToSubDir('transcripts', textFile, truncatedText);
        
        return { htmlFile, textFile };
    }
    
    const htmlFile = `${baseName}.html`;
    const textFile = `${baseName}.txt`;
    
    await writeToSubDir('transcripts', htmlFile, htmlContent);
    await writeToSubDir('transcripts', textFile, textContent);
    
    return { htmlFile, textFile };
}

export default {
    generateHtmlTranscript,
    generateTextTranscript,
    saveTranscripts
};