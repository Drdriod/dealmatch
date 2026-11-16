-- The provider-portfolio bucket (private, skill-verification photos) had no size or file-type limit.
-- The app only ever uploads photos, so cap it like the other image buckets.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','image/avif']
WHERE id = 'provider-portfolio';
