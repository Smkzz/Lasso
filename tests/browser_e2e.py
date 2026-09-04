import base64
import json
import pathlib
import sys
import time

try:
    import requests
    import websocket
except ModuleNotFoundError as error:
    print(f'BROWSER_E2E=BLOCKED ({error})')
    print('Install optional test dependencies from requirements-dev.txt in this environment to run browser E2E.')
    sys.exit(2)

ROOT = pathlib.Path(__file__).resolve().parents[1]
SHOTDIR = ROOT / 'artifacts' / 'browser-e2e-v03'
SHOTDIR.mkdir(parents=True, exist_ok=True)
PORT = 9222


def fail(message):
    raise AssertionError(message)


try:
    page = requests.put(f'http://127.0.0.1:{PORT}/json/new?about:blank', timeout=5).json()
except Exception as error:
    print(f'BROWSER_E2E=BLOCKED ({error})')
    print('Start Chromium with --remote-debugging-port=9222 and rerun this script.')
    sys.exit(2)

ws = websocket.create_connection(page['webSocketDebuggerUrl'], timeout=10)
next_id = 1
events = []


def call(method, params=None, timeout=10):
    global next_id
    request_id = next_id
    next_id += 1
    ws.send(json.dumps({'id': request_id, 'method': method, 'params': params or {}}))
    deadline = time.time() + timeout
    while time.time() < deadline:
        message = json.loads(ws.recv())
        if message.get('id') == request_id:
            if 'error' in message:
                raise RuntimeError(message['error'])
            return message.get('result', {})
        events.append(message)
    raise TimeoutError(method)


def evaljs(expression, await_promise=False):
    result = call('Runtime.evaluate', {
        'expression': expression,
        'returnByValue': True,
        'awaitPromise': await_promise,
        'userGesture': True,
    })
    if 'exceptionDetails' in result:
        raise RuntimeError(result['exceptionDetails'])
    return result.get('result', {}).get('value')


def shot(name):
    result = call('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
    (SHOTDIR / name).write_bytes(base64.b64decode(result['data']))


def wait_for(expression, timeout=8):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if evaljs(expression):
                return True
        except Exception:
            pass
        time.sleep(0.08)
    return False


def state():
    return json.loads(evaljs('JSON.stringify(window.__LASSO_V03__.getState())'))


def tools():
    return json.loads(evaljs('JSON.stringify(window.__LASSO_V03__.tools())'))


def find_tool(base):
    return evaljs(f"window.__LASSO_V03__.findTool({json.dumps(base)})")


def run(base, arguments):
    name = find_tool(base)
    if not name:
        fail(f'missing tool {base}')
    expression = f"window.__LASSO_V03__.run({json.dumps(name)},{json.dumps(arguments)})"
    return evaljs(expression, True)


def contract_args():
    current = state()
    return {
        'workspaceGeneration': current['workspaceGeneration'],
        'scopeRevision': current['scopeRevision'],
    }


call('Page.enable')
call('Runtime.enable')
call('Log.enable')
call('Emulation.setDeviceMetricsOverride', {
    'width': 1600,
    'height': 1000,
    'deviceScaleFactor': 1,
    'mobile': False,
})
frame = call('Page.getFrameTree')['frameTree']['frame']['id']
html = (ROOT / '_smoke_v03.html').read_text(encoding='utf-8')
call('Page.setDocumentContent', {'frameId': frame, 'html': html})
assert wait_for("document.readyState==='complete' && !!window.__LASSO_V03__"), (
    'app did not load: '
    + str(evaljs("document.body?.dataset?.bootError||document.body?.innerText?.slice(0,500)"))
)
assert wait_for("window.__LASSO_V03__.bridgeStatus().health==='ready'")
assert evaljs("document.getElementById('mcpStatus').innerText.includes('local validation')")
assert evaljs("document.getElementById('contractHealth').innerText.includes('active in local bridge')")
assert evaljs("!document.getElementById('contractHealth').innerText.includes('confirmed by host')")
assert evaljs("document.querySelectorAll('[id]').length===new Set([...document.querySelectorAll('[id]')].map(node=>node.id)).size")
assert evaljs("[...document.querySelectorAll('button')].every(button=>button.textContent.trim()||button.getAttribute('aria-label'))")
assert evaljs("document.querySelectorAll('*').length<500")
shot('00-initial.png')

initial = state()
assert initial['webMcpMode'] == 'local-bridge'
assert initial['selectedDeliveryIds'] == []
assert len(initial['activeToolNames']) == 1
assert evaljs("getComputedStyle(document.querySelector('.task-strip')).display==='grid'")
assert evaljs("getComputedStyle(document.querySelector('.constraint-block')).borderTopWidth==='1px'")
assert evaljs("document.getElementById('contractHealth').textContent.includes('tools active in local bridge')")
coarse = json.loads(evaljs(
    "window.__LASSO_V03__.run(window.__LASSO_V03__.tools()[0].name,"
    "{workspaceGeneration:1,scopeRevision:1}).then(x=>JSON.stringify(x))",
    True,
))
assert 'lateDeliveries' not in coarse

# True pointer-driven freehand lasso in SVG viewBox coordinates.
rect = json.loads(evaljs("JSON.stringify(document.getElementById('dispatchMap').getBoundingClientRect())"))
polygon = [(470, 210), (690, 205), (785, 320), (770, 540), (540, 545), (470, 410), (470, 210)]


def client(point):
    x = rect['x'] + point[0] / 1000 * rect['width']
    y = rect['y'] + point[1] / 620 * rect['height']
    return x, y


x, y = client(polygon[0])
call('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x, 'y': y, 'button': 'left', 'buttons': 1, 'clickCount': 1})
for point in polygon[1:-1]:
    x, y = client(point)
    call('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': 'left', 'buttons': 1})
    time.sleep(0.03)
x, y = client(polygon[-1])
call('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x, 'y': y, 'button': 'left', 'buttons': 0, 'clickCount': 1})
assert wait_for(
    "window.__LASSO_V03__.getState().selectedDeliveryIds.length===6 && "
    "window.__LASSO_V03__.getState().selectedDriverIds.length===2 && "
    "!!window.__LASSO_V03__.findTool('evaluate_plan')"
), state()
selected = state()
assert sorted(selected['selectedDeliveryIds']) == sorted(['D04', 'D07', 'D09', 'D12', 'D15', 'D18'])
assert sorted(selected['selectedDriverIds']) == sorted(['AINO-02', 'LEO-05'])
assert evaljs("document.getElementById('lassoPath').getAttribute('d').length>20")
assert evaljs("document.getElementById('scopeBadge').textContent.includes('max 3 route changes')")
shot('01-freehand-scope.png')

# Schema itself is compiled from the human selection.
selected_tools = tools()
evaluation_definition = next(tool for tool in selected_tools if 'evaluate_plan' in tool['name'])
assignment_properties = evaluation_definition['inputSchema']['properties']['assignments']['items']['properties']
assert sorted(assignment_properties['driverId']['enum']) == sorted(['AINO-02', 'LEO-05'])
assert sorted(assignment_properties['deliveryIds']['items']['enum']) == sorted(['D04', 'D07', 'D09', 'D12', 'D15', 'D18'])
assert evaluation_definition['annotations'] == {
    'readOnlyHint': False,
    'untrustedContentHint': False,
    'consequentialHint': False,
}

# External-agent-shaped invalid plan; the app diagnoses rather than solves it.
invalid = run('evaluate_plan', {
    **contract_args(),
    'assignments': [
        {'driverId': 'AINO-02', 'deliveryIds': ['D04', 'D07', 'D15']},
        {'driverId': 'LEO-05', 'deliveryIds': ['D09', 'D12']},
    ],
})
assert invalid['status'] == 'invalid'
codes = {violation['code'] for violation in invalid['violations']}
assert {'VEHICLE_CAPABILITY_MISSING', 'DRIVER_CAPACITY_EXCEEDED', 'OVERTIME_FORBIDDEN'} <= codes
opportunity = next(item for item in invalid['boundaryOpportunities'] if item['deliveryId'] == 'D15')
serialized_opportunities = json.dumps(invalid['boundaryOpportunities'])
assert 'MIKA-03' not in serialized_opportunities and 'Mika' not in serialized_opportunities
assert wait_for("!!window.__LASSO_V03__.findTool('request_expansion')")
request_definition = next(tool for tool in tools() if 'request_expansion' in tool['name'])
assert request_definition['annotations'] == {
    'readOnlyHint': False,
    'untrustedContentHint': False,
    'consequentialHint': False,
}
shot('02-invalid-agent-plan.png')

# Invalid runtime reason is rejected even if schema validation is bypassed.
short_reason = run('request_expansion', {
    **contract_args(),
    'opportunityId': opportunity['opportunityId'],
    'reason': 'short',
})
assert short_reason['status'] == 'rejected' and short_reason['code'] == 'INVALID_EXPANSION_REASON'

# Agent requests an opaque WebMCP opportunity; it cannot self-authorize or receive the resource ID from the tool.
request_result = run('request_expansion', {
    **contract_args(),
    'opportunityId': opportunity['opportunityId'],
    'reason': 'D15 needs compatible refrigerated capacity outside the current human boundary.',
})
assert request_result['status'] == 'awaiting_human'
assert request_result['authorityChanged'] is False
assert 'MIKA-03' not in json.dumps(request_result)
assert not state()['selectedDriverIds'].__contains__('MIKA-03')
assert evaljs("document.getElementById('expansionCard').classList.contains('hidden')===false")
shot('03-scope-negotiation.png')

# Human approves in visible UI. The new revision contains Mika and the proof diff exposes it.
old_revision = state()['scopeRevision']
evaljs("document.getElementById('contractToggle').click(); document.getElementById('approveExpansion').click(); true")
assert wait_for(
    f"window.__LASSO_V03__.getState().scopeRevision==={old_revision + 1} && "
    "window.__LASSO_V03__.getState().selectedDriverIds.includes('MIKA-03') && "
    "!!window.__LASSO_V03__.findTool('evaluate_plan')"
)
assert evaljs("document.getElementById('scopeLink').getAttribute('d').length>10")
assert evaljs("document.getElementById('contractDiff').innerText.includes('MIKA-03')")
expanded_tools = tools()
expanded_evaluation = next(tool for tool in expanded_tools if 'evaluate_plan' in tool['name'])
expanded_driver_enum = expanded_evaluation['inputSchema']['properties']['assignments']['items']['properties']['driverId']['enum']
assert 'MIKA-03' in expanded_driver_enum
shot('04-expanded-contract.png')

# Agent authors a repaired plan. LASSO validates while preserving Mika's undisclosed protected D06 commitment.
valid = run('evaluate_plan', {
    **contract_args(),
    'assignments': [
        {'driverId': 'AINO-02', 'deliveryIds': ['D04', 'D07']},
        {'driverId': 'LEO-05', 'deliveryIds': ['D09', 'D12']},
        {'driverId': 'MIKA-03', 'deliveryIds': ['D15']},
    ],
})
assert valid['status'] == 'verified'
assert valid['afterLate'] == 1 and valid['stillLateIds'] == ['D18']
assert valid['overtimeMinutes'] == 0 and valid['routeChanges'] == 3
assert evaljs("document.querySelectorAll('#proposalRoutes .route-line.proposal').length===5")
assert evaljs("document.getElementById('contractDiff').innerText.includes('noOvertime: true')")
shot('05-verified-agent-plan.png')

# Human authorizes one exact plan; only then does write authority exist.
assert not find_tool('apply_plan')
evaljs("document.getElementById('authorizeBtn').click(); true")
assert wait_for("!!window.__LASSO_V03__.findTool('apply_plan')")
assert evaljs("document.getElementById('contractDiff').innerText.includes('epoch:')")
shot('06-exact-authorization.png')

current = state()
apply_name = find_tool('apply_plan')
apply_args = {
    'workspaceGeneration': current['workspaceGeneration'],
    'scopeRevision': current['scopeRevision'],
    'planId': current['verifiedPlan']['planId'],
    'actuationEpoch': current['authorization']['actuationEpoch'],
}
result = evaljs(
    f"window.__LASSO_V03__.run({json.dumps(apply_name)},{json.dumps(apply_args)})",
    True,
)
assert result['status'] == 'applied'
assert wait_for("window.__LASSO_V03__.getState().deliveries.find(d=>d.id==='D15').status==='on-time'")
final = state()
assert next(delivery for delivery in final['deliveries'] if delivery['id'] == 'D18')['status'] == 'late'
assert final['liveAssignments']['AINO-02'] == ['D04', 'D07']
assert final['liveAssignments']['LEO-05'] == ['D09', 'D12']
assert final['liveAssignments']['MIKA-03'] == ['D06', 'D15']
assert final['liveAssignments']['SARA-01'] == ['D01', 'D02']
assert final['liveAssignments']['OSKARI-04'] == ['D16']
all_assignments = [delivery_id for route in final['liveAssignments'].values() for delivery_id in route]
assert len(all_assignments) == len(set(all_assignments))
assert evaljs("document.querySelectorAll('#liveRoutes .route-line.live').length===9")
assert evaljs("document.querySelectorAll('#liveRoutes .route-line.live.applied').length===5")
assert not find_tool('apply_plan')
shot('07-applied.png')

# Old exact write is not callable after contract invalidation.
replay = evaljs(
    f"window.__LASSO_V03__.run({json.dumps(apply_name)},{json.dumps(apply_args)})",
    True,
)
assert replay['status'] == 'rejected' and replay['code'] == 'TOOL_NOT_EXPOSED'

# Responsive smoke check: the same product remains usable at a narrow desktop/tablet width.
call('Emulation.setDeviceMetricsOverride', {
    'width': 900,
    'height': 900,
    'deviceScaleFactor': 1,
    'mobile': False,
})
time.sleep(0.15)
assert evaljs("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2")
assert evaljs("document.getElementById('dispatchMap').getBoundingClientRect().width>700")
shot('08-responsive.png')

# Mobile-width smoke: no horizontal overflow and the core interaction remains visible.
call('Emulation.setDeviceMetricsOverride', {
    'width': 390,
    'height': 844,
    'deviceScaleFactor': 1,
    'mobile': True,
})
time.sleep(0.15)
assert evaljs("document.documentElement.scrollWidth<=document.documentElement.clientWidth+2")
assert evaljs("document.getElementById('dispatchMap').getBoundingClientRect().width>=350")
assert evaljs("document.getElementById('resetBtn').getBoundingClientRect().right<=document.documentElement.clientWidth")
shot('09-mobile.png')

errors = []
for event in events:
    if event.get('method') == 'Runtime.exceptionThrown':
        errors.append(event)
    if event.get('method') == 'Log.entryAdded' and event.get('params', {}).get('entry', {}).get('level') == 'error':
        errors.append(event)
assert not errors, errors

print('BROWSER_E2E=PASS')
print('FREEHAND_SCOPE=PASS')
print('SCHEMA_COMPILES_SELECTION=PASS')
print('OPAQUE_SCOPE_NEGOTIATION=PASS')
print('AGENT_AUTHORED_PLAN_REPAIR=PASS')
print('EXACT_PLAN_AUTHORIZATION=PASS')
print('PROTECTED_ROUTE_NON_INTERFERENCE=PASS')
print('GLOBAL_SINGLE_OWNER_INVARIANT=PASS')
print('PERSISTENT_LIVE_ROUTES=PASS')
print('STALE_REPLAY=REJECTED')
print('CONTRACT_DIFF=PASS')
print('RESPONSIVE_SMOKE=PASS')
print('MOBILE_SMOKE=PASS')
print('PAGE_ERRORS=0')
print('FINAL_LATE_COUNT=', sum(1 for delivery in final['deliveries'] if delivery['status'] == 'late'))
ws.close()
