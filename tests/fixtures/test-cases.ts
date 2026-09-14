export const SEQUENTIAL_SOURCE = `
const basePrice = 100;
const taxRate = 0.08;
const calculatedTotal = basePrice + (basePrice * taxRate);
`;

export const IF_ELSE_SOURCE = `
function computeDiscount(isVip: boolean) {
  let discountAmount = 0;
  if (isVip) {
    discountAmount = 25;
  } else {
    discountAmount = 5;
  }
  return discountAmount;
}
`;

export const WHILE_LOOP_SOURCE = `
function retrySync(maxRetries: number) {
  let attempts = 0;
  while (attempts < maxRetries) {
    attempts = attempts + 1;
  }
  return attempts;
}
`;

export const UNREACHABLE_BRANCH_SOURCE = `
function evaluateFeatureGate() {
  if (false) {
    executeLegacyPipeline();
  }
  return 0;
}
`;

export const UNREACHABLE_LOOP_SOURCE = `
function drainPendingBuffer() {
  while (false) {
    processOrphanedEvents();
  }
  return 0;
}
`;

export const SHORT_CIRCUIT_SOURCE = `
function verifyAccess(isAuthorized: boolean) {
  isAuthorized && recordSecurityEvent();
  return isAuthorized;
}
`;
