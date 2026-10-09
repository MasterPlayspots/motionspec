#!/usr/bin/env python3
"""Validate this staged portable package; build a deterministic, allowlisted ZIP.

Standard library only. This enforces MotionSpec's documented package contract,
not the complete OpenAI upload validator or a live MCP integration test.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import zipfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
FILES = (
    'LICENSE',
    'assets/logo.png',
    'mcp.json',
    'plugin.json',
    'skills/audit-motion/SKILL.md',
    'skills/audit-motion/agents/openai.yaml',
    'skills/validate-motion/SKILL.md',
    'skills/validate-motion/agents/openai.yaml',
)
ENDPOINT = 'https://api.motionspec.dev/chatgpt/mcp'
TOOLS = {'motion_audit', 'motion_catalog', 'motion_validate'}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def public_https(value):
    parsed = urlsplit(value)
    return parsed.scheme == 'https' and bool(parsed.hostname) and not parsed.username and not parsed.password


def validate(package):
    package = Path(package)
    files = {}
    for name in FILES:
        path = package / name
        require(not path.is_symlink() and path.is_file(), f'missing or symlink file: {name}')
        require(path.resolve().is_relative_to(package.resolve()), f'path escapes package: {name}')
        files[name] = path.read_bytes()
    actual = {p.relative_to(package).as_posix() for p in package.rglob('*') if p.is_file() or p.is_symlink()}
    require(actual == set(FILES), f'unexpected package files: {sorted(actual - set(FILES))}')
    require(files['LICENSE'] == (ROOT / 'LICENSE').read_bytes(), 'MIT license must match repository LICENSE')
    manifest = json.loads(files['plugin.json'])
    require(set(manifest) == {'$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions'}, 'unsupported manifest root fields')
    require(manifest['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', 'portable manifest schema identifier')
    require(bool(re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', manifest['name'])) and len(manifest['name']) <= 64, 'plugin name')
    require(bool(re.fullmatch(r'\d+\.\d+\.\d+', manifest['version'])), 'semantic version required')
    require(manifest['license'] == 'MIT', 'license identifier')
    require(set(manifest['extensions']) == {'com.openai'}, 'unexpected extension')
    extension = manifest['extensions']['com.openai']
    require(set(extension) == {'interface', 'review'}, 'unexpected OpenAI settings; do not add app mappings, hooks or publication targeting implicitly')
    listing = extension['interface']
    limits = {'displayName':30, 'shortDescription':30, 'longDescription':4000, 'developerName':80, 'websiteURL':1024, 'supportURL':1024, 'privacyPolicyURL':1024, 'termsOfServiceURL':1024}
    for field, limit in limits.items():
        value = listing[field]
        require(isinstance(value, str) and 0 < len(value.strip()) <= limit, f'listing field: {field}')
        require(not any(ord(c) < 32 and c != '\n' for c in value), f'control characters: {field}')
    for field in ['websiteURL', 'supportURL', 'privacyPolicyURL', 'termsOfServiceURL']:
        require(public_https(listing[field]), f'HTTPS listing URL required: {field}')
    require(listing['category'] == 'Developer Tools', 'confirm dashboard category before changing')
    prompts = listing['defaultPrompt']
    require(isinstance(prompts, list) and 1 <= len(prompts) <= 3 and len(set(prompts)) == len(prompts), 'starter prompt count/uniqueness')
    require(all(isinstance(p, str) and 0 < len(p) <= 128 and '@' not in p for p in prompts), 'starter prompt format')
    require(len(listing['capabilities']) <= 20 and all(len(c) <= 120 for c in listing['capabilities']), 'capability lengths')
    for field in ['composerIcon','logo']:
        require(listing[field] == './assets/logo.png', f'{field} must reference packaged icon')
    png = files['assets/logo.png']
    require(png[:8] == b'\x89PNG\r\n\x1a\n' and png[12:16] == b'IHDR', 'PNG icon required')
    width, height = struct.unpack('>II', png[16:24])
    require(width == height and 48 <= width <= 4096 and len(png) <= 5 * 1024 * 1024, 'icon dimensions/size')
    mcp = json.loads(files['mcp.json'])
    require(mcp == {'$schema':'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', 'mcpServers':{'motionspec':{'type':'streamable-http','url':ENDPOINT}}}, 'single no-credential remote MCP configuration required')
    review = extension['review']
    require(set(review) == {'test_cases','commerce','commerce_description'} and review['commerce'] is False, 'staged non-commerce review fields')
    cases = review['test_cases']
    require(set(cases) == {'positive','negative'} and len(cases['positive']) == 5 and len(cases['negative']) == 3, 'exactly five positive and three negative review cases')
    for case in cases['positive']:
        require(set(case) == {'description','prompt','tools_triggered','expected_behavior'}, 'positive review case fields')
        require(all(isinstance(v, str) and bool(v.strip()) for v in case.values()), 'empty review case')
        require(set(case['tools_triggered'].split(', ')) <= TOOLS, 'review case calls unavailable tool')
    for case in cases['negative']:
        require(set(case) == {'description','prompt'} and all(isinstance(v,str) and v.strip() for v in case.values()), 'negative review case fields')
    for skill in ['audit-motion','validate-motion']:
        text = files[f'skills/{skill}/SKILL.md'].decode()
        front = re.match(r'\A---\nname: ([a-z0-9-]+)\ndescription: ([^\n]+)\n---\n', text)
        require(front is not None and front[1] == skill, f'skill frontmatter: {skill}')
        require('TODO' not in text and len(text.splitlines()) < 500, f'unfinished/oversize skill: {skill}')
        config = files[f'skills/{skill}/agents/openai.yaml'].decode()
        require('value: "motionspec"' in config and f'url: "{ENDPOINT}"' in config and 'transport: "streamable_http"' in config, f'skill MCP dependency: {skill}')
    # Permit safety instructions which name unsupported operations, but never embed credentials.
    for name, data in files.items():
        if name.endswith(('.json','.md','.yaml')):
            text = data.decode()
            require(not re.search(r'(?i)(authorization\s*[:=]\s*bearer|sk-[a-z0-9]{20,}|BEGIN .*PRIVATE KEY)', text), f'credential-like content: {name}')
    return files, manifest


def archive(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_STORED) as bundle:
        for name in sorted(files):
            entry = zipfile.ZipInfo(name, date_time=(2026, 10, 9, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_STORED
            bundle.writestr(entry, files[name])
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, default=ROOT / 'openai-plugin')
    parser.add_argument('--out-dir', type=Path, default=ROOT / 'out/chatgpt-plugin')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    files, manifest = validate(args.package)
    first, second = archive(files), archive(files)
    require(first == second, 'ZIP build is not deterministic')
    evidence = {
        'package':manifest['name'], 'version':manifest['version'],
        'local_package_checks':'passed',
        'check_scope':'Documented MotionSpec package contract; not full OpenAI server-side schema/import validation',
        'deterministic_zip':'passed',
        'zip_sha256':hashlib.sha256(first).hexdigest(),
        'zip_bytes':len(first),
        'remote_endpoint':ENDPOINT,
        'live_mcp_tests':'not-run', 'chatgpt_review_cases':'not-run',
        'openai_upload_validation':'not-run', 'public_submission':'not-performed',
        'files':{name:hashlib.sha256(data).hexdigest() for name,data in sorted(files.items())},
    }
    if not args.check:
        args.out_dir.mkdir(parents=True, exist_ok=True)
        basename = f'motionspec-chatgpt-{manifest["version"]}-draft'
        (args.out_dir / (basename + '.zip')).write_bytes(first)
        (args.out_dir / (basename + '.manifest.json')).write_text(json.dumps(evidence, indent=2) + '\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    main()
