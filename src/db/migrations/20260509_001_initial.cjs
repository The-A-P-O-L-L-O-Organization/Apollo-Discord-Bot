exports.up = async function (knex) {
  await knex.schema.createTable('guild_store', (table) => {
    table.text('store').notNullable();
    table.text('guild_id').notNullable();
    table.jsonb('data').notNullable().defaultTo('{}');
    table.primary(['store', 'guild_id']);
  });

  await knex.schema.createTable('guild_user_store', (table) => {
    table.text('store').notNullable();
    table.text('guild_id').notNullable();
    table.text('user_id').notNullable();
    table.jsonb('data').notNullable().defaultTo('[]');
    table.primary(['store', 'guild_id', 'user_id']);
  });

  await knex.schema.createTable('migration_meta', (table) => {
    table.text('key').primary();
    table.jsonb('value');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('guild_store');
  await knex.schema.dropTableIfExists('guild_user_store');
  await knex.schema.dropTableIfExists('migration_meta');
};
