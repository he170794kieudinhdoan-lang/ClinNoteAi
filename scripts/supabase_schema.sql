-- ClinNote AI — schema khớp src/models/
-- Chạy trong Supabase SQL Editor.

create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    full_name varchar(255) not null,
    email varchar(255) not null unique,
    role varchar(50) not null default 'DOCTOR',
    created_at timestamptz not null default now()
);

create table if not exists patients (
    id uuid primary key default gen_random_uuid(),
    patient_code varchar(50) not null unique,
    full_name varchar(255) not null,
    date_of_birth date,
    sex varchar(20),
    created_at timestamptz not null default now()
);

create table if not exists consultations (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null references patients (id) on delete restrict,
    doctor_id uuid not null references users (id) on delete restrict,
    status varchar(50) not null default 'PROCESSING',
    audio_path varchar(1024),
    language varchar(20) not null default 'vi',
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists ix_consultations_patient_id on consultations (patient_id);
create index if not exists ix_consultations_doctor_id on consultations (doctor_id);
create index if not exists ix_consultations_status on consultations (status);

create table if not exists transcript_segments (
    id uuid primary key default gen_random_uuid(),
    consultation_id uuid not null references consultations (id) on delete cascade,
    speaker_label varchar(50) not null,
    resolved_role varchar(30),
    content text not null,
    start_ms integer,
    end_ms integer,
    asr_confidence double precision,
    role_confidence double precision
);

create index if not exists ix_transcript_segments_consultation_id
    on transcript_segments (consultation_id);

create table if not exists clinical_facts (
    id uuid primary key default gen_random_uuid(),
    consultation_id uuid not null references consultations (id) on delete cascade,
    transcript_segment_id uuid references transcript_segments (id) on delete set null,
    fact_type varchar(50) not null,
    raw_text text not null,
    normalized_term varchar(255),
    value varchar(255),
    unit varchar(50),
    polarity varchar(30) not null default 'PRESENT',
    confidence double precision,
    created_at timestamptz not null default now()
);

create index if not exists ix_clinical_facts_consultation_id on clinical_facts (consultation_id);
create index if not exists ix_clinical_facts_transcript_segment_id on clinical_facts (transcript_segment_id);
create index if not exists ix_clinical_facts_fact_type on clinical_facts (fact_type);

create table if not exists soap_notes (
    id uuid primary key default gen_random_uuid(),
    consultation_id uuid not null references consultations (id) on delete cascade,
    version integer not null default 1,
    status varchar(50) not null default 'DRAFT',
    subjective text,
    objective text,
    assessment text,
    plan text,
    model_name varchar(255),
    approved_by uuid references users (id) on delete set null,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    constraint uq_soap_note_consultation_version unique (consultation_id, version)
);

create index if not exists ix_soap_notes_consultation_id on soap_notes (consultation_id);
create index if not exists ix_soap_notes_status on soap_notes (status);

create table if not exists soap_claims (
    id uuid primary key default gen_random_uuid(),
    soap_note_id uuid not null references soap_notes (id) on delete cascade,
    section varchar(20) not null,
    claim_text text not null,
    claim_type varchar(50),
    claim_order integer not null default 0
);

create index if not exists ix_soap_claims_soap_note_id on soap_claims (soap_note_id);
create index if not exists ix_soap_claims_section on soap_claims (section);

create table if not exists evidence_links (
    id uuid primary key default gen_random_uuid(),
    soap_claim_id uuid not null references soap_claims (id) on delete cascade,
    transcript_segment_id uuid not null references transcript_segments (id) on delete cascade,
    evidence_text text,
    grounding_score double precision,
    created_at timestamptz not null default now(),
    constraint uq_evidence_claim_segment unique (soap_claim_id, transcript_segment_id)
);

create index if not exists ix_evidence_links_soap_claim_id on evidence_links (soap_claim_id);
create index if not exists ix_evidence_links_transcript_segment_id
    on evidence_links (transcript_segment_id);

create table if not exists verification_results (
    id uuid primary key default gen_random_uuid(),
    soap_claim_id uuid not null references soap_claims (id) on delete cascade,
    check_type varchar(50) not null,
    status varchar(20) not null,
    message text,
    confidence double precision,
    created_at timestamptz not null default now()
);

create index if not exists ix_verification_results_soap_claim_id
    on verification_results (soap_claim_id);
create index if not exists ix_verification_results_check_type on verification_results (check_type);
create index if not exists ix_verification_results_status on verification_results (status);

create table if not exists icd_suggestions (
    id uuid primary key default gen_random_uuid(),
    consultation_id uuid not null references consultations (id) on delete cascade,
    icd_code varchar(30) not null,
    description varchar(512) not null,
    confidence double precision,
    status varchar(30) not null default 'SUGGESTED'
);

create index if not exists ix_icd_suggestions_consultation_id on icd_suggestions (consultation_id);
create index if not exists ix_icd_suggestions_icd_code on icd_suggestions (icd_code);
