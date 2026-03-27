-- Add agency column to checklist_items if it doesn't exist
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_items' AND column_name = 'agency'
  ) THEN
    ALTER TABLE checklist_items ADD COLUMN agency TEXT DEFAULT '';
  END IF;
END $$;
