import { strict as assert } from 'node:assert';
import {
  buildScopedRoutePatch,
  createStore,
  evaluatePlan,
  indexAssignmentOwners,
  stableStringify,
  validateLiveAssignmentGraph,
} from '../src/core.js';

const ITERATIONS = 5_000;
let randomState = 0x00c0ffee;
let validPlans = 0;
let appliedPlans = 0;

function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x1_0000_0000;
}

function pick(values) {
  return values[Math.floor(random() * values.length)];
}

function ownerOf(owners, deliveryId) {
  return owners.get(deliveryId) ?? null;
}

for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
  const store = createStore();
  const allDeliveryIds = store.state.deliveries.map((delivery) => delivery.id);
  const allDriverIds = store.state.drivers.map((driver) => driver.id);
  const selectedDeliveryIds = allDeliveryIds.filter(() => random() < 0.35);
  const selectedDriverIds = allDriverIds.filter(() => random() < 0.55);
  if (selectedDeliveryIds.length === 0) selectedDeliveryIds.push(pick(allDeliveryIds));
  if (selectedDriverIds.length === 0) selectedDriverIds.push(pick(allDriverIds));
  store.setSelection(selectedDeliveryIds, selectedDriverIds, 'deterministic_fuzz');

  const assignmentCount = Math.floor(random() * (selectedDriverIds.length + 3));
  const assignments = [];
  for (let index = 0; index < assignmentCount; index += 1) {
    const driverId = random() < 0.9 ? pick(selectedDriverIds) : pick(allDriverIds);
    const candidateDeliveries = random() < 0.9 ? selectedDeliveryIds : allDeliveryIds;
    const deliveryIds = candidateDeliveries.filter(() => random() < 0.3);
    if (deliveryIds.length === 0 && random() < 0.8) deliveryIds.push(pick(candidateDeliveries));
    if (deliveryIds.length > 0 && random() < 0.05) deliveryIds.push(deliveryIds[0]);
    assignments.push({ driverId, deliveryIds });
  }

  const result = evaluatePlan(store.state, assignments);
  const patch = buildScopedRoutePatch(store.state, result.assignments);

  assert.equal(
    stableStringify(patch.protectedAfter),
    stableStringify(patch.protectedBefore),
    `protected commitments changed during iteration ${iteration}`,
  );
  for (const driverId of allDriverIds.filter((id) => !selectedDriverIds.includes(id))) {
    assert.deepEqual(
      patch.nextAssignments[driverId],
      patch.before[driverId],
      `unselected driver ${driverId} changed during iteration ${iteration}`,
    );
  }

  if (!result.valid) continue;
  validPlans += 1;
  const beforeOwners = indexAssignmentOwners(store.state.liveAssignments).owners;
  store.setEvaluation(result);
  assert.equal(store.authorizeExactPlan(result.planId), true);
  const applied = store.applyVerifiedPlan(result.planId, store.state.authorization.actuationEpoch);
  assert.equal(applied.status, 'applied');
  appliedPlans += 1;
  assert.deepEqual(validateLiveAssignmentGraph(store.state), []);

  const afterOwners = indexAssignmentOwners(store.state.liveAssignments).owners;
  for (const deliveryId of allDeliveryIds.filter((id) => !selectedDeliveryIds.includes(id))) {
    assert.equal(
      ownerOf(afterOwners, deliveryId),
      ownerOf(beforeOwners, deliveryId),
      `outside-scope delivery ${deliveryId} changed owner during iteration ${iteration}`,
    );
  }
}

assert.ok(validPlans >= 100, `expected broad valid-plan coverage, got ${validPlans}`);
assert.equal(appliedPlans, validPlans);
console.log(`FUZZ_ITERATIONS=${ITERATIONS}`);
console.log(`FUZZ_VALID_PLANS=${validPlans}`);
console.log(`FUZZ_SECURITY_CHECKS=PASS`);
