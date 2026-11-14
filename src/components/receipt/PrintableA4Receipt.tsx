import React from 'react';
import { Lock, ShieldCheck, Zap } from 'lucide-react';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
  generateReceiptVerificationCode,
  maskPhoneNumber,
} from '../../utils/billingCalculator';
import { formatKwhReading } from '../../utils/financialEngine';

interface PrintableA4ReceiptProps {
  bill: BillRecord;
  settings: AppSettings;
  maskContactsOnReceipt: boolean;
  prevMeterProofImg: string;
  currMeterProofImg: string;
  remainingAdvanceCredit: number;
}

function getCoverageRangeLabel(billingPeriod: string, dueDateIso: string): {
  coverage: string;
  dueLabel: string;
  dueDay: number;
} {
  const parsedDue = new Date(dueDateIso);
  const validDue = Number.isNaN(parsedDue.getTime()) ? new Date() : parsedDue;
  const parsedPeriod = new Date(`1 ${billingPeriod}`);
  const startDate = Number.isNaN(parsedPeriod.getTime())
    ? new Date(validDue.getFullYear(), validDue.getMonth(), 1)
    : new Date(parsedPeriod.getFullYear(), parsedPeriod.getMonth(), 1);

  const curYear = startDate.getFullYear();
  const curMonth = startDate.getMonth();
  const curLastDay = new Date(curYear, curMonth + 1, 0).getDate();
  const curMonthShort = startDate.toLocaleDateString('en-US', { month: 'short' });

  return {
    coverage: `${curMonthShort} 1 - ${curLastDay}, ${curYear}`,
    dueLabel: validDue.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    dueDay: clampDueDayOneToTen(validDue.getDate()),
  };
}

/**
 * Dedicated A4 Portrait Receipt Document (794px width @ 96dpi -> 595.28 x 841.89 pt PDF).
 * Designed cleanly for 1-2 page PDF export and physical A4 printing with zero UI chrome.
 */
export const PrintableA4Receipt = React.forwardRef<HTMLDivElement, PrintableA4ReceiptProps>(
  (
    {
      bill,
      settings,
      maskContactsOnReceipt,
      prevMeterProofImg,
      currMeterProofImg,
      remainingAdvanceCredit,
    },
    ref
  ) => {
    const verificationSeal = generateReceiptVerificationCode(
      bill.receiptNo,
      bill.roomName,
      bill.totalAmountDue
    );
    const { coverage, dueLabel, dueDay } = getCoverageRangeLabel(
      bill.billingPeriod,
      bill.dueDate
    );

    const formattedIssueDate = new Date(bill.createdAt).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const formattedPaidAt =
      bill.paidAt && bill.status === 'paid'
        ? new Date(bill.paidAt).toLocaleDateString('en-PH', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : null;

    const propertyTitle = (settings.apartmentName || '').trim();
    const displayLandlordName =
      settings.landlordName && settings.landlordName !== 'Property Administrator'
        ? settings.landlordName
        : 'Authorized Landlord';
    const isLocked = Boolean(bill.isLocked || bill.isArchived || bill.status === 'paid');

    const statusBadgeClass =
      bill.status === 'paid'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-600'
        : bill.status === 'partial'
        ? 'bg-amber-50 text-amber-800 border-amber-600'
        : 'bg-red-50 text-red-800 border-red-600';

    const statusLabel =
      bill.status === 'paid'
        ? 'PAID IN FULL'
        : bill.status === 'partial'
        ? 'PARTIALLY PAID'
        : 'UNPAID / DUE';

    const advanceApplied = Number(bill.advanceApplied || 0);
    const securityDepositApplied = Number(bill.securityDepositApplied || 0);
    const legacyDepositApplied =
      bill.depositApplied > 0 && advanceApplied === 0 && securityDepositApplied === 0
        ? bill.depositApplied
        : 0;
    const otherCharges = Number(bill.otherCharges || 0);
    const grossCharges =
      typeof bill.grossCharges === 'number'
        ? bill.grossCharges
        : bill.baseRent +
          bill.electricTotal +
          bill.previousBalanceCarryOver +
          otherCharges;

    const resolvedRemainingAdvance = Math.max(
      0,
      typeof bill.advanceBalanceAfter === 'number'
        ? bill.advanceBalanceAfter
        : remainingAdvanceCredit
    );
    const showRemainingAdvance =
      resolvedRemainingAdvance > 0 ||
      advanceApplied > 0 ||
      bill.overpaymentToAdvance > 0 ||
      (bill.advanceBalanceBefore || 0) > 0;

    return (
      <div
        ref={ref}
        id="printable-receipt-area"
        className="printable-a4-sheet w-[794px] bg-white text-slate-900 px-8 py-6 font-sans leading-snug box-border"
      >
        {/* Block 1: Letterhead & Official Document Metadata */}
        <div
          data-pdf-block
          className="border-b-2 border-slate-900 pb-3.5 mb-3.5 flex items-start justify-between gap-4"
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-900 text-amber-400 text-[10px] font-black tracking-widest uppercase">
                4Rent Management System
              </span>
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-700 text-[10px] font-bold uppercase">
                  <Lock className="w-2.5 h-2.5" />
                  Locked Record
                </span>
              )}
            </div>
            {propertyTitle && propertyTitle !== '4Rent Management System' && (
              <h1 className="text-[18px] font-black uppercase tracking-tight text-slate-950 pt-1">
                {propertyTitle}
              </h1>
            )}
            <p className="text-[12px] font-extrabold uppercase tracking-wider text-slate-700">
              Official Statement of Account &amp; Sub-Meter Receipt
            </p>
            <p className="text-[11px] text-slate-600">
              Issuer: {displayLandlordName}
              {settings.landlordPhone
                ? ` | Contact: ${maskPhoneNumber(settings.landlordPhone, maskContactsOnReceipt)}`
                : ''}
            </p>
          </div>

          <div className="text-right space-y-1 shrink-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Receipt Number
            </div>
            <div className="text-[15px] font-black font-mono-num text-slate-950">
              {bill.receiptNo}
            </div>
            <div className="text-[10.5px] font-mono-num text-slate-600">
              Issued: {formattedIssueDate}
            </div>
            <div>
              <span
                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${statusBadgeClass}`}
              >
                {statusLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Block 2: Tenant, Room & Billing Period Summary */}
        <div
          data-pdf-block
          className="grid grid-cols-4 border border-slate-300 rounded-lg overflow-hidden mb-3.5 text-[11px]"
        >
          <div className="p-2.5 bg-slate-50 border-r border-slate-300">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Tenant Name
            </div>
            <div className="font-black text-slate-950 text-[12px] mt-0.5 break-words">
              {bill.tenantName || 'Registered Tenant'}
            </div>
            {bill.tenantPhone && (
              <div className="font-mono-num text-[10px] text-slate-600 mt-0.5">
                {maskPhoneNumber(bill.tenantPhone, maskContactsOnReceipt)}
              </div>
            )}
          </div>

          <div className="p-2.5 bg-slate-50 border-r border-slate-300">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Room Number
            </div>
            <div className="font-black text-slate-950 text-[12px] mt-0.5">
              {bill.roomName}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              Payment Window: 1st-10th (Day {dueDay})
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 border-r border-slate-300">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Billing Period
            </div>
            <div className="font-black text-slate-950 text-[12px] mt-0.5">
              {bill.billingPeriod}
            </div>
            <div className="text-[10px] font-mono-num text-slate-600 mt-0.5">
              Coverage: {coverage}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Due Date &amp; Rate
            </div>
            <div className="font-black font-mono-num text-slate-950 text-[12px] mt-0.5">
              {dueLabel}
            </div>
            <div className="text-[10px] font-mono-num text-slate-700 mt-0.5">
              Rate: {formatPeso(bill.electricRate)}/kWh
            </div>
          </div>
        </div>

        {/* Block 3: Sub-Meter Readings & Proportional Photographic Proof */}
        <div
          data-pdf-block
          className="border border-slate-300 rounded-lg p-3 bg-slate-50/70 mb-3.5"
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-900">
                Sub-Meter Reading &amp; Photographic Proof
              </span>
            </div>
            <span className="text-[10.5px] font-mono-num font-bold text-slate-700">
              Consumption: {formatKwhReading(bill.consumptionKwh)} kWh x {formatPeso(bill.electricRate)}/kWh ={' '}
              <strong className="text-slate-950">{formatPeso(bill.electricTotal)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-slate-200 rounded bg-white p-2">
              <div className="flex items-center justify-between text-[10.5px] pb-1 mb-1.5 border-b border-slate-200">
                <span className="font-bold uppercase text-slate-600">Previous Meter Reading</span>
                <span className="font-mono-num font-black text-slate-950">
                  {formatKwhReading(bill.prevReading)} kWh
                </span>
              </div>
              {prevMeterProofImg && (
                <div className="h-[112px] w-full bg-slate-50 rounded border border-slate-200 flex items-center justify-center p-1 overflow-hidden">
                  <img
                    src={prevMeterProofImg}
                    alt="Previous Meter Reading Proof"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
            </div>

            <div className="border border-slate-200 rounded bg-white p-2">
              <div className="flex items-center justify-between text-[10.5px] pb-1 mb-1.5 border-b border-slate-200">
                <span className="font-bold uppercase text-slate-600">Current Meter Reading</span>
                <span className="font-mono-num font-black text-slate-950">
                  {formatKwhReading(bill.currReading)} kWh
                </span>
              </div>
              {currMeterProofImg && (
                <div className="h-[112px] w-full bg-slate-50 rounded border border-slate-200 flex items-center justify-center p-1 overflow-hidden">
                  <img
                    src={currMeterProofImg}
                    alt="Current Meter Reading Proof"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2 text-[10.5px] bg-white border border-slate-200 rounded px-3 py-1.5">
            <div>
              <span className="text-slate-500">Previous:</span>{' '}
              <strong className="font-mono-num text-slate-950">
                {formatKwhReading(bill.prevReading)} kWh
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Current:</span>{' '}
              <strong className="font-mono-num text-slate-950">
                {formatKwhReading(bill.currReading)} kWh
              </strong>
            </div>
            <div>
              <span className="text-slate-500">Consumption:</span>{' '}
              <strong className="font-mono-num text-slate-950">
                {formatKwhReading(bill.consumptionKwh)} kWh
              </strong>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Rate:</span>{' '}
              <strong className="font-mono-num text-slate-950">
                {formatPeso(bill.electricRate)}/kWh
              </strong>
            </div>
          </div>
        </div>

        {/* Block 4: Billing Summary & Financial Settlement */}
        <div
          data-pdf-block
          className="border border-slate-300 rounded-lg overflow-hidden bg-white mb-3.5"
        >
          <div className="bg-slate-900 text-white px-3.5 py-2 flex items-center justify-between text-[10.5px] font-black uppercase tracking-wider">
            <span>Billing Summary</span>
            <span>Amount (PHP)</span>
          </div>

          <table className="w-full text-[11.5px] border-collapse">
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-3.5 py-2 text-slate-800">
                  Monthly Rent ({bill.billingPeriod})
                </td>
                <td className="px-3.5 py-2 text-right font-mono-num font-bold text-slate-950">
                  {formatPeso(bill.baseRent)}
                </td>
              </tr>

              <tr>
                <td className="px-3.5 py-2 text-slate-800">
                  Electricity Charges ({formatKwhReading(bill.consumptionKwh)} kWh @{' '}
                  {formatPeso(bill.electricRate)}/kWh)
                </td>
                <td className="px-3.5 py-2 text-right font-mono-num font-bold text-slate-950">
                  {formatPeso(bill.electricTotal)}
                </td>
              </tr>

              {bill.previousBalanceCarryOver > 0 && (
                <tr className="bg-red-50/50">
                  <td className="px-3.5 py-2 font-semibold text-red-800">
                    Other Charges: Unpaid Balance Carried Over
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono-num font-bold text-red-800">
                    {formatPeso(bill.previousBalanceCarryOver)}
                  </td>
                </tr>
              )}

              {otherCharges !== 0 && (
                <tr>
                  <td className="px-3.5 py-2 text-slate-800">
                    Other Charges or Deductions
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono-num font-bold text-slate-950">
                    {otherCharges < 0 ? `-${formatPeso(Math.abs(otherCharges))}` : formatPeso(otherCharges)}
                  </td>
                </tr>
              )}

              {(advanceApplied > 0 || securityDepositApplied > 0 || legacyDepositApplied > 0) && (
                <tr className="bg-slate-50">
                  <td className="px-3.5 py-1.5 font-semibold text-slate-700">
                    Total Monthly Charges
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-slate-900">
                    {formatPeso(grossCharges)}
                  </td>
                </tr>
              )}

              {advanceApplied > 0 && (
                <tr className="bg-emerald-50/50">
                  <td className="px-3.5 py-2 font-bold text-emerald-900">
                    Advance Credit Applied
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono-num font-bold text-emerald-800">
                    -{formatPeso(advanceApplied)}
                  </td>
                </tr>
              )}

              {securityDepositApplied > 0 && (
                <tr className="bg-emerald-50/50">
                  <td className="px-3.5 py-2 font-bold text-emerald-900">
                    Required Deposit Deduction
                    {(bill.securityDepositRemainingAfterBill || 0) > 0
                      ? ` (${formatPeso(bill.securityDepositRemainingAfterBill || 0)} held)`
                      : ''}
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono-num font-bold text-emerald-800">
                    -{formatPeso(securityDepositApplied)}
                  </td>
                </tr>
              )}

              {legacyDepositApplied > 0 && (
                <tr className="bg-emerald-50/50">
                  <td className="px-3.5 py-2 font-bold text-emerald-900">
                    Deposit / Advance Credit Applied
                  </td>
                  <td className="px-3.5 py-2 text-right font-mono-num font-bold text-emerald-800">
                    -{formatPeso(legacyDepositApplied)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="bg-slate-50 border-t-2 border-slate-900 px-3.5 py-2.5 space-y-1.5 text-[11.5px]">
            <div className="flex items-center justify-between">
              <span className="font-black uppercase text-slate-950 text-[12.5px]">
                Total Amount Due
              </span>
              <span className="font-mono-num font-black text-slate-950 text-[16px]">
                {formatPeso(bill.totalAmountDue)}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700">
              <span>
                Actual Payment Received{bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}
              </span>
              <span className="font-mono-num font-bold text-emerald-800">
                {formatPeso(bill.amountPaid)}
              </span>
            </div>

            <div className="flex items-center justify-between font-black">
              <span className="text-slate-900">Remaining Balance</span>
              <span
                className={`font-mono-num ${
                  bill.remainingBalance > 0 ? 'text-red-700' : 'text-emerald-800'
                }`}
              >
                {formatPeso(bill.remainingBalance)}
              </span>
            </div>

            {bill.overpaymentToAdvance > 0 && (
              <div className="flex items-center justify-between font-semibold text-emerald-800">
                <span>Excess Credited to Advance Balance</span>
                <span className="font-mono-num">
                  +{formatPeso(bill.overpaymentToAdvance)}
                </span>
              </div>
            )}

            {showRemainingAdvance && (
              <div className="flex items-center justify-between font-bold text-emerald-900 pt-1 border-t border-slate-200">
                <span>Remaining Advance Credit</span>
                <span className="font-mono-num">
                  {formatPeso(resolvedRemainingAdvance)}
                </span>
              </div>
            )}

            {bill.adjustmentNotes && bill.adjustmentNotes.length > 0 && (
              <div className="pt-1 border-t border-slate-200 text-[10.5px] text-slate-600">
                Remarks:{' '}
                {bill.adjustmentNotes
                  .map((note) => note.reason)
                  .filter(Boolean)
                  .join(' | ')}
              </div>
            )}
          </div>
        </div>

        {/* Block 5: Payment Verification & Receipt Seal */}
        <div
          data-pdf-block
          className="border border-slate-300 rounded-lg bg-slate-50 px-3.5 py-2.5 flex items-center justify-between gap-4 text-[10.5px]"
        >
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <div className="font-bold text-slate-900">
                Payment Verification: {statusLabel}
                {formattedPaidAt ? ` (${formattedPaidAt})` : ''}
              </div>
              <div className="text-slate-600">
                4Rent Official Billing Record | Receipt {bill.receiptNo}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Receipt Seal / Verification Reference
            </div>
            <div className="font-mono-num font-black text-emerald-800 text-[11px]">
              {verificationSeal}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

PrintableA4Receipt.displayName = 'PrintableA4Receipt';
