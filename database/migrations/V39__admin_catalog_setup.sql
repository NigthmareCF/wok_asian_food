-- Catalog setup primitives and catalog/recipe metadata. No actual menu, recipes, or stock are seeded here.
SET search_path = wok, public;

INSERT INTO item_types (code, name)
VALUES ('MENU_PRODUCT', 'Producto de menú')
ON CONFLICT (code) DO NOTHING;

INSERT INTO units (code, name, dimension, factor_to_base)
VALUES ('UNIT', 'Unidad', 'COUNT', 1)
ON CONFLICT (code) DO NOTHING;

-- Optional stable catalog key used by seeds and channel clients. Recipe status is
-- metadata only: it never creates recipe components or inventory consumption.
ALTER TABLE menu_items ADD COLUMN slug TEXT;
ALTER TABLE menu_items ADD COLUMN age_restricted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE menu_items ADD COLUMN recipe_status TEXT NOT NULL DEFAULT 'PENDING_DATA';
ALTER TABLE menu_items ADD CONSTRAINT ck_menu_items_slug CHECK (
    slug IS NULL OR (slug = lower(btrim(slug)) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
ALTER TABLE menu_items ADD CONSTRAINT ck_menu_items_recipe_status CHECK (
    recipe_status IN ('DRAFT', 'PENDING_DATA', 'ACTIVE', 'ARCHIVED')
);
CREATE UNIQUE INDEX uq_menu_items_slug ON menu_items(slug) WHERE slug IS NOT NULL;

-- Natural keys make repeatable development seeds safe without fixed UUIDs.
CREATE UNIQUE INDEX uq_modifier_groups_name ON modifier_groups (name);
CREATE UNIQUE INDEX uq_modifiers_group_name ON modifiers (group_id, name);
