/**
 * 4Rent Billing & Meter Reading Decision Trees
 * 
 * Formalized decision logic following Agentic Architecture guidelines:
 * - Do One Thing Well
 * - Specific Descriptions
 * - Modularity & Portability
 * - Include Decision Trees
 */

import { Room, BillRecord } from '../types/rental';

/**
 * Result of evaluating a sub-meter reading decision tree.
 */
export interface SubMeterDecisionResult {
  decision: 'ACCEPT_AUTOMATIC' | 'CONFIRM_ROLLOVER' | 'INSPECT_TAMPER_OR_RESET' | 'FALLBACK_MANUAL';
  reason: string;
  calculatedConsumption: number;
  calculatedCost: number;
  recommendedAction: string;
}

/**
 * Evaluates the sub-meter reading decision tree when moving from previous to current reading.
 * 
 * Decision Tree Flow:
 * 1. Is previous or current reading NaN or negative? -> FALLBACK_MANUAL
 * 2. Is current >= previous?
 *    a. If consumption <= 1500 kWh -> ACCEPT_AUTOMATIC
 *    b. If consumption > 1500 kWh -> CONFIRM_ROLLOVER (unusually high consumption warning)
 * 3. Is current < previous?
 *    a. Is previous > 9000 and current < 1000? -> CONFIRM_ROLLOVER (cyclometer mechanical wrap around 9999.9 -> 0000.0)
 *    b. Otherwise -> INSPECT_TAMPER_OR_RESET (meter replaced, tampered, or wrong room photo)
 */
export function evaluateSubMeterDecisionTree(
  prevReading: number,
  currReading: number,
  electricRate: number
): SubMeterDecisionResult {
  if (isNaN(prevReading) || isNaN(currReading) || prevReading < 0 || currReading < 0) {
    return {
      decision: 'FALLBACK_MANUAL',
      reason: 'Invalid reading values detected. Numerical inputs must be non-negative numbers.',
      calculatedConsumption: 0,
      calculatedCost: 0,
      recommendedAction: 'Inspect meter faceplate and enter digits manually.',
    };
  }

  const rate = Math.max(0, electricRate || 0);

  // Normal consumption branch
  if (currReading >= prevReading) {
    const consumption = parseFloat((currReading - prevReading).toFixed(1));
    const cost = parseFloat((consumption * rate).toFixed(2));

    if (consumption > 1500) {
      return {
        decision: 'CONFIRM_ROLLOVER',
        reason: `High sub-meter consumption detected (${consumption.toFixed(1)} kWh). Exceeds typical residential threshold.`,
        calculatedConsumption: consumption,
        calculatedCost: cost,
        recommendedAction: 'Verify tenant AC or heavy equipment usage with tenant before releasing statement.',
      };
    }

    return {
      decision: 'ACCEPT_AUTOMATIC',
      reason: `Normal consumption verified (${consumption.toFixed(1)} kWh at ₱${rate.toFixed(2)}/kWh).`,
      calculatedConsumption: consumption,
      calculatedCost: cost,
      recommendedAction: 'Auto-insert reading and generate official statement.',
    };
  }

  // Dial wrap-around branch (9999.9 -> 0000.0)
  if (prevReading >= 9000 && currReading <= 1000) {
    const wrappedConsumption = parseFloat((10000 - prevReading + currReading).toFixed(1));
    const cost = parseFloat((wrappedConsumption * rate).toFixed(2));
    return {
      decision: 'CONFIRM_ROLLOVER',
      reason: `Cyclometer dial rollover detected (Wrapped past 9,999.9 kWh to ${currReading.toFixed(1)} kWh).`,
      calculatedConsumption: wrappedConsumption,
      calculatedCost: cost,
      recommendedAction: 'Confirm 10,000 kWh mechanical wrap-around with landlord.',
    };
  }

  // Negative difference branch (meter replacement or inverted photo)
  return {
    decision: 'INSPECT_TAMPER_OR_RESET',
    reason: `Current reading (${currReading.toFixed(1)}) is lower than previous reading (${prevReading.toFixed(1)}).`,
    calculatedConsumption: 0,
    calculatedCost: 0,
    recommendedAction: 'Check if sub-meter was recently replaced by electrician, or if previous slot photo was swapped.',
  };
}

/**
 * Result of payment and overpayment accounting decision tree.
 */
export interface PaymentAccountingDecision {
  totalAmountDue: number;
  advanceDeducted: number;
  netPayableAfterAdvance: number;
  overpaymentCreditedToAdvance: number;
  remainingUnpaidBalance: number;
  finalRoomAdvanceBalance: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
}

/**
 * Evaluates landlord payment application under strict Philippine Rent Law (RA 10173 & Rent Control Guidelines).
 * 
 * Rules:
 * 1. Security Deposit is strictly non-deductible for rent during active tenancy (reserved for property repairs).
 * 2. Available Advance Rent automatically deducts from the gross bill due.
 * 3. Any overpayment made by tenant strictly credits into Advance Rent for future months.
 * 4. Any unpaid remaining balance carries over into Unpaid Carried Balance.
 */
export function evaluatePaymentAccountingDecision(
  baseRent: number,
  electricCost: number,
  carryOverUnpaid: number,
  currentRoomAdvance: number,
  amountPaid: number
): PaymentAccountingDecision {
  const safeBase = Math.max(0, baseRent || 0);
  const safeElectric = Math.max(0, electricCost || 0);
  const safeCarryOver = Math.max(0, carryOverUnpaid || 0);
  const safeAdvance = Math.max(0, currentRoomAdvance || 0);
  const safePaid = Math.max(0, amountPaid || 0);

  const totalAmountDue = parseFloat((safeBase + safeElectric + safeCarryOver).toFixed(2));

  // Step 1: Auto-deduct advance rent
  const advanceDeducted = Math.min(safeAdvance, totalAmountDue);
  const netPayable = parseFloat((totalAmountDue - advanceDeducted).toFixed(2));

  // Step 2: Handle tenant payment
  let overpaymentCredited = 0;
  let remainingUnpaid = 0;
  let finalAdvance = safeAdvance - advanceDeducted;
  let paymentStatus: 'paid' | 'partial' | 'unpaid' = 'unpaid';

  if (safePaid >= netPayable) {
    overpaymentCredited = parseFloat((safePaid - netPayable).toFixed(2));
    finalAdvance = parseFloat((finalAdvance + overpaymentCredited).toFixed(2));
    remainingUnpaid = 0;
    paymentStatus = 'paid';
  } else if (safePaid > 0) {
    remainingUnpaid = parseFloat((netPayable - safePaid).toFixed(2));
    paymentStatus = 'partial';
  } else {
    remainingUnpaid = netPayable;
    paymentStatus = 'unpaid';
  }

  return {
    totalAmountDue,
    advanceDeducted,
    netPayableAfterAdvance: netPayable,
    overpaymentCreditedToAdvance: overpaymentCredited,
    remainingUnpaidBalance: remainingUnpaid,
    finalRoomAdvanceBalance: finalAdvance,
    paymentStatus,
  };
}
