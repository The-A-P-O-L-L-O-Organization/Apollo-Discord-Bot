export async function checkTwitchStream(streamerName, config) {
    if (!config.twitchClientId || !config.twitchClientSecret) {return null;}

    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams({
            client_id: config.twitchClientId,
            client_secret: config.twitchClientSecret,
            grant_type: 'client_credentials'
        })
    });
    if (!tokenRes.ok) {return null;}
    const { access_token } = await tokenRes.json();

    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(streamerName)}`, {
        headers: {
            'Client-ID': config.twitchClientId,
            Authorization: `Bearer ${access_token}`
        }
    });
    if (!res.ok) {return null;}

    const { data } = await res.json();
    if (!data || data.length === 0) {return { live: false };}

    const stream = data[0];
    return {
        live: true,
        title: stream.title,
        game: stream.game_name,
        viewers: stream.viewer_count,
        thumbnail: stream.thumbnail_url.replace('{width}', '640').replace('{height}', '360')
    };
}

export async function checkYoutubeUploads(channelId, config) {
    if (!config.youtubeApiKey) {return null;}

    const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&maxResults=5&type=video&key=${config.youtubeApiKey}`
    );
    if (!res.ok) {return null;}

    const body = await res.json();
    return (body.items || []).map(item => ({
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        videoId: item.id.videoId,
        publishedAt: item.snippet.publishedAt
    }));
}

export async function checkRssFeed(feedUrl) {
    try {
        const res = await fetch(feedUrl);
        if (!res.ok) {return null;}
        const xml = await res.text();
        return parseFeedXml(xml);
    } catch {
        return null;
    }
}

function parseFeedXml(xml) {
    const items = [];
    let feedTitle = '';

    const titleMatch = xml.match(/<title[^>]*>([^<]+)<\/title>/);
    if (titleMatch) {feedTitle = titleMatch[1];}

    const isAtom = xml.includes('<feed ');

    if (isAtom) {
        const entryRegex = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
        let entryMatch;
        while ((entryMatch = entryRegex.exec(xml)) !== null) {
            const entry = entryMatch[1];
            const title = entry.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || '';
            const link = entry.match(/<link[^>]+href="([^"]+)"/)?.[1] || '';
            const guid = entry.match(/<id[^>]*>([^<]+)<\/id>/)?.[1] || '';
            const pubDate = entry.match(/<published[^>]*>([^<]+)<\/published>/)?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    } else {
        const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
        let itemMatch;
        while ((itemMatch = itemRegex.exec(xml)) !== null) {
            const entry = itemMatch[1];
            const title = entry.match(/<title[^>]*>([^<]+)<\/title>/)?.[1] || '';
            const link = entry.match(/<link[^>]*>([^<]+)<\/link>/)?.[1] || '';
            const guid = entry.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1] || '';
            const pubDate = entry.match(/<pubDate[^>]*>([^<]+)<\/pubDate>/)?.[1] || '';
            items.push({ title, link, guid, pubDate });
        }
    }

    return { feedTitle, items };
}
