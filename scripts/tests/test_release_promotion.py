"""Synthetic guards: no network or release writes."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('promotion', ROOT / 'scripts/promote_verified_release.py')
P = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(P)


class PromotionTests(unittest.TestCase):
    def fixture(self):
        return ({'head_sha': P.SOURCE, 'conclusion': 'success', 'event': 'workflow_dispatch',
                 'path': '.github/workflows/build.yml'},
                {'draft': True, 'id': P.DRAFT, 'assets': [
                    {'name': n, 'id': i, 'size': s} for n, (i, s) in P.ASSETS.items()]})

    def test_exact_source(self):
        run, release = self.fixture()
        P.validate_metadata(run, release)
        for key, value in [('head_sha', 'other'), ('conclusion', 'failure'), ('event', 'push')]:
            altered = dict(run, **{key: value})
            with self.assertRaises(ValueError):
                P.validate_metadata(altered, release)

    def test_exact_assets(self):
        run, release = self.fixture()
        for key, value in [('name', 'other.dmg'), ('id', 123), ('size', 1)]:
            _, altered = self.fixture()
            altered['assets'][0][key] = value
            with self.assertRaises(ValueError):
                P.validate_metadata(run, altered)
        release['draft'] = False
        with self.assertRaises(ValueError):
            P.validate_metadata(run, release)

    def test_local_publish_refused(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaises(ValueError):
            P.require_publish_context()

    def test_workflow_uses_only_repository_token(self):
        text = (ROOT / '.github/workflows/promote-verified.yml').read_text()
        self.assertIn('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}', text)
        self.assertIn('default: false', text)
        self.assertIn('persist-credentials: false', text)
        self.assertNotIn('upload-artifact', text)
        self.assertNotIn('actions/cache', text)
        self.assertIn("github.triggering_actor == 'ollisulopuisto'", text)


if __name__ == '__main__':
    unittest.main()
