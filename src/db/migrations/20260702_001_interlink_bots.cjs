exports.up = async function (knex) {
  await knex.schema.createTable('interlink_bots', (table) => {
    table.text('id').primary();
    table.text('name').notNullable().unique();
    table.text('description').defaultTo('');
    table.text('webhook_url').notNullable();
    table.integer('supports_redis').defaultTo(0);
    table.text('api_key_hash').notNullable();
    table.text('api_key_prefix').notNullable();
    table.text('scopes').defaultTo('all');
    table.integer('is_active').defaultTo(1);
    table.text('last_seen_at');
    table.text('created_at').defaultTo(knex.fn.now());
    table.text('updated_at').defaultTo(knex.fn.now());
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('interlink_bots');
};
