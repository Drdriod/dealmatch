-- Pinecone: vector similarity matching
-- Used for semantic property matching based on buyer preferences

-- NOTE: Pinecone calls happen server-side (Vercel API routes) to protect your API key.
-- This file contains the SQL schema for storing Pinecone-related metadata if needed.

-- Example: Table to track which properties have been indexed in Pinecone
CREATE TABLE IF NOT EXISTS public.pinecone_index_status (
  property_id  uuid REFERENCES public.properties(id) ON DELETE CASCADE PRIMARY KEY,
  is_indexed   boolean DEFAULT false,
  last_indexed timestamptz DEFAULT now(),
  error_log    text
);

ALTER TABLE public.pinecone_index_status ENABLE ROW LEVEL SECURITY;

-- Only admins or service role should manage this
CREATE POLICY "Admins manage pinecone status" 
ON public.pinecone_index_status FOR ALL 
USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Public read pinecone status"
ON public.pinecone_index_status FOR SELECT
USING (true);
