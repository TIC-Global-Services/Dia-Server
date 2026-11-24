export const REFUND_SUCCEEDED = 'refund.succeeded';

export interface RefundSucceededEvent {
  orderId: string;
  /** Total refunded on the order so far, including this refund. */
  refundedMinor: number;
  /** What the customer paid. */
  paidMinor: number;
}
