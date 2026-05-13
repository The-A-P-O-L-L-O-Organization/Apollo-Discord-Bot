export function formatTwitchNotification(streamerName, streamData) {
  if (!streamData.live) return null;

  return {
    content: `🔴 **${streamerName}** is now live!`,
    embeds: [{
      color: 0x9146FF,
      title: streamData.title,
      url: `https://twitch.tv/${streamerName}`,
      fields: [
        { name: 'Game', value: streamData.game, inline: true },
        { name: 'Viewers', value: String(streamData.viewers), inline: true },
      ],
      thumbnail: { url: streamData.thumbnail },
      timestamp: new Date().toISOString(),
    }],
  };
}

export function formatYoutubeNotification(channelName, video) {
  return {
    content: `📹 **${channelName}** uploaded a new video!`,
    embeds: [{
      color: 0xFF0000,
      title: video.title,
      url: `https://youtu.be/${video.videoId}`,
      thumbnail: video.thumbnail ? { url: video.thumbnail } : undefined,
      timestamp: new Date().toISOString(),
    }],
  };
}

export function formatRssNotification(feedTitle, item) {
  return {
    content: `📰 **${feedTitle}**`,
    embeds: [{
      color: 0xFFA500,
      title: item.title,
      url: item.link,
      timestamp: new Date().toISOString(),
    }],
  };
}

export function formatGithubPushNotification(repo, sender, ref, commits) {
  const branch = ref.replace('refs/heads/', '');
  const commitList = (commits || []).slice(0, 5).map(c =>
    `[${c.message.split('\n')[0]}](${c.url})`
  ).join('\n');

  return {
    embeds: [{
      color: 0x2B7489,
      title: `[${repo}] Push to ${branch}`,
      url: `https://github.com/${repo}`,
      description: commitList || 'No commits',
      fields: [{ name: 'Author', value: sender, inline: true }],
      timestamp: new Date().toISOString(),
    }],
  };
}

export function formatGithubPrNotification(repo, sender, pr) {
  return {
    embeds: [{
      color: pr.state === 'open' ? 0x2CBE4E : 0xCB2431,
      title: `#${pr.number} ${pr.title}`,
      url: pr.html_url,
      description: (pr.body || '').slice(0, 200),
      fields: [
        { name: 'Repository', value: repo, inline: true },
        { name: 'Author', value: sender, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };
}
