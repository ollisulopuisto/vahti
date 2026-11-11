"""Offline DMG payload allowlist tests. No Finder/native acceptance claim."""
import importlib.util
from pathlib import Path
import tempfile
from unittest import mock
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

    def test_layout_validator_survives_source_export(self):
        # Exercise the actual export function, including PNG metadata stripping.
        with tempfile.TemporaryDirectory() as td:
            tree = Path(td) / 'export'
            tree.mkdir()
            names = ['scripts/release-validation.py', 'scripts/privacy-gate.py',
                     'packaging/dmg/welcome-vahti.png', 'packaging/dmg/restyle.py',
                     'packaging/dmg/capture.py', 'README.md', 'LICENSE', 'SECURITY.md']
            gate = mock.Mock()
            with mock.patch.object(validation.privacy.subprocess, 'check_output', return_value=('\0'.join(names) + '\0').encode()):
                validation.privacy.export(ROOT, tree, gate)
            gate.tree.assert_called_once_with(tree)
            self.assertTrue((tree / 'packaging/dmg/restyle.py').is_file())
            exported_spec = importlib.util.spec_from_file_location('exported_validator', tree / 'scripts/release-validation.py')
            exported = importlib.util.module_from_spec(exported_spec)
            exported_spec.loader.exec_module(exported)
            mount = Path(td) / 'mount'
            mount.mkdir()
            self.fixture(mount)
            exported.validate_dmg_layout(mount)
            # The exact allowlist still excludes unknown packaging files.
            self.assertFalse(validation.privacy.allowed('packaging/dmg/private-notes.txt'))
            self.assertFalse(validation.privacy.allowed('packaging/dmg/.secret'))


if __name__ == '__main__':
    unittest.main()
