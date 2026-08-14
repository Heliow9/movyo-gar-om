function normalizeOrderCount(value) {
  const count = Math.floor(Number(value));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function nextDailyOrderMilestone(afterCount) {
  const count = normalizeOrderCount(afterCount);

  if (count < 500) return (Math.floor(count / 100) + 1) * 100;
  if (count < 3000) return (Math.floor(count / 500) + 1) * 500;
  return (Math.floor(count / 1000) + 1) * 1000;
}

function crossedDailyOrderMilestones(previousCount, currentCount) {
  const previous = normalizeOrderCount(previousCount);
  const current = normalizeOrderCount(currentCount);
  if (current <= previous) return [];

  const crossed = [];
  let milestone = nextDailyOrderMilestone(previous);
  while (milestone <= current) {
    crossed.push(milestone);
    milestone = nextDailyOrderMilestone(milestone);
  }
  return crossed;
}

function latestCrossedDailyOrderMilestone(previousCount, currentCount) {
  const crossed = crossedDailyOrderMilestones(previousCount, currentCount);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

module.exports = {
  crossedDailyOrderMilestones,
  latestCrossedDailyOrderMilestone,
  nextDailyOrderMilestone,
  normalizeOrderCount,
};
