export const DEMO_DELIVERY_IDS = Object.freeze(['D04', 'D07', 'D09', 'D12', 'D15', 'D18']);
export const DEMO_DRIVER_IDS = Object.freeze(['AINO-02', 'LEO-05']);

export const DEFAULT_CONSTRAINTS = Object.freeze({
  noOvertime: true,
  maxRouteChanges: 3,
});

const AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const MAX_AUDIT_ITEMS = 80;
const MAX_ROUTE_CHANGES = 5;
const MAX_PLAN_ASSIGNMENTS = 16;
const MAX_DELIVERIES_PER_ASSIGNMENT = 24;
const MAX_TOTAL_PLAN_DELIVERIES = 96;
const MAX_IDENTIFIER_LENGTH = 64;
const INVALID_DELIVERY_CODES = new Set([
  'VEHICLE_CAPABILITY_MISSING',
  'DELIVERY_WINDOW_CLOSED',
  'DELIVERY_OUT_OF_SCOPE',
  'DUPLICATE_DELIVERY_ASSIGNMENT',
  'CURRENT_OWNER_OUT_OF_SCOPE',
]);
const INVALID_DRIVER_CODES = new Set([
  'DRIVER_CAPACITY_EXCEEDED',
  'OVERTIME_FORBIDDEN',
  'DRIVER_OUT_OF_SCOPE',
]);

export function seedData() {
  const deliveries = [
    ['D01', 170, 120, 'Arcade', '16:45', 'on-time', 'standard', 1],
    ['D02', 275, 150, 'Kallio Labs', '16:40', 'on-time', 'standard', 1],
    ['D03', 360, 115, 'Northstar', '16:30', 'on-time', 'standard', 1],
    ['D04', 585, 245, 'Onda', '16:05', 'late', 'standard', 1],
    ['D05', 460, 195, 'Kite', '16:50', 'on-time', 'standard', 1],
    ['D06', 790, 140, 'Morrow', '17:00', 'on-time', 'standard', 1],
    ['D07', 655, 300, 'Juno', '16:08', 'late', 'standard', 1],
    ['D08', 405, 290, 'Vela', '16:55', 'on-time', 'standard', 1],
    ['D09', 735, 340, 'Ember', '16:12', 'late', 'standard', 1],
    ['D10', 245, 330, 'Pine', '16:45', 'on-time', 'standard', 1],
    ['D11', 330, 390, 'Atlas', '17:05', 'on-time', 'standard', 1],
    ['D12', 575, 385, 'North Dock', '16:15', 'late', 'standard', 1],
    ['D13', 855, 300, 'Meri', '16:55', 'on-time', 'standard', 1],
    ['D14', 455, 455, 'Keel', '16:50', 'on-time', 'standard', 1],
    ['D15', 735, 455, 'Sisu Cold', '16:18', 'late', 'refrigerated', 2],
    ['D16', 175, 500, 'Nova', '17:10', 'on-time', 'standard', 1],
    ['D17', 335, 525, 'Fold', '17:00', 'on-time', 'standard', 1],
    ['D18', 620, 505, 'Ranta Critical', '16:02', 'late', 'standard', 1],
    ['D19', 825, 520, 'Bloom', '17:20', 'on-time', 'standard', 1],
    ['D20', 505, 565, 'Coda', '17:05', 'on-time', 'standard', 1],
    ['D21', 100, 280, 'Mint', '16:50', 'on-time', 'standard', 1],
    ['D22', 900, 210, 'Mast', '17:15', 'on-time', 'standard', 1],
    ['D23', 265, 575, 'Loop', '17:25', 'on-time', 'standard', 1],
    ['D24', 885, 420, 'Helix', '17:10', 'on-time', 'standard', 1],
  ].map(([id, x, y, customer, deadline, status, requirement, loadUnits]) => ({
    id,
    x,
    y,
    customer,
    deadline,
    status,
    requirement,
    loadUnits,
    serviceMinutes: requirement === 'refrigerated' ? 5 : 4,
    priority: id === 'D18' ? 'critical' : status === 'late' ? 'high' : 'normal',
    windowClosed: id === 'D18',
  }));

  const drivers = [
    { id: 'SARA-01', name: 'Sara', x: 225, y: 210, capacityUnits: 3, availableMinutes: 26, capabilities: ['standard'] },
    { id: 'AINO-02', name: 'Aino', x: 535, y: 305, capacityUnits: 2, availableMinutes: 24, capabilities: ['standard'] },
    { id: 'MIKA-03', name: 'Mika', x: 790, y: 230, capacityUnits: 3, availableMinutes: 25, capabilities: ['standard', 'refrigerated'] },
    { id: 'OSKARI-04', name: 'Oskari', x: 300, y: 480, capacityUnits: 4, availableMinutes: 18, capabilities: ['standard'] },
    { id: 'LEO-05', name: 'Leo', x: 510, y: 445, capacityUnits: 2, availableMinutes: 23, capabilities: ['standard'] },
  ];

  const travel = {
    'AINO-02': { D04: [6, 1.0], D07: [9, 1.5], D09: [16, 2.8], D12: [8, 1.2], D15: [18, 3.1], D18: [21, 3.6] },
    'LEO-05': { D04: [15, 2.6], D07: [14, 2.4], D09: [9, 1.6], D12: [6, 1.0], D15: [13, 2.2], D18: [8, 1.4] },
    'MIKA-03': { D04: [11, 1.9], D06: [4, 0.7], D07: [8, 1.3], D09: [7, 1.1], D12: [14, 2.5], D15: [6, 0.9], D18: [17, 2.8] },
    'SARA-01': { D04: [24, 4.2], D07: [27, 4.6], D09: [31, 5.1], D12: [28, 4.8], D15: [35, 5.9], D18: [30, 5.0] },
    'OSKARI-04': { D04: [22, 3.9], D07: [25, 4.3], D09: [26, 4.5], D12: [15, 2.7], D15: [29, 5.0], D18: [16, 2.8] },
  };

  // Deliberately non-optimal, but globally valid, live state.
  const liveAssignments = {
    'AINO-02': ['D04'],
    'LEO-05': ['D12'],
    'MIKA-03': ['D06'],
    'SARA-01': ['D01', 'D02'],
    'OSKARI-04': ['D16'],
  };

  return { deliveries, drivers, travel, liveAssignments };
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function hashString(value) {
  const input = String(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value)))];
}

export function canonicalPlan(assignments = []) {
  if (!Array.isArray(assignments)) return [];
  return assignments
    .map((assignment) => ({
      driverId: String(assignment?.driverId ?? ''),
      deliveryIds: uniqueStrings(assignment?.deliveryIds).sort(),
    }))
    .sort((left, right) => left.driverId.localeCompare(right.driverId));
}

export function exactSet(values, expected) {
  if (!Array.isArray(values) || !(expected instanceof Set)) return false;
  const actual = new Set(values);
  if (actual.size !== values.length) return false;
  return actual.size === expected.size
    && [...actual].every((value) => expected.has(value))
    && [...expected].every((value) => actual.has(value));
}

function cloneAssignments(assignments) {
  return Object.fromEntries(
    Object.entries(assignments ?? {}).map(([driverId, deliveryIds]) => [driverId, [...(deliveryIds ?? [])]]),
  );
}

function arraysEqual(left = [], right = []) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function deliveryById(state, deliveryId) {
  return state.deliveries.find((delivery) => delivery.id === deliveryId);
}

function minutesFor(state, driverId, deliveryId) {
  return state.travel?.[driverId]?.[deliveryId]?.[0]
    ?? deliveryById(state, deliveryId)?.serviceMinutes
    ?? 999;
}

function kmFor(state, driverId, deliveryId) {
  return state.travel?.[driverId]?.[deliveryId]?.[1] ?? 0;
}

export function indexAssignmentOwners(liveAssignments) {
  const owners = new Map();
  const duplicates = [];

  for (const [driverId, deliveryIds] of Object.entries(liveAssignments ?? {})) {
    const routeSeen = new Set();
    for (const deliveryId of deliveryIds ?? []) {
      if (routeSeen.has(deliveryId)) {
        duplicates.push({ code: 'DUPLICATE_DELIVERY_IN_LIVE_ROUTE', driverId, deliveryId });
        continue;
      }
      routeSeen.add(deliveryId);
      if (owners.has(deliveryId)) {
        duplicates.push({
          code: 'DELIVERY_HAS_MULTIPLE_LIVE_OWNERS',
          deliveryId,
          ownerIds: [owners.get(deliveryId), driverId].sort(),
        });
      } else {
        owners.set(deliveryId, driverId);
      }
    }
  }

  return { owners, duplicates };
}

export function validateLiveAssignmentGraph(state, liveAssignments = state.liveAssignments) {
  const violations = [];
  const driverIds = new Set(state.drivers.map((driver) => driver.id));
  const deliveryIds = new Set(state.deliveries.map((delivery) => delivery.id));

  for (const [driverId, route] of Object.entries(liveAssignments ?? {})) {
    if (!driverIds.has(driverId)) violations.push({ code: 'UNKNOWN_LIVE_DRIVER', driverId });
    if (!Array.isArray(route)) {
      violations.push({ code: 'MALFORMED_LIVE_ROUTE', driverId });
      continue;
    }
    for (const deliveryId of route) {
      if (!deliveryIds.has(deliveryId)) violations.push({ code: 'UNKNOWN_LIVE_DELIVERY', driverId, deliveryId });
    }
  }

  violations.push(...indexAssignmentOwners(liveAssignments).duplicates);
  return dedupeViolations(violations);
}

function protectedProjection(liveAssignments, selectedDeliveryIds) {
  return Object.fromEntries(
    Object.entries(liveAssignments).map(([driverId, route]) => [
      driverId,
      route.filter((deliveryId) => !selectedDeliveryIds.has(deliveryId)),
    ]),
  );
}

/**
 * Builds, but does not apply, an atomic patch over only the selected delivery and
 * driver resources. Every delivery outside the selected delivery set is kept
 * byte-for-byte in its existing route. An in-scope delivery may move only when
 * its current owner is also in scope (or it is currently unassigned).
 */
export function buildScopedRoutePatch(state, assignments) {
  const plan = canonicalPlan(assignments);
  const before = cloneAssignments(state.liveAssignments);
  const next = cloneAssignments(state.liveAssignments);
  const selectedDeliveries = state.selectedDeliveryIds;
  const selectedDrivers = state.selectedDriverIds;
  const violations = validateLiveAssignmentGraph(state, before);
  const { owners } = indexAssignmentOwners(before);
  const plannedDeliveryIds = new Set();
  const acceptedAssignments = [];
  const seenDrivers = new Set();

  // Treat the agent plan as untrusted even when this helper is called outside
  // evaluatePlan(). Invalid resources are recorded and omitted from the
  // candidate patch instead of being allowed to contaminate intermediate state.
  for (const assignment of plan) {
    if (!selectedDrivers.has(assignment.driverId)) {
      violations.push({ code: 'DRIVER_OUT_OF_SCOPE', driverId: assignment.driverId });
      continue;
    }
    if (seenDrivers.has(assignment.driverId)) {
      violations.push({ code: 'DUPLICATE_DRIVER_ASSIGNMENT', driverId: assignment.driverId });
    }
    seenDrivers.add(assignment.driverId);

    const acceptedDeliveryIds = [];
    for (const deliveryId of assignment.deliveryIds) {
      if (!selectedDeliveries.has(deliveryId)) {
        violations.push({ code: 'DELIVERY_OUT_OF_SCOPE', driverId: assignment.driverId, deliveryId });
        continue;
      }
      if (plannedDeliveryIds.has(deliveryId)) {
        violations.push({ code: 'DUPLICATE_DELIVERY_ASSIGNMENT', deliveryId });
        continue;
      }

      const currentOwner = owners.get(deliveryId);
      if (currentOwner && !selectedDrivers.has(currentOwner)) {
        violations.push({
          code: 'CURRENT_OWNER_OUT_OF_SCOPE',
          deliveryId,
          currentOwnerState: 'outside_scope',
        });
        continue;
      }

      plannedDeliveryIds.add(deliveryId);
      acceptedDeliveryIds.push(deliveryId);
    }

    if (acceptedDeliveryIds.length > 0) {
      acceptedAssignments.push({
        driverId: assignment.driverId,
        deliveryIds: acceptedDeliveryIds,
      });
    }
  }

  // Remove only accepted in-scope deliveries, and only from in-scope drivers.
  for (const driverId of selectedDrivers) {
    next[driverId] = (next[driverId] ?? []).filter((deliveryId) => !plannedDeliveryIds.has(deliveryId));
  }

  // Add the accepted scoped patch while retaining every protected commitment.
  for (const assignment of acceptedAssignments) {
    const route = next[assignment.driverId] ?? [];
    for (const deliveryId of assignment.deliveryIds) {
      if (!route.includes(deliveryId)) route.push(deliveryId);
    }
    next[assignment.driverId] = route;
  }

  const protectedBefore = protectedProjection(before, selectedDeliveries);
  const protectedAfter = protectedProjection(next, selectedDeliveries);
  if (stableStringify(protectedBefore) !== stableStringify(protectedAfter)) {
    violations.push({ code: 'PROTECTED_COMMITMENT_CHANGED' });
  }

  for (const driverId of Object.keys(before)) {
    if (!selectedDrivers.has(driverId) && !arraysEqual(before[driverId], next[driverId])) {
      violations.push({ code: 'OUT_OF_SCOPE_DRIVER_ROUTE_CHANGED', driverId });
    }
  }

  violations.push(...validateLiveAssignmentGraph(state, next));

  const allDriverIds = new Set([...Object.keys(before), ...Object.keys(next)]);
  const changedDriverIds = [...allDriverIds]
    .filter((driverId) => !arraysEqual(before[driverId] ?? [], next[driverId] ?? []))
    .sort();

  const changedDeliveryIds = [];
  const nextOwners = indexAssignmentOwners(next).owners;
  for (const deliveryId of plannedDeliveryIds) {
    if (owners.get(deliveryId) !== nextOwners.get(deliveryId)) changedDeliveryIds.push(deliveryId);
  }

  return {
    plan,
    acceptedAssignments,
    before,
    nextAssignments: next,
    currentOwners: owners,
    nextOwners,
    plannedDeliveryIds,
    changedDriverIds,
    changedDeliveryIds: changedDeliveryIds.sort(),
    protectedBefore,
    protectedAfter,
    violations: dedupeViolations(violations),
  };
}

export function getProtectedCommitments(state, driverId) {
  const route = state.liveAssignments?.[driverId] ?? [];
  const protectedDeliveryIds = route.filter((deliveryId) => !state.selectedDeliveryIds.has(deliveryId));
  return {
    deliveryCount: protectedDeliveryIds.length,
    loadUnits: protectedDeliveryIds.reduce((total, deliveryId) => total + (deliveryById(state, deliveryId)?.loadUnits ?? 0), 0),
    reservedMinutes: protectedDeliveryIds.reduce((total, deliveryId) => total + minutesFor(state, driverId, deliveryId), 0),
  };
}

function routeMetrics(state, driverId, route) {
  let loadUnits = 0;
  let routeMinutes = 0;
  const missingCapabilities = [];

  const driver = state.drivers.find((candidate) => candidate.id === driverId);
  for (const deliveryId of route) {
    const delivery = deliveryById(state, deliveryId);
    if (!delivery) continue;
    loadUnits += delivery.loadUnits;
    routeMinutes += minutesFor(state, driverId, deliveryId);
    if (driver && !driver.capabilities.includes(delivery.requirement)) {
      missingCapabilities.push({ deliveryId, requiredCapability: delivery.requirement });
    }
  }

  return { loadUnits, routeMinutes, missingCapabilities };
}

function candidateCanTakeDelivery(state, driver, delivery) {
  if (!driver.capabilities.includes(delivery.requirement)) return false;
  const currentRoute = state.liveAssignments?.[driver.id] ?? [];
  const candidateRoute = currentRoute.includes(delivery.id)
    ? currentRoute
    : [...currentRoute, delivery.id];
  const metrics = routeMetrics(state, driver.id, candidateRoute);
  return metrics.loadUnits <= driver.capacityUnits && metrics.routeMinutes <= driver.availableMinutes;
}

function boundaryOpportunityRecords(state, deliveryIds) {
  const publicRecords = [];
  const internalRecords = [];

  for (const deliveryId of deliveryIds) {
    const delivery = deliveryById(state, deliveryId);
    if (!delivery || delivery.windowClosed) continue;

    const candidates = state.drivers
      .filter((driver) => !state.selectedDriverIds.has(driver.id) && candidateCanTakeDelivery(state, driver, delivery))
      .sort((left, right) => minutesFor(state, left.id, deliveryId) - minutesFor(state, right.id, deliveryId));

    const candidate = candidates[0];
    if (!candidate) continue;

    const opportunityId = `op-${hashString(stableStringify({
      workspaceGeneration: state.workspaceGeneration,
      scopeRevision: state.scopeRevision,
      deliveryId,
      candidateId: candidate.id,
    }))}`;

    publicRecords.push({
      opportunityId,
      deliveryId,
      requiredCapability: delivery.requirement,
      estimatedMinutes: minutesFor(state, candidate.id, deliveryId),
      summary: `A compatible out-of-scope resource may recover ${deliveryId} without exceeding the current no-overtime policy.`,
    });
    internalRecords.push({
      opportunityId,
      deliveryId,
      resourceId: candidate.id,
      name: candidate.name,
      requiredCapability: delivery.requirement,
      estimatedMinutes: minutesFor(state, candidate.id, deliveryId),
    });
  }

  return { publicRecords, internalRecords };
}

export function resolveBoundaryOpportunity(state, opportunityId) {
  const eligibleDeliveryIds = state.lastEvaluation?.stillLateIds
    ?? state.deliveries.filter((delivery) => state.selectedDeliveryIds.has(delivery.id) && delivery.status === 'late').map((delivery) => delivery.id);
  return boundaryOpportunityRecords(state, eligibleDeliveryIds).internalRecords
    .find((record) => record.opportunityId === opportunityId) ?? null;
}

function stateFingerprint(state) {
  const payload = {
    workspaceGeneration: state.workspaceGeneration,
    scopeRevision: state.scopeRevision,
    selectedDeliveryIds: [...state.selectedDeliveryIds].sort(),
    selectedDriverIds: [...state.selectedDriverIds].sort(),
    constraints: state.constraints,
    liveAssignments: Object.fromEntries(Object.entries(state.liveAssignments).sort(([left], [right]) => left.localeCompare(right))),
    deliveryStatuses: Object.fromEntries(state.deliveries.map((delivery) => [delivery.id, delivery.status]).sort(([left], [right]) => left.localeCompare(right))),
  };
  return hashString(stableStringify(payload));
}

function authorizationEnvelope(state, assignments) {
  return stableStringify({
    workspaceGeneration: state.workspaceGeneration,
    scopeRevision: state.scopeRevision,
    selectedDeliveryIds: [...state.selectedDeliveryIds].sort(),
    selectedDriverIds: [...state.selectedDriverIds].sort(),
    constraints: state.constraints,
    liveAssignments: Object.fromEntries(Object.entries(state.liveAssignments).sort(([left], [right]) => left.localeCompare(right))),
    deliveryStatuses: Object.fromEntries(state.deliveries.map((delivery) => [delivery.id, delivery.status]).sort(([left], [right]) => left.localeCompare(right))),
    assignments: canonicalPlan(assignments),
  });
}

function dedupeViolations(violations) {
  return [...new Map(violations.map((violation) => [stableStringify(violation), violation])).values()];
}

export function evaluatePlan(state, assignments) {
  const rawAssignments = Array.isArray(assignments) ? assignments : [];
  const violations = [];
  const boundedAssignments = [];

  if (!Array.isArray(assignments)) violations.push({ code: 'MALFORMED_PLAN' });
  if (rawAssignments.length === 0) violations.push({ code: 'EMPTY_PLAN' });
  if (rawAssignments.length > MAX_PLAN_ASSIGNMENTS) {
    violations.push({
      code: 'PLAN_TOO_LARGE',
      limit: MAX_PLAN_ASSIGNMENTS,
      attempted: rawAssignments.length,
    });
  }

  const rawDrivers = new Set();
  let totalDeliveryReferences = 0;
  for (const assignment of rawAssignments.slice(0, MAX_PLAN_ASSIGNMENTS)) {
    if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
      violations.push({ code: 'MALFORMED_ASSIGNMENT' });
      continue;
    }

    const unexpectedKeys = Object.keys(assignment).filter((key) => !['driverId', 'deliveryIds'].includes(key));
    if (unexpectedKeys.length > 0) {
      violations.push({ code: 'UNEXPECTED_ASSIGNMENT_PROPERTY', properties: unexpectedKeys.sort() });
    }

    const driverId = String(assignment.driverId ?? '');
    if (!driverId || driverId.length > MAX_IDENTIFIER_LENGTH) violations.push({ code: 'MALFORMED_DRIVER_ID' });
    if (rawDrivers.has(driverId)) violations.push({ code: 'DUPLICATE_DRIVER_ASSIGNMENT', driverId });
    rawDrivers.add(driverId);

    const rawDeliveryIds = Array.isArray(assignment.deliveryIds) ? assignment.deliveryIds : [];
    if (!Array.isArray(assignment.deliveryIds)) violations.push({ code: 'MALFORMED_DELIVERY_LIST', driverId });
    if (rawDeliveryIds.length > MAX_DELIVERIES_PER_ASSIGNMENT) {
      violations.push({
        code: 'ASSIGNMENT_TOO_LARGE',
        driverId,
        limit: MAX_DELIVERIES_PER_ASSIGNMENT,
        attempted: rawDeliveryIds.length,
      });
    }
    const deliveryIds = rawDeliveryIds.slice(0, MAX_DELIVERIES_PER_ASSIGNMENT).map(String);
    totalDeliveryReferences += deliveryIds.length;
    if (deliveryIds.length === 0) violations.push({ code: 'EMPTY_DRIVER_ASSIGNMENT', driverId });
    if (deliveryIds.some((deliveryId) => !deliveryId || deliveryId.length > MAX_IDENTIFIER_LENGTH)) {
      violations.push({ code: 'MALFORMED_DELIVERY_ID', driverId });
    }
    if (new Set(deliveryIds).size !== deliveryIds.length) {
      violations.push({ code: 'DUPLICATE_DELIVERY_IN_ASSIGNMENT', driverId });
    }
    boundedAssignments.push({ driverId, deliveryIds });
  }

  if (totalDeliveryReferences > MAX_TOTAL_PLAN_DELIVERIES) {
    violations.push({
      code: 'PLAN_DELIVERY_LIMIT_EXCEEDED',
      limit: MAX_TOTAL_PLAN_DELIVERIES,
      attempted: totalDeliveryReferences,
    });
  }

  const plan = canonicalPlan(boundedAssignments);
  const selectedDeliveries = state.selectedDeliveryIds;
  const selectedDrivers = state.selectedDriverIds;
  const driverMap = new Map(state.drivers.map((driver) => [driver.id, driver]));
  const deliveryMap = new Map(state.deliveries.map((delivery) => [delivery.id, delivery]));
  const seenDeliveries = new Set();

  if (selectedDeliveries.size === 0 || selectedDrivers.size === 0) {
    violations.push({ code: 'INCOMPLETE_SCOPE', message: 'Select at least one delivery and one driver.' });
  }

  for (const assignment of plan) {
    const driver = driverMap.get(assignment.driverId);
    if (!driver || !selectedDrivers.has(assignment.driverId)) {
      violations.push({ code: 'DRIVER_OUT_OF_SCOPE', driverId: assignment.driverId });
      continue;
    }

    for (const deliveryId of assignment.deliveryIds) {
      if (!deliveryMap.has(deliveryId) || !selectedDeliveries.has(deliveryId)) {
        violations.push({ code: 'DELIVERY_OUT_OF_SCOPE', driverId: driver.id, deliveryId });
        continue;
      }
      if (seenDeliveries.has(deliveryId)) {
        violations.push({ code: 'DUPLICATE_DELIVERY_ASSIGNMENT', deliveryId });
        continue;
      }
      seenDeliveries.add(deliveryId);
      if (deliveryMap.get(deliveryId).windowClosed) violations.push({ code: 'DELIVERY_WINDOW_CLOSED', deliveryId });
    }
  }

  const patch = buildScopedRoutePatch(state, plan);
  violations.push(...patch.violations);

  if (rawAssignments.length > 0 && patch.changedDriverIds.length === 0) {
    violations.push({
      code: 'NO_EFFECT_PLAN',
      message: 'The proposed patch does not change any selected live route.',
    });
  }

  if (patch.changedDriverIds.length > state.constraints.maxRouteChanges) {
    violations.push({
      code: 'TOO_MANY_ROUTE_CHANGES',
      limit: state.constraints.maxRouteChanges,
      attempted: patch.changedDriverIds.length,
    });
  }

  for (const driverId of patch.changedDriverIds) {
    const driver = driverMap.get(driverId);
    if (!driver || !selectedDrivers.has(driverId)) continue;
    const metrics = routeMetrics(state, driverId, patch.nextAssignments[driverId] ?? []);

    if (metrics.loadUnits > driver.capacityUnits) {
      violations.push({
        code: 'DRIVER_CAPACITY_EXCEEDED',
        driverId,
        capacityUnits: driver.capacityUnits,
        attemptedLoadUnits: metrics.loadUnits,
      });
    }

    const overtimeMinutes = Math.max(0, metrics.routeMinutes - driver.availableMinutes);
    if (state.constraints.noOvertime && overtimeMinutes > 0) {
      violations.push({ code: 'OVERTIME_FORBIDDEN', driverId, overtimeMinutes });
    }

    for (const missing of metrics.missingCapabilities) {
      violations.push({
        code: 'VEHICLE_CAPABILITY_MISSING',
        driverId,
        deliveryId: missing.deliveryId,
        requiredCapability: missing.requiredCapability,
      });
    }
  }

  const uniqueViolations = dedupeViolations(violations);
  const invalidDeliveries = new Set(
    uniqueViolations.filter((violation) => INVALID_DELIVERY_CODES.has(violation.code)).map((violation) => violation.deliveryId).filter(Boolean),
  );
  const invalidDrivers = new Set(
    uniqueViolations.filter((violation) => INVALID_DRIVER_CODES.has(violation.code)).map((violation) => violation.driverId).filter(Boolean),
  );

  const rescuedDeliveryIds = [];
  for (const assignment of plan) {
    if (invalidDrivers.has(assignment.driverId)) continue;
    for (const deliveryId of assignment.deliveryIds) {
      const delivery = deliveryMap.get(deliveryId);
      if (delivery?.status === 'late' && !invalidDeliveries.has(deliveryId) && selectedDeliveries.has(deliveryId)) {
        rescuedDeliveryIds.push(deliveryId);
      }
    }
  }

  const rescued = [...new Set(rescuedDeliveryIds)].sort();
  const selectedLate = state.deliveries
    .filter((delivery) => selectedDeliveries.has(delivery.id) && delivery.status === 'late')
    .map((delivery) => delivery.id);
  const stillLateIds = selectedLate.filter((deliveryId) => !rescued.includes(deliveryId));
  const opportunities = boundaryOpportunityRecords(state, stillLateIds).publicRecords;

  let extraKm = 0;
  for (const assignment of plan) {
    for (const deliveryId of assignment.deliveryIds) {
      const currentOwner = patch.currentOwners.get(deliveryId);
      if (currentOwner === assignment.driverId) continue;
      extraKm += kmFor(state, assignment.driverId, deliveryId) - (currentOwner ? kmFor(state, currentOwner, deliveryId) : 0);
    }
  }

  let overtimeMinutes = 0;
  for (const driverId of patch.changedDriverIds) {
    const driver = driverMap.get(driverId);
    if (!driver) continue;
    const metrics = routeMetrics(state, driverId, patch.nextAssignments[driverId] ?? []);
    overtimeMinutes += Math.max(0, metrics.routeMinutes - driver.availableMinutes);
  }

  const valid = uniqueViolations.length === 0;
  const core = {
    workspaceGeneration: state.workspaceGeneration,
    scopeRevision: state.scopeRevision,
    assignments: plan,
    beforeLate: selectedLate.length,
    afterLate: stillLateIds.length,
    rescuedDeliveryIds: rescued,
    stillLateIds,
    routeChanges: patch.changedDriverIds.length,
    changedDriverIds: patch.changedDriverIds,
    changedDeliveryIds: patch.changedDeliveryIds,
    extraKm: Number(extraKm.toFixed(1)),
    overtimeMinutes,
    baselineFingerprint: stateFingerprint(state),
  };
  const planDigest = hashString(stableStringify({ core, constraints: state.constraints }));

  return {
    status: valid ? 'verified' : 'invalid',
    valid,
    planId: `plan-${state.workspaceGeneration}-${state.scopeRevision}-${planDigest}`,
    planDigest,
    ...core,
    violations: uniqueViolations,
    boundaryOpportunities: opportunities,
  };
}

function publicAuthorization(authorization) {
  if (!authorization) return null;
  const { exactEnvelope: _exactEnvelope, ...safe } = authorization;
  return { ...safe };
}

export function createStore() {
  const listeners = new Set();

  const newState = (generation = 1) => {
    const data = seedData();
    return {
      ...data,
      workspaceGeneration: generation,
      scopeRevision: 1,
      selectedDeliveryIds: new Set(),
      selectedDriverIds: new Set(),
      constraints: { ...DEFAULT_CONSTRAINTS },
      verifiedPlan: null,
      lastEvaluation: null,
      lastAppliedPlan: null,
      expansionRequest: null,
      authorization: null,
      actuationEpoch: 0,
      audit: [],
      activeToolNames: [],
      webMcpMode: 'detecting',
      webMcpStatus: {
        mode: 'detecting',
        health: 'starting',
        desiredCount: 0,
        registeredCount: 0,
        contractSerial: 0,
        error: null,
      },
    };
  };

  let state = newState(1);
  const notify = () => listeners.forEach((listener) => listener(state));
  const audit = (type, detail = {}) => {
    state.audit.unshift({ at: new Date().toISOString(), type, detail });
    state.audit = state.audit.slice(0, MAX_AUDIT_ITEMS);
  };
  const invalidatePlan = () => {
    state.verifiedPlan = null;
    state.lastEvaluation = null;
    state.authorization = null;
  };
  const bumpScope = (reason) => {
    state.scopeRevision += 1;
    invalidatePlan();
    state.lastAppliedPlan = null;
    state.expansionRequest = null;
    state.actuationEpoch += 1;
    audit('scope_changed', { reason, revision: state.scopeRevision });
  };

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify,
    audit,
    setSelection(deliveryIds, driverIds, reason = 'selection') {
      const validDeliveries = new Set(state.deliveries.map((delivery) => delivery.id));
      const validDrivers = new Set(state.drivers.map((driver) => driver.id));
      state.selectedDeliveryIds = new Set(uniqueStrings(deliveryIds).filter((id) => validDeliveries.has(id)));
      state.selectedDriverIds = new Set(uniqueStrings(driverIds).filter((id) => validDrivers.has(id)));
      bumpScope(reason);
      notify();
      return true;
    },
    approveExpansion(opportunityId) {
      const request = state.expansionRequest;
      if (!request || request.opportunityId !== opportunityId) return false;
      const candidate = resolveBoundaryOpportunity(state, opportunityId);
      if (!candidate || candidate.resourceId !== request.candidate.resourceId) return false;
      state.selectedDriverIds.add(candidate.resourceId);
      bumpScope('human_scope_expansion');
      audit('scope_expansion_approved', { opportunityId, resourceId: candidate.resourceId });
      notify();
      return true;
    },
    rejectExpansion() {
      if (state.expansionRequest) {
        audit('scope_expansion_rejected', { opportunityId: state.expansionRequest.opportunityId });
      }
      state.expansionRequest = null;
      notify();
    },
    setExpansionRequest(request) {
      const candidate = resolveBoundaryOpportunity(state, request?.opportunityId);
      const reason = typeof request?.reason === 'string' ? request.reason.trim() : '';
      if (!candidate || reason.length < 8 || reason.length > 280) return false;
      state.expansionRequest = {
        workspaceGeneration: state.workspaceGeneration,
        scopeRevision: state.scopeRevision,
        opportunityId: request.opportunityId,
        reason,
        candidate,
      };
      audit('scope_expansion_requested', {
        opportunityId: request.opportunityId,
        resourceId: candidate.resourceId,
      });
      notify();
      return true;
    },
    setConstraint(key, value) {
      if (key === 'noOvertime' && typeof value === 'boolean') {
        if (state.constraints.noOvertime === value) return true;
        state.constraints.noOvertime = value;
      } else if (key === 'maxRouteChanges' && Number.isInteger(value) && value >= 1 && value <= MAX_ROUTE_CHANGES) {
        if (state.constraints.maxRouteChanges === value) return true;
        state.constraints.maxRouteChanges = value;
      } else {
        return false;
      }
      bumpScope(`constraint_${key}`);
      notify();
      return true;
    },
    setEvaluation(result) {
      state.lastEvaluation = result;
      state.verifiedPlan = result.valid ? result : null;
      state.authorization = null;
      state.expansionRequest = null;
      audit(result.valid ? 'plan_verified' : 'plan_rejected', {
        planId: result.planId,
        violations: result.violations.map((violation) => violation.code),
      });
      notify();
    },
    authorizeExactPlan(planId) {
      if (!state.verifiedPlan || state.verifiedPlan.planId !== planId) return false;
      if (state.verifiedPlan.baselineFingerprint !== stateFingerprint(state)) return false;

      state.actuationEpoch += 1;
      const authorizedAt = Date.now();
      state.authorization = {
        planId,
        planDigest: state.verifiedPlan.planDigest,
        scopeRevision: state.scopeRevision,
        workspaceGeneration: state.workspaceGeneration,
        actuationEpoch: state.actuationEpoch,
        consumed: false,
        authorizedAt,
        expiresAt: authorizedAt + AUTHORIZATION_TTL_MS,
        exactEnvelope: authorizationEnvelope(state, state.verifiedPlan.assignments),
      };
      audit('exact_plan_authorized', { planId, actuationEpoch: state.actuationEpoch });
      notify();
      return true;
    },
    revokeAuthorization() {
      if (state.authorization) audit('authorization_revoked', { planId: state.authorization.planId });
      state.authorization = null;
      state.actuationEpoch += 1;
      notify();
    },
    expireAuthorization() {
      if (!state.authorization || Date.now() <= state.authorization.expiresAt) return false;
      audit('authorization_expired', { planId: state.authorization.planId });
      state.authorization = null;
      state.actuationEpoch += 1;
      notify();
      return true;
    },
    applyVerifiedPlan(planId, epoch) {
      const plan = state.verifiedPlan;
      const authorization = state.authorization;
      if (!plan || !authorization) return { status: 'rejected', code: 'NO_EXACT_AUTHORIZATION' };
      if (authorization.consumed) return { status: 'rejected', code: 'AUTHORIZATION_CONSUMED' };
      if (authorization.planId !== planId || plan.planId !== planId || authorization.planDigest !== plan.planDigest) {
        return { status: 'rejected', code: 'PLAN_AUTHORIZATION_MISMATCH' };
      }
      if (Date.now() > authorization.expiresAt) return { status: 'rejected', code: 'AUTHORIZATION_EXPIRED' };
      if (authorization.scopeRevision !== state.scopeRevision || authorization.workspaceGeneration !== state.workspaceGeneration) {
        return { status: 'rejected', code: 'AUTHORIZATION_STALE' };
      }
      if (Number(epoch) !== authorization.actuationEpoch || Number(epoch) !== state.actuationEpoch) {
        return { status: 'rejected', code: 'ACTUATION_EPOCH_MISMATCH' };
      }
      if (authorization.exactEnvelope !== authorizationEnvelope(state, plan.assignments)) {
        return { status: 'rejected', code: 'AUTHORIZED_STATE_CHANGED' };
      }

      const recheck = evaluatePlan(state, plan.assignments);
      if (!recheck.valid || recheck.planDigest !== plan.planDigest) {
        return { status: 'rejected', code: 'PLAN_REVALIDATION_FAILED', violations: recheck.violations };
      }

      const patch = buildScopedRoutePatch(state, plan.assignments);
      if (patch.violations.length > 0) {
        return { status: 'rejected', code: 'SCOPED_PATCH_REJECTED', violations: patch.violations };
      }
      if (stableStringify(patch.protectedBefore) !== stableStringify(patch.protectedAfter)) {
        return { status: 'rejected', code: 'PROTECTED_COMMITMENT_CHANGED' };
      }

      const graphViolations = validateLiveAssignmentGraph(state, patch.nextAssignments);
      if (graphViolations.length > 0) {
        return { status: 'rejected', code: 'LIVE_ASSIGNMENT_INVARIANT_FAILED', violations: graphViolations };
      }

      // Commit only after all checks pass, so writes are atomic from application state.
      const nextDeliveries = state.deliveries.map((delivery) => (
        plan.rescuedDeliveryIds.includes(delivery.id) ? { ...delivery, status: 'on-time' } : delivery
      ));
      state.liveAssignments = patch.nextAssignments;
      state.deliveries = nextDeliveries;
      state.lastAppliedPlan = {
        ...plan,
        appliedAt: Date.now(),
        changedDriverIds: patch.changedDriverIds,
        changedDeliveryIds: patch.changedDeliveryIds,
      };
      authorization.consumed = true;
      audit('plan_applied', {
        planId,
        rescued: plan.rescuedDeliveryIds,
        changedDriverIds: patch.changedDriverIds,
      });

      state.scopeRevision += 1;
      state.actuationEpoch += 1;
      state.authorization = null;
      state.verifiedPlan = null;
      state.lastEvaluation = null;
      state.expansionRequest = null;
      notify();

      return {
        status: 'applied',
        planId,
        rescuedDeliveryIds: plan.rescuedDeliveryIds,
        changedDriverIds: patch.changedDriverIds,
        changedDeliveryIds: patch.changedDeliveryIds,
        protectedCommitmentsChanged: false,
        liveStateChanged: true,
      };
    },
    setWebMcpStatus(status) {
      const nextStatus = {
        mode: status.mode === 'native' ? 'native' : status.mode === 'local-bridge' ? 'local-bridge' : 'detecting',
        health: ['starting', 'ready', 'degraded', 'stopped'].includes(status.health) ? status.health : 'degraded',
        desiredCount: Number.isInteger(status.desiredCount) ? Math.max(0, status.desiredCount) : 0,
        registeredCount: Number.isInteger(status.registeredCount) ? Math.max(0, status.registeredCount) : 0,
        contractSerial: Number.isInteger(status.contractSerial) ? Math.max(0, status.contractSerial) : 0,
        error: status.error ? String(status.error).slice(0, 240) : null,
      };
      state.webMcpStatus = nextStatus;
      state.webMcpMode = nextStatus.mode;
      state.activeToolNames = Array.isArray(status.activeToolNames) ? [...new Set(status.activeToolNames.map(String))] : [];
      notify();
    },
    reset() {
      const generation = state.workspaceGeneration + 1;
      state = newState(generation);
      audit('workspace_reset', { generation });
      notify();
    },
    snapshot() {
      return {
        workspaceGeneration: state.workspaceGeneration,
        scopeRevision: state.scopeRevision,
        selectedDeliveryIds: [...state.selectedDeliveryIds],
        selectedDriverIds: [...state.selectedDriverIds],
        constraints: { ...state.constraints },
        verifiedPlan: state.verifiedPlan,
        lastEvaluation: state.lastEvaluation,
        lastAppliedPlan: state.lastAppliedPlan,
        expansionRequest: state.expansionRequest,
        authorization: publicAuthorization(state.authorization),
        actuationEpoch: state.actuationEpoch,
        audit: [...state.audit],
        deliveries: state.deliveries.map((delivery) => ({ ...delivery })),
        drivers: state.drivers.map((driver) => ({ ...driver, capabilities: [...driver.capabilities] })),
        liveAssignments: cloneAssignments(state.liveAssignments),
        activeToolNames: [...state.activeToolNames],
        webMcpMode: state.webMcpMode,
        webMcpStatus: { ...state.webMcpStatus },
      };
    },
  };
}
