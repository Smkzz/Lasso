import { strict as assert } from 'node:assert';
import {
  buildScopedRoutePatch,
  createStore,
  DEMO_DELIVERY_IDS,
  DEMO_DRIVER_IDS,
  evaluatePlan,
  exactSet,
  getProtectedCommitments,
  indexAssignmentOwners,
  seedData,
  validateLiveAssignmentGraph,
} from '../src/core.js';
import { createWebMcpBridge, MockModelContext } from '../src/webmcp.js';

let passed = 0;
const results = [];

async function check(name, test) {
  try {
    await test();
    passed += 1;
    results.push(['PASS', name]);
  } catch (error) {
    results.push(['FAIL', name, error.message]);
    console.error('FAIL', name, error);
    process.exitCode = 1;
  }
}

const contractArgs = (state) => ({
  workspaceGeneration: state.workspaceGeneration,
  scopeRevision: state.scopeRevision,
});
const findTool = (base, bridge) => bridge.tools.find((tool) => tool.name.includes(`lasso_${base}_`));
const demoValidAssignments = [
  { driverId: 'AINO-02', deliveryIds: ['D04', 'D07'] },
  { driverId: 'LEO-05', deliveryIds: ['D09', 'D12'] },
  { driverId: 'MIKA-03', deliveryIds: ['D15'] },
];
const demoInvalidAssignments = [
  { driverId: 'AINO-02', deliveryIds: ['D04', 'D07', 'D15'] },
  { driverId: 'LEO-05', deliveryIds: ['D09', 'D12'] },
];

async function settle(bridge) {
  await bridge.whenIdle();
}

const data = seedData();
await check('seed has 24 deliveries', () => assert.equal(data.deliveries.length, 24));
await check('seed has 5 drivers', () => assert.equal(data.drivers.length, 5));
await check('seed has 6 late deliveries', () => assert.equal(data.deliveries.filter((delivery) => delivery.status === 'late').length, 6));
await check('D15 requires refrigerated capability', () => assert.equal(data.deliveries.find((delivery) => delivery.id === 'D15').requirement, 'refrigerated'));
await check('D18 recovery window is closed', () => assert.equal(data.deliveries.find((delivery) => delivery.id === 'D18').windowClosed, true));
await check('seed live assignment graph is valid', () => assert.deepEqual(validateLiveAssignmentGraph(data), []));
await check('exactSet accepts exact set', () => assert.equal(exactSet(['a', 'b'], new Set(['b', 'a'])), true));
await check('exactSet rejects duplicate replacement', () => assert.equal(exactSet(['a', 'a'], new Set(['a', 'b'])), false));
await check('exactSet rejects omission', () => assert.equal(exactSet(['a'], new Set(['a', 'b'])), false));

const store = createStore();
const bridge = createWebMcpBridge(store, { forceMock: true });
await bridge.start();
await settle(bridge);
await check('initial bridge contract is healthy', () => assert.equal(bridge.status.health, 'ready'));
await check('initial bridge reports confirmed registration count', () => assert.equal(bridge.status.registeredCount, 1));
await check('no scope exposes exactly one coarse tool', () => assert.equal(bridge.tools.length, 1));
await check('coarse tool is generation, revision, and contract versioned', () => assert.match(bridge.tools[0].name, /g1_r1_c\d+$/));
await check('coarse tool uses current WebMCP read-only annotations', () => assert.deepEqual(bridge.tools[0].annotations, {
  readOnlyHint: true,
  untrustedContentHint: false,
  consequentialHint: false,
}));

const coarse = await bridge.executeLocal(bridge.tools[0].name, contractArgs(store.state));
await check('coarse summary reports late count', () => assert.equal(coarse.lateCount, 6));
await check('coarse summary does not leak late delivery IDs', () => assert.equal('lateDeliveries' in coarse, false));
await check('coarse summary says no active scope', () => assert.equal(coarse.activeScope, false));

store.setSelection(['D04'], [], 'test_incomplete');
await settle(bridge);
await check('delivery-only scope does not expose detailed tools', () => assert.equal(bridge.tools.length, 1));

store.setSelection(DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS, 'test_scope');
await settle(bridge);
await check('complete scope exposes inspect tool', () => assert.ok(findTool('inspect_scope', bridge)));
await check('complete scope exposes evaluate tool', () => assert.ok(findTool('evaluate_plan', bridge)));
await check('complete scope has no apply before human authorization', () => assert.equal(Boolean(findTool('apply_plan', bridge)), false));
await check('inspect tool is accurately annotated read-only', () => assert.equal(findTool('inspect_scope', bridge).annotations.readOnlyHint, true));
await check('evaluate tool is accurately annotated state-changing but non-consequential', () => assert.deepEqual(findTool('evaluate_plan', bridge).annotations, {
  readOnlyHint: false,
  untrustedContentHint: false,
  consequentialHint: false,
}));
await check('unsupported legacy annotation fields are absent', () => {
  const serialized = JSON.stringify(bridge.tools.map((tool) => tool.annotations));
  assert.equal(serialized.includes('destructiveHint'), false);
  assert.equal(serialized.includes('idempotentHint'), false);
});

const evaluationTool = findTool('evaluate_plan', bridge);
const assignmentProperties = evaluationTool.inputSchema.properties.assignments.items.properties;
await check('driver schema enum equals human-selected drivers', () => assert.deepEqual([...assignmentProperties.driverId.enum].sort(), [...DEMO_DRIVER_IDS].sort()));
await check('delivery schema enum equals human-selected deliveries', () => assert.deepEqual([...assignmentProperties.deliveryIds.items.enum].sort(), [...DEMO_DELIVERY_IDS].sort()));
await check('evaluate schema rejects extra top-level properties', () => assert.equal(evaluationTool.inputSchema.additionalProperties, false));
await check('assignment schema describes scoped patch semantics', () => assert.match(assignmentProperties.deliveryIds.description, /remain unchanged/i));

const inspect = await bridge.executeLocal(findTool('inspect_scope', bridge).name, contractArgs(store.state));
await check('inspect returns 6 selected deliveries', () => assert.equal(inspect.deliveries.length, 6));
await check('inspect returns 2 selected drivers', () => assert.equal(inspect.drivers.length, 2));
await check('inspect includes travel only for scoped deliveries', () => assert.deepEqual(Object.keys(inspect.drivers[0].travel).sort(), [...DEMO_DELIVERY_IDS].sort()));
await check('inspect advertises scoped patch semantics', () => assert.equal(inspect.semantics.assignmentsAreScopedPatches, true));
await check('inspect states that outside identities are excluded from tool results', () => assert.equal(inspect.semantics.outsideScopeResourceIdentitiesExcludedFromToolResults, true));
await check('inspect excludes outside resource identities from WebMCP results', () => assert.equal(JSON.stringify(inspect.boundarySignals).includes('MIKA-03'), false));

const cancellationController = new AbortController();
cancellationController.abort();
const auditBeforeCancelledEvaluation = store.state.audit.length;
await check('cancelled evaluation rejects with AbortError before changing shared state', async () => {
  await assert.rejects(
    evaluationTool.execute({
      ...contractArgs(store.state),
      assignments: demoInvalidAssignments,
    }, { signal: cancellationController.signal }),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(store.state.audit.length, auditBeforeCancelledEvaluation);
  assert.equal(store.state.lastEvaluation, null);
});

const previousNames = bridge.tools.map((tool) => tool.name);
const invalid = await bridge.executeLocal(evaluationTool.name, {
  ...contractArgs(store.state),
  assignments: demoInvalidAssignments,
});
await settle(bridge);
await check('agent-authored invalid plan is rejected', () => assert.equal(invalid.status, 'invalid'));
await check('invalid plan catches missing vehicle capability', () => assert.ok(invalid.violations.some((violation) => violation.code === 'VEHICLE_CAPABILITY_MISSING')));
await check('invalid plan catches protected capacity', () => assert.ok(invalid.violations.some((violation) => violation.code === 'DRIVER_CAPACITY_EXCEEDED')));
await check('invalid plan catches forbidden overtime', () => assert.ok(invalid.violations.some((violation) => violation.code === 'OVERTIME_FORBIDDEN')));
await check('invalid plan is not stored as verified', () => assert.equal(store.state.verifiedPlan, null));
await check('invalid plan identifies an opaque boundary opportunity', () => assert.ok(invalid.boundaryOpportunities.some((opportunity) => opportunity.deliveryId === 'D15')));
await check('boundary opportunity does not reveal resource identity', () => {
  const serialized = JSON.stringify(invalid.boundaryOpportunities);
  assert.equal(serialized.includes('MIKA-03'), false);
  assert.equal(serialized.includes('Mika'), false);
});
await check('boundary opportunity exposes request tool', () => assert.ok(findTool('request_expansion', bridge)));
await check('tool surface change never reuses previous native names', () => assert.equal(bridge.tools.some((tool) => previousNames.includes(tool.name)), false));

const opportunity = invalid.boundaryOpportunities.find((item) => item.deliveryId === 'D15');
const requestTool = findTool('request_expansion', bridge);
await check('request schema accepts only opaque opportunity IDs', () => {
  const property = requestTool.inputSchema.properties.opportunityId;
  assert.ok(property.enum.includes(opportunity.opportunityId));
  assert.equal('resourceId' in requestTool.inputSchema.properties, false);
});
await check('scope expansion request is correctly annotated as state-changing', () => assert.deepEqual(requestTool.annotations, {
  readOnlyHint: false,
  untrustedContentHint: false,
  consequentialHint: false,
}));
const shortReason = await bridge.executeLocal(requestTool.name, {
  ...contractArgs(store.state),
  opportunityId: opportunity.opportunityId,
  reason: 'short',
});
await check('runtime rejects too-short expansion reason if schema validation is bypassed', () => assert.equal(shortReason.code, 'INVALID_EXPANSION_REASON'));
await check('invalid expansion reason does not create human request', () => assert.equal(store.state.expansionRequest, null));

const request = await bridge.executeLocal(requestTool.name, {
  ...contractArgs(store.state),
  opportunityId: opportunity.opportunityId,
  reason: 'Need compatible refrigerated capacity for D15 outside the current boundary.',
});
await settle(bridge);
await check('agent expansion request awaits human', () => assert.equal(request.status, 'awaiting_human'));
await check('agent request does not expand authority', () => assert.equal(store.state.selectedDriverIds.has('MIKA-03'), false));
await check('tool response does not reveal candidate identity', () => assert.equal(JSON.stringify(request).includes('MIKA-03'), false));
await check('human UI state resolves the opaque opportunity to Mika', () => assert.equal(store.state.expansionRequest.candidate.resourceId, 'MIKA-03'));

const oldRevision = store.state.scopeRevision;
const oldRequestName = requestTool.name;
await check('human cannot approve a different opportunity', () => assert.equal(store.approveExpansion('op-not-current'), false));
await check('human can approve the pending opportunity', () => assert.equal(store.approveExpansion(opportunity.opportunityId), true));
await settle(bridge);
await check('human expansion increments scope revision', () => assert.equal(store.state.scopeRevision, oldRevision + 1));
await check('human expansion adds Mika to scope', () => assert.equal(store.state.selectedDriverIds.has('MIKA-03'), true));
await check('old expansion tool is no longer exposed', () => assert.equal(bridge.tools.some((tool) => tool.name === oldRequestName), false));
await check('new plan schema contains Mika', () => assert.ok(findTool('evaluate_plan', bridge).inputSchema.properties.assignments.items.properties.driverId.enum.includes('MIKA-03')));

const valid = await bridge.executeLocal(findTool('evaluate_plan', bridge).name, {
  ...contractArgs(store.state),
  assignments: demoValidAssignments,
});
await settle(bridge);
await check('repaired agent-authored plan verifies', () => assert.equal(valid.status, 'verified'));
await check('verified plan leaves exactly one selected delivery late', () => assert.equal(valid.afterLate, 1));
await check('verified plan leaves D18 late', () => assert.deepEqual(valid.stillLateIds, ['D18']));
await check('verified plan rescues D15', () => assert.ok(valid.rescuedDeliveryIds.includes('D15')));
await check('route-change metric counts actual changed driver routes', () => assert.deepEqual(valid.changedDriverIds, ['AINO-02', 'LEO-05', 'MIKA-03']));
await check('verified plan uses exactly 3 changed driver routes', () => assert.equal(valid.routeChanges, 3));
await check('verified plan reports net added distance', () => assert.equal(valid.extraKm, 4));
await check('verified plan produces zero overtime', () => assert.equal(valid.overtimeMinutes, 0));
await check('verified plan is stored for human review', () => assert.equal(store.state.verifiedPlan.planId, valid.planId));
await check('verified plan still exposes no apply before authorization', () => assert.equal(Boolean(findTool('apply_plan', bridge)), false));

await check('human can authorize exact verified plan', () => assert.equal(store.authorizeExactPlan(valid.planId), true));
await settle(bridge);
await check('authorization has five-minute expiry', () => assert.equal(store.state.authorization.expiresAt - store.state.authorization.authorizedAt, 300_000));
await check('authorization exposes single-use apply tool', () => assert.ok(findTool('apply_plan', bridge)));
await check('apply tool carries the current WebMCP consequential annotation', () => assert.deepEqual(findTool('apply_plan', bridge).annotations, {
  readOnlyHint: false,
  untrustedContentHint: false,
  consequentialHint: true,
}));

const applyTool = findTool('apply_plan', bridge);
const applyArgs = {
  ...contractArgs(store.state),
  planId: valid.planId,
  actuationEpoch: store.state.authorization.actuationEpoch,
};
const protectedBeforeMain = {
  Sara: [...store.state.liveAssignments['SARA-01']],
  Oskari: [...store.state.liveAssignments['OSKARI-04']],
  Mika: [...store.state.liveAssignments['MIKA-03']],
};
const applied = await bridge.executeLocal(applyTool.name, applyArgs);
await settle(bridge);
await check('authorized exact plan applies', () => assert.equal(applied.status, 'applied'));
await check('apply reports protected commitments unchanged', () => assert.equal(applied.protectedCommitmentsChanged, false));
await check('D15 becomes on-time after apply', () => assert.equal(store.state.deliveries.find((delivery) => delivery.id === 'D15').status, 'on-time'));
await check('D18 remains late after apply', () => assert.equal(store.state.deliveries.find((delivery) => delivery.id === 'D18').status, 'late'));
await check('Aino keeps D04 and receives D07', () => assert.deepEqual(store.state.liveAssignments['AINO-02'], ['D04', 'D07']));
await check('Leo keeps D12 and receives D09', () => assert.deepEqual(store.state.liveAssignments['LEO-05'], ['D09', 'D12']));
await check('Mika keeps protected D06 and receives D15', () => assert.deepEqual(store.state.liveAssignments['MIKA-03'], ['D06', 'D15']));
await check('unselected Sara route remains bit-for-bit unchanged', () => assert.deepEqual(store.state.liveAssignments['SARA-01'], protectedBeforeMain.Sara));
await check('unselected Oskari route remains bit-for-bit unchanged', () => assert.deepEqual(store.state.liveAssignments['OSKARI-04'], protectedBeforeMain.Oskari));
await check('successful apply preserves global single-owner invariant', () => assert.deepEqual(validateLiveAssignmentGraph(store.state), []));
await check('successful apply invalidates old scope', () => assert.notEqual(store.state.scopeRevision, applyArgs.scopeRevision));
await check('successful apply removes authorization', () => assert.equal(store.state.authorization, null));
await check('successful apply removes old apply capability', () => assert.equal(bridge.tools.some((tool) => tool.name === applyTool.name), false));

const replay = await bridge.executeLocal(applyTool.name, applyArgs);
await check('stale apply replay is rejected because tool no longer exists', () => assert.equal(replay.code, 'TOOL_NOT_EXPOSED'));
await check('direct second apply is rejected without authorization', () => assert.equal(store.applyVerifiedPlan(valid.planId, applyArgs.actuationEpoch).code, 'NO_EXACT_AUTHORIZATION'));

// Regression: a patch over D07 must retain Aino's outside-scope D04 commitment.
const partialStore = createStore();
partialStore.setSelection(['D07'], ['AINO-02'], 'partial_scope');
const protectedCommitments = getProtectedCommitments(partialStore.state, 'AINO-02');
await check('partial scope reports one protected commitment', () => assert.deepEqual(protectedCommitments, { deliveryCount: 1, loadUnits: 1, reservedMinutes: 6 }));
const partialPlan = evaluatePlan(partialStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D07'] }]);
await check('partial scoped patch is valid with protected capacity included', () => assert.equal(partialPlan.status, 'verified'));
partialStore.setEvaluation(partialPlan);
partialStore.authorizeExactPlan(partialPlan.planId);
const partialApply = partialStore.applyVerifiedPlan(partialPlan.planId, partialStore.state.authorization.actuationEpoch);
await check('partial scoped patch applies', () => assert.equal(partialApply.status, 'applied'));
await check('partial patch retains D04 and adds D07', () => assert.deepEqual(partialStore.state.liveAssignments['AINO-02'], ['D04', 'D07']));
await check('partial patch does not create duplicate owners', () => assert.deepEqual(validateLiveAssignmentGraph(partialStore.state), []));

// Regression: moving D04 between two in-scope drivers must remove its old owner and preserve Leo's protected D12.
const transferStore = createStore();
transferStore.setSelection(['D04'], ['AINO-02', 'LEO-05'], 'transfer_scope');
const transferPlan = evaluatePlan(transferStore.state, [{ driverId: 'LEO-05', deliveryIds: ['D04'] }]);
await check('in-scope transfer verifies', () => assert.equal(transferPlan.status, 'verified'));
transferStore.setEvaluation(transferPlan);
transferStore.authorizeExactPlan(transferPlan.planId);
const transferApply = transferStore.applyVerifiedPlan(transferPlan.planId, transferStore.state.authorization.actuationEpoch);
await check('in-scope transfer applies', () => assert.equal(transferApply.status, 'applied'));
await check('old owner no longer contains transferred D04', () => assert.deepEqual(transferStore.state.liveAssignments['AINO-02'], []));
await check('new owner preserves D12 and gains D04', () => assert.deepEqual(transferStore.state.liveAssignments['LEO-05'], ['D12', 'D04']));
await check('transferred delivery has exactly one owner', () => assert.equal(indexAssignmentOwners(transferStore.state.liveAssignments).owners.get('D04'), 'LEO-05'));
await check('transfer graph remains globally valid', () => assert.deepEqual(validateLiveAssignmentGraph(transferStore.state), []));

const ownerOutsideStore = createStore();
ownerOutsideStore.setSelection(['D04'], ['LEO-05'], 'owner_outside_scope');
const ownerOutside = evaluatePlan(ownerOutsideStore.state, [{ driverId: 'LEO-05', deliveryIds: ['D04'] }]);
await check('plan rejects changing a delivery whose current owner is outside driver scope', () => assert.ok(ownerOutside.violations.some((violation) => violation.code === 'CURRENT_OWNER_OUT_OF_SCOPE')));
const ownerOutsidePatch = buildScopedRoutePatch(ownerOutsideStore.state, ownerOutside.assignments);
await check('patch builder independently rejects an owner outside driver scope', () => assert.ok(ownerOutsidePatch.violations.some((violation) => violation.code === 'CURRENT_OWNER_OUT_OF_SCOPE')));
await check('rejected owner-outside patch leaves routes unchanged', () => assert.deepEqual(ownerOutsidePatch.nextAssignments, ownerOutsidePatch.before));
await check('rejected owner-outside patch never creates a duplicate owner', () => assert.deepEqual(validateLiveAssignmentGraph(ownerOutsideStore.state, ownerOutsidePatch.nextAssignments), []));

const protectedInspectStore = createStore();
const protectedInspectBridge = createWebMcpBridge(protectedInspectStore, { forceMock: true });
await protectedInspectBridge.start();
protectedInspectStore.setSelection(['D07'], ['AINO-02'], 'protected_inspect');
await settle(protectedInspectBridge);
const protectedInspect = await protectedInspectBridge.executeLocal(findTool('inspect_scope', protectedInspectBridge).name, contractArgs(protectedInspectStore.state));
await check('inspect includes aggregate protected commitments', () => assert.deepEqual(protectedInspect.drivers[0].protectedCommitments, { deliveryCount: 1, loadUnits: 1, reservedMinutes: 6 }));
await check('inspect does not disclose protected D04 identity', () => assert.equal(JSON.stringify(protectedInspect.drivers[0]).includes('D04'), false));
protectedInspectBridge.destroy();

const bypassStore = createStore();
bypassStore.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03']);
await check('runtime rejects duplicate driver assignment', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D04'] }, { driverId: 'AINO-02', deliveryIds: ['D07'] }]).violations.some((violation) => violation.code === 'DUPLICATE_DRIVER_ASSIGNMENT')));
await check('runtime rejects duplicate delivery within assignment', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D04', 'D04'] }]).violations.some((violation) => violation.code === 'DUPLICATE_DELIVERY_IN_ASSIGNMENT')));
await check('runtime rejects empty plan when schema is bypassed', () => assert.ok(evaluatePlan(bypassStore.state, []).violations.some((violation) => violation.code === 'EMPTY_PLAN')));
await check('runtime rejects malformed non-array plan', () => assert.ok(evaluatePlan(bypassStore.state, {}).violations.some((violation) => violation.code === 'MALFORMED_PLAN')));
await check('runtime rejects out-of-scope driver', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'SARA-01', deliveryIds: ['D04'] }]).violations.some((violation) => violation.code === 'DRIVER_OUT_OF_SCOPE')));
await check('runtime rejects out-of-scope delivery', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D01'] }]).violations.some((violation) => violation.code === 'DELIVERY_OUT_OF_SCOPE')));
await check('runtime rejects assigning closed-window D18', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'LEO-05', deliveryIds: ['D18'] }]).violations.some((violation) => violation.code === 'DELIVERY_WINDOW_CLOSED')));

const oversizedPlan = Array.from({ length: 17 }, () => ({ driverId: 'AINO-02', deliveryIds: ['D04'] }));
await check('runtime bounds excessive assignment counts', () => assert.ok(evaluatePlan(bypassStore.state, oversizedPlan).violations.some((violation) => violation.code === 'PLAN_TOO_LARGE')));
const oversizedAssignment = [{ driverId: 'AINO-02', deliveryIds: Array.from({ length: 25 }, (_, index) => `D${String((index % 24) + 1).padStart(2, '0')}`) }];
await check('runtime bounds deliveries per assignment', () => assert.ok(evaluatePlan(bypassStore.state, oversizedAssignment).violations.some((violation) => violation.code === 'ASSIGNMENT_TOO_LARGE')));
const excessiveReferences = Array.from({ length: 5 }, (_, driverIndex) => ({
  driverId: ['AINO-02', 'LEO-05', 'MIKA-03', 'SARA-01', 'OSKARI-04'][driverIndex],
  deliveryIds: Array.from({ length: 24 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
}));
await check('runtime bounds total delivery references', () => assert.ok(evaluatePlan(bypassStore.state, excessiveReferences).violations.some((violation) => violation.code === 'PLAN_DELIVERY_LIMIT_EXCEEDED')));
await check('runtime rejects unexpected assignment properties', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D04'], injected: true }]).violations.some((violation) => violation.code === 'UNEXPECTED_ASSIGNMENT_PROPERTY')));
await check('runtime rejects overlong identifiers', () => assert.ok(evaluatePlan(bypassStore.state, [{ driverId: 'A'.repeat(65), deliveryIds: ['D04'] }]).violations.some((violation) => violation.code === 'MALFORMED_DRIVER_ID')));

const guardStore = createStore();
const guardBridge = createWebMcpBridge(guardStore, { forceMock: true });
await guardBridge.start();
guardStore.setSelection(DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS, 'guard_scope');
await settle(guardBridge);
const guardTool = findTool('evaluate_plan', guardBridge);
await check('tool runtime rejects unexpected top-level arguments', async () => {
  const result = await guardBridge.executeLocal(guardTool.name, {
    ...contractArgs(guardStore.state),
    assignments: demoInvalidAssignments,
    injected: true,
  });
  assert.equal(result.code, 'UNEXPECTED_TOOL_ARGUMENT');
});
await check('tool runtime rejects non-integer contract revisions', async () => {
  const result = await guardBridge.executeLocal(guardTool.name, {
    workspaceGeneration: String(guardStore.state.workspaceGeneration),
    scopeRevision: guardStore.state.scopeRevision,
    assignments: demoInvalidAssignments,
  });
  assert.equal(result.code, 'INVALID_CONTRACT_REVISION');
});
await check('tool runtime rejects malformed argument envelopes', async () => {
  const result = await guardTool.execute(null);
  assert.equal(result.code, 'MALFORMED_TOOL_ARGUMENTS');
});
guardBridge.destroy();

const noEffectStore = createStore();
noEffectStore.setSelection(['D04'], ['AINO-02'], 'no_effect_scope');
const noEffect = evaluatePlan(noEffectStore.state, [{ driverId: 'AINO-02', deliveryIds: ['D04'] }]);
await check('runtime rejects a plan that leaves every selected live route unchanged', () => assert.ok(noEffect.violations.some((violation) => violation.code === 'NO_EFFECT_PLAN')));
await check('no-effect plan cannot become verified', () => assert.equal(noEffect.valid, false));

const tooManyChanges = evaluatePlan(bypassStore.state, [
  { driverId: 'AINO-02', deliveryIds: ['D07'] },
  { driverId: 'LEO-05', deliveryIds: ['D09'] },
  { driverId: 'MIKA-03', deliveryIds: ['D15'] },
]);
await check('three changed routes satisfy default change limit', () => assert.equal(tooManyChanges.violations.some((violation) => violation.code === 'TOO_MANY_ROUTE_CHANGES'), false));
bypassStore.setConstraint('maxRouteChanges', 2);
const limited = evaluatePlan(bypassStore.state, tooManyChanges.assignments);
await check('runtime enforces human changed-route limit', () => assert.ok(limited.violations.some((violation) => violation.code === 'TOO_MANY_ROUTE_CHANGES')));

const overtimeStore = createStore();
overtimeStore.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03']);
const overtimeOn = evaluatePlan(overtimeStore.state, [{ driverId: 'LEO-05', deliveryIds: ['D04', 'D09'] }]);
await check('no-overtime policy catches otherwise feasible overtime plan', () => assert.ok(overtimeOn.violations.some((violation) => violation.code === 'OVERTIME_FORBIDDEN')));
const revisionBeforePolicyChange = overtimeStore.state.scopeRevision;
await check('valid no-overtime policy change is accepted', () => assert.equal(overtimeStore.setConstraint('noOvertime', false), true));
const overtimeOff = evaluatePlan(overtimeStore.state, [{ driverId: 'LEO-05', deliveryIds: ['D04', 'D09'] }]);
await check('turning off no-overtime removes that policy violation', () => assert.equal(overtimeOff.violations.some((violation) => violation.code === 'OVERTIME_FORBIDDEN'), false));
await check('constraint change increments scope revision', () => assert.equal(overtimeStore.state.scopeRevision, revisionBeforePolicyChange + 1));
const revisionBeforeInvalidPolicy = overtimeStore.state.scopeRevision;
await check('unknown constraint key is rejected', () => assert.equal(overtimeStore.setConstraint('__proto__', {}), false));
await check('out-of-range change limit is rejected', () => assert.equal(overtimeStore.setConstraint('maxRouteChanges', 99), false));
await check('rejected constraints do not change revision', () => assert.equal(overtimeStore.state.scopeRevision, revisionBeforeInvalidPolicy));

const stateChangeStore = createStore();
stateChangeStore.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03']);
const stateChangePlan = evaluatePlan(stateChangeStore.state, demoValidAssignments);
stateChangeStore.setEvaluation(stateChangePlan);
stateChangeStore.authorizeExactPlan(stateChangePlan.planId);
stateChangeStore.state.liveAssignments['SARA-01'].push('D03');
await check('exact authorization rejects any intervening live-state change', () => assert.equal(stateChangeStore.applyVerifiedPlan(stateChangePlan.planId, stateChangeStore.state.authorization.actuationEpoch).code, 'AUTHORIZED_STATE_CHANGED'));

const expiryStore = createStore();
expiryStore.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03']);
const expiryPlan = evaluatePlan(expiryStore.state, demoValidAssignments);
expiryStore.setEvaluation(expiryPlan);
expiryStore.authorizeExactPlan(expiryPlan.planId);
expiryStore.state.authorization.expiresAt = Date.now() - 1;
await check('expired exact authorization fails closed at apply', () => assert.equal(expiryStore.applyVerifiedPlan(expiryPlan.planId, expiryStore.state.authorization.actuationEpoch).code, 'AUTHORIZATION_EXPIRED'));
await check('expiry cleanup removes expired authority', () => assert.equal(expiryStore.expireAuthorization(), true));
await check('expiry cleanup clears authorization', () => assert.equal(expiryStore.state.authorization, null));

const resetStore = createStore();
const oldGeneration = resetStore.state.workspaceGeneration;
resetStore.reset();
await check('workspace reset increments generation', () => assert.equal(resetStore.state.workspaceGeneration, oldGeneration + 1));
await check('workspace reset clears detailed scope', () => assert.equal(resetStore.state.selectedDriverIds.size, 0));

class TrackingContext extends MockModelContext {
  constructor(log, failPredicate = () => false) {
    super();
    this.log = log;
    this.failPredicate = failPredicate;
  }

  async registerTool(tool, options = {}) {
    this.log.push(`register:${tool.name}`);
    if (this.failPredicate(tool)) throw new Error('Synthetic registration failure');
    options.signal?.addEventListener('abort', () => this.log.push(`abort:${tool.name}`), { once: true });
    return super.registerTool(tool, options);
  }
}

const barrierLog = [];
const barrierStore = createStore();
const barrierContext = new TrackingContext(barrierLog);
const barrierBridge = createWebMcpBridge(barrierStore, { modelContext: barrierContext });
await barrierBridge.start();
barrierStore.setSelection(DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS, 'barrier_scope');
await settle(barrierBridge);
barrierLog.length = 0;
const barrierEvaluationTool = findTool('evaluate_plan', barrierBridge);
const barrierResultPromise = barrierBridge.executeLocal(barrierEvaluationTool.name, {
  ...contractArgs(barrierStore.state),
  assignments: demoInvalidAssignments,
}).then((result) => {
  barrierLog.push('caller-resolved');
  return result;
});
const barrierResult = await barrierResultPromise;
await check('barrier test plan completes normally', () => assert.equal(barrierResult.status, 'invalid'));
await check('old contract is not aborted before caller receives tool result', () => assert.equal(barrierLog.some((entry) => entry.startsWith('abort:')), false));
await settle(barrierBridge);
await check('old contract is eventually unregistered after result settles', () => assert.ok(barrierLog.some((entry) => entry.startsWith('abort:'))));
await check('caller resolves before old contract abort', () => assert.ok(barrierLog.indexOf('caller-resolved') < barrierLog.findIndex((entry) => entry.startsWith('abort:'))));
barrierBridge.destroy();

const failureLog = [];
const failureStore = createStore();
const failureContext = new TrackingContext(failureLog, (tool) => tool.name.includes('lasso_apply_plan_'));
const failureBridge = createWebMcpBridge(failureStore, { modelContext: failureContext });
await failureBridge.start();
failureStore.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03'], 'failure_scope');
await settle(failureBridge);
const failurePlan = await failureBridge.executeLocal(findTool('evaluate_plan', failureBridge).name, {
  ...contractArgs(failureStore.state),
  assignments: demoValidAssignments,
});
await settle(failureBridge);
failureStore.authorizeExactPlan(failurePlan.planId);
await settle(failureBridge);
await check('partial host registration failure marks contract degraded', () => assert.equal(failureBridge.status.health, 'degraded'));
await check('failed apply registration never appears active', () => assert.equal(Boolean(findTool('apply_plan', failureBridge)), false));
await check('degraded registration fails closed with zero active tools', () => assert.equal(failureBridge.tools.length, 0));
await check('degraded bridge reports zero confirmed registrations', () => assert.equal(failureBridge.status.registeredCount, 0));
await check('store exposes degraded host status to human UI', () => assert.equal(failureStore.state.webMcpStatus.health, 'degraded'));
await check('store exposes no active tool names after degraded registration', () => assert.deepEqual(failureStore.state.activeToolNames, []));
await check('native host mock has retired the prior contract after failure', async () => assert.equal((await failureContext.getTools()).length, 0));
const failedAttemptNames = failureLog.filter((entry) => entry.startsWith('register:')).map((entry) => entry.slice('register:'.length));
failureStore.revokeAuthorization();
await settle(failureBridge);
await check('bridge recovers after desired contract no longer contains failing capability', () => assert.equal(failureBridge.status.health, 'ready'));
await check('recovery never reuses names from the failed registration attempt', () => assert.equal(failureBridge.tools.some((tool) => failedAttemptNames.includes(tool.name)), false));
failureBridge.destroy();

const churnStore = createStore();
const churnContext = new MockModelContext();
const churnBridge = createWebMcpBridge(churnStore, { modelContext: churnContext });
await churnBridge.start();
churnStore.setSelection(DEMO_DELIVERY_IDS, DEMO_DRIVER_IDS, 'churn_scope');
await settle(churnBridge);
const churnNames = new Set(churnBridge.tools.map((tool) => tool.name));
let churnReusedName = false;
for (let index = 0; index < 12; index += 1) {
  churnStore.setConstraint('noOvertime', index % 2 === 0 ? false : true);
  await settle(churnBridge);
  for (const tool of churnBridge.tools) {
    if (churnNames.has(tool.name)) churnReusedName = true;
    churnNames.add(tool.name);
  }
}
await check('contract churn never reuses an active tool identity', () => assert.equal(churnReusedName, false));
const hostToolsAfterChurn = await churnContext.getTools();
await check('contract churn leaves only the current host surface', () => assert.deepEqual(
  hostToolsAfterChurn.map((tool) => tool.name).sort(),
  churnBridge.tools.map((tool) => tool.name).sort(),
));
await check('contract churn stays healthy', () => assert.equal(churnBridge.status.health, 'ready'));
await check('contract churn keeps the active surface bounded', () => assert.ok(hostToolsAfterChurn.length <= 4));
churnBridge.destroy();

bridge.destroy();

const outcome = passed === results.length ? 'PASS' : 'FAIL';
console.log(`\nCORE_INVARIANTS=${passed}/${results.length} ${outcome}`);
for (const result of results) console.log(result.join(' | '));
if (outcome === 'FAIL') process.exit(1);
