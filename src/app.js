import { createStore, DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS } from './core.js';
import { createWebMcpBridge } from './webmcp.js';

const store = createStore();
const bridge = createWebMcpBridge(store);
const byId = (id) => document.getElementById(id);
const svg = byId('dispatchMap');

if (!svg) throw new Error('Dispatch map is missing from the document.');

const elements = {
  roads: byId('roads'),
  liveRoutes: byId('liveRoutes'),
  proposalRoutes: byId('proposalRoutes'),
  deliveries: byId('deliveries'),
  drivers: byId('drivers'),
  lassoPath: byId('lassoPath'),
  scopeLink: byId('scopeLink'),
  lateMetric: byId('lateMetric'),
  onTimeMetric: byId('onTimeMetric'),
  mcpStatus: byId('mcpStatus'),
  scopeTitle: byId('scopeTitle'),
  scopeRevision: byId('scopeRevision'),
  scopeCopy: byId('scopeCopy'),
  scopeStats: byId('scopeStats'),
  scopeBadge: byId('scopeBadge'),
  authorityList: byId('authorityList'),
  noOvertimeInput: byId('noOvertimeInput'),
  maxRouteChangesSelect: byId('maxRouteChangesSelect'),
  contractHealth: byId('contractHealth'),
  toolSummary: byId('toolSummary'),
  contractProof: byId('contractProof'),
  contractDiff: byId('contractDiff'),
  toolList: byId('toolList'),
  expansionCard: byId('expansionCard'),
  expansionReason: byId('expansionReason'),
  expansionImpact: byId('expansionImpact'),
  planTitle: byId('planTitle'),
  planStatus: byId('planStatus'),
  planEmpty: byId('planEmpty'),
  planContent: byId('planContent'),
  violations: byId('violations'),
  beforeLate: byId('beforeLate'),
  afterLate: byId('afterLate'),
  routeChanges: byId('routeChanges'),
  extraKm: byId('extraKm'),
  overtime: byId('overtime'),
  assignmentList: byId('assignmentList'),
  authorizeBtn: byId('authorizeBtn'),
  revokeBtn: byId('revokeBtn'),
  timeline: byId('timeline'),
  auditCount: byId('auditCount'),
  toast: byId('toast'),
  stepScope: byId('stepScope'),
  stepAsk: byId('stepAsk'),
  stepReview: byId('stepReview'),
};

const missingElementIds = Object.entries(elements)
  .filter(([, element]) => !element)
  .map(([id]) => id);
if (missingElementIds.length > 0) {
  throw new Error(`Required UI elements are missing: ${missingElementIds.join(', ')}`);
}

const MAX_LASSO_POINTS = 512;

let lassoPoints = [];
let drawing = false;
let persistentLasso = '';
let expandedVisualResourceId = null;
let lastApplyCall = null;
let authorizationTimer = null;
let scheduledAuthorizationExpiry = null;
let bridgeView = {
  tools: [],
  previousTools: [],
  status: bridge.status,
  native: bridge.native,
};

function svgElement(tag, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function setToast(message) {
  elements.toast.textContent = message;
}

function drawRoads() {
  const paths = [
    'M40 145 C250 110 410 160 620 130 S850 90 970 145',
    'M25 310 C210 270 350 350 535 305 S790 250 980 300',
    'M35 490 C220 535 410 450 590 500 S820 560 980 500',
    'M190 20 C225 180 215 350 250 610',
    'M485 5 C460 180 505 340 480 615',
    'M785 10 C760 180 810 350 795 610',
    'M70 220 L930 420',
    'M120 590 L900 70',
    'M100 60 L890 570',
    'M350 20 L720 610',
  ];
  for (const [index, path] of paths.entries()) {
    elements.roads.append(svgElement('path', { d: path, class: index > 5 ? 'small' : '' }));
  }
}

drawRoads();

function routePath(driver, delivery, offset = 0) {
  const middleX = (driver.x + delivery.x) / 2 + offset;
  const middleY = (driver.y + delivery.y) / 2 - 24 - offset / 3;
  return `M ${driver.x} ${driver.y} Q ${middleX} ${middleY} ${delivery.x} ${delivery.y}`;
}

function renderRoutes(state) {
  elements.liveRoutes.replaceChildren();
  elements.proposalRoutes.replaceChildren();

  const appliedPairs = new Set(
    (state.lastAppliedPlan?.assignments ?? [])
      .flatMap((assignment) => assignment.deliveryIds.map((deliveryId) => `${assignment.driverId}:${deliveryId}`)),
  );

  for (const [driverId, deliveryIds] of Object.entries(state.liveAssignments)) {
    const driver = state.drivers.find((candidate) => candidate.id === driverId);
    if (!driver) continue;
    deliveryIds.forEach((deliveryId, index) => {
      const delivery = state.deliveries.find((candidate) => candidate.id === deliveryId);
      if (!delivery) return;
      const applied = appliedPairs.has(`${driverId}:${deliveryId}`);
      elements.liveRoutes.append(svgElement('path', {
        d: routePath(driver, delivery, (index - 1) * 8),
        class: applied ? 'route-line live applied' : 'route-line live',
      }));
    });
  }

  const proposal = state.verifiedPlan;
  if (!proposal) return;
  proposal.assignments.forEach((assignment, assignmentIndex) => {
    const driver = state.drivers.find((candidate) => candidate.id === assignment.driverId);
    if (!driver) return;
    assignment.deliveryIds.forEach((deliveryId, deliveryIndex) => {
      const delivery = state.deliveries.find((candidate) => candidate.id === deliveryId);
      if (!delivery) return;
      elements.proposalRoutes.append(svgElement('path', {
        d: routePath(driver, delivery, (assignmentIndex + deliveryIndex) * 6),
        class: 'route-line proposal',
      }));
    });
  });
}

function lassoCenter() {
  if (lassoPoints.length === 0) return null;
  return lassoPoints.reduce((center, point) => ({
    x: center.x + point.x / lassoPoints.length,
    y: center.y + point.y / lassoPoints.length,
  }), { x: 0, y: 0 });
}

function renderMap(state) {
  renderRoutes(state);
  elements.deliveries.replaceChildren();
  elements.drivers.replaceChildren();

  for (const delivery of state.deliveries) {
    const selected = state.selectedDeliveryIds.has(delivery.id);
    const group = svgElement('g', {
      class: `delivery ${delivery.status === 'late' ? 'late' : ''} ${selected ? 'selected' : ''}`.trim(),
      transform: `translate(${delivery.x} ${delivery.y})`,
      'data-id': delivery.id,
    });
    group.append(svgElement('circle', { class: 'outer', r: 14 }));
    group.append(svgElement('circle', { class: 'core', r: 4 }));
    const label = svgElement('text', { x: 19, y: 4 });
    label.textContent = delivery.id;
    group.append(label);
    elements.deliveries.append(group);
  }

  for (const driver of state.drivers) {
    const selected = state.selectedDriverIds.has(driver.id);
    const requested = state.expansionRequest?.candidate.resourceId === driver.id;
    const group = svgElement('g', {
      class: `driver ${selected ? 'selected' : ''} ${requested ? 'requested' : ''}`.trim(),
      transform: `translate(${driver.x} ${driver.y})`,
      'data-id': driver.id,
    });
    group.append(svgElement('circle', { class: 'halo', r: 20 }));
    group.append(svgElement('rect', { class: 'car', x: -9, y: -5, width: 18, height: 10, rx: 3 }));
    const label = svgElement('text', { x: 25, y: 4 });
    label.textContent = driver.name.toUpperCase();
    group.append(label);
    elements.drivers.append(group);
  }

  elements.lassoPath.setAttribute('d', persistentLasso);

  let linkPath = '';
  const targetId = state.expansionRequest?.candidate.resourceId ?? expandedVisualResourceId;
  const center = lassoCenter();
  if (targetId && center) {
    const driver = state.drivers.find((candidate) => candidate.id === targetId);
    if (driver) {
      linkPath = `M ${center.x} ${center.y} Q ${(center.x + driver.x) / 2} ${(center.y + driver.y) / 2 - 38} ${driver.x} ${driver.y}`;
    }
  }
  elements.scopeLink.setAttribute('d', linkPath);
  elements.scopeLink.setAttribute('class', `scope-link ${state.expansionRequest ? 'requested' : targetId ? 'approved' : ''}`.trim());
}

function auditLabel(item) {
  const labels = {
    scope_changed: 'Human changed scope',
    scope_expansion_requested: 'Agent requested more scope',
    scope_expansion_approved: 'Human expanded scope',
    scope_expansion_rejected: 'Human kept boundary',
    plan_verified: 'Agent plan verified',
    plan_rejected: 'Agent plan rejected',
    exact_plan_authorized: 'Human authorized exact plan',
    authorization_revoked: 'Human revoked authority',
    authorization_expired: 'Execution authority expired',
    plan_applied: 'Agent applied authorized plan',
    workspace_reset: 'Scenario reset',
  };
  return labels[item.type] ?? item.type.replaceAll('_', ' ');
}

function baseCapabilityName(toolName) {
  const match = toolName.match(/^lasso_(.+?)_g\d+_r\d+(?:_e\d+)?_c\d+$/);
  return match?.[1] ?? toolName;
}

function contractSummary(tools) {
  const evaluationTool = tools.find((tool) => tool.name.includes('lasso_evaluate_plan_'));
  const applyTool = tools.find((tool) => tool.name.includes('lasso_apply_plan_'));
  const assignmentProperties = evaluationTool?.inputSchema?.properties?.assignments?.items?.properties;
  const serialMatch = tools[0]?.name.match(/_c(\d+)$/);
  return {
    capabilities: [...new Set(tools.map((tool) => baseCapabilityName(tool.name)))].sort(),
    driverIds: [...(assignmentProperties?.driverId?.enum ?? [])].sort(),
    deliveryIds: [...(assignmentProperties?.deliveryIds?.items?.enum ?? [])].sort(),
    applyPlanIds: [...(applyTool?.inputSchema?.properties?.planId?.enum ?? [])],
    actuationEpochs: [...(applyTool?.inputSchema?.properties?.actuationEpoch?.enum ?? [])],
    contractSerial: serialMatch ? Number(serialMatch[1]) : 0,
  };
}

function setDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function enumChips(values, addedValues = [], removedValues = []) {
  const added = new Set(addedValues);
  const removed = new Set(removedValues);
  const all = [...new Set([...values, ...removedValues])];
  if (all.length === 0) return '<span class="contract-empty">None in this contract.</span>';
  return all.map((value) => {
    const className = added.has(value) ? ' added' : removed.has(value) ? ' removed' : '';
    return `<span class="enum-chip${className}">${escapeHtml(value)}</span>`;
  }).join('');
}

function renderContractProof(state) {
  const current = contractSummary(bridgeView.tools);
  const previous = contractSummary(bridgeView.previousTools);
  const addedDrivers = setDifference(current.driverIds, previous.driverIds);
  const removedDrivers = setDifference(previous.driverIds, current.driverIds);
  const addedDeliveries = setDifference(current.deliveryIds, previous.deliveryIds);
  const removedDeliveries = setDifference(previous.deliveryIds, current.deliveryIds);
  const addedCapabilities = setDifference(current.capabilities, previous.capabilities);
  const removedCapabilities = setDifference(previous.capabilities, current.capabilities);
  const status = bridgeView.status;

  const capabilityDiffRows = [
    ...addedCapabilities.map((capability) => `<div class="capability-row added"><span>+ capability</span><code>${escapeHtml(capability)}</code></div>`),
    ...removedCapabilities.map((capability) => `<div class="capability-row removed"><span>− capability</span><code>${escapeHtml(capability)}</code></div>`),
  ].join('') || '<span class="contract-empty">No capability type changed in the latest recompilation.</span>';

  const degradedMessage = status.health === 'degraded'
    ? `<div class="violation">HOST REGISTRATION DEGRADED · ${escapeHtml(status.error ?? 'Unknown error')}</div>`
    : '';

  elements.contractDiff.innerHTML = `
    <div class="contract-proof-head">
      <strong>CONTRACT G${state.workspaceGeneration} · R${state.scopeRevision} · C${current.contractSerial || status.contractSerial || 0}</strong>
      <span>${status.health === 'ready'
        ? status.mode === 'native' ? 'host confirmed' : 'local bridge active'
        : escapeHtml(status.health)}</span>
    </div>
    ${degradedMessage}
    <div class="contract-section">
      <span>driverId enum</span>
      <div class="enum-list">${enumChips(current.driverIds, addedDrivers, removedDrivers)}</div>
    </div>
    <div class="contract-section">
      <span>deliveryId enum</span>
      <div class="enum-list">${enumChips(current.deliveryIds, addedDeliveries, removedDeliveries)}</div>
    </div>
    <div class="contract-section">
      <span>latest contract diff</span>
      <div class="capability-diff">${capabilityDiffRows}</div>
    </div>
    <div class="contract-section">
      <span>human policy</span>
      <div class="enum-list">
        <span class="enum-chip">${state.constraints.noOvertime ? 'noOvertime: true' : 'noOvertime: false'}</span>
        <span class="enum-chip">maxRouteChanges: ${state.constraints.maxRouteChanges}</span>
      </div>
    </div>
    <div class="contract-section">
      <span>write authority</span>
      <div class="enum-list">${current.applyPlanIds.length > 0
        ? `${enumChips(current.applyPlanIds, current.applyPlanIds)}${current.actuationEpochs.map((epoch) => `<span class="enum-chip added">epoch: ${escapeHtml(epoch)}</span>`).join('')}`
        : '<span class="contract-empty">None. A human must authorize one exact verified plan.</span>'}</div>
    </div>`;

  elements.toolList.innerHTML = bridgeView.tools.map((tool) => `
    <div class="tool ${tool.name.includes('apply_plan') ? 'write' : ''}">
      <i class="tool-dot"></i><code>${escapeHtml(tool.name)}</code>
    </div>`).join('');
}

function renderBridgeStatus(state) {
  const status = bridgeView.status ?? state.webMcpStatus;
  const label = status.health === 'degraded'
    ? 'WebMCP · degraded'
    : status.mode === 'native'
      ? 'WebMCP · native'
      : status.mode === 'local-bridge'
        ? 'WebMCP · local validation'
        : 'WebMCP · detecting';

  elements.mcpStatus.textContent = label;
  elements.mcpStatus.className = `status-pill ${status.health === 'degraded' ? 'degraded' : status.health === 'ready' ? 'ready' : ''}`.trim();
  elements.contractHealth.className = `contract-health ${status.health}`;
  elements.contractHealth.textContent = status.health === 'ready'
    ? status.mode === 'native'
      ? `${status.registeredCount}/${status.desiredCount} tools confirmed by host`
      : `${status.registeredCount}/${status.desiredCount} tools active in local bridge`
    : status.health === 'degraded'
      ? `Fail-closed · ${status.registeredCount}/${status.desiredCount} tools active`
      : status.mode === 'native' ? 'Waiting for host confirmation' : 'Starting local validation bridge';
  elements.toolSummary.textContent = `${state.activeToolNames.length} revision-specific typed tool${state.activeToolNames.length === 1 ? '' : 's'} active`;
}

function setStepState(element, state) {
  element.classList.remove('active', 'done');
  if (state) element.classList.add(state);
}

function renderTaskProgress(state, completeScope) {
  const hasAgentWork = Boolean(state.lastEvaluation || state.verifiedPlan || state.expansionRequest || state.lastAppliedPlan);
  const reviewReached = Boolean(state.expansionRequest || state.verifiedPlan || state.authorization || state.lastAppliedPlan);
  setStepState(elements.stepScope, completeScope ? 'done' : 'active');
  setStepState(elements.stepAsk, !completeScope ? null : hasAgentWork ? 'done' : 'active');
  setStepState(elements.stepReview, reviewReached ? state.lastAppliedPlan ? 'done' : 'active' : null);
}

function scheduleAuthorizationExpiry(authorization) {
  const expiry = authorization?.expiresAt ?? null;
  if (scheduledAuthorizationExpiry === expiry) return;
  if (authorizationTimer !== null) clearTimeout(authorizationTimer);
  authorizationTimer = null;
  scheduledAuthorizationExpiry = expiry;
  if (!expiry) return;

  authorizationTimer = setTimeout(() => {
    authorizationTimer = null;
    scheduledAuthorizationExpiry = null;
    if (store.expireAuthorization()) setToast('Execution authority expired. The single-use apply capability was removed.');
  }, Math.max(0, expiry - Date.now() + 25));
}

function formatDistance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  if (number === 0) return '0.0 km';
  return `${number > 0 ? '+' : '−'}${Math.abs(number).toFixed(1)} km`;
}

function renderUI(state) {
  const late = state.deliveries.filter((delivery) => delivery.status === 'late').length;
  const completeScope = state.selectedDeliveryIds.size > 0 && state.selectedDriverIds.size > 0;
  const anyScope = state.selectedDeliveryIds.size + state.selectedDriverIds.size > 0;

  elements.lateMetric.textContent = String(late);
  elements.onTimeMetric.textContent = `${Math.round(((state.deliveries.length - late) / state.deliveries.length) * 100)}%`;
  elements.scopeRevision.textContent = `G${state.workspaceGeneration} · R${state.scopeRevision}`;
  elements.scopeTitle.textContent = completeScope ? `Scope ${state.scopeRevision}` : anyScope ? 'Incomplete scope' : 'No active scope';
  elements.scopeCopy.textContent = completeScope
    ? 'Detailed state and typed plan actions exist only for resources inside this human-defined boundary. Outside commitments remain aggregate and protected.'
    : 'Draw around the part of the live board the agent may understand in detail. Your gesture becomes its typed capability contract.';
  elements.scopeStats.classList.toggle('empty', !anyScope);
  elements.scopeStats.innerHTML = `<span>${state.selectedDeliveryIds.size} deliveries</span><span>${state.selectedDriverIds.size} drivers</span>`;
  elements.scopeBadge.classList.toggle('hidden', !anyScope);
  elements.scopeBadge.textContent = anyScope
    ? `SCOPE R${state.scopeRevision} · ${state.selectedDeliveryIds.size} deliveries · ${state.selectedDriverIds.size} drivers · ${state.constraints.noOvertime ? 'no overtime' : 'overtime permitted'} · max ${state.constraints.maxRouteChanges} route changes`
    : '';

  elements.noOvertimeInput.checked = state.constraints.noOvertime;
  elements.maxRouteChangesSelect.value = String(state.constraints.maxRouteChanges);

  if (completeScope) {
    const canApply = Boolean(state.authorization);
    elements.authorityList.innerHTML = `
      <div><i></i><span>Inspect detailed state inside scope</span></div>
      <div><i></i><span>Author and validate scoped route patches</span></div>
      <div><i></i><span>Request human scope expansion</span></div>
      <div class="${canApply ? '' : 'blocked'}"><i></i><span>${canApply ? 'Apply one exact verified plan' : 'Cannot mutate live routes'}</span></div>`;
  } else {
    elements.authorityList.innerHTML = `
      <div><i></i><span>Board summary only</span></div>
      <div class="blocked"><i></i><span>No detailed operational access</span></div>
      <div class="blocked"><i></i><span>No live-route mutation</span></div>`;
  }

  renderBridgeStatus(state);
  renderContractProof(state);
  renderTaskProgress(state, completeScope);

  const request = state.expansionRequest;
  elements.expansionCard.classList.toggle('hidden', !request);
  if (request) {
    elements.expansionReason.textContent = request.reason;
    elements.expansionImpact.innerHTML = `<strong>${escapeHtml(request.candidate.name)}</strong> matches opaque opportunity ${escapeHtml(request.opportunityId)}. Human approval will invalidate R${state.scopeRevision}; only the next WebMCP contract may address this resource ID.`;
  }

  const evaluation = state.lastEvaluation ?? state.lastAppliedPlan;
  const showingApplied = !state.lastEvaluation && Boolean(state.lastAppliedPlan);
  elements.planEmpty.classList.toggle('hidden', Boolean(evaluation));
  elements.planContent.classList.toggle('hidden', !evaluation);

  if (!evaluation) {
    elements.planTitle.textContent = 'Waiting for agent';
    elements.planStatus.textContent = 'No plan';
    elements.planStatus.className = 'status-tag neutral';
  } else {
    elements.planTitle.textContent = showingApplied
      ? 'Recovery plan applied'
      : evaluation.valid
        ? 'Verified recovery plan'
        : 'Plan needs repair';
    elements.planStatus.textContent = showingApplied ? 'Applied' : evaluation.valid ? 'Verified' : 'Rejected';
    elements.planStatus.className = `status-tag ${showingApplied || evaluation.valid ? 'good' : 'bad'}`;
    elements.beforeLate.textContent = String(evaluation.beforeLate);
    elements.afterLate.textContent = String(evaluation.afterLate);
    elements.routeChanges.textContent = String(evaluation.routeChanges);
    elements.extraKm.textContent = formatDistance(evaluation.extraKm);
    elements.overtime.textContent = `${evaluation.overtimeMinutes} min`;
    elements.assignmentList.innerHTML = evaluation.assignments.map((assignment) => `
      <div class="assignment"><strong>${escapeHtml(assignment.driverId)}</strong><span>${assignment.deliveryIds.map(escapeHtml).join(' · ')}</span></div>`).join('');
    const violations = showingApplied ? [] : evaluation.violations ?? [];
    elements.violations.classList.toggle('hidden', violations.length === 0);
    elements.violations.innerHTML = violations.slice(0, 6).map((violation) => `
      <div class="violation">${escapeHtml(violation.code)}${violation.deliveryId ? ` · ${escapeHtml(violation.deliveryId)}` : ''}${violation.driverId ? ` · ${escapeHtml(violation.driverId)}` : ''}</div>`).join('');
  }

  elements.authorizeBtn.classList.toggle('hidden', !(state.verifiedPlan && !state.authorization));
  elements.revokeBtn.classList.toggle('hidden', !state.authorization);
  if (state.authorization) {
    elements.authorizeBtn.classList.add('hidden');
    elements.planStatus.textContent = 'Authorized once';
    elements.planStatus.className = 'status-tag good';
  }

  elements.auditCount.textContent = String(state.audit.length);
  elements.timeline.innerHTML = state.audit.length > 0
    ? state.audit.slice(0, 8).map((item) => `
      <div class="timeline-item"><i></i><div><strong>${escapeHtml(auditLabel(item))}</strong><br>${escapeHtml(item.detail?.planId ?? item.detail?.resourceId ?? item.detail?.opportunityId ?? item.detail?.reason ?? '')}</div></div>`).join('')
    : '<div class="empty-state compact">Human and agent actions will appear here.</div>';

  scheduleAuthorizationExpiry(state.authorization);
  renderMap(state);
}

store.subscribe(renderUI);
bridge.subscribe((view) => {
  bridgeView = view;
  renderUI(store.state);
});
await bridge.start();
bridgeView = {
  tools: bridge.tools,
  previousTools: bridge.previousTools,
  status: bridge.status,
  native: bridge.native,
};
renderUI(store.state);

function svgPoint(event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  return matrix ? point.matrixTransform(matrix.inverse()) : { x: event.offsetX, y: event.offsetY };
}

function pathFromPoints(points) {
  if (points.length === 0) return '';
  return `M ${points.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')} Z`;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentX = polygon[index].x;
    const currentY = polygon[index].y;
    const previousX = polygon[previous].x;
    const previousY = polygon[previous].y;
    const intersects = ((currentY > point.y) !== (previousY > point.y))
      && (point.x < ((previousX - currentX) * (point.y - currentY)) / (previousY - currentY + Number.EPSILON) + currentX);
    if (intersects) inside = !inside;
  }
  return inside;
}

svg.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  drawing = true;
  expandedVisualResourceId = null;
  lassoPoints = [svgPoint(event)];
  persistentLasso = pathFromPoints(lassoPoints);
  elements.lassoPath.setAttribute('d', persistentLasso);
  svg.setPointerCapture?.(event.pointerId);
});

svg.addEventListener('pointermove', (event) => {
  if (!drawing) return;
  const point = svgPoint(event);
  const previous = lassoPoints.at(-1);
  if (lassoPoints.length >= MAX_LASSO_POINTS) return;
  if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 5) {
    lassoPoints.push(point);
    persistentLasso = pathFromPoints(lassoPoints);
    elements.lassoPath.setAttribute('d', persistentLasso);
  }
});

svg.addEventListener('pointerup', (event) => {
  if (!drawing) return;
  drawing = false;
  svg.releasePointerCapture?.(event.pointerId);
  if (lassoPoints.length < 3) {
    persistentLasso = '';
    renderMap(store.state);
    return;
  }

  const deliveryIds = store.state.deliveries.filter((delivery) => pointInPolygon(delivery, lassoPoints)).map((delivery) => delivery.id);
  const driverIds = store.state.drivers.filter((driver) => pointInPolygon(driver, lassoPoints)).map((driver) => driver.id);
  store.setSelection(deliveryIds, driverIds, 'freehand_lasso');
  setToast(`Human gesture compiled into contract R${store.state.scopeRevision}: ${deliveryIds.length} deliveries, ${driverIds.length} drivers.`);
});

svg.addEventListener('pointercancel', () => {
  drawing = false;
  lassoPoints = [];
  persistentLasso = '';
  renderMap(store.state);
});

byId('resetBtn').addEventListener('click', () => {
  persistentLasso = '';
  lassoPoints = [];
  expandedVisualResourceId = null;
  lastApplyCall = null;
  store.reset();
  setToast('Fresh workspace generation created. Old capabilities cannot be replayed.');
});

byId('contractToggle').addEventListener('click', (event) => {
  const hidden = elements.contractProof.classList.toggle('hidden');
  event.currentTarget.textContent = hidden ? 'Show technical proof' : 'Hide technical proof';
  event.currentTarget.setAttribute('aria-expanded', String(!hidden));
});

byId('rejectExpansion').addEventListener('click', () => {
  store.rejectExpansion();
  setToast('Human kept the boundary. Agent authority did not change.');
});

byId('approveExpansion').addEventListener('click', () => {
  const request = store.state.expansionRequest;
  if (!request) return;
  const candidateName = request.candidate.name;
  expandedVisualResourceId = request.candidate.resourceId;
  if (store.approveExpansion(request.opportunityId)) {
    setToast(`Human included ${candidateName}. Old contract invalidated; a new revision is being confirmed by the host.`);
  } else {
    expandedVisualResourceId = null;
    setToast('Expansion was rejected because the opportunity was no longer current.');
  }
});

byId('authorizeBtn').addEventListener('click', () => {
  const plan = store.state.verifiedPlan;
  if (plan && store.authorizeExactPlan(plan.planId)) {
    setToast('One exact verified plan authorized. A single-use apply capability is being registered.');
  } else {
    setToast('Authorization failed closed because the plan or live state changed.');
  }
});

byId('revokeBtn').addEventListener('click', () => {
  store.revokeAuthorization();
  setToast('Execution authority revoked. Apply capability removed.');
});

elements.noOvertimeInput.addEventListener('change', (event) => {
  if (store.setConstraint('noOvertime', event.currentTarget.checked)) {
    setToast('Human constraint changed. The previous contract is invalid and a new revision is being compiled.');
  }
});

elements.maxRouteChangesSelect.addEventListener('change', (event) => {
  const value = Number(event.currentTarget.value);
  if (store.setConstraint('maxRouteChanges', value)) {
    setToast('Human route-change limit changed. The previous contract is invalid and a new revision is being compiled.');
  }
});

function findTool(base) {
  return bridge.tools.find((tool) => tool.name.includes(`lasso_${base}_`));
}

async function runTool(base, args) {
  const tool = findTool(base);
  if (!tool) return { status: 'rejected', code: 'TOOL_NOT_EXPOSED' };
  return bridge.executeLocal(tool.name, args);
}

function contractArgs() {
  return {
    workspaceGeneration: store.state.workspaceGeneration,
    scopeRevision: store.state.scopeRevision,
  };
}

function setDemoLasso() {
  lassoPoints = [
    { x: 470, y: 210 },
    { x: 690, y: 205 },
    { x: 785, y: 320 },
    { x: 770, y: 540 },
    { x: 540, y: 545 },
    { x: 470, y: 410 },
  ];
  persistentLasso = pathFromPoints(lassoPoints);
  expandedVisualResourceId = null;
  store.setSelection(DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS, 'demo_freehand_equivalent');
}

const localDevelopmentHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const devMode = localDevelopmentHost && new URLSearchParams(location.search).get('dev') === '1';
const testHarnessMode = window.__LASSO_TEST_HARNESS__ === true;

if (devMode) {
  byId('devTray').classList.remove('hidden');
  byId('devSelect').onclick = () => {
    setDemoLasso();
    setToast('Validation: demo lasso compiled.');
  };
  byId('devInvalid').onclick = async () => {
    const result = await runTool('evaluate_plan', {
      ...contractArgs(),
      assignments: [
        { driverId: 'AINO-02', deliveryIds: ['D04', 'D07', 'D15'] },
        { driverId: 'LEO-05', deliveryIds: ['D09', 'D12'] },
      ],
    });
    setToast(`Agent-authored plan: ${result.status} (${result.violations?.length ?? 0} violations).`);
  };
  byId('devRequest').onclick = async () => {
    const opportunity = store.state.lastEvaluation?.boundaryOpportunities?.find((item) => item.deliveryId === 'D15');
    if (!opportunity) {
      setToast('No validated refrigerated boundary opportunity yet.');
      return;
    }
    const result = await runTool('request_expansion', {
      ...contractArgs(),
      opportunityId: opportunity.opportunityId,
      reason: 'The current scope has no refrigerated driver for D15. Request the compatible boundary opportunity.',
    });
    setToast(result.status === 'awaiting_human' ? 'Agent requested an opaque opportunity; human decision required.' : 'Request failed.');
  };
  byId('devValid').onclick = async () => {
    const result = await runTool('evaluate_plan', {
      ...contractArgs(),
      assignments: [
        { driverId: 'AINO-02', deliveryIds: ['D04', 'D07'] },
        { driverId: 'LEO-05', deliveryIds: ['D09', 'D12'] },
        { driverId: 'MIKA-03', deliveryIds: ['D15'] },
      ],
    });
    setToast(`Repaired agent plan: ${result.status}.`);
  };
  byId('devAuthorize').onclick = () => {
    const plan = store.state.verifiedPlan;
    if (plan) {
      store.authorizeExactPlan(plan.planId);
      setToast('Human authorized exact plan for one actuation epoch.');
    }
  };
  byId('devApply').onclick = async () => {
    const plan = store.state.verifiedPlan;
    const authorization = store.state.authorization;
    const tool = findTool('apply_plan');
    if (!plan || !authorization || !tool) {
      setToast('Verified and authorized plan required.');
      return;
    }
    lastApplyCall = {
      name: tool.name,
      args: {
        ...contractArgs(),
        planId: plan.planId,
        actuationEpoch: authorization.actuationEpoch,
      },
    };
    const result = await bridge.executeLocal(tool.name, lastApplyCall.args);
    setToast(result.status === 'applied' ? 'Authorized scoped patch applied; protected commitments unchanged.' : `Apply rejected: ${result.code}`);
  };
  byId('devReplay').onclick = async () => {
    if (!lastApplyCall) {
      setToast('Apply once before replay test.');
      return;
    }
    const result = await bridge.executeLocal(lastApplyCall.name, lastApplyCall.args);
    setToast(result.code === 'TOOL_NOT_EXPOSED' ? 'Replay rejected: old apply tool no longer exists.' : `Replay result: ${result.code ?? result.status}`);
  };
}

const debugApi = {
  store,
  bridge,
  getState: () => store.snapshot(),
  tools: () => bridge.tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    inputSchema: tool.inputSchema,
    description: tool.description,
    annotations: tool.annotations,
  })),
  previousTools: () => bridge.previousTools.map((tool) => ({ name: tool.name, inputSchema: tool.inputSchema })),
  bridgeStatus: () => bridge.status,
  run: (name, args) => bridge.executeLocal(name, args),
  idle: () => bridge.whenIdle(),
  findTool: (base) => findTool(base)?.name ?? null,
  setDemoLasso,
};
if (devMode || testHarnessMode) {
  Object.defineProperty(window, '__LASSO_V03__', {
    value: Object.freeze(debugApi),
    configurable: true,
  });
}
