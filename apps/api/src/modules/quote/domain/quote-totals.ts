/**
 * Calcul pur des totaux d'un devis (HT / TVA / TTC).
 * Source unique de vérité, partagée par le module Devis et la consolidation
 * financière : garantit des montants identiques partout.
 */

export interface QuoteLineAmounts {
  quantity: number | string;
  unitPrice: number | string;
  discountRate: number | string;
}

export interface QuoteTotals {
  totalHT: number;
  vatAmount: number;
  totalTTC: number;
}

/** Montant HT d'une ligne = quantité × prix unitaire × (1 − remise%). */
export function lineTotalHT(line: QuoteLineAmounts): number {
  const quantity = Number(line.quantity);
  const unitPrice = Number(line.unitPrice);
  const discountRate = Number(line.discountRate);
  return round(quantity * unitPrice * (1 - discountRate / 100));
}

export function computeQuoteTotals(
  lines: QuoteLineAmounts[],
  vatRate: number | string,
): QuoteTotals {
  const totalHT = round(lines.reduce((acc, line) => acc + lineTotalHT(line), 0));
  const vatAmount = round((totalHT * Number(vatRate)) / 100);
  const totalTTC = round(totalHT + vatAmount);
  return { totalHT, vatAmount, totalTTC };
}

/** Arrondi monétaire à 2 décimales. */
export function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
