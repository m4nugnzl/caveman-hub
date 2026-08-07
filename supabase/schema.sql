-- Caveman Hub - current public schema
-- Reconstructed from Supabase information_schema + constraint introspection.
-- This file describes the current schema and can be used as a local source of truth.
-- Generated without modifying the remote database.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    role text DEFAULT 'coach'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.clients (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL,
    client_profile_id uuid,
    name text NOT NULL,
    email text,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    phone text,
    plan text,
    gender text,
    onboarding_complete boolean DEFAULT false,
    posture_reviewed boolean DEFAULT false,
    payment_status text DEFAULT 'pending'::text,
    next_payment_date date,
    gym_equipment_link text,
    youtube_explanation_url text,
    avatar text,
    current_weight numeric,
    start_date date DEFAULT CURRENT_DATE,
    cycle_type text NOT NULL DEFAULT 'weekly'::text,
    cycle_pattern jsonb NOT NULL DEFAULT '{"rest": 1, "train": 2}'::jsonb,
    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_client_profile_id_fkey
        FOREIGN KEY (client_profile_id) REFERENCES public.profiles(id),
    CONSTRAINT clients_coach_id_fkey
        FOREIGN KEY (coach_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.anthropometry (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    history jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT anthropometry_pkey PRIMARY KEY (id),
    CONSTRAINT anthropometry_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT anthropometry_client_id_key UNIQUE (client_id)
);

CREATE TABLE IF NOT EXISTS public.exercises (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL,
    name text NOT NULL,
    muscle_group text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exercises_pkey PRIMARY KEY (id),
    CONSTRAINT exercises_coach_id_fkey
        FOREIGN KEY (coach_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.foods (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    coach_id uuid NOT NULL,
    name text NOT NULL,
    protein_per_100g numeric NOT NULL DEFAULT 0,
    carbs_per_100g numeric NOT NULL DEFAULT 0,
    fats_per_100g numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT foods_pkey PRIMARY KEY (id),
    CONSTRAINT foods_coach_id_fkey
        FOREIGN KEY (coach_id) REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.nutrition_plans (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    meals jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    type text DEFAULT 'macros'::text,
    target_kcals numeric,
    protein_grams numeric,
    carbs_grams numeric,
    fats_grams numeric,
    steps_goal text,
    habits_notes jsonb DEFAULT '[]'::jsonb,
    closed_meals jsonb DEFAULT '[]'::jsonb,
    has_day_variants boolean NOT NULL DEFAULT false,
    closed_meals_training jsonb NOT NULL DEFAULT '[]'::jsonb,
    closed_meals_rest jsonb NOT NULL DEFAULT '[]'::jsonb,
    CONSTRAINT nutrition_plans_pkey PRIMARY KEY (id),
    CONSTRAINT nutrition_plans_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT nutrition_plans_client_id_key UNIQUE (client_id)
);

CREATE TABLE IF NOT EXISTS public.progress_photos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    photo_url text NOT NULL,
    tag text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT progress_photos_pkey PRIMARY KEY (id),
    CONSTRAINT progress_photos_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE IF NOT EXISTS public.videos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    video_url text NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    exercise text,
    load_kg numeric,
    reps numeric,
    rpe numeric,
    rir numeric,
    date date DEFAULT CURRENT_DATE,
    status text DEFAULT 'pending'::text,
    coach_feedback text,
    timestamps jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT videos_pkey PRIMARY KEY (id),
    CONSTRAINT videos_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id)
);

CREATE TABLE IF NOT EXISTS public.workout_data (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL,
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    weekly_split jsonb DEFAULT '{}'::jsonb,
    mobility_drills jsonb DEFAULT '[]'::jsonb,
    notes text DEFAULT ''::text,
    microcycles jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT workout_data_pkey PRIMARY KEY (id),
    CONSTRAINT workout_data_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES public.clients(id),
    CONSTRAINT workout_data_client_id_key UNIQUE (client_id)
);

COMMIT;