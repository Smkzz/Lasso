import { compileTools } from './scopeCompiler.js';

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const CONTRACT_TRANSITION_CODE = 'CONTRACT_REFRESHING';
const CONTRACT_INACTIVE_CODE = 'CONTRACT_NOT_ACTIVE';

export class MockModelContext extends EventTarget {
  constructor() {
    super();
    this.tools = new Map();
  }

  async registerTool(tool, { signal } = {}) {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool ${tool.name}`);

    this.tools.set(tool.name, tool);
    signal?.addEventListener('abort', () => {
      this.tools.delete(tool.name);
      this.dispatchEvent(new Event('toolchange'));
    }, { once: true });
    this.dispatchEvent(new Event('toolchange'));
  }

  async getTools() {
    return [...this.tools.values()].map(({ name, title, description, inputSchema, annotations }) => ({
      name,
      title,
      description,
      inputSchema,
      annotations,
    }));
  }
}

function errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error ?? 'Unknown WebMCP registration error');
}

/**
 * Bridges LASSO's state-derived tool definitions into a WebMCP host.
 *
 * Safety properties:
 * - every contract gets unique tool names;
 * - a tool cannot execute before its full contract is activated;
 * - contract swaps wait for every in-flight call to settle;
 * - new calls fail closed while a swap is quiescing the old contract;
 * - any partial registration failure removes the entire active surface;
 * - handlers still revalidate scope/generation independently of discovery.
 */
export function createWebMcpBridge(
  store,
  {
    forceMock = false,
    modelContext = null,
    contextOverride = null,
  } = {},
) {
  const detectedNativeContext = !forceMock
    && typeof document !== 'undefined'
    && typeof document.modelContext?.registerTool === 'function'
    ? document.modelContext
    : null;
  const injectedContext = contextOverride ?? modelContext;
  const context = injectedContext ?? detectedNativeContext ?? new MockModelContext();
  const native = context === detectedNativeContext && detectedNativeContext !== null;
  const mode = native ? 'native' : 'local-bridge';

  let activeController = null;
  let activeActivation = null;
  let activeTools = [];
  let previousTools = [];
  let contractSerial = 0;
  let registrationAttemptSerial = 0;
  let requestSerial = 0;
  let inFlight = 0;
  let pending = false;
  let compiling = false;
  let quiescing = false;
  let scheduledTimer = null;
  let destroyed = false;
  let status = {
    mode,
    health: 'starting',
    desiredCount: 0,
    registeredCount: 0,
    contractSerial: 0,
    error: null,
  };
  const listeners = new Set();

  const publish = (nextStatus) => {
    status = { ...status, ...nextStatus, mode };
    store.setWebMcpStatus({
      ...status,
      activeToolNames: activeTools.map((tool) => tool.name),
    });
    const view = {
      native,
      tools: activeTools,
      previousTools,
      status: { ...status },
      inFlight,
      quiescing,
    };
    for (const listener of listeners) listener(view);
  };

  const schedule = () => {
    if (destroyed || scheduledTimer !== null || inFlight > 0 || compiling || !pending) return;
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null;
      void compilePending();
    }, 0);
  };

  const wrapExecution = (definition, activation) => {
    const execute = definition.execute;
    return {
      ...definition,
      execute: async (...args) => {
        if (destroyed || !activation.enabled) {
          return { status: 'rejected', code: CONTRACT_INACTIVE_CODE };
        }
        if (quiescing) {
          return { status: 'rejected', code: CONTRACT_TRANSITION_CODE };
        }

        inFlight += 1;
        try {
          return await execute(...args);
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          console.error(`WebMCP tool execution failed: ${definition.name}`, error);
          return {
            status: 'rejected',
            code: 'TOOL_EXECUTION_FAILED',
            message: 'The application rejected the operation after an internal execution error.',
          };
        } finally {
          inFlight -= 1;
          if (inFlight === 0 && pending) schedule();
        }
      },
    };
  };

  const waitForInFlightToSettle = async () => {
    while (!destroyed && inFlight > 0) await nextTask();
    // A task boundary closes the race where a native host had already queued an
    // invocation just before quiescing became visible to the wrapper.
    if (!destroyed) await nextTask();
    while (!destroyed && inFlight > 0) await nextTask();
  };

  const clearActiveContract = async () => {
    quiescing = true;
    await waitForInFlightToSettle();
    if (activeActivation) activeActivation.enabled = false;
    previousTools = activeTools;
    activeTools = [];
    activeController?.abort();
    activeController = null;
    activeActivation = null;
    quiescing = false;
  };

  async function compileOnce(capturedRequestSerial) {
    const nextContractSerial = registrationAttemptSerial + 1;
    registrationAttemptSerial = nextContractSerial;
    const candidateController = new AbortController();
    const candidateActivation = { enabled: false };
    const definitions = compileTools(store).map((definition) => wrapExecution({
      ...definition,
      name: `${definition.name}_c${nextContractSerial}`,
    }, candidateActivation));
    const confirmed = [];
    const failures = [];

    for (const definition of definitions) {
      if (destroyed || capturedRequestSerial !== requestSerial) {
        candidateController.abort();
        pending = !destroyed;
        return false;
      }
      try {
        await context.registerTool(definition, { signal: candidateController.signal });
        confirmed.push(definition);
      } catch (error) {
        if (error?.name !== 'AbortError') failures.push({ name: definition.name, error });
      }
    }

    if (destroyed || capturedRequestSerial !== requestSerial) {
      candidateController.abort();
      pending = !destroyed;
      return false;
    }

    if (failures.length > 0 || confirmed.length !== definitions.length) {
      candidateController.abort();
      const summary = failures.length > 0
        ? failures.map(({ name, error }) => `${name}: ${errorMessage(error)}`).join('; ')
        : 'Not all requested tools were confirmed by the host.';
      await clearActiveContract();
      publish({
        health: 'degraded',
        desiredCount: definitions.length,
        registeredCount: 0,
        contractSerial,
        error: summary,
      });
      return false;
    }

    // Do not revoke a tool that is still returning a result to the host. New
    // calls are rejected during this short, fail-closed transition.
    quiescing = true;
    await waitForInFlightToSettle();
    if (destroyed || capturedRequestSerial !== requestSerial) {
      quiescing = false;
      candidateController.abort();
      pending = !destroyed;
      return false;
    }

    const oldController = activeController;
    const oldActivation = activeActivation;
    previousTools = activeTools;
    if (oldActivation) oldActivation.enabled = false;
    oldController?.abort();

    activeTools = confirmed;
    activeController = candidateController;
    activeActivation = candidateActivation;
    candidateActivation.enabled = true;
    contractSerial = nextContractSerial;
    quiescing = false;
    publish({
      health: 'ready',
      desiredCount: definitions.length,
      registeredCount: confirmed.length,
      contractSerial,
      error: null,
    });
    return true;
  }

  async function compilePending() {
    if (destroyed || compiling || inFlight > 0) {
      schedule();
      return;
    }

    compiling = true;
    try {
      while (pending && !destroyed && inFlight === 0) {
        pending = false;
        const capturedRequestSerial = requestSerial;
        await compileOnce(capturedRequestSerial);
      }
    } finally {
      compiling = false;
      if (pending && inFlight === 0) schedule();
    }
  }

  const requestRecompile = () => {
    requestSerial += 1;
    pending = true;
    schedule();
  };

  const computeKey = () => {
    const state = store.state;
    return JSON.stringify({
      generation: state.workspaceGeneration,
      revision: state.scopeRevision,
      epoch: state.actuationEpoch,
      plan: state.verifiedPlan?.planId ?? '',
      evaluation: state.lastEvaluation?.planId ?? '',
      request: state.expansionRequest?.opportunityId ?? '',
      authorization: state.authorization?.planId ?? '',
    });
  };

  let stateKey = computeKey();
  const unsubscribe = store.subscribe(() => {
    const nextKey = computeKey();
    if (nextKey === stateKey) return;
    stateKey = nextKey;
    requestRecompile();
  });

  return {
    context,
    get native() {
      return native;
    },
    get tools() {
      return activeTools;
    },
    get previousTools() {
      return previousTools;
    },
    get status() {
      return { ...status };
    },
    get inFlight() {
      return inFlight;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      if (destroyed) throw new Error('Cannot start a destroyed WebMCP bridge.');
      requestSerial += 1;
      const capturedRequestSerial = requestSerial;
      pending = false;
      compiling = true;
      try {
        await compileOnce(capturedRequestSerial);
      } finally {
        compiling = false;
        if (pending) schedule();
      }
    },
    async whenIdle(timeoutMs = 2_000) {
      const deadline = Date.now() + timeoutMs;
      while (!destroyed && (pending || compiling || inFlight > 0 || quiescing || scheduledTimer !== null)) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for WebMCP bridge to become idle.');
        await nextTask();
      }
    },
    async executeLocal(name, args = {}) {
      const tool = activeTools.find((candidate) => candidate.name === name);
      if (!tool) return { status: 'rejected', code: 'TOOL_NOT_EXPOSED', name };
      return tool.execute(args);
    },
    retry() {
      if (destroyed) return false;
      requestRecompile();
      return true;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      quiescing = true;
      if (scheduledTimer !== null) clearTimeout(scheduledTimer);
      scheduledTimer = null;
      if (activeActivation) activeActivation.enabled = false;
      activeController?.abort();
      activeController = null;
      activeActivation = null;
      activeTools = [];
      previousTools = [];
      unsubscribe();
      publish({
        health: 'stopped',
        desiredCount: 0,
        registeredCount: 0,
        error: null,
      });
      listeners.clear();
    },
  };
}
