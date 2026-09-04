from __future__ import annotations

from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TEXT_FILES = [
    ROOT / 'index.html',
    ROOT / 'styles.css',
    ROOT / 'serve.mjs',
    *sorted((ROOT / 'src').glob('*.js')),
    *sorted((ROOT / 'scripts').glob('*.py')),
    *sorted((ROOT / 'tests').glob('*.mjs')),
    *sorted((ROOT / 'tests').glob('*.py')),
]

checks: list[tuple[str, bool, str]] = []


def check(name: str, condition: bool, detail: str = '') -> None:
    checks.append((name, bool(condition), detail))


class ProductHtmlAudit(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []
        self.buttons_without_type: list[str] = []
        self.images_without_alt: list[str] = []
        self.inline_handlers: list[str] = []
        self.script_sources: list[str] = []
        self.inline_script_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get('id'):
            self.ids.append(attributes['id'])
        if tag == 'button' and attributes.get('type') not in {'button', 'submit', 'reset'}:
            self.buttons_without_type.append(attributes.get('id', '<unnamed>'))
        if tag == 'img' and 'alt' not in attributes:
            self.images_without_alt.append(attributes.get('src', '<unknown>'))
        for key in attributes:
            if key.lower().startswith('on'):
                self.inline_handlers.append(key)
        if tag == 'script':
            if attributes.get('src'):
                self.script_sources.append(attributes['src'])
            else:
                self.inline_script_count += 1


for path in TEXT_FILES:
    text = path.read_text(encoding='utf-8')
    relative = str(path.relative_to(ROOT))
    check(f'{relative} ends with newline', text.endswith('\n'))
    check(f'{relative} has no trailing whitespace', all(line.rstrip() == line for line in text.splitlines()))
    check(f'{relative} has no tab indentation', all('\t' not in line for line in text.splitlines()))

index = (ROOT / 'index.html').read_text(encoding='utf-8')
html_audit = ProductHtmlAudit()
html_audit.feed(index)
duplicate_ids = sorted(identifier for identifier, count in Counter(html_audit.ids).items() if count > 1)
check('HTML IDs are unique', not duplicate_ids, ', '.join(duplicate_ids))
check('all buttons declare an explicit type', not html_audit.buttons_without_type, ', '.join(html_audit.buttons_without_type))
check('all images have alt text', not html_audit.images_without_alt, ', '.join(html_audit.images_without_alt))
check('HTML has no inline event handlers', not html_audit.inline_handlers, ', '.join(html_audit.inline_handlers))
check('production HTML has no inline scripts', html_audit.inline_script_count == 0, str(html_audit.inline_script_count))
check('production HTML loads one local module entrypoint', html_audit.script_sources == ['./src/app.js'], repr(html_audit.script_sources))

css = (ROOT / 'styles.css').read_text(encoding='utf-8')


def parse_css_top_level_selectors(stylesheet: str) -> tuple[list[str], list[str]]:
    cleaned = re.sub(r'/\*.*?\*/', '', stylesheet, flags=re.S)
    selectors: list[str] = []
    syntax_errors: list[str] = []
    i = 0
    n = len(cleaned)
    while i < n:
        while i < n and cleaned[i].isspace():
            i += 1
        if i >= n:
            break

        if cleaned[i] != '{':
            start = i
            while i < n and cleaned[i] != '{' and cleaned[i] != '}':
                i += 1
            selector = cleaned[start:i].strip()
            if i < n and cleaned[i] == '{':
                rule_start = i + 1
                depth = 1
                i += 1
                while i < n and depth:
                    char = cleaned[i]
                    if char == '{':
                        depth += 1
                    elif char == '}':
                        depth -= 1
                    i += 1
                if depth != 0:
                    syntax_errors.append('unbalanced braces')
                    break
                block = cleaned[rule_start:i - 1]
                if selector and not selector.startswith('@') and block:
                    selectors.append(selector)
                continue
            if selector:
                syntax_errors.append('unexpected closing brace or incomplete rule')
                break

        if cleaned[i] == '}':
            syntax_errors.append('unexpected closing brace')
            break
        i += 1

    return selectors, syntax_errors


css_selectors, css_errors = parse_css_top_level_selectors(css)
check(
    'CSS parses without syntax errors',
    not css_errors,
    '; '.join(css_errors),
)
duplicate_selectors = sorted(selector for selector, count in Counter(css_selectors).items() if count > 1)
check('CSS has no duplicate top-level selectors', not duplicate_selectors, ', '.join(duplicate_selectors[:12]))

production_text = '\n'.join(
    path.read_text(encoding='utf-8')
    for path in [ROOT / 'index.html', ROOT / 'styles.css', ROOT / 'serve.mjs', *sorted((ROOT / 'src').glob('*.js'))]
)
secret_patterns = {
    'private key material': r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'generic API bearer token': r'(?i)bearer\s+[a-z0-9._~+/-]{24,}',
    'OpenAI-style secret key': r'\bsk-[A-Za-z0-9_-]{20,}\b',
    'AWS access key': r'\bAKIA[0-9A-Z]{16}\b',
}
for name, pattern in secret_patterns.items():
    check(f'no {name}', re.search(pattern, production_text) is None)

check('production source contains no source-map directives', 'sourceMappingURL=' not in production_text)
check('production source contains no debugger statements', re.search(r'(^|[;{}\s])debugger\s*;', production_text) is None)

failures = [(name, detail) for name, passed, detail in checks if not passed]
print(f'SOURCE_QUALITY_CHECKS={len(checks) - len(failures)}/{len(checks)} {"PASS" if not failures else "FAIL"}')
for name, passed, detail in checks:
    print(('PASS' if passed else 'FAIL'), '|', name, ('| ' + detail if detail else ''))
if failures:
    sys.exit(1)
