-- ═══════════════════════════════════════════════════════════════════════
-- DealMatch — Rental Occupancy Status Migration
-- Run in Supabase SQL Editor
--
-- Purpose: lets a landlord mark a rental "Occupied" the moment a tenancy
-- is signed in person, so the listing is instantly hidden from new
-- online enquiries on RentalsPage. Closes the gap where only hotels
-- and shortlets had double-booking protection.
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS occupancy_status text DEFAULT 'vacant'
    CHECK (occupancy_status IN ('vacant', 'occupied'));

-- Existing rows default to 'vacant' so nothing already live gets hidden
UPDATE public.properties
  SET occupancy_status = 'vacant'
  WHERE occupancy_status IS NULL
    AND category IN ('rental', 'shortlet');

CREATE INDEX IF NOT EXISTS idx_properties_occupancy
  ON public.properties(category, occupancy_status)
  WHERE category IN ('rental', 'shortlet');
