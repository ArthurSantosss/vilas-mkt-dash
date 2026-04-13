-- Create storage bucket for report images (public, auto-cleanup)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'report-images',
  'report-images',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Allow anonymous uploads (the app uses anon key)
CREATE POLICY "Allow anonymous upload to report-images"
ON storage.objects FOR INSERT
TO anon
WITH CHECK (bucket_id = 'report-images');

-- Allow public read
CREATE POLICY "Allow public read of report-images"
ON storage.objects FOR SELECT
TO anon, public
USING (bucket_id = 'report-images');

-- Allow anonymous delete (for cleanup)
CREATE POLICY "Allow anonymous delete of report-images"
ON storage.objects FOR DELETE
TO anon
USING (bucket_id = 'report-images');
