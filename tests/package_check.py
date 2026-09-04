from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
errors = []
checks = []


def read_text(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def check(name, condition, detail=''):
    checks.append((name, bool(condition), detail))
    if not condition:
        errors.append((name, detail))


required_files = [
    'index.html',
    'styles.css',
    'src/app.js',
    'src/core.js',
    'src/scopeCompiler.js',
    'src/webmcp.js',
    'serve.mjs',
    'package.json',
    'LICENSE',
    'SECURITY.md',
    '.editorconfig',
    '.github/workflows/quality.yml',
    'requirements-dev.txt',
    '.gitignore',
    'tests/core.test.mjs',
    'tests/fuzz_smoke.mjs',
    'tests/performance_smoke.mjs',
    'tests/source_quality.py',
    'tests/http_security.py',
    'tests/browser_e2e.py',
]
for filename in required_files:
    check(f'{filename} exists', (root / filename).is_file())

index = read_text(root / 'index.html')
server = read_text(root / 'serve.mjs')
package = json.loads(read_text(root / 'package.json'))
source_files = list((root / 'src').glob('*.js'))
all_source = '\n'.join(read_text(path) for path in [*source_files, root / 'serve.mjs'])

check('package version is final-polish candidate', package.get('version') == '0.3.0')
check('package has no runtime dependencies', not package.get('dependencies') and not package.get('devDependencies'))
check('Node 20 engine declared', package.get('engines', {}).get('node') == '>=20')
check('quality scripts exist', all(name in package.get('scripts', {}) for name in ['lint', 'test', 'test:fuzz', 'test:performance', 'test:quality', 'test:http', 'test:browser', 'check', 'check:browser', 'check:release', 'build:smoke']))

security_policy = read_text(root / 'SECURITY.md')
workflow = read_text(root / '.github/workflows/quality.yml')
check('security policy states application boundary', 'does not authenticate the visiting agent' in security_policy and 'not a cryptographic signature' in security_policy and 'external penetration test' in security_policy)
check('CI uses least-privilege repository permissions', 'contents: read' in workflow)
check('CI runs deterministic quality gate', 'npm run check' in workflow)
check('CI installs pinned test requirements', 'pip install' in workflow and 'requirements-dev.txt' in workflow)
requirements = read_text(root / 'requirements-dev.txt')
check('test requirements are exact-pinned', all('==' in line for line in requirements.splitlines() if line and not line.startswith('#')))

check('CSP meta exists', 'Content-Security-Policy' in index)
check('CSP blocks objects', "object-src 'none'" in index)
check('CSP blocks forms', "form-action 'none'" in index)
check('production uses external module script', '<script type="module" src="./src/app.js"></script>' in index)
check('no inline event handlers', not re.search(r'\son[a-z]+\s*=', index, flags=re.IGNORECASE))
check('server emits CSP header', 'Content-Security-Policy' in server)
check('server emits no-referrer policy', 'Referrer-Policy' in server)
check('server disables sensitive permissions', 'Permissions-Policy' in server and 'camera=()' in server and 'microphone=()' in server)
check('server restricts methods', "['GET', 'HEAD']" in server)
check('server checks path containment', 'startsWith' in server and 'path.resolve' in server)
check('server checks real paths against symlink escape', 'realpath' in server and 'Forbidden symlink target' in server)
check('server validates port and supports configurable host', 'HOST' in server and "'0.0.0.0'" in server and '65_535' in server)
check('server exposes only explicit runtime assets', 'publicFiles' in server and "'/package.json'" not in server.split('const publicFiles', 1)[1].split(']);', 1)[0])
check('server bounds request targets', '2_048' in server and 'URI too long' in server)
check('server emits legacy cross-domain protection', 'X-Permitted-Cross-Domain-Policies' in server)
check('freehand input is point-bounded', 'MAX_LASSO_POINTS' in read_text(root / 'src/app.js'))
check('hostile-input performance gate exists', 'HOSTILE_PLAN_100K_REFS_MS' in read_text(root / 'tests/performance_smoke.mjs'))
check('no obsolete optimizer source', not (root / 'src/optimizer.js').exists())
check('no obsolete simulate_rebalance tool', 'simulate_rebalance' not in all_source)
check('agent-authored evaluate_plan exists', 'evaluate_plan' in all_source)
check('exact apply tool exists', 'apply_plan' in all_source)
check('scoped patch implementation exists', 'buildScopedRoutePatch' in all_source and 'PROTECTED_COMMITMENT_CHANGED' in all_source)
check('opaque opportunity flow exists', 'opportunityId' in all_source and 'INVALID_EXPANSION_OPPORTUNITY' in all_source)
check('native modelContext registration exists', 'document.modelContext' in all_source and 'registerTool' in all_source)
check('native modelContext registration is feature-detected as a function', "typeof document.modelContext?.registerTool === 'function'" in read_text(root / 'src/webmcp.js'))
check('current WebMCP annotations are present', all(token in all_source for token in ['readOnlyHint', 'untrustedContentHint', 'consequentialHint']))
check('obsolete MCP annotations are absent', all(token not in all_source for token in ['destructiveHint', 'idempotentHint']))
check('consequential apply is explicitly annotated', 'CONSEQUENTIAL_ANNOTATIONS' in read_text(root / 'src/scopeCompiler.js'))
check('cancelled native executions are preserved as aborts', "error?.name === 'AbortError'" in read_text(root / 'src/webmcp.js'))
check('AbortSignal lifecycle exists', 'AbortController' in all_source)
check('in-flight recompile barrier exists', 'inFlight' in read_text(root / 'src/webmcp.js') and 'pending' in read_text(root / 'src/webmcp.js'))
check('fail-closed degraded registration exists', "health: 'degraded'" in read_text(root / 'src/webmcp.js'))
check('contract diff UI exists', all(token in index for token in ['contractDiff', 'contractHealth', 'contractProof']))
check('human constraints UI exists', all(token in index for token in ['noOvertimeInput', 'maxRouteChangesSelect']))
style_text = read_text(root / 'styles.css')
check('contract proof styles exist', all(token in style_text for token in ['.contract-health', '.contract-section', '.enum-chip', '.capability-row']))
check('current onboarding styles exist', all(token in style_text for token in ['.task-strip', '.task-step.active', '.task-step.done']))
check('current constraint styles exist', all(token in style_text for token in ['.constraint-block', '.constraint-chip', '.constraint-note']))
check('judge onboarding flow exists', all(token in index for token in ['stepScope', 'stepAsk', 'stepReview']))
app_text = read_text(root / 'src/app.js')
check('dynamic strings use escaping helper', 'escapeHtml' in app_text)
check('production debug API is gated', 'devMode || testHarnessMode' in app_text and '__LASSO_V02__' not in app_text)
check('no eval usage', not re.search(r'\beval\s*\(', all_source))
check('no Function constructor', 'new Function' not in all_source)
check('no document.write', 'document.write' not in all_source)
runtime_source = '\n'.join(read_text(path) for path in source_files).replace('http://www.w3.org/2000/svg', '')
check('no remote runtime URLs', not re.search(r'https?://', runtime_source))
check('all production sources are nonempty', all((root / filename).stat().st_size > 0 for filename in required_files))
check('individual source files stay below 100 KiB', all(path.stat().st_size < 100 * 1024 for path in source_files))
runtime_assets = [root / 'index.html', root / 'styles.css', *source_files]
check('uncompressed runtime stays below 160 KiB', sum(path.stat().st_size for path in runtime_assets) < 160 * 1024, str(sum(path.stat().st_size for path in runtime_assets)))

for match in re.finditer(r'(?:href|src)="(\./[^"?#]+)', index):
    relative = match.group(1)[2:]
    check(f'referenced file exists: {relative}', (root / relative).is_file(), relative)

for path in source_files:
    text = read_text(path)
    for match in re.finditer(r"from\s+['\"](\./[^'\"]+)['\"]", text):
        target = (path.parent / match.group(1)).resolve()
        check(f'import exists: {path.name} -> {match.group(1)}', target.is_file(), str(target))

outcome = 'PASS' if not errors else 'FAIL'
print(f'PACKAGE_CHECKS={sum(condition for _, condition, _ in checks)}/{len(checks)} {outcome}')
for name, condition, detail in checks:
    print(('PASS' if condition else 'FAIL'), '|', name, ('| ' + detail if detail else ''))
if errors:
    sys.exit(1)
