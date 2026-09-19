-- Seed the four new verticals from the architecture brief.
-- Schemas mirror src/modules/catalog/schemas/*.json - keep these in sync
-- manually for now (see note in catalogService.js about a future sync script).

INSERT INTO public.categories (slug, name, attribute_schema) VALUES
('teachers', 'Talent & Teacher Recruitment', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "years_experience": { "type": "integer", "minimum": 0 },
    "qualification": { "type": "string", "enum": ["B.Ed", "B.Sc", "M.Ed", "PGDE"] },
    "subject_specialities": { "type": "array", "items": { "type": "string" } },
    "employment_type": { "type": "string", "enum": ["FULL_TIME", "PART_TIME", "CONTRACT"] }
  },
  "required": ["qualification", "years_experience"]
}'::jsonb),

('artisans', 'Skilled Artisans', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "trade": { "type": "string", "enum": ["PLUMBER", "ELECTRICIAN", "CARPENTER", "PAINTER", "MASON", "WELDER", "AC_TECHNICIAN", "GENERAL_CONTRACTOR"] },
    "years_experience": { "type": "integer", "minimum": 0 },
    "rating": { "type": "number", "minimum": 0, "maximum": 5 },
    "has_tools": { "type": "boolean" },
    "availability": { "type": "string", "enum": ["IMMEDIATE", "WITHIN_WEEK", "SCHEDULED"] },
    "certifications": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["trade", "years_experience"]
}'::jsonb),

('corporate-services', 'Corporate Services', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "service_type": { "type": "string", "enum": ["LEGAL", "ACCOUNTING", "CONSULTING", "IT_SUPPORT", "MARKETING", "HR", "LOGISTICS"] },
    "company_size_served": { "type": "string", "enum": ["STARTUP", "SME", "ENTERPRISE"] },
    "engagement_model": { "type": "string", "enum": ["ONE_OFF", "RETAINER", "PROJECT_BASED"] },
    "years_in_business": { "type": "integer", "minimum": 0 },
    "cac_registered": { "type": "boolean" }
  },
  "required": ["service_type", "engagement_model"]
}'::jsonb),

('automotive', 'Automotive', '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "vehicle_type": { "type": "string", "enum": ["SEDAN", "SUV", "TRUCK", "BUS", "MOTORCYCLE", "TRICYCLE"] },
    "make": { "type": "string" },
    "model": { "type": "string" },
    "year": { "type": "integer", "minimum": 1980, "maximum": 2027 },
    "mileage_km": { "type": "integer", "minimum": 0 },
    "transmission": { "type": "string", "enum": ["MANUAL", "AUTOMATIC"] },
    "fuel_type": { "type": "string", "enum": ["PETROL", "DIESEL", "HYBRID", "ELECTRIC"] },
    "condition": { "type": "string", "enum": ["NEW", "FOREIGN_USED", "NIGERIAN_USED"] }
  },
  "required": ["vehicle_type", "make", "model", "year"]
}'::jsonb)

ON CONFLICT (slug) DO NOTHING;
