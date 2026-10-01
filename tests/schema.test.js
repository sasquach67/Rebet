const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Actual Postgres query/RLS execution in an ephemeral local database. The
// Supabase auth schema is a minimal test double, not a live Auth service.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
let n = 0;
(async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${A}'), ('${B}');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    const migrations = path.join(__dirname, '../supabase/migrations');
    for (const file of fs.readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
      await db.exec(fs.readFileSync(path.join(migrations, file), 'utf8'));
    }
    const as = async (role, owner) => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner || '']);
      await db.exec('set role ' + role);
    };
    const test = async (name, fn) => { await fn(); n++; console.log('ok  schema: ' + name); };
    await as('authenticated', A);
    await test('owner can create and read a UTC-scheduled bet', async () => {
      await db.query(`insert into public.bets(user_id,id,title,game_start,has_time,units,odds,revision)
        values ($1,'fixture','Example game','2026-10-03T20:00:00-04:00',true,0.72,-137,99)`, [A]);
      const { rows } = await db.query('select game_start, revision from public.bets');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].game_start.toISOString(), '2026-10-04T00:00:00.000Z');
      assert.equal(Number(rows[0].revision), 1);
    });
    await test('stale revision cannot overwrite a newer edit', async () => {
      const first = await db.query("update public.bets set units=0.8 where id='fixture' and revision=1 returning revision");
      assert.equal(Number(first.rows[0].revision), 2);
      const stale = await db.query("update public.bets set units=9 where id='fixture' and revision=1 returning id");
      assert.equal(stale.rows.length, 0);
    });
    await test('owner cannot insert or reassign another user’s bet', async () => {
      await assert.rejects(db.query("insert into public.bets(user_id,id,title) values ($1,'forbidden','X')", [B]), /row-level security/i);
      await assert.rejects(db.query("update public.bets set user_id=$1 where id='fixture'", [B]), /row-level security/i);
    });
    await test('unknown-time bets remain unscheduled and invalid schedule combinations fail', async () => {
      await db.query("insert into public.bets(user_id,id,title) values ($1,'no-time','Unknown time')", [A]);
      await assert.rejects(db.query("update public.bets set has_time=true where id='no-time'"), /check constraint/i);
      await assert.rejects(db.query("update public.bets set odds=0 where id='fixture'"), /check constraint/i);
      await assert.rejects(db.query("update public.bets set units=-1 where id='fixture'"), /check constraint/i);
    });
    await test('settings and subscription writes are owner-only', async () => {
      await db.query('insert into public.settings(user_id) values ($1)', [A]);
      await db.query("insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values ($1,'https://push.example.test/device','test-key','test-auth')", [A]);
      await assert.rejects(db.query('insert into public.settings(user_id) values ($1)', [B]), /row-level security/i);
      await assert.rejects(db.query("update public.push_subscriptions set user_id=$1", [B]), /row-level security/i);
      await as('authenticated', B);
      for (const table of ['bets','settings','push_subscriptions']) {
        assert.equal((await db.query('select * from public.' + table)).rows.length, 0);
        assert.equal((await db.query('delete from public.' + table + ' returning user_id')).rows.length, 0);
      }
      await db.query("insert into public.bets(user_id,id,title) values ($1,'fixture','B own game')", [B]);
      assert.equal((await db.query('select title from public.bets')).rows[0].title, 'B own game');
    });
    await test('anonymous role cannot read or write any table', async () => {
      await as('anon');
      for (const table of ['bets','settings','push_subscriptions','reminders_sent']) {
        await assert.rejects(db.query('select * from public.' + table), /permission denied/i);
      }
      await assert.rejects(db.query("insert into public.bets(user_id,id,title) values ($1,'anon','X')", [A]), /permission denied/i);
    });
    await test('reminder delivery claims are server-only, unique, and owner-bound', async () => {
      await as('authenticated', A);
      const sql = `insert into public.reminders_sent(user_id,bet_id,channel,delivery_key,scheduled_for,game_start)
        values ($1,'fixture','email','email','2026-10-03T21:00:00Z','2026-10-04T00:00:00Z')`;
      await assert.rejects(db.query(sql, [A]), /permission denied/i);
      await as('service_role');
      await db.query(sql, [A]);
      await assert.rejects(db.query(sql, [A]), /unique constraint/i);
      await assert.rejects(db.query(sql.replace("'fixture'", "'no-time'"), [B]), /foreign key/i);
      await as('authenticated', B);
      assert.equal((await db.query('select * from public.reminders_sent')).rows.length, 0);
      await as('authenticated', A);
      assert.equal((await db.query('select * from public.reminders_sent')).rows.length, 1);
      await assert.rejects(db.query("update public.reminders_sent set status='sent'"), /permission denied/i);
      await assert.rejects(db.query('delete from public.reminders_sent'), /permission denied/i);
    });
    console.log(n + ' schema checks passed');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
