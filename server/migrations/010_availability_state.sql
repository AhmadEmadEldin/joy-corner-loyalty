-- Add structured availability state and price audit logging
-- availability_state replaces the boolean active/available combo with a richer enum

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS availability_state text NOT NULL DEFAULT 'available'
    CHECK (availability_state IN ('available','temporarily_unavailable','sold_out','archived'));

-- Migrate existing data: active=false OR available=false → map to appropriate state
UPDATE menu_items
  SET availability_state = CASE
    WHEN active = false THEN 'archived'
    WHEN available = false THEN 'sold_out'
    ELSE 'available'
  END
  WHERE active = false OR available = false;

-- Price audit log: tracks every price change with who/when/what
CREATE TABLE IF NOT EXISTS price_audit_logs (
  id bigint generated always as identity PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('menu_item_size','menu_modifier')),
  entity_id uuid NOT NULL,
  menu_item_id uuid,
  old_price numeric(12,2),
  new_price numeric(12,2) NOT NULL,
  changed_by_user_id uuid,
  changed_by_role text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_audit_logs_entity ON price_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_price_audit_logs_menu_item ON price_audit_logs(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_price_audit_logs_created_at ON price_audit_logs(created_at);
