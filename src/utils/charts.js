// Charts Utility
// Creates text-based charts and visualizations for Discord embeds

/**
 * Creates a horizontal bar chart using Unicode blocks
 * @param {Array<{label: string, value: number}>} data - Array of data points
 * @param {number} maxWidth - Maximum width of the bar in characters (default: 20)
 * @returns {string} Formatted bar chart
 */
export function createBarChart(data, maxWidth = 20) {
    if (!data || data.length === 0) {
        return 'No data available';
    }
    
    // Find the maximum value for scaling
    const maxValue = Math.max(...data.map(d => d.value), 1);
    
    const lines = data.map(item => {
        const barLength = Math.round((item.value / maxValue) * maxWidth);
        
        // Create bar using block characters
        const fullBlocks = Math.floor(barLength);
        const bar = '█'.repeat(fullBlocks) + '░'.repeat(maxWidth - fullBlocks);
        
        // Format the line
        return `${item.label.padEnd(15)} ${bar} ${item.value.toLocaleString()}`;
    });
    
    return lines.join('\n');
}

/**
 * Creates a percentage bar
 * @param {number} value - Current value
 * @param {number} max - Maximum value
 * @param {number} width - Width of the bar (default: 10)
 * @returns {string} Formatted percentage bar
 */
export function createPercentageBar(value, max, width = 10) {
    const percentage = Math.min((value / max) * 100, 100);
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return `${'█'.repeat(filled)}${'░'.repeat(empty)} ${percentage.toFixed(1)}%`;
}

/**
 * Creates a simple line chart using Unicode characters
 * @param {Array<{label: string, value: number}>} data - Array of data points
 * @param {number} height - Height of the chart (default: 5)
 * @returns {string} Formatted line chart
 */
export function createLineChart(data, height = 5) {
    if (!data || data.length === 0) {
        return 'No data available';
    }
    
    const maxValue = Math.max(...data.map(d => d.value), 1);
    const minValue = Math.min(...data.map(d => d.value), 0);
    const range = maxValue - minValue || 1;
    
    const lines = [];
    
    // Create the chart from top to bottom
    for (let row = height - 1; row >= 0; row--) {
        let line = '';
        for (let i = 0; i < data.length; i++) {
            const normalized = ((data[i].value - minValue) / range) * height;
            const level = Math.round(normalized);
            
            if (level === row) {
                line += '●';
            } else if (level > row) {
                line += '│';
            } else {
                line += ' ';
            }
            
            // Add connector
            if (i < data.length - 1) {
                line += '─';
            }
        }
        lines.push(line);
    }
    
    // Add labels at the bottom
    const labelLine = data.map(d => d.label.substring(0, 1)).join(' ');
    lines.push('─'.repeat(data.length * 2 - 1));
    lines.push(labelLine);
    
    return lines.join('\n');
}

/**
 * Creates a sparkline (mini line chart)
 * @param {Array<number>} values - Array of numeric values
 * @returns {string} Sparkline string
 */
export function createSparkline(values) {
    if (!values || values.length === 0) {
        return '';
    }
    
    const sparkChars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    
    return values.map(val => {
        const normalized = (val - min) / range;
        const index = Math.min(Math.floor(normalized * sparkChars.length), sparkChars.length - 1);
        return sparkChars[index];
    }).join('');
}

/**
 * Creates a trend indicator
 * @param {number} current - Current value
 * @param {number} previous - Previous value
 * @returns {string} Trend indicator with emoji
 */
export function createTrendIndicator(current, previous) {
    if (previous === 0) {
        return '➡️ New';
    }
    
    const change = ((current - previous) / previous) * 100;
    
    if (change > 5) {
        return `📈 +${change.toFixed(1)}%`;
    } else if (change < -5) {
        return `📉 ${change.toFixed(1)}%`;
    } else {
        return `➡️ ${change.toFixed(1)}%`;
    }
}

/**
 * Creates a table from data
 * @param {Array<Object>} data - Array of objects
 * @param {Array<string>} columns - Column names to display
 * @returns {string} Formatted table
 */
export function createTable(data, columns) {
    if (!data || data.length === 0) {
        return 'No data available';
    }
    
    const rows = data.map(item => {
        return columns.map(col => String(item[col] || '').substring(0, 15)).join(' │ ');
    });
    
    const header = columns.map(col => col.substring(0, 15)).join(' │ ');
    const separator = '─'.repeat(header.length);
    
    return [header, separator, ...rows].join('\n');
}

/**
 * Formats a duration in milliseconds to human readable
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {return `${days}d ${hours % 24}h`;}
    if (hours > 0) {return `${hours}h ${minutes % 60}m`;}
    if (minutes > 0) {return `${minutes}m ${seconds % 60}s`;}
    return `${seconds}s`;
}

/**
 * Formats a large number with K/M/B suffixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1) + 'B';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}
