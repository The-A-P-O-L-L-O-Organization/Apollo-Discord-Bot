import { config } from '../../config/config.js';
import { getLockRedis, withLock } from '../../utils/lock.js';
import { postNaviWord } from './utils/naviApi.js';

let client = null;
let schedulerInterval = null;
let lastPostDate = null;

const CHECK_INTERVAL = 60000;

function isNoonET() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  });
  const [hour, minute] = formatter.format(new Date()).split(':').map(Number);
  return hour === 12 && minute < 2;
}

function getDateET() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date());
}

export function initNaviScheduler(discordClient) {
  client = discordClient;

  const channelId = process.env.NAVI_CHANNEL_ID;
  if (!channelId) {
    console.warn('[Nova] NAVI_CHANNEL_ID not set, daily Na\'vi scheduler disabled');
    return;
  }

  schedulerInterval = setInterval(async () => {
    const redis = await getLockRedis();
    if (redis) {
      await withLock(redis, 'scheduler:navi', config.podId, doDailyPost, 25000);
    } else {
      await doDailyPost();
    }
  }, CHECK_INTERVAL);

  console.log('[Nova] Daily Na\'vi scheduler started (checking every 60s)');
}

export function stopNaviScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    lastPostDate = null;
    console.log('[Nova] Daily Na\'vi scheduler stopped');
  }
}

async function doDailyPost() {
  if (!client) return;
  if (!isNoonET()) return;

  const today = getDateET();
  if (lastPostDate === today) return;
  lastPostDate = today;

  const channelId = process.env.NAVI_CHANNEL_ID;
  if (!channelId) return;

  await postNaviWord(client, channelId);
}
