[
  {
    "jsonb_build_object": {
      "table": "anthropometry",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "client_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "history",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "NO"
        },
        {
          "name": "updated_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "clients",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "coach_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "client_profile_id",
          "type": "uuid",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "name",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "email",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "status",
          "type": "text",
          "default": "'active'::text",
          "nullable": "YES"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        },
        {
          "name": "phone",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "plan",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "gender",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "onboarding_complete",
          "type": "boolean",
          "default": "false",
          "nullable": "YES"
        },
        {
          "name": "posture_reviewed",
          "type": "boolean",
          "default": "false",
          "nullable": "YES"
        },
        {
          "name": "payment_status",
          "type": "text",
          "default": "'pending'::text",
          "nullable": "YES"
        },
        {
          "name": "next_payment_date",
          "type": "date",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "gym_equipment_link",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "youtube_explanation_url",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "avatar",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "current_weight",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "start_date",
          "type": "date",
          "default": "CURRENT_DATE",
          "nullable": "YES"
        },
        {
          "name": "cycle_type",
          "type": "text",
          "default": "'weekly'::text",
          "nullable": "NO"
        },
        {
          "name": "cycle_pattern",
          "type": "jsonb",
          "default": "'{\"rest\": 1, \"train\": 2}'::jsonb",
          "nullable": "NO"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "exercises",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "coach_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "name",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "muscle_group",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "now()",
          "nullable": "YES"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "foods",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "coach_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "name",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "protein_per_100g",
          "type": "numeric",
          "default": "0",
          "nullable": "NO"
        },
        {
          "name": "carbs_per_100g",
          "type": "numeric",
          "default": "0",
          "nullable": "NO"
        },
        {
          "name": "fats_per_100g",
          "type": "numeric",
          "default": "0",
          "nullable": "NO"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "now()",
          "nullable": "YES"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "nutrition_plans",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "client_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "meals",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "NO"
        },
        {
          "name": "updated_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        },
        {
          "name": "type",
          "type": "text",
          "default": "'macros'::text",
          "nullable": "YES"
        },
        {
          "name": "target_kcals",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "protein_grams",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "carbs_grams",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "fats_grams",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "steps_goal",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "habits_notes",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "YES"
        },
        {
          "name": "closed_meals",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "YES"
        },
        {
          "name": "has_day_variants",
          "type": "boolean",
          "default": "false",
          "nullable": "NO"
        },
        {
          "name": "closed_meals_training",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "NO"
        },
        {
          "name": "closed_meals_rest",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "NO"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "profiles",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "full_name",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "email",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "role",
          "type": "text",
          "default": "'coach'::text",
          "nullable": "YES"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "progress_photos",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "client_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "photo_url",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "tag",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "videos",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "client_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "video_url",
          "type": "text",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "notes",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "created_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        },
        {
          "name": "exercise",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "load_kg",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "reps",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "rpe",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "rir",
          "type": "numeric",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "date",
          "type": "date",
          "default": "CURRENT_DATE",
          "nullable": "YES"
        },
        {
          "name": "status",
          "type": "text",
          "default": "'pending'::text",
          "nullable": "YES"
        },
        {
          "name": "coach_feedback",
          "type": "text",
          "default": null,
          "nullable": "YES"
        },
        {
          "name": "timestamps",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "YES"
        }
      ]
    }
  },
  {
    "jsonb_build_object": {
      "table": "workout_data",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "default": "gen_random_uuid()",
          "nullable": "NO"
        },
        {
          "name": "client_id",
          "type": "uuid",
          "default": null,
          "nullable": "NO"
        },
        {
          "name": "data",
          "type": "jsonb",
          "default": "'{}'::jsonb",
          "nullable": "NO"
        },
        {
          "name": "updated_at",
          "type": "timestamp with time zone",
          "default": "timezone('utc'::text, now())",
          "nullable": "NO"
        },
        {
          "name": "weekly_split",
          "type": "jsonb",
          "default": "'{}'::jsonb",
          "nullable": "YES"
        },
        {
          "name": "mobility_drills",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "YES"
        },
        {
          "name": "notes",
          "type": "text",
          "default": "''::text",
          "nullable": "YES"
        },
        {
          "name": "microcycles",
          "type": "jsonb",
          "default": "'[]'::jsonb",
          "nullable": "YES"
        }
      ]
    }
  }
]