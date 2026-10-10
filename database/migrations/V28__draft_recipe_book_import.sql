-- Draft transcription of the 2026-10-10 recipe book. This data is metadata only:
-- it does not publish recipes, create stock, or activate inventory consumption.
SET search_path = wok, public;

CREATE TABLE recipe_book_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    output_menu_item_id UUID REFERENCES menu_items(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_VALIDATION',
    link_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    note TEXT NOT NULL DEFAULT '',
    yield_quantity NUMERIC(18,6),
    yield_unit TEXT,
    procedure TEXT,
    preparation_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_recipe_book_recipes_status CHECK (status IN ('PENDING_VALIDATION', 'VALIDATED', 'ARCHIVED')),
    CONSTRAINT ck_recipe_book_recipes_link_status CHECK (link_status IN ('LINKED', 'NEEDS_REVIEW', 'UNMATCHED')),
    CONSTRAINT ck_recipe_book_recipes_yield CHECK (yield_quantity IS NULL OR (yield_quantity > 0 AND yield_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))),
    CONSTRAINT ck_recipe_book_recipes_preparation CHECK (preparation_minutes IS NULL OR preparation_minutes > 0)
);
CREATE INDEX ix_recipe_book_recipes_menu_item ON recipe_book_recipes(output_menu_item_id);

CREATE TABLE recipe_book_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    recipe_id UUID NOT NULL REFERENCES recipe_book_recipes(id) ON DELETE RESTRICT,
    ingredient_item_id UUID REFERENCES items(id) ON DELETE RESTRICT,
    ingredient_name TEXT NOT NULL,
    quantity NUMERIC(18,6),
    unit_code TEXT NOT NULL,
    raw TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'TRANSCRIBED',
    confirmation_source TEXT,
    alternate_quantity NUMERIC(18,6),
    alternate_unit_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_recipe_book_components_quantity CHECK (quantity IS NULL OR (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))),
    CONSTRAINT ck_recipe_book_components_alternate_quantity CHECK (alternate_quantity IS NULL OR (alternate_quantity > 0 AND alternate_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))),
    CONSTRAINT ck_recipe_book_components_status CHECK (status IN ('TRANSCRIBED', 'PENDING_CONFIRMATION', 'PENDING_UNIT', 'USER_CONFIRMED'))
);
CREATE INDEX ix_recipe_book_components_recipe ON recipe_book_components(recipe_id);
CREATE INDEX ix_recipe_book_components_item ON recipe_book_components(ingredient_item_id);

CREATE TABLE recipe_book_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    ingredient_item_id UUID REFERENCES items(id) ON DELETE RESTRICT,
    ingredient_name TEXT NOT NULL,
    presentation TEXT NOT NULL,
    quantity NUMERIC(18,6),
    unit_code TEXT NOT NULL,
    raw TEXT NOT NULL,
    source TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'TRANSCRIBED',
    confirmation_source TEXT,
    alternate_quantity NUMERIC(18,6),
    alternate_unit_code TEXT,
    is_inventory BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_recipe_book_purchases_quantity CHECK (quantity IS NULL OR (quantity > 0 AND quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))),
    CONSTRAINT ck_recipe_book_purchases_alternate CHECK (alternate_quantity IS NULL OR (alternate_quantity > 0 AND alternate_quantity::text NOT IN ('NaN', 'Infinity', '-Infinity'))),
    CONSTRAINT ck_recipe_book_purchases_status CHECK (status IN ('TRANSCRIBED', 'PENDING_CONFIRMATION', 'PENDING_UNIT', 'USER_CONFIRMED')),
    CONSTRAINT ck_recipe_book_purchases_not_stock CHECK (is_inventory = false)
);

CREATE TABLE recipe_book_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id TEXT NOT NULL UNIQUE,
    topic TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_recipe_book_questions_status CHECK (status IN ('OPEN', 'ANSWERED'))
);
