-- All application timestamps are stored as UTC in TIMESTAMP WITHOUT TIME ZONE
-- columns. Keep both pooled runtime roles on UTC so parameter casts and
-- date/time formatting do not depend on the database server default timezone.
ALTER ROLE atlas_app SET timezone = 'UTC';
ALTER ROLE atlas_ops SET timezone = 'UTC';
