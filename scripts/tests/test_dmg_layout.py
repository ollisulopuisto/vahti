"""Offline DMG payload allowlist tests. No Finder/native acceptance claim."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('release_validation', ROOT / 'scripts/release-validation.py')
validation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validation)


class LayoutTests(unittest.TestCase):
    def fixture(self, mount):
        (mount / 'Vahti.app').mkdir()
        (mount / 'Applications').symlink_to('/Applications')
        (mount / '.background').mkdir()
        (mount / '.background/welcome.png').write_bytes((ROOT / 'packaging/dmg/welcome-vahti.png').read_bytes())
        (mount / '.DS_Store').write_bytes(b'fixture metadata')

    def test_exact_art_and_metadata_allowed(self):
        with tempfile.TemporaryDirectory() as td:
            mount = Path(td)
            self.fixture(mount)
            validation.validate_dmg_layout(mount)

    def test_art_mismatch_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            mount = Path(td)
            self.fixture(mount)
            (mount / '.background/welcome.png').write_bytes(b'wrong')
            with self.assertRaisesRegex(ValueError, 'artwork'):
                validation.validate_dmg_layout(mount)

    def test_extra_root_or_background_file_rejected(self):
        for name in ('surprise', '.background/surprise'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as td:
                mount = Path(td)
                self.fixture(mount)
                (mount / name).write_bytes(b'wrong')
                with self.assertRaises(ValueError):
                    validation.validate_dmg_layout(mount)

    def test_missing_metadata_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            mount = Path(td)
            self.fixture(mount)
            (mount / '.DS_Store').unlink()
            with self.assertRaises(ValueError):
                validation.validate_dmg_layout(mount)


if __name__ == '__main__':
    unittest.main()
