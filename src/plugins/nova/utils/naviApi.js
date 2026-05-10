import { EmbedBuilder } from 'discord.js';

const NAVI_API = 'https://reykunyu.lu/api/random?holpxay=1&fnel=n';

export async function fetchNaviWord() {
  let response;
  try {
    response = await fetch(NAVI_API);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }
  const wordData = Array.isArray(data) ? data[0] : data;
  if (!wordData) return null;
  const navi = wordData["na'vi"] || null;
  const translations = wordData.translations || [];
  const english = translations[0]?.en || null;
  if (!navi || !english) return null;
  return { navi, english };
}

export function buildNaviEmbed(navi, english) {
  return new EmbedBuilder()
    .setTitle('Daily Na\'vi Word')
    .setDescription(`**Na\'vi:** ${navi}\n**English:** ${english}`)
    .setColor(0x3498DB)
    .setTimestamp()
    .setFooter({ text: 'From Reykunyu' });
}

export async function postNaviWord(client, channelId) {
  const result = await fetchNaviWord();
  if (!result) {
    console.error('[Nova] Failed to fetch Na\'vi word');
    return false;
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    console.error(`[Nova] Channel ${channelId} not found`);
    return false;
  }
  const embed = buildNaviEmbed(result.navi, result.english);
  await channel.send({ embeds: [embed] });
  console.log(`[Nova] Posted Na\'vi word: ${result.navi} - ${result.english}`);
  return true;
}
