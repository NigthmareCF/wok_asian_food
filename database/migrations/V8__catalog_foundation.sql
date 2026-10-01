-- Minimal executable catalog foundation. No menu or recipe data is fabricated.
SET search_path = wok, public;

CREATE TABLE item_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_item_types_code CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 2 AND 40)
);

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    dimension TEXT NOT NULL,
    factor_to_base NUMERIC(18,6) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_units_code CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 1 AND 20),
    CONSTRAINT ck_units_dimension CHECK (dimension IN ('MASS', 'VOLUME', 'COUNT')),
    CONSTRAINT ck_units_factor CHECK (factor_to_base > 0 AND factor_to_base::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    item_type_id UUID NOT NULL REFERENCES item_types(id),
    base_unit_id UUID NOT NULL REFERENCES units(id),
    track_inventory BOOLEAN NOT NULL DEFAULT true,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_items_sku CHECK (sku = upper(btrim(sku)) AND length(sku) BETWEEN 1 AND 80),
    CONSTRAINT ck_items_row_version CHECK (row_version > 0)
);
CREATE INDEX ix_items_item_type_id ON items(item_type_id);
CREATE INDEX ix_items_base_unit_id ON items(base_unit_id);

CREATE TABLE preparation_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_preparation_areas_row_version CHECK (row_version > 0)
);

CREATE TABLE menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_menu_categories_name CHECK (length(btrim(name)) > 0),
    CONSTRAINT ck_menu_categories_row_version CHECK (row_version > 0)
);

CREATE TABLE modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    min_selection INTEGER NOT NULL DEFAULT 0,
    max_selection INTEGER NOT NULL,
    required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_modifier_groups_selection CHECK (min_selection >= 0 AND max_selection >= min_selection),
    CONSTRAINT ck_modifier_groups_required CHECK (required = (min_selection > 0)),
    CONSTRAINT ck_modifier_groups_row_version CHECK (row_version > 0)
);

CREATE TABLE modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES modifier_groups(id),
    name TEXT NOT NULL,
    price_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_modifiers_price_delta CHECK (price_delta >= 0 AND price_delta::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_modifiers_row_version CHECK (row_version > 0)
);
CREATE INDEX ix_modifiers_group_id ON modifiers(group_id);

CREATE TABLE menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES items(id),
    category_id UUID NOT NULL REFERENCES menu_categories(id),
    preparation_area_id UUID NOT NULL REFERENCES preparation_areas(id),
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC(14,2) NOT NULL,
    currency_id UUID NOT NULL REFERENCES currencies(id),
    image_reference TEXT,
    visibility TEXT NOT NULL DEFAULT 'PUBLIC',
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    display_order INTEGER NOT NULL DEFAULT 0,
    estimated_preparation_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    row_version INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT ck_menu_items_price CHECK (price >= 0 AND price::text NOT IN ('NaN', 'Infinity', '-Infinity')),
    CONSTRAINT ck_menu_items_visibility CHECK (visibility IN ('PUBLIC', 'STAFF', 'HIDDEN')),
    CONSTRAINT ck_menu_items_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
    CONSTRAINT ck_menu_items_preparation CHECK (estimated_preparation_seconds >= 0),
    CONSTRAINT ck_menu_items_row_version CHECK (row_version > 0)
);
CREATE INDEX ix_menu_items_public_order ON menu_items(category_id, status, display_order, id);
CREATE INDEX ix_menu_items_item_id ON menu_items(item_id);
CREATE INDEX ix_menu_items_preparation_area_id ON menu_items(preparation_area_id);
CREATE INDEX ix_menu_items_currency_id ON menu_items(currency_id);

CREATE TABLE menu_item_modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID NOT NULL REFERENCES menu_items(id),
    group_id UUID NOT NULL REFERENCES modifier_groups(id),
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_menu_item_modifier_groups_pair UNIQUE(menu_item_id, group_id)
);
CREATE INDEX ix_menu_item_modifier_groups_group_id ON menu_item_modifier_groups(group_id);

CREATE TABLE modifier_item_impacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modifier_id UUID NOT NULL REFERENCES modifiers(id),
    item_id UUID NOT NULL REFERENCES items(id),
    quantity_delta NUMERIC(18,6) NOT NULL,
    affects_availability BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_modifier_item_impacts_pair UNIQUE(modifier_id, item_id),
    CONSTRAINT ck_modifier_item_impacts_delta CHECK (quantity_delta <> 0 AND quantity_delta::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX ix_modifier_item_impacts_item_id ON modifier_item_impacts(item_id);
