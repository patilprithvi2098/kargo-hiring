-- Kargo Hiring. RLS on, no policies: the publishable key reaches data ONLY through
-- the secret-gated SECURITY DEFINER functions below.
-- Replace the hash with sha256(KH_DB_SECRET) for your deployment.
create extension if not exists pgcrypto with schema extensions;

create table public.kh_app_config (
  id int primary key default 1 check (id = 1),
  secret_sha256 text not null
);
alter table public.kh_app_config enable row level security;
insert into public.kh_app_config (secret_sha256) values ('<sha256 of KH_DB_SECRET>');

create table public.kh_rubric (
  role text primary key check (role in ('PM','SPM')),
  criteria jsonb not null,
  source text not null,
  updated_at timestamptz not null default now()
);
alter table public.kh_rubric enable row level security;

create table public.kh_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  role_applied text not null check (role_applied in ('PM','SPM')),
  cv_filename text not null,
  -- Personal details: stored here, NEVER sent to the AI
  name text,
  email text,
  phone text,
  -- AI-safe content (PII stripped at ingestion)
  cv_content text,
  profile jsonb,
  pipeline_status text not null default 'uploaded'
    check (pipeline_status in ('uploaded','extracted','scored','ready','error')),
  pipeline_error text,
  brief jsonb,
  -- System recommends...
  recommendation text check (recommendation in ('invite','decline')),
  -- ...Arjun decides
  decision text check (decision in ('invite','decline')),
  decided_by text,
  decided_at timestamptz,
  email_type text check (email_type in ('invite','decline')),
  email_subject text,
  email_body text,
  email_edited boolean not null default false,
  email_status text not null default 'none' check (email_status in ('none','draft','sent','failed')),
  email_to text,
  email_error text,
  sent_at timestamptz,
  sent_by text,
  resend_id text
);
alter table public.kh_candidates enable row level security;

create table public.kh_scores (
  candidate_id uuid not null references public.kh_candidates(id) on delete cascade,
  role text not null check (role in ('PM','SPM')),
  total numeric(5,1) not null,
  criteria jsonb not null,
  passes_floor boolean not null default true,
  floor_reason text,
  created_at timestamptz not null default now(),
  primary key (candidate_id, role)
);
alter table public.kh_scores enable row level security;

create or replace function public.kh_check(p_secret text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_secret is null or encode(extensions.digest(p_secret, 'sha256'), 'hex')
     <> (select secret_sha256 from public.kh_app_config where id = 1) then
    raise exception 'kh: unauthorized' using errcode = '42501';
  end if;
end $$;

create or replace function public.kh_rubric_get(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.kh_check(p_secret);
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.role) from public.kh_rubric r), '[]'::jsonb);
end $$;

create or replace function public.kh_rubric_upsert(p_secret text, p_role text, p_criteria jsonb, p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.kh_check(p_secret);
  insert into public.kh_rubric(role, criteria, source) values (p_role, p_criteria, p_source)
  on conflict (role) do update set criteria = excluded.criteria, source = excluded.source, updated_at = now();
end $$;

create or replace function public.kh_candidate_create(p_secret text, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.kh_check(p_secret);
  insert into public.kh_candidates(role_applied, cv_filename, name, email, phone, cv_content)
  values (p->>'role_applied', p->>'cv_filename', p->>'name', p->>'email', p->>'phone', p->>'cv_content')
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.kh_candidate_update(p_secret text, p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r public.kh_candidates;
begin
  perform public.kh_check(p_secret);
  select * into r from public.kh_candidates where id = p_id for update;
  if not found then raise exception 'kh: candidate not found'; end if;
  r := jsonb_populate_record(r, p - 'id' - 'created_at');
  update public.kh_candidates set
    role_applied = r.role_applied, cv_filename = r.cv_filename, name = r.name, email = r.email,
    phone = r.phone, cv_content = r.cv_content, profile = r.profile,
    pipeline_status = r.pipeline_status, pipeline_error = r.pipeline_error, brief = r.brief,
    recommendation = r.recommendation, decision = r.decision, decided_by = r.decided_by,
    decided_at = r.decided_at, email_type = r.email_type, email_subject = r.email_subject,
    email_body = r.email_body, email_edited = r.email_edited, email_status = r.email_status,
    email_to = r.email_to, email_error = r.email_error, sent_at = r.sent_at, sent_by = r.sent_by,
    resend_id = r.resend_id
  where id = p_id;
end $$;

create or replace function public.kh_score_upsert(p_secret text, p_candidate uuid, p_role text, p_total numeric, p_criteria jsonb, p_passes_floor boolean, p_floor_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.kh_check(p_secret);
  insert into public.kh_scores(candidate_id, role, total, criteria, passes_floor, floor_reason)
  values (p_candidate, p_role, p_total, p_criteria, p_passes_floor, p_floor_reason)
  on conflict (candidate_id, role) do update set total = excluded.total, criteria = excluded.criteria,
    passes_floor = excluded.passes_floor, floor_reason = excluded.floor_reason, created_at = now();
end $$;

create or replace function public.kh_candidates_list(p_secret text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.kh_check(p_secret);
  return coalesce((
    select jsonb_agg(
      (to_jsonb(c) - 'cv_content') || jsonb_build_object('scores',
        coalesce((select jsonb_object_agg(s.role, jsonb_build_object('total', s.total, 'criteria', s.criteria,
                    'passes_floor', s.passes_floor, 'floor_reason', s.floor_reason))
                  from public.kh_scores s where s.candidate_id = c.id), '{}'::jsonb))
      order by c.created_at)
    from public.kh_candidates c), '[]'::jsonb);
end $$;

create or replace function public.kh_candidate_get(p_secret text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.kh_check(p_secret);
  return (
    select to_jsonb(c) || jsonb_build_object('scores',
      coalesce((select jsonb_object_agg(s.role, jsonb_build_object('total', s.total, 'criteria', s.criteria,
                  'passes_floor', s.passes_floor, 'floor_reason', s.floor_reason))
                from public.kh_scores s where s.candidate_id = c.id), '{}'::jsonb))
    from public.kh_candidates c where c.id = p_id);
end $$;

revoke all on function public.kh_check(text) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'kh_rubric_get(text)', 'kh_rubric_upsert(text,text,jsonb,text)',
    'kh_candidate_create(text,jsonb)', 'kh_candidate_update(text,uuid,jsonb)',
    'kh_score_upsert(text,uuid,text,numeric,jsonb,boolean,text)', 'kh_candidates_list(text)',
    'kh_candidate_get(text,uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
