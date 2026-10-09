"""Regression checks for the portable package boundary; no live service calls."""
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package_builder', ROOT / 'scripts/build-chatgpt-plugin.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class PackageBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.package = Path(self.temp.name) / 'package'
        shutil.copytree(ROOT / 'openai-plugin', self.package)

    def test_reproducible_portable_root_and_license(self):
        files, _ = builder.validate(self.package)
        data = builder.archive(files)
        self.assertEqual(data, builder.archive(dict(reversed(list(files.items())))))
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            self.assertEqual(bundle.namelist(), sorted(builder.FILES))
            self.assertEqual(bundle.read('LICENSE'), (ROOT / 'LICENSE').read_bytes())
            self.assertEqual(bundle.testzip(), None)

    def test_unexpected_file_cannot_enter_bundle(self):
        (self.package / '.env').write_text('SYNTHETIC_SECRET=not-a-real-secret')
        with self.assertRaisesRegex(ValueError, 'unexpected package files'):
            builder.validate(self.package)

    def test_symlink_cannot_escape_package(self):
        p = self.package / 'assets/logo.png'
        p.unlink()
        p.symlink_to(ROOT / 'docs/assets/logo-512.png')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            builder.validate(self.package)

    def test_commercial_or_stdio_mcp_cannot_replace_isolated_route(self):
        p = self.package / 'mcp.json'
        content = json.loads(p.read_text())
        content['mcpServers']['motionspec']['url'] = 'https://api.motionspec.dev/mcp'
        p.write_text(json.dumps(content))
        with self.assertRaisesRegex(ValueError, 'single no-credential'):
            builder.validate(self.package)

    def test_review_inventory_has_required_five_and_three_cases(self):
        p = self.package / 'plugin.json'
        content = json.loads(p.read_text())
        content['extensions']['com.openai']['review']['test_cases']['positive'].pop()
        p.write_text(json.dumps(content))
        with self.assertRaisesRegex(ValueError, 'five positive and three negative'):
            builder.validate(self.package)

    def test_hooks_or_registered_app_mapping_are_not_public_submission(self):
        p = self.package / 'plugin.json'
        content = json.loads(p.read_text())
        content['extensions']['com.openai']['apps'] = './.app.json'
        p.write_text(json.dumps(content))
        with self.assertRaisesRegex(ValueError, 'unexpected OpenAI settings'):
            builder.validate(self.package)


if __name__ == '__main__':
    unittest.main()
