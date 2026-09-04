import { performance } from 'node:perf_hooks';
import {
  createStore,
  DEMO_DELIVERY_IDS,
  DEMO_DRIVER_IDS,
  evaluatePlan,
} from '../src/core.js';
import { compileTools } from '../src/scopeCompiler.js';

const store = createStore();
store.setSelection(DEMO_DELIVERY_IDS, [...DEMO_DRIVER_IDS, 'MIKA-03'], 'performance_smoke');

const assignments = [
  { driverId: 'AINO-02', deliveryIds: ['D04', 'D07'] },
  { driverId: 'LEO-05', deliveryIds: ['D09', 'D12'] },
  { driverId: 'MIKA-03', deliveryIds: ['D15'] },
];

for (let index = 0; index < 500; index += 1) evaluatePlan(store.state, assignments);

const evaluationIterations = 10_000;
let startedAt = performance.now();
let result;
for (let index = 0; index < evaluationIterations; index += 1) {
  result = evaluatePlan(store.state, assignments);
}
const evaluationMs = performance.now() - startedAt;

const compileIterations = 10_000;
startedAt = performance.now();
let toolCount = 0;
for (let index = 0; index < compileIterations; index += 1) {
  toolCount = compileTools(store).length;
}
const compileMs = performance.now() - startedAt;

// The host should normally enforce the JSON Schema before invocation, but the
// runtime still bounds hostile input independently. Time only application
// evaluation here; JSON parsing and transport are host responsibilities.
const hostileAssignments = [{
  driverId: 'AINO-02',
  deliveryIds: Array.from({ length: 100_000 }, (_, index) => `D${index}`),
}];
startedAt = performance.now();
const hostileResult = evaluatePlan(store.state, hostileAssignments);
const hostileMs = performance.now() - startedAt;
const hostileCodes = new Set(hostileResult.violations.map((violation) => violation.code));

const checks = [
  ['evaluation remains correct under load', result?.status === 'verified'],
  ['10k plan evaluations complete within 5 seconds', evaluationMs < 5_000],
  ['10k contract compilations complete within 1 second', compileMs < 1_000 && toolCount >= 3],
  ['100k-reference hostile plan is bounded and rejected within 500 ms', hostileMs < 500 && hostileResult.status === 'invalid' && hostileCodes.has('ASSIGNMENT_TOO_LARGE')],
];
const failures = checks.filter(([, passed]) => !passed);

for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} | ${name}`);
console.log(`PLAN_EVALUATION_10K_MS=${evaluationMs.toFixed(1)}`);
console.log(`CONTRACT_COMPILE_10K_MS=${compileMs.toFixed(1)}`);
console.log(`HOSTILE_PLAN_100K_REFS_MS=${hostileMs.toFixed(1)}`);
console.log(`PERFORMANCE_CHECKS=${checks.length - failures.length}/${checks.length} ${failures.length ? 'FAIL' : 'PASS'}`);

if (failures.length > 0) process.exit(1);
