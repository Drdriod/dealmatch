-- Audit F-008 / F-009: storage clean-up.
-- 1. property-images: an upload must go into the uploader's own folder ("<uid>/..." or
--    "hostels/<uid>/..."), not anywhere in the bucket.
DROP POLICY IF EXISTS "Property img upload" ON storage.objects;
CREATE POLICY "Property img upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-images'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR ((storage.foldername(name))[1] = 'hostels' AND (storage.foldername(name))[2] = (SELECT auth.uid())::text)
    )
  );

-- 2. avatars had every policy twice (allow_auth_* and "Avatar ..."); allow_auth_delete stays, it is the only avatar delete rule. Keep one set.
DROP POLICY IF EXISTS allow_auth_insert ON storage.objects;
DROP POLICY IF EXISTS allow_auth_update ON storage.objects;
DROP POLICY IF EXISTS allow_public_read ON storage.objects;

-- 3. Size and type limits on buckets that had none (public image buckets only take images).
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']
  WHERE id IN ('avatars', 'property-images') AND allowed_mime_types IS NULL;
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
  WHERE id = 'identity-docs' AND file_size_limit IS NULL AND allowed_mime_types IS NULL;
