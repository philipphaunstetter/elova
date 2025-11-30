-- Add is_tracked column to workflows table
ALTER TABLE workflows ADD COLUMN is_tracked BOOLEAN DEFAULT 1;
