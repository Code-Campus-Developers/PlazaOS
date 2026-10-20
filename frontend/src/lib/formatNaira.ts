/**
 * PlazaOS charges and displays money in Nigerian naira (NGN).
 *
 * This is the single formatting helper used everywhere a real amount is
 * shown, so no screen can drift back to a bare number or a dollar sign.
 */
export function formatNaira(amount: number): string {
  return `₦${new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`
}
