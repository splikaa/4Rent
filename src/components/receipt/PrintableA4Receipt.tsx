import React from 'react';
import { Lock, ShieldCheck, Zap } from 'lucide-react';
import { AppSettings, BillRecord } from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
  generateReceiptVerificationCode,
  maskPhoneNumber,
} from '../../utils/billingCalculator';
import {
  computeBillComponentBalances,
  formatKwhReading,
} from '../../utils/financialEngine';

interface PrintableA4ReceiptProps {
  bill: BillRecord;
  settings: AppSettings;
  maskContactsOnReceipt: boolean;
  prevMeterProofImg: string;
  currMeterProofImg: string;
  prevMeterCropImg?: string;
  currMeterCropImg?: string;
  remainingAdvanceCredit: number;
  interactiveMode?: boolean;
  onInspectPhoto?: (
    fullImg: string,
    title: string,
    cropImg?: string,
    readingValue?: string
  ) => void;
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
export const PrintableA4Receipt = React.forwardRef(
  function PrintableA4ReceiptInner(
    {
      bill,
      settings,
      maskContactsOnReceipt,
      prevMeterProofImg,
      currMeterProofImg,
      prevMeterCropImg,
      currMeterCropImg,
      remainingAdvanceCredit,
      interactiveMode = false,
      onInspectPhoto,
    }: PrintableA4ReceiptProps,
    ref: React.ForwardedRef<HTMLDivElement>
  ) {
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
    const totalDeductions =
      advanceApplied + securityDepositApplied + legacyDepositApplied;
    const otherCharges = Number(bill.otherCharges || 0);
    const latePenalty = Number(bill.latePenalty || 0);
    const grossCharges =
      typeof bill.grossCharges === 'number'
        ? bill.grossCharges
        : bill.baseRent +
          latePenalty +
          bill.electricTotal +
          bill.previousBalanceCarryOver +
          otherCharges;
    const componentBalances = computeBillComponentBalances(bill);
    const totalRentDue =
      typeof bill.totalRentDue === 'number'
        ? bill.totalRentDue
        : bill.baseRent + latePenalty;

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
    const showRemainingSecurityDeposit =
      securityDepositApplied > 0 ||
      typeof bill.securityDepositRemainingAfterBill === 'number';
    const remainingSecurityDeposit = Math.max(
      0,
      Number(bill.securityDepositRemainingAfterBill ?? 0)
    );
    const hasInteractiveLightbox = Boolean(interactiveMode && onInspectPhoto);

    return (
      <div
        ref={ref}
        id={interactiveMode ? 'printable-receipt-preview' : 'printable-receipt-area'}
        className={
          interactiveMode
            ? 'w-full max-w-[794px] mx-auto bg-white text-slate-900 px-3.5 sm:px-7 py-5 font-sans leading-snug box-border rounded-2xl shadow-2xl border border-slate-200'
            : 'printable-a4-sheet w-[794px] bg-white text-slate-900 px-8 py-6 font-sans leading-snug box-border'
        }
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
          className={`grid ${
            interactiveMode ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4'
          } border border-slate-300 rounded-lg overflow-hidden mb-3.5 text-[11px]`}
        >
          <div
            className={`p-2.5 bg-slate-50 border-r border-slate-300 ${
              interactiveMode ? 'border-b sm:border-b-0' : ''
            }`}
          >
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

          <div
            className={`p-2.5 bg-slate-50 border-slate-300 ${
              interactiveMode
                ? 'sm:border-r border-b sm:border-b-0'
                : 'border-r'
            }`}
          >
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Room Number
            </div>
            <div className="font-black text-slate-950 text-[12px] mt-0.5">
              {bill.roomName}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              Cycle Schedule: 1st-10th Window
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
            <div className="text-[10px] font-mono-num font-bold text-slate-800 mt-0.5">
              Rate: {formatPeso(bill.electricRate)}/kWh
            </div>
          </div>

          <div className="p-2.5 bg-slate-50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
              Due Date
            </div>
            <div className="font-black font-mono-num text-slate-950 text-[12px] mt-0.5">
              {dueLabel}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              Payment Window: 1st-10th (Day {dueDay})
            </div>
          </div>
        </div>

        {/* Block 3: Sub-Meter Readings & Dual Full + Cropped Photographic Proof */}
        <div
          data-pdf-block
          className="border border-slate-300 rounded-lg p-3 bg-slate-50/70 mb-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-200">
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

          <div
            className={`grid ${
              interactiveMode ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2'
            } gap-3`}
          >
            {/* Previous Meter Card: Full Sub-Meter + Cropped Register Value */}
            <div className="border border-slate-200 rounded bg-white p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px] pb-1 border-b border-slate-200">
                <span className="font-bold uppercase text-slate-600">Previous Meter Reading</span>
                <span className="font-mono-num font-black text-slate-950">
                  {formatKwhReading(bill.prevReading)} kWh
                </span>
              </div>
              <div
                className={`grid ${
                  prevMeterProofImg && prevMeterCropImg ? 'grid-cols-[1.3fr_1fr]' : 'grid-cols-1'
                } gap-1.5`}
              >
                {prevMeterProofImg && (
                  <div
                    onClick={() => {
                      if (hasInteractiveLightbox && onInspectPhoto) {
                        onInspectPhoto(
                          prevMeterProofImg,
                          `Previous Sub-Meter | ${bill.roomName}`,
                          prevMeterCropImg,
                          `${formatKwhReading(bill.prevReading)} kWh`
                        );
                      }
                    }}
                    className={`relative h-[104px] w-full bg-slate-50 rounded border border-slate-200 flex flex-col items-center justify-center p-1 overflow-hidden ${
                      hasInteractiveLightbox ? 'cursor-zoom-in hover:border-amber-500 transition' : ''
                    }`}
                  >
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[8px] font-bold uppercase tracking-wider">
                      Full Meter
                    </span>
                    <img
                      src={prevMeterProofImg}
                      alt="Previous Meter Full Sub-Meter Photo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
                {prevMeterCropImg && (
                  <div
                    onClick={() => {
                      if (hasInteractiveLightbox && onInspectPhoto) {
                        onInspectPhoto(
                          prevMeterProofImg || prevMeterCropImg,
                          `Previous Sub-Meter | ${bill.roomName}`,
                          prevMeterCropImg,
                          `${formatKwhReading(bill.prevReading)} kWh`
                        );
                      }
                    }}
                    className={`relative h-[104px] w-full bg-amber-50/40 rounded border border-amber-300 flex flex-col items-center justify-center p-1 overflow-hidden ${
                      hasInteractiveLightbox ? 'cursor-zoom-in hover:border-amber-500 transition' : ''
                    }`}
                  >
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[8px] font-black uppercase tracking-wider">
                      Cropped Value
                    </span>
                    <img
                      src={prevMeterCropImg}
                      alt="Previous Meter Cropped Value"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasInteractiveLightbox && (prevMeterProofImg || prevMeterCropImg) && (
                <button
                  type="button"
                  onClick={() =>
                    onInspectPhoto?.(
                      prevMeterProofImg || prevMeterCropImg || '',
                      `Previous Sub-Meter | ${bill.roomName}`,
                      prevMeterCropImg,
                      `${formatKwhReading(bill.prevReading)} kWh`
                    )
                  }
                  className="no-print w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer transition"
                >
                  Inspect Full + Cropped 1:1
                </button>
              )}
            </div>

            {/* Current Meter Card: Full Sub-Meter + Cropped Register Value */}
            <div className="border border-slate-200 rounded bg-white p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px] pb-1 border-b border-slate-200">
                <span className="font-bold uppercase text-slate-600">Current Meter Reading</span>
                <span className="font-mono-num font-black text-slate-950">
                  {formatKwhReading(bill.currReading)} kWh
                </span>
              </div>
              <div
                className={`grid ${
                  currMeterProofImg && currMeterCropImg ? 'grid-cols-[1.3fr_1fr]' : 'grid-cols-1'
                } gap-1.5`}
              >
                {currMeterProofImg && (
                  <div
                    onClick={() => {
                      if (hasInteractiveLightbox && onInspectPhoto) {
                        onInspectPhoto(
                          currMeterProofImg,
                          `Current Sub-Meter | ${bill.roomName}`,
                          currMeterCropImg,
                          `${formatKwhReading(bill.currReading)} kWh`
                        );
                      }
                    }}
                    className={`relative h-[104px] w-full bg-slate-50 rounded border border-slate-200 flex flex-col items-center justify-center p-1 overflow-hidden ${
                      hasInteractiveLightbox ? 'cursor-zoom-in hover:border-amber-500 transition' : ''
                    }`}
                  >
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/80 text-white text-[8px] font-bold uppercase tracking-wider">
                      Full Meter
                    </span>
                    <img
                      src={currMeterProofImg}
                      alt="Current Meter Full Sub-Meter Photo"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
                {currMeterCropImg && (
                  <div
                    onClick={() => {
                      if (hasInteractiveLightbox && onInspectPhoto) {
                        onInspectPhoto(
                          currMeterProofImg || currMeterCropImg,
                          `Current Sub-Meter | ${bill.roomName}`,
                          currMeterCropImg,
                          `${formatKwhReading(bill.currReading)} kWh`
                        );
                      }
                    }}
                    className={`relative h-[104px] w-full bg-amber-50/40 rounded border border-amber-300 flex flex-col items-center justify-center p-1 overflow-hidden ${
                      hasInteractiveLightbox ? 'cursor-zoom-in hover:border-amber-500 transition' : ''
                    }`}
                  >
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[8px] font-black uppercase tracking-wider">
                      Cropped Value
                    </span>
                    <img
                      src={currMeterCropImg}
                      alt="Current Meter Cropped Value"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                )}
              </div>
              {hasInteractiveLightbox && (currMeterProofImg || currMeterCropImg) && (
                <button
                  type="button"
                  onClick={() =>
                    onInspectPhoto?.(
                      currMeterProofImg || currMeterCropImg || '',
                      `Current Sub-Meter | ${bill.roomName}`,
                      currMeterCropImg,
                      `${formatKwhReading(bill.currReading)} kWh`
                    )
                  }
                  className="no-print w-full py-1 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer transition"
                >
                  Inspect Full + Cropped 1:1
                </button>
              )}
            </div>
          </div>

          <div
            className={`mt-2 grid ${
              interactiveMode ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4'
            } gap-2 text-[10.5px] bg-white border border-slate-200 rounded px-3 py-1.5`}
          >
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
            <div className={interactiveMode ? 'sm:text-right' : 'text-right'}>
              <span className="text-slate-500">Rate ({bill.billingPeriod}):</span>{' '}
              <strong className="font-mono-num text-slate-950">
                {formatPeso(bill.electricRate)}/kWh
              </strong>
            </div>
          </div>
        </div>

        {/* Block 4: Itemized Billing Summary & Plain-English Settlement Explanation */}
        <div
          data-pdf-block
          className="border border-slate-300 rounded-lg overflow-hidden bg-white mb-3.5"
        >
          <div className="bg-slate-900 text-white px-3.5 py-2 flex items-center justify-between text-[10.5px] font-black uppercase tracking-wider">
            <span>Billing Summary &amp; Deductions Explanation</span>
            <span>Amount (PHP)</span>
          </div>

          <table className="w-full text-[11px] border-collapse">
            <tbody className="divide-y divide-slate-200">
              <tr className="bg-slate-100/80">
                <td
                  colSpan={2}
                  className="px-3.5 py-1 text-[9.5px] font-black uppercase tracking-wider text-slate-600"
                >
                  A. Charges Breakdown (What Is Billed This Month)
                </td>
              </tr>

              <tr>
                <td className="px-3.5 py-1.5 text-slate-800">
                  <div className="font-semibold text-slate-900">
                    {bill.isProrated
                      ? `Prorated Rent (${bill.billingPeriod})`
                      : `Monthly Rent (${bill.billingPeriod})`}
                  </div>
                  <div className="text-[9.5px] text-slate-500">
                    {bill.isProrated &&
                    bill.monthlyRentFull &&
                    bill.occupiedDays &&
                    bill.daysInBillingMonth
                      ? `Full Monthly Rate ${formatPeso(bill.monthlyRentFull)} / ${bill.daysInBillingMonth} days (${formatPeso(bill.dailyRentRate || 0)}/day) x ${bill.occupiedDays} occupied days`
                      : `Regular monthly room rental rate for ${bill.roomName}`}
                  </div>
                </td>
                <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-slate-950 align-top">
                  {formatPeso(bill.baseRent)}
                </td>
              </tr>

              {latePenalty > 0 && (
                <tr className="bg-amber-50/50">
                  <td className="px-3.5 py-1.5 text-amber-950">
                    <div className="font-semibold text-amber-900">
                      Late Payment Penalty (Starting Day 11)
                    </div>
                    <div className="text-[9.5px] text-amber-800">
                      {bill.latePenaltyLabel ||
                        `Applied past the 1st-10th payment period (Due ${dueLabel})`}
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-amber-900 align-top">
                    {formatPeso(latePenalty)}
                  </td>
                </tr>
              )}

              {(bill.isProrated || latePenalty > 0) && (
                <tr className="bg-slate-50/80">
                  <td className="px-3.5 py-1 text-slate-800">
                    <div className="font-bold text-slate-900 text-[10.5px]">
                      Total Rent Due (Rent{latePenalty > 0 ? ' + Late Penalty' : ''})
                    </div>
                  </td>
                  <td className="px-3.5 py-1 text-right font-mono-num font-bold text-slate-950">
                    {formatPeso(totalRentDue)}
                  </td>
                </tr>
              )}

              <tr>
                <td className="px-3.5 py-1.5 text-slate-800">
                  <div className="font-semibold text-slate-900">
                    Electricity Charges ({formatKwhReading(bill.consumptionKwh)} kWh @{' '}
                    {formatPeso(bill.electricRate)}/kWh)
                  </div>
                  <div className="text-[9.5px] text-slate-500">
                    Meter difference ({formatKwhReading(bill.currReading)} curr - {formatKwhReading(bill.prevReading)} prev) multiplied by {bill.billingPeriod} electric rate
                  </div>
                </td>
                <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-slate-950 align-top">
                  {formatPeso(bill.electricTotal)}
                </td>
              </tr>

              {bill.previousBalanceCarryOver > 0 && (
                <tr className="bg-red-50/50">
                  <td className="px-3.5 py-1.5 font-semibold text-red-800">
                    <div>Previous Unpaid Balance Carry-Over</div>
                    <div className="text-[9.5px] font-normal text-red-700">
                      Remaining unpaid amount brought forward from earlier statement(s)
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-red-800 align-top">
                    {formatPeso(bill.previousBalanceCarryOver)}
                  </td>
                </tr>
              )}

              {otherCharges !== 0 && (
                <tr>
                  <td className="px-3.5 py-1.5 text-slate-800">
                    <div className="font-semibold text-slate-900">Other Charges or Adjustments</div>
                    <div className="text-[9.5px] text-slate-500">
                      Additional room fee or manual billing adjustment applied to this cycle
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-slate-950 align-top">
                    {otherCharges < 0 ? `-${formatPeso(Math.abs(otherCharges))}` : formatPeso(otherCharges)}
                  </td>
                </tr>
              )}

              <tr className="bg-slate-50">
                <td className="px-3.5 py-1.5">
                  <div className="font-extrabold text-slate-900">Total Monthly Charges (Gross)</div>
                  <div className="text-[9.5px] text-slate-500">
                    Sum of all billed charges above before subtracting any credits or deposits
                  </div>
                </td>
                <td className="px-3.5 py-1.5 text-right font-mono-num font-black text-slate-950 align-top">
                  {formatPeso(grossCharges)}
                </td>
              </tr>

              <tr className="bg-emerald-50/70">
                <td
                  colSpan={2}
                  className="px-3.5 py-1 text-[9.5px] font-black uppercase tracking-wider text-emerald-900"
                >
                  B. Credits &amp; Deductions Applied (What Reduces This Bill)
                </td>
              </tr>

              {advanceApplied > 0 && (
                <tr className="bg-emerald-50/40">
                  <td className="px-3.5 py-1.5 font-bold text-emerald-900">
                    <div>Advance Credit Applied</div>
                    <div className="text-[9.5px] font-normal text-emerald-800">
                      {typeof bill.advanceBalanceBefore === 'number'
                        ? `Deducted from ${formatPeso(bill.advanceBalanceBefore)} available advance balance (Remaining before excess payment: ${formatPeso(Math.max(0, bill.advanceBalanceBefore - advanceApplied))})`
                        : 'Prepaid advance balance deducted from gross charges'}
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-emerald-800 align-top">
                    -{formatPeso(advanceApplied)}
                  </td>
                </tr>
              )}

              {securityDepositApplied > 0 && (
                <tr className="bg-emerald-50/40">
                  <td className="px-3.5 py-1.5 font-bold text-emerald-900">
                    <div>Required Deposit Deduction</div>
                    <div className="text-[9.5px] font-normal text-emerald-800">
                      Applied from paid security deposit ({formatPeso(remainingSecurityDeposit)} still held on account)
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-emerald-800 align-top">
                    -{formatPeso(securityDepositApplied)}
                  </td>
                </tr>
              )}

              {legacyDepositApplied > 0 && (
                <tr className="bg-emerald-50/40">
                  <td className="px-3.5 py-1.5 font-bold text-emerald-900">
                    <div>Deposit / Advance Credit Applied</div>
                    <div className="text-[9.5px] font-normal text-emerald-800">
                      Credit deducted from gross charges before calculating net payable
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-emerald-800 align-top">
                    -{formatPeso(legacyDepositApplied)}
                  </td>
                </tr>
              )}

              {totalDeductions === 0 && (
                <tr>
                  <td className="px-3.5 py-1.5 text-slate-600">
                    <div className="font-semibold text-slate-700">No Credits or Deposits Deducted</div>
                    <div className="text-[9.5px] text-slate-500">
                      No advance payment or security deposit deduction was applied to this cycle
                    </div>
                  </td>
                  <td className="px-3.5 py-1.5 text-right font-mono-num font-bold text-slate-700 align-top">
                    {formatPeso(0)}
                  </td>
                </tr>
              )}

              <tr className="bg-emerald-50/80">
                <td className="px-3.5 py-1.5">
                  <div className="font-extrabold text-emerald-950">Total Deductions Applied</div>
                  <div className="text-[9.5px] text-emerald-800">
                    Combined advance and deposit credits subtracted from Total Monthly Charges
                  </div>
                </td>
                <td className="px-3.5 py-1.5 text-right font-mono-num font-black text-emerald-900 align-top">
                  -{formatPeso(totalDeductions)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="bg-slate-50 border-t-2 border-slate-900 px-3.5 py-2.5 space-y-1.5 text-[11px]">
            <div className="rounded bg-white border border-slate-200 px-2.5 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-700">
              <span className="font-semibold">
                How Total Was Calculated: Gross Charges - Total Deductions
              </span>
              <span className="font-mono-num font-bold text-slate-950">
                {formatPeso(grossCharges)} - {formatPeso(totalDeductions)} = {formatPeso(bill.totalAmountDue)}
              </span>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <div>
                <span className="font-black uppercase text-slate-950 text-[12px] block">
                  Net Total Amount Due
                </span>
                <span className="text-[9.5px] text-slate-500">
                  {totalDeductions > 0 && bill.totalAmountDue === 0
                    ? 'Covered in full by applied credits (zero cash payment required)'
                    : 'Final payable balance after all deductions'}
                </span>
              </div>
              <span className="font-mono-num font-black text-slate-950 text-[16px]">
                {formatPeso(bill.totalAmountDue)}
              </span>
            </div>

            <div className="flex items-center justify-between text-slate-700 pt-1 border-t border-slate-200">
              <span>
                Actual Payment Received{bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}
              </span>
              <span className="font-mono-num font-bold text-emerald-800">
                {formatPeso(bill.amountPaid)}
              </span>
            </div>

            <div className="flex items-center justify-between font-black">
              <div>
                <span className="text-slate-900 block">Remaining Unpaid Balance</span>
                <span className="text-[9.5px] font-normal text-slate-500">
                  {bill.remainingBalance > 0
                    ? 'Unpaid portion remaining due (carries forward if unpaid)'
                    : 'Statement settled with zero unpaid balance'}
                </span>
              </div>
              <span
                className={`font-mono-num ${
                  bill.remainingBalance > 0 ? 'text-red-700' : 'text-emerald-800'
                }`}
              >
                {formatPeso(bill.remainingBalance)}
              </span>
            </div>

            {/* Separate Component Payment Tracking Summary */}
            <div className="rounded bg-white border border-slate-200 px-2.5 py-2 space-y-1 text-[10px]">
              <div className="font-extrabold uppercase tracking-wider text-slate-600 text-[9px]">
                Component Payment Tracking (Rent vs. Electricity{latePenalty > 0 ? ' vs. Late Penalty' : ''})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-slate-500 block">Rent Payment:</span>
                  <strong className="font-mono-num text-slate-900">
                    Paid {formatPeso(componentBalances.rentPaid)} | Bal {formatPeso(componentBalances.rentRemaining)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Electricity Payment:</span>
                  <strong
                    className={`font-mono-num ${
                      componentBalances.electricityRemaining > 0
                        ? 'text-red-700'
                        : 'text-emerald-800'
                    }`}
                  >
                    Paid {formatPeso(componentBalances.electricityPaid)} | Bal {formatPeso(componentBalances.electricityRemaining)}
                  </strong>
                </div>
                {latePenalty > 0 && (
                  <div>
                    <span className="text-slate-500 block">Late Penalty:</span>
                    <strong className="font-mono-num text-amber-800">
                      Paid {formatPeso(componentBalances.latePenaltyPaid)} | Bal {formatPeso(componentBalances.latePenaltyRemaining)}
                    </strong>
                  </div>
                )}
              </div>
              {componentBalances.rentRemaining <= 0.005 &&
                componentBalances.electricityRemaining > 0.005 && (
                  <div className="text-[9.5px] font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1 mt-1">
                    Notice: Rent is settled, but Electricity balance ({formatPeso(componentBalances.electricityRemaining)}) remains unpaid. Statement is PARTIALLY PAID until electricity is cleared.
                  </div>
                )}
            </div>

            {bill.overpaymentToAdvance > 0 && (
              <div className="flex items-center justify-between font-semibold text-emerald-800">
                <div>
                  <span className="block">Excess Cash Credited to Advance Balance</span>
                  <span className="text-[9.5px] font-normal text-emerald-700">
                    Overpayment saved as prepaid credit for future bills
                  </span>
                </div>
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

            {showRemainingSecurityDeposit && (
              <div className="flex items-center justify-between font-semibold text-slate-700">
                <span>Remaining Security Deposit Held</span>
                <span className="font-mono-num text-slate-900">
                  {formatPeso(remainingSecurityDeposit)}
                </span>
              </div>
            )}

            {bill.adjustmentNotes && bill.adjustmentNotes.length > 0 && (
              <div className="pt-1 border-t border-slate-200 text-[10px] text-slate-600">
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
          className={`border border-slate-300 rounded-lg bg-slate-50 px-3.5 py-2.5 flex ${
            interactiveMode ? 'flex-col sm:flex-row sm:items-center' : 'items-center'
          } justify-between gap-3 text-[10.5px]`}
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
