const assert = require("node:assert/strict");
const {
  getOrderSequenceMilestone,
  isOrderSequenceMilestone,
  parseOrderSequence,
} = require("../src/utils/orderMilestones");

assert.deepEqual(parseOrderSequence("#BK00100"), { code: "BK00100", prefix: "BK", number: 100 });
assert.deepEqual(parseOrderSequence("99F00500"), { code: "99F00500", prefix: "99F", number: 500 });
assert.equal(parseOrderSequence("pedido-100"), null);
assert.equal(isOrderSequenceMilestone(99), false);
assert.equal(isOrderSequenceMilestone(100), true);
assert.equal(isOrderSequenceMilestone(500), true);
assert.equal(isOrderSequenceMilestone(600), false);
assert.equal(isOrderSequenceMilestone(1000), true);
assert.equal(isOrderSequenceMilestone(3500), false);
assert.equal(isOrderSequenceMilestone(4000), true);
assert.deepEqual(getOrderSequenceMilestone({ numeroPedido: "BK00100" }), { code: "BK00100", prefix: "BK", number: 100 });
assert.equal(getOrderSequenceMilestone({ numeroPedido: "BK00099" }), null);

console.log("orderMilestones: todos os cenarios passaram.");
