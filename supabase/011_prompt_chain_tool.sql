-- =====================================================================
-- 011  THE PROMPT CHAIN TOOL
-- =====================================================================
-- Run after 010. Paste the whole file into the Supabase SQL Editor --
-- it is one transaction, and splitting it breaks the $$ bodies.
-- Re-runnable: every object is dropped-if-exists or created-if-missing.
--
-- What this does, in order:
--   1. Closes the RPC hole on close_gallery() and the trigger functions.
--   2. Gives chains an execution mode (assembled | sequential) and an
--      input kind (none | text | image).
--   3. Makes the step-order uniqueness deferrable and adds an atomic
--      reorder function.
--   4. Grants curators write access to chains and steps. 010 left these
--      read-only on purpose; this tool is the screen that is meant to
--      write them, so the policies arrive with it.
--   5. Keeps sequential chains out of the weighted draw the museum uses.
--   6. Lets a curator log a tool run, with the per-step trace.
--   7. Seeds one sequential chain: image -> description -> joke -> captions.
--
-- No comment in this file contains an apostrophe. A comment ends at its
-- newline; lose one in transit and a stray apostrophe opens a string
-- literal that swallows the rest of the file.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. FUNCTIONS THAT SHOULD NOT BE CALLABLE OVER THE API
-- ---------------------------------------------------------------------
-- close_gallery() accessions the winners and writes the exhibition
-- record. It is security definer, and it was executable by anon -- so
-- anyone with the public key could POST /rest/v1/rpc/close_gallery and
-- close the museum mid-afternoon. Only the midnight cron should call it,
-- and that runs as service_role, which keeps its grant.
revoke execute on function public.close_gallery(date) from public, anon, authenticated;
grant  execute on function public.close_gallery(date) to service_role;

-- Trigger functions. Postgres checks EXECUTE when a trigger is created,
-- not when it fires, so revoking here changes nothing about how they run.
-- It only stops them being reachable as /rpc endpoints.
revoke execute on function public.enforce_signup_allowlist() from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.sync_prompt_chain_mix()    from public, anon, authenticated;
revoke execute on function public.sync_work_score()          from public, anon, authenticated;

-- signup_allowed() is only called from inside the signup trigger, which
-- runs as its owner. Left public, it is an oracle for which addresses
-- the museum admits.
revoke execute on function public.signup_allowed(text) from public, anon, authenticated;

-- is_superadmin() stays executable: every curator policy calls it as the
-- signed-in user, and revoking it would make every one of them error.

-- ---------------------------------------------------------------------
-- 2. EXECUTION MODE AND INPUT KIND
-- ---------------------------------------------------------------------
-- assembled  : every active step is a SECTION of one prompt, joined in
--              order and sent as a single model call. This is how the
--              museum has always used chains, and all five seeded chains
--              are this kind.
-- sequential : every active step is its OWN model call. Step N sees the
--              output of step N-1 as {{previous}}, and any earlier step as
--              {{step_1}}, {{step_2}} and so on.
alter table public.prompt_chains
  add column if not exists execution  text not null default 'assembled',
  add column if not exists input_kind text not null default 'none';

alter table public.prompt_chains drop constraint if exists prompt_chains_execution_check;
alter table public.prompt_chains add  constraint prompt_chains_execution_check
  check (execution in ('assembled', 'sequential'));

alter table public.prompt_chains drop constraint if exists prompt_chains_input_kind_check;
alter table public.prompt_chains add  constraint prompt_chains_input_kind_check
  check (input_kind in ('none', 'text', 'image'));

-- A sequential step is a whole call, not a section, so it gets its own
-- role. The seven section roles stay exactly as 010 defined them.
alter table public.prompt_chain_steps drop constraint if exists prompt_chain_steps_role_check;
alter table public.prompt_chain_steps add  constraint prompt_chain_steps_role_check
  check (role in ('role', 'context', 'audience', 'school', 'rules', 'examples', 'format', 'call'));

alter table public.prompt_chain_steps
  add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- 3. REORDERING
-- ---------------------------------------------------------------------
-- Swapping steps 1 and 2 passes through a moment where two rows both
-- hold step_order 1. A plain unique constraint refuses that. Deferrable
-- moves the check to the end of the transaction, where the order is
-- whole again.
alter table public.prompt_chain_steps
  drop constraint if exists prompt_chain_steps_chain_id_step_order_key;
alter table public.prompt_chain_steps
  add constraint prompt_chain_steps_chain_id_step_order_key
  unique (chain_id, step_order) deferrable initially immediate;

-- Takes the complete new order as an array of step ids and renumbers
-- 1..n in one statement. Security INVOKER: it runs as the curator, so
-- RLS still decides whether the update is allowed. The explicit check
-- is the friendly error; the policy is the real one.
--
-- The array must name every step of the chain exactly once. A partial
-- list would leave the untouched steps colliding with renumbered ones.
create or replace function public.reorder_prompt_chain_steps(p_chain_id bigint, p_step_ids bigint[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_steps   integer;
  n_given   integer;
  n_unique  integer;
  n_match   integer;
begin
  if not public.is_superadmin() then
    raise exception 'only curators can reorder steps' using errcode = '42501';
  end if;

  select count(*) into n_steps from public.prompt_chain_steps where chain_id = p_chain_id;
  n_given := coalesce(array_length(p_step_ids, 1), 0);
  select count(distinct x) into n_unique from unnest(p_step_ids) as x;
  select count(*) into n_match
    from public.prompt_chain_steps
   where chain_id = p_chain_id and id = any (p_step_ids);

  if n_given <> n_steps or n_unique <> n_steps or n_match <> n_steps then
    raise exception 'the new order must list every step of chain % exactly once', p_chain_id
      using errcode = '22023';
  end if;

  set constraints public.prompt_chain_steps_chain_id_step_order_key deferred;

  update public.prompt_chain_steps s
     set step_order = o.ord,
         updated_at = now()
    from unnest(p_step_ids) with ordinality as o(step_id, ord)
   where s.id = o.step_id
     and s.chain_id = p_chain_id;
end;
$$;

revoke execute on function public.reorder_prompt_chain_steps(bigint, bigint[]) from public, anon;
grant  execute on function public.reorder_prompt_chain_steps(bigint, bigint[]) to authenticated;

-- ---------------------------------------------------------------------
-- 4. CURATORS MAY WRITE CHAINS AND STEPS
-- ---------------------------------------------------------------------
drop policy if exists "curators create chains" on public.prompt_chains;
drop policy if exists "curators edit chains"   on public.prompt_chains;
drop policy if exists "curators delete chains" on public.prompt_chains;

create policy "curators create chains" on public.prompt_chains
  for insert to authenticated
  with check ((select public.is_superadmin()));

create policy "curators edit chains" on public.prompt_chains
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy "curators delete chains" on public.prompt_chains
  for delete to authenticated
  using ((select public.is_superadmin()));

drop policy if exists "curators create steps" on public.prompt_chain_steps;
drop policy if exists "curators edit steps"   on public.prompt_chain_steps;
drop policy if exists "curators delete steps" on public.prompt_chain_steps;

create policy "curators create steps" on public.prompt_chain_steps
  for insert to authenticated
  with check ((select public.is_superadmin()));

create policy "curators edit steps" on public.prompt_chain_steps
  for update to authenticated
  using ((select public.is_superadmin()))
  with check ((select public.is_superadmin()));

create policy "curators delete steps" on public.prompt_chain_steps
  for delete to authenticated
  using ((select public.is_superadmin()));

-- ---------------------------------------------------------------------
-- 5. SEQUENTIAL CHAINS NEVER ENTER THE MUSEUM DRAW
-- ---------------------------------------------------------------------
-- The museum assembles whatever chain it draws into one prompt. A
-- sequential chain assembled that way would send step 3 (which expects
-- step 2 output) with an unfilled {{previous}} in it. New chains already
-- join the mix at weight 0; this makes it impossible to dial a
-- sequential one up, from any screen.
create or replace function public.guard_prompt_chain_mix()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.weight > 0 and exists (
       select 1 from public.prompt_chains c
        where c.id = new.chain_id and c.execution = 'sequential') then
    raise exception 'a sequential chain cannot take a share of museum traffic'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_prompt_chain_mix() from public, anon, authenticated;

drop trigger if exists prompt_chain_mix_guard on public.prompt_chain_mix;
create trigger prompt_chain_mix_guard
  before insert or update on public.prompt_chain_mix
  for each row execute function public.guard_prompt_chain_mix();

-- When a chain changes, keep its mix row consistent with it: a chain
-- turned sequential drops to weight 0, and a chain moved to another
-- department takes its mix row along. Security definer because curators
-- may only update weight, is_active and updated_at on the mix (010),
-- and the department column has to move too.
create or replace function public.sync_prompt_chain_mix_on_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.execution = 'sequential' and old.execution is distinct from 'sequential' then
    update public.prompt_chain_mix set weight = 0, updated_at = now() where chain_id = new.id;
  end if;
  if new.department is distinct from old.department then
    update public.prompt_chain_mix set department = new.department, updated_at = now()
     where chain_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_prompt_chain_mix_on_update() from public, anon, authenticated;

drop trigger if exists prompt_chains_sync_mix_on_update on public.prompt_chains;
create trigger prompt_chains_sync_mix_on_update
  after update of execution, department on public.prompt_chains
  for each row execute function public.sync_prompt_chain_mix_on_update();

-- ---------------------------------------------------------------------
-- 6. TOOL RUNS
-- ---------------------------------------------------------------------
-- A run of the tool is a generation request with origin tool. The
-- museum keeps writing house and member rows exactly as before.
alter table public.generation_requests drop constraint if exists generation_requests_origin_check;
alter table public.generation_requests add  constraint generation_requests_origin_check
  check (origin in ('house', 'member', 'tool'));

alter table public.generation_requests
  add column if not exists input_text       text,
  add column if not exists input_image_path text,
  add column if not exists output_text      text;

-- One response row per model call. For a sequential run that is one per
-- step, so the trace needs to say which step and what it was sent.
alter table public.llm_responses
  add column if not exists step_id     bigint references public.prompt_chain_steps(id) on delete set null,
  add column if not exists step_order  integer,
  add column if not exists prompt_text text;

create index if not exists generation_requests_chain_created_idx
  on public.generation_requests (chain_id, created_at desc);
create index if not exists llm_responses_request_idx
  on public.llm_responses (request_id);

-- Curators log and complete their own tool runs. The member policies
-- from 010 still pin members to origin member; policies are permissive,
-- so these add a second way in rather than widening the first.
-- llm_responses needs nothing new: the 010 policy already lets anyone
-- log a response against a request they own.
drop policy if exists "curators log tool runs"      on public.generation_requests;
drop policy if exists "curators complete tool runs" on public.generation_requests;

create policy "curators log tool runs" on public.generation_requests
  for insert to authenticated
  with check (
    origin = 'tool'
    and requester_id = (select auth.uid())
    and (select public.is_superadmin())
  );

create policy "curators complete tool runs" on public.generation_requests
  for update to authenticated
  using (
    origin = 'tool'
    and requester_id = (select auth.uid())
    and (select public.is_superadmin())
  )
  with check (
    origin = 'tool'
    and requester_id = (select auth.uid())
    and (select public.is_superadmin())
  );

-- ---------------------------------------------------------------------
-- 7. SEED: THE THREE-STEP CAPTION CHAIN
-- ---------------------------------------------------------------------
-- The worked example from the brief, as a real chain: describe an
-- image, find what is funny in it, then write five captions from that.
insert into public.prompt_chains
  (slug, name, department, media, model_id, temperature, max_output_tokens,
   is_active, notes, execution, input_kind)
select
  'image-captions-v1',
  'Image to five captions',
  'humour',
  'text',
  (select id from public.llm_models where slug = 'gemini-flash-latest'),
  1.0,
  2400,
  true,
  'Sequential. Step 1 sees the uploaded image; each later step sees the output before it.',
  'sequential',
  'image'
where not exists (select 1 from public.prompt_chains where slug = 'image-captions-v1');

insert into public.prompt_chain_steps (chain_id, step_order, role, label, template, is_active)
select c.id, s.step_order, 'call', s.label, s.template, true
  from public.prompt_chains c
  cross join (values
    (1, 'Describe the image',
     'Describe the attached image in plain, specific language.' || chr(10) ||
     'Say what is in it, where it seems to be, and any detail that looks odd, telling or out of place.' || chr(10) ||
     'Three to five sentences. No jokes yet, and no guessing at things you cannot see.'),
    (2, 'Find what is funny',
     'Here is a description of an image:' || chr(10) || chr(10) || '{{previous}}' || chr(10) || chr(10) ||
     'Write one short paragraph about what is funny in it for this audience:' || chr(10) ||
     '{{audience}}' || chr(10) || chr(10) ||
     'Point at the specific detail that carries the joke. Do not write captions yet.'),
    (3, 'Write five captions',
     'Here is a note on what is funny about an image:' || chr(10) || chr(10) || '{{previous}}' || chr(10) || chr(10) ||
     'Write five short, funny captions for the image.' || chr(10) ||
     '- One per line, numbered 1 to 5.' || chr(10) ||
     '- Under twelve words each.' || chr(10) ||
     '- Each one takes a different angle.' || chr(10) ||
     '{{house_rules}}' || chr(10) ||
     'Output the five lines only.')
  ) as s(step_order, label, template)
 where c.slug = 'image-captions-v1'
   and not exists (select 1 from public.prompt_chain_steps x where x.chain_id = c.id);

commit;

-- ---------------------------------------------------------------------
-- VERIFY (optional; run separately after the commit)
-- ---------------------------------------------------------------------
-- select slug, execution, input_kind from public.prompt_chains order by slug;
-- select c.slug, m.weight from public.prompt_chain_mix m join public.prompt_chains c on c.id = m.chain_id;
-- select has_function_privilege('anon', 'public.close_gallery(date)', 'execute');   -- expect false
