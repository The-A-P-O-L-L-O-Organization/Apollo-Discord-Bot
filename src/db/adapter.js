let _db = null;

function deserialize(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

export function createAdapter(db) {
  _db = db;
}

export async function getGuildData(store, guildId) {
  const row = await _db('guild_store')
    .select('data')
    .where({ store, guild_id: guildId })
    .first();
  return row ? deserialize(row.data) : {};
}

export async function setGuildData(store, guildId, data) {
  await _db('guild_store')
    .insert({ store, guild_id: guildId, data: JSON.stringify(data) })
    .onConflict(['store', 'guild_id'])
    .merge();
}

export async function updateGuildData(store, guildId, updater) {
  const current = await getGuildData(store, guildId);
  const next = updater(current);
  await setGuildData(store, guildId, next);
  return next;
}

export async function getAllGuildData(store) {
  const rows = await _db('guild_store')
    .select('guild_id', 'data')
    .where({ store })
    .whereNot({ guild_id: '__global__' });
  return rows.map(r => ({ guildId: r.guild_id, data: deserialize(r.data) }));
}

export async function getUserData(store, guildId, userId) {
  const row = await _db('guild_user_store')
    .select('data')
    .where({ store, guild_id: guildId, user_id: userId })
    .first();
  return row ? deserialize(row.data) : undefined;
}

export async function setUserData(store, guildId, userId, data) {
  await _db('guild_user_store')
    .insert({ store, guild_id: guildId, user_id: userId, data: JSON.stringify(data) })
    .onConflict(['store', 'guild_id', 'user_id'])
    .merge();
}

export async function getAllUserData(store, guildId) {
  const rows = await _db('guild_user_store')
    .select('user_id', 'data')
    .where({ store, guild_id: guildId });
  return rows.map(r => ({ userId: r.user_id, data: deserialize(r.data) }));
}

export async function getData(store) {
  return getGuildData(store, '__global__');
}

export async function setData(store, data) {
  return setGuildData(store, '__global__', data);
}
