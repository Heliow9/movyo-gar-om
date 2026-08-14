const assert = require("node:assert/strict");
const {
  crossedDailyOrderMilestones,
  latestCrossedDailyOrderMilestone,
  nextDailyOrderMilestone,
} = require("../src/utils/orderMilestones");

assert.equal(nextDailyOrderMilestone(0), 100);
assert.equal(nextDailyOrderMilestone(100), 200);
assert.equal(nextDailyOrderMilestone(499), 500);
assert.equal(nextDailyOrderMilestone(500), 1000);
assert.equal(nextDailyOrderMilestone(2999), 3000);
assert.equal(nextDailyOrderMilestone(3000), 4000);
assert.equal(nextDailyOrderMilestone(10000), 11000);

assert.equal(latestCrossedDailyOrderMilestone(495, 499), null);
assert.equal(latestCrossedDailyOrderMilestone(495, 500), 500);
assert.equal(latestCrossedDailyOrderMilestone(500, 999), null);
assert.equal(latestCrossedDailyOrderMilestone(999, 1000), 1000);
assert.equal(latestCrossedDailyOrderMilestone(3000, 3999), null);
assert.equal(latestCrossedDailyOrderMilestone(3999, 4000), 4000);
assert.equal(latestCrossedDailyOrderMilestone(500, 499), null);
assert.deepEqual(crossedDailyOrderMilestones(495, 1500), [500, 1000, 1500]);

console.log("orderMilestones: todos os cenarios passaram.");
