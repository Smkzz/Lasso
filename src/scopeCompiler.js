import {
  evaluatePlan,
  getProtectedCommitments,
  indexAssignmentOwners,
  resolveBoundaryOpportunity,
} from './core.js';

const READ_ONLY_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  untrustedContentHint: false,
  consequentialHint: false,
});

const STATE_CHANGING_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  untrustedContentHint: false,
  consequentialHint: false,
});

const CONSEQUENTIAL_ANNOTATIONS = Object.freeze({
  readOnlyHint: false,
  untrustedContentHint: false,
  consequentialHint: true,
});

function throwIfCancelled(options) {
  if (!options?.signal?.aborted) return;
  if (typeof options.signal.throwIfAborted === 'function') options.signal.throwIfAborted();
  throw new DOMException('Tool execution was cancelled.', 'AbortError');
}

function rejectStale(store, scopeRevision, workspaceGeneration) {
  const state = store.state;
  if (!Number.isInteger(workspaceGeneration) || !Number.isInteger(scopeRevision)) {
    return {
      status: 'rejected',
      code: 'INVALID_CONTRACT_REVISION',
      message: 'workspaceGeneration and scopeRevision must be integers from the current tool schema.',
    };
  }
  if (workspaceGeneration !== state.workspaceGeneration) {
    return {
      status: 'rejected',
      code: 'WORKSPACE_GENERATION_MISMATCH',
      expected: state.workspaceGeneration,
      provided: workspaceGeneration,
    };
  }
  if (scopeRevision !== state.scopeRevision) {
    return {
      status: 'rejected',
      code: 'SCOPE_REVISION_MISMATCH',
      expected: state.scopeRevision,
      provided: scopeRevision,
    };
  }
  return null;
}

function guardInvocation(store, args, allowedKeys, options) {
  throwIfCancelled(options);
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { status: 'rejected', code: 'MALFORMED_TOOL_ARGUMENTS' };
  }
  const unexpected = Object.keys(args).filter((key) => !allowedKeys.includes(key));
  if (unexpected.length > 0) {
    return {
      status: 'rejected',
      code: 'UNEXPECTED_TOOL_ARGUMENT',
      properties: unexpected.sort(),
    };
  }
  return rejectStale(store, args.scopeRevision, args.workspaceGeneration);
}

function nameFor(state, base, suffix = '') {
  return `lasso_${base}_g${state.workspaceGeneration}_r${state.scopeRevision}${suffix}`;
}

function revisionSchema(state) {
  return {
    type: 'integer',
    enum: [state.scopeRevision],
    description: `Must equal current scope revision ${state.scopeRevision}.`,
  };
}

function generationSchema(state) {
  return {
    type: 'integer',
    enum: [state.workspaceGeneration],
    description: `Must equal workspace generation ${state.workspaceGeneration}.`,
  };
}

function boundarySignals(state, selectedDeliveries) {
  const requiredCapabilities = new Set(
    selectedDeliveries
      .filter((delivery) => delivery.status === 'late' && !delivery.windowClosed)
      .map((delivery) => delivery.requirement),
  );

  return [...requiredCapabilities].map((capability) => ({
    capability,
    capabilityMatchCount: state.drivers.filter(
      (driver) => !state.selectedDriverIds.has(driver.id) && driver.capabilities.includes(capability),
    ).length,
  }));
}

function scopedData(state) {
  const { owners } = indexAssignmentOwners(state.liveAssignments);
  const selectedDeliveries = state.deliveries
    .filter((delivery) => state.selectedDeliveryIds.has(delivery.id))
    .map((delivery) => {
      const currentOwner = owners.get(delivery.id);
      return {
        id: delivery.id,
        customer: delivery.customer,
        status: delivery.status,
        deadline: delivery.deadline,
        priority: delivery.priority,
        requirement: delivery.requirement,
        loadUnits: delivery.loadUnits,
        windowClosed: delivery.windowClosed,
        currentAssignment: currentOwner
          ? state.selectedDriverIds.has(currentOwner)
            ? { state: 'in_scope', driverId: currentOwner }
            : { state: 'outside_scope' }
          : { state: 'unassigned' },
      };
    });

  const selectedDrivers = state.drivers
    .filter((driver) => state.selectedDriverIds.has(driver.id))
    .map((driver) => {
      const protectedCommitments = getProtectedCommitments(state, driver.id);
      const currentScopedDeliveryIds = (state.liveAssignments[driver.id] ?? [])
        .filter((deliveryId) => state.selectedDeliveryIds.has(deliveryId));
      const travel = Object.fromEntries(
        selectedDeliveries.map((delivery) => [
          delivery.id,
          {
            minutes: state.travel?.[driver.id]?.[delivery.id]?.[0] ?? delivery.serviceMinutes ?? 999,
            km: state.travel?.[driver.id]?.[delivery.id]?.[1] ?? 0,
          },
        ]),
      );

      return {
        id: driver.id,
        name: driver.name,
        capacityUnits: driver.capacityUnits,
        availableMinutes: driver.availableMinutes,
        capabilities: [...driver.capabilities],
        currentScopedDeliveryIds,
        protectedCommitments,
        remainingAfterProtected: {
          capacityUnits: Math.max(0, driver.capacityUnits - protectedCommitments.loadUnits),
          minutes: Math.max(0, driver.availableMinutes - protectedCommitments.reservedMinutes),
        },
        travel,
      };
    });

  return {
    status: 'ok',
    workspaceGeneration: state.workspaceGeneration,
    scopeRevision: state.scopeRevision,
    constraints: { ...state.constraints },
    deliveries: selectedDeliveries,
    drivers: selectedDrivers,
    boundarySignals: boundarySignals(state, selectedDeliveries),
    semantics: {
      assignmentsAreScopedPatches: true,
      outsideScopeResourceIdentitiesExcludedFromToolResults: true,
      protectedCommitmentsArePreserved: true,
    },
  };
}

export function compileTools(store) {
  const state = store.state;
  const tools = [];
  const baseProperties = {
    workspaceGeneration: generationSchema(state),
    scopeRevision: revisionSchema(state),
  };
  const baseKeys = ['workspaceGeneration', 'scopeRevision'];

  tools.push({
    name: nameFor(state, 'describe_board'),
    title: 'Describe dispatch board',
    description: 'Read a coarse board summary. Detailed operational data becomes available only after the human draws a complete scope.',
    inputSchema: {
      type: 'object',
      properties: { ...baseProperties },
      required: baseKeys,
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    execute: async (args = {}, options = {}) => {
      const rejected = guardInvocation(store, args, baseKeys, options);
      if (rejected) return rejected;
      return {
        status: 'ok',
        workspaceGeneration: store.state.workspaceGeneration,
        scopeRevision: store.state.scopeRevision,
        totalDeliveries: store.state.deliveries.length,
        totalDrivers: store.state.drivers.length,
        lateCount: store.state.deliveries.filter((delivery) => delivery.status === 'late').length,
        activeScope: store.state.selectedDeliveryIds.size > 0 && store.state.selectedDriverIds.size > 0,
        humanInstruction: store.state.selectedDeliveryIds.size > 0 && store.state.selectedDriverIds.size > 0
          ? 'Use only this revision’s scoped tools. Request human expansion if the current boundary is insufficient.'
          : 'Ask the human to lasso at least one delivery and one driver.',
      };
    },
  });

  if (state.selectedDeliveryIds.size === 0 || state.selectedDriverIds.size === 0) return tools;

  const deliveryIds = [...state.selectedDeliveryIds].sort();
  const driverIds = [...state.selectedDriverIds].sort();

  tools.push({
    name: nameFor(state, 'inspect_scope'),
    title: 'Inspect human-defined scope',
    description: 'Read detailed operational data only inside the current lasso. Existing outside-scope commitments are disclosed only as aggregate protected capacity.',
    inputSchema: {
      type: 'object',
      properties: { ...baseProperties },
      required: baseKeys,
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
    execute: async (args = {}, options = {}) => {
      const rejected = guardInvocation(store, args, baseKeys, options);
      if (rejected) return rejected;
      return scopedData(store.state);
    },
  });

  const assignmentSchema = {
    type: 'array',
    minItems: 1,
    maxItems: driverIds.length,
    description: `Scoped route patches. Runtime policy permits at most ${state.constraints.maxRouteChanges} changed driver routes.`,
    items: {
      type: 'object',
      properties: {
        driverId: {
          type: 'string',
          enum: driverIds,
          description: 'Must be a driver in the human-selected scope.',
        },
        deliveryIds: {
          type: 'array',
          minItems: 1,
          maxItems: deliveryIds.length,
          uniqueItems: true,
          items: { type: 'string', enum: deliveryIds },
          description: 'Only selected deliveries. Unlisted deliveries and all outside-scope commitments remain unchanged.',
        },
      },
      required: ['driverId', 'deliveryIds'],
      additionalProperties: false,
    },
  };

  tools.push({
    name: nameFor(state, 'evaluate_plan'),
    title: 'Evaluate agent-authored recovery plan',
    description: `Submit your own scoped driver-to-delivery patch. LASSO validates scope, uniqueness, capability, protected capacity, timing, no-overtime policy, and the human limit of ${state.constraints.maxRouteChanges} changed routes. It never generates the answer.`,
    inputSchema: {
      type: 'object',
      properties: { ...baseProperties, assignments: assignmentSchema },
      required: [...baseKeys, 'assignments'],
      additionalProperties: false,
    },
    annotations: STATE_CHANGING_ANNOTATIONS,
    execute: async (args = {}, options = {}) => {
      const rejected = guardInvocation(store, args, [...baseKeys, 'assignments'], options);
      if (rejected) return rejected;
      const result = evaluatePlan(store.state, args.assignments);
      throwIfCancelled(options);
      store.setEvaluation(result);
      return result;
    },
  });

  const opportunities = state.lastEvaluation?.boundaryOpportunities ?? [];
  if (opportunities.length > 0) {
    tools.push({
      name: nameFor(state, 'request_expansion'),
      title: 'Request human scope expansion',
      description: 'Request one opaque boundary opportunity identified by the validator. This creates a visible request and never expands authority by itself.',
      inputSchema: {
        type: 'object',
        properties: {
          ...baseProperties,
          opportunityId: {
            type: 'string',
            enum: opportunities.map((opportunity) => opportunity.opportunityId),
            description: 'Opaque opportunity ID. This WebMCP result does not disclose the underlying resource ID before human approval.',
          },
          reason: { type: 'string', minLength: 8, maxLength: 280 },
        },
        required: [...baseKeys, 'opportunityId', 'reason'],
        additionalProperties: false,
      },
      annotations: STATE_CHANGING_ANNOTATIONS,
      execute: async (args = {}, options = {}) => {
        const rejected = guardInvocation(store, args, [...baseKeys, 'opportunityId', 'reason'], options);
        if (rejected) return rejected;
        const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
        if (reason.length < 8 || reason.length > 280) {
          return { status: 'rejected', code: 'INVALID_EXPANSION_REASON' };
        }
        const candidate = resolveBoundaryOpportunity(store.state, args.opportunityId);
        const allowed = opportunities.some((opportunity) => opportunity.opportunityId === args.opportunityId);
        if (!candidate || !allowed) return { status: 'rejected', code: 'INVALID_EXPANSION_OPPORTUNITY' };
        throwIfCancelled(options);
        const accepted = store.setExpansionRequest({ opportunityId: args.opportunityId, reason });
        if (!accepted) return { status: 'rejected', code: 'EXPANSION_REQUEST_NOT_ACCEPTED' };
        return {
          status: 'awaiting_human',
          authorityChanged: false,
          opportunityId: args.opportunityId,
          message: 'The request is visible to the human. The resource ID remains outside the WebMCP contract until approved.',
        };
      },
    });
  }

  const authorization = state.authorization;
  const plan = state.verifiedPlan;
  const exactAuthorizationIsCurrent = authorization
    && plan
    && !authorization.consumed
    && authorization.planId === plan.planId
    && authorization.scopeRevision === state.scopeRevision
    && authorization.workspaceGeneration === state.workspaceGeneration
    && Date.now() <= authorization.expiresAt;

  if (exactAuthorizationIsCurrent) {
    const suffix = `_e${authorization.actuationEpoch}`;
    tools.push({
      name: nameFor(state, 'apply_plan', suffix),
      title: 'Apply exactly authorized recovery plan',
      description: `Consequential single-use write. Applies only verified plan ${plan.planId}, authorized by the human for actuation epoch ${authorization.actuationEpoch}. Every protected outside-scope commitment must remain unchanged.`,
      inputSchema: {
        type: 'object',
        properties: {
          ...baseProperties,
          planId: { type: 'string', enum: [plan.planId] },
          actuationEpoch: { type: 'integer', enum: [authorization.actuationEpoch] },
        },
        required: [...baseKeys, 'planId', 'actuationEpoch'],
        additionalProperties: false,
      },
      annotations: CONSEQUENTIAL_ANNOTATIONS,
      execute: async (args = {}, options = {}) => {
        const rejected = guardInvocation(store, args, [...baseKeys, 'planId', 'actuationEpoch'], options);
        if (rejected) return rejected;
        throwIfCancelled(options);
        return store.applyVerifiedPlan(args.planId, args.actuationEpoch);
      },
    });
  }

  return tools;
}
