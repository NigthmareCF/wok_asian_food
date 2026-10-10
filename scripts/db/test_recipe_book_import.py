import json
import unittest
from pathlib import Path

from import_recipe_book import generate, validate


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "database/seeds/recipe_book_2026-10-10.json"


class RecipeBookImportTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA.read_text(encoding="utf-8"))
        cls.sql = generate(cls.data)

    def test_transcription_counts_and_source_ids_are_stable(self):
        self.assertEqual(len(self.data["recipes"]), 13)
        self.assertEqual(sum(len(r["ingredients"]) for r in self.data["recipes"]), 72)
        self.assertEqual(len(self.data["purchases"]), 21)
        self.assertEqual(len(self.data["questions"]), 15)
        self.assertEqual(self.sql.count("INSERT INTO recipe_book_recipes"), 13)
        self.assertEqual(self.sql.count("INSERT INTO recipe_book_components"), 72)
        self.assertEqual(self.sql.count("INSERT INTO recipe_book_purchases"), 21)
        self.assertEqual(self.sql.count("INSERT INTO recipe_book_questions"), 15)

    def test_import_is_insert_only_and_keeps_unresolved_recipe_data_null(self):
        validate(self.data)
        self.assertEqual(self.sql.count("ON CONFLICT (source_id) DO NOTHING"), 121)
        self.assertIn("'REC001',", self.sql)
        self.assertIn("'COM021',", self.sql)
        for recipe in self.data["recipes"]:
            if recipe["name"] in {"Cerdo", "Ramen"}:
                self.assertIn("'NEEDS_REVIEW'", self.sql)
        self.assertIn("150, 'oz'", self.sql)
        self.assertIn("133, 'oz'", self.sql)

    def test_generated_seed_never_creates_stock_or_activates_recipes(self):
        self.assertNotIn("inventory_movements", self.sql)
        self.assertNotIn("INSERT INTO inventory", self.sql)
        self.assertIn("'PENDING_VALIDATION'", self.sql)
        self.assertIn(", FALSE", self.sql)


if __name__ == "__main__":
    unittest.main()
