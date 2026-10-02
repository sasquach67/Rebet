const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

// Executes rebet_claim_due_reminders in an ephemeral Postgres (PGlite) with an Auth test double.
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T0 = Date.parse('2026-10-03T12:00:00Z'); // "now"
const at = h => new Date(T0 + h * 3600e3).toISOString();
let n = 0;
(async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email text);
      insert into auth.users values ('${A}','a@example.test'), ('${B}','b@example.test');
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
    `);
    const dir = path.join(__dirname, '../supabase/migrations');
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
    await db.exec('set role service_role');
    const claim = async (nowH, channels = ['email']) =>
      (await db.query('select * from public.rebet_claim_due_reminders($1::timestamptz, $2::text[])', [at(nowH), channels])).rows;
    const reset = async () => { await db.exec('delete from public.reminders_sent; delete from public.bets; delete from public.settings; delete from public.push_subscriptions;'); };
    const bet = (user, id, startH, extra = '') => db.query(
      `insert into public.bets(user_id,id,title,pick,league,units,odds,game_start,has_time,status${extra ? ',' + extra.split('=')[0] : ''})
       values ($1,$2,'Team X @ Team Y','Over 55.5 Total','ncaa',0.62,-128,$3,$4,'pending'${extra ? ',' + extra.split('=')[1] : ''})`,
      [user, id, startH == null ? null : at(startH), startH != null]);
    const test = async (name, fn) => { await reset(); await fn(); n++; console.log('ok  reminders: ' + name); };

    await test('only pending, scheduled, unstarted, undeleted bets inside the lead window are claimed', async () => {
      await db.query("insert into public.settings(user_id,email_reminders,lead_hours) values ($1,true,3)", [A]);
      await bet(A, 'due', 2); await bet(A, 'too-early', 5); await bet(A, 'started', -1); await bet(A, 'no-time', null);
      await bet(A, 'deleted', 2); await db.query("update public.bets set deleted_at=now() where id='deleted'");
      await bet(A, 'placed', 2); await db.query("update public.bets set status='placed' where id='placed'");
      const rows = await claim(0);
      assert.deepEqual(rows.map(r => r.o_bet_id), ['due']);
      assert.equal(rows[0].o_email, 'a@example.test');
      assert.equal(rows[0].o_scheduled_for.toISOString(), at(-1));
      assert.equal(Number(rows[0].o_attempts), 1);
    });
    await test('claims are idempotent while the lease is active', async () => {
      await db.query("insert into public.settings(user_id,email_reminders) values ($1,true)", [A]);
      await bet(A, 'due', 2);
      assert.equal((await claim(0)).length, 1);
      assert.equal((await claim(0)).length, 0);
      assert.equal((await claim(0.05)).length, 0); // 3 minutes later, lease still held
    });
    await test('a crashed sender is retried after the lease; sent rows are never re-claimed', async () => {
      await db.query("insert into public.settings(user_id,email_reminders) values ($1,true)", [A]);
      await bet(A, 'due', 2);
      await claim(0);
      const again = await claim(0.2); // 12 minutes later, lease expired
      assert.equal(again.length, 1); assert.equal(Number(again[0].o_attempts), 2);
      await db.exec("update public.reminders_sent set status='sent', sent_at=now()");
      assert.equal((await claim(1)).length, 0);
    });
    await test('failed deliveries retry up to 3 attempts and not after the game starts', async () => {
      await db.query("insert into public.settings(user_id,email_reminders) values ($1,true)", [A]);
      await bet(A, 'due', 2);
      for (const expected of [1, 2, 3]) {
        const r = await claim(0.1 * expected);
        assert.equal(Number(r[0].o_attempts), expected);
        await db.exec("update public.reminders_sent set status='failed', last_error='boom'");
      }
      assert.equal((await claim(0.5)).length, 0);
      await db.exec("update public.reminders_sent set attempts=1");
      assert.equal((await claim(2.5)).length, 0); // game started at +2h
    });
    await test('email off or no settings row means no claim', async () => {
      await db.query("insert into public.settings(user_id,email_reminders) values ($1,false)", [A]);
      await bet(A, 'a', 2); await bet(B, 'b', 2); // B has no settings row
      assert.equal((await claim(0)).length, 0);
    });
    await test('per-bet lead overrides the default and users are isolated', async () => {
      await db.query("insert into public.settings(user_id,email_reminders,lead_hours) values ($1,true,3),($2,true,1)", [A, B]);
      await bet(A, 'short', 2, 'lead_hours=1');   // own lead 1h: not due yet at 2h out
      await bet(B, 'b-default', 2);               // B default 1h: not due
      await bet(B, 'b-due', 0.5);
      const rows = await claim(0);
      assert.deepEqual(rows.map(r => [r.o_user_id, r.o_bet_id]), [[B, 'b-due']]);
    });
    await test('second lead sends a later reminder; simultaneous slots send only the latest', async () => {
      await db.query("insert into public.settings(user_id,email_reminders,lead_hours,second_lead_hours) values ($1,true,3,0.5)", [A]);
      await bet(A, 'g', 2.9);
      const first = await claim(0);                       // 3h lead slot due (start-3h = -0.1h)
      assert.equal(first.length, 1); assert.equal(first[0].o_scheduled_for.toISOString(), at(-0.1));
      await db.exec("update public.reminders_sent set status='sent', sent_at=now()");
      assert.equal((await claim(1)).length, 0);
      const second = await claim(2.6);                    // within 0.5h of start
      assert.equal(second.length, 1); assert.equal(second[0].o_scheduled_for.toISOString(), at(2.4));
      await reset();
      await db.query("insert into public.settings(user_id,email_reminders,lead_hours,second_lead_hours) values ($1,true,3,0.5)", [A]);
      await bet(A, 'late', 0.25);                         // both slots already passed: one email only
      const late = await claim(0);
      assert.equal(late.length, 1); assert.equal(late[0].o_scheduled_for.toISOString(), at(-0.25));
    });
    await test('push claims are one per live subscription; expired ones are skipped', async () => {
      await db.query("insert into public.settings(user_id,email_reminders,push_reminders) values ($1,false,true)", [A]);
      await db.query("insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values ($1,'https://push.example.test/1','k','a'),($1,'https://push.example.test/2','k','a')", [A]);
      await db.query("insert into public.push_subscriptions(user_id,endpoint,p256dh,auth,expiration_time) values ($1,'https://push.example.test/old','k','a',$2)", [A, at(-1)]);
      await bet(A, 'due', 2);
      assert.equal((await claim(0)).length, 0); // email channel only by default
      const rows = await claim(0, ['push']);
      assert.equal(rows.length, 2); assert.ok(rows.every(r => r.o_channel === 'push'));
      assert.equal((await claim(0, ['push'])).length, 0);
    });
    await test('limit caps a batch and the rest follow on the next run', async () => {
      await db.query("insert into public.settings(user_id,email_reminders) values ($1,true)", [A]);
      for (const id of ['x1', 'x2', 'x3']) await bet(A, id, 1);
      const r = await db.query('select * from public.rebet_claim_due_reminders($1::timestamptz, array[\'email\'], 2)', [at(0)]);
      assert.equal(r.rows.length, 2);
      assert.equal((await claim(0)).length, 1);
    });
    await test('clients cannot call the claim function', async () => {
      await db.exec('reset role; set role authenticated');
      await assert.rejects(db.query('select * from public.rebet_claim_due_reminders()'), /permission denied/i);
      await db.exec('reset role; set role anon');
      await assert.rejects(db.query('select * from public.rebet_claim_due_reminders()'), /permission denied/i);
      await db.exec('reset role; set role service_role');
    });
    console.log(n + ' reminder checks passed');
  } finally { await db.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
