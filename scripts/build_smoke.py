from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'styles.css').read_text(encoding='utf-8')
parts = []

for filename in ['src/core.js', 'src/scopeCompiler.js', 'src/webmcp.js', 'src/app.js']:
    source = (root / filename).read_text(encoding='utf-8')
    source = re.sub(
        r'^import\s+[\s\S]*?\s+from\s+[\'\"][^\'\"]+[\'\"]\s*;\s*',
        '',
        source,
        flags=re.MULTILINE,
    )
    source = re.sub(r'\bexport\s+(?=(const|let|var|function|class)\b)', '', source)
    parts.append(source)

javascript = "window.__LASSO_TEST_HARNESS__ = true;\n" + '\n\n'.join(parts)
html = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '', html)
html = html.replace('  <link rel="stylesheet" href="./styles.css" />', f'  <style>{css}</style>')
html = html.replace(
    '<script type="module" src="./src/app.js"></script>',
    f'<script>(async()=>{{\n{javascript}\n}})().catch(error=>{{console.error(error);document.body.dataset.bootError=String(error?.stack||error)}});</script>',
)
output = root / '_smoke_v03.html'
output.write_text(html, encoding='utf-8')
print(output)
