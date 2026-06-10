interface StkPushParams {
  phone: string;
  bookingId: string;
  amount?: number;
}

interface StkPushResult {
  success: boolean;
  paymentRequestId?: string;
  transactionId?: string;
  referenceId?: string;
  statusCode?: string;
  statusDescription?: string;
  error?: string;
}

interface PaymentStatusResult {
  success: boolean;
  bookingId: string;
  status: string;
  paymentStatus: string;
  paid: boolean;
  confirmed: boolean;
  paymentRequest?: any;
}

interface StkQueryResult {
  success: boolean;
  paid: boolean;
  failed: boolean;
  status?: string;
  description?: string;
  error?: string;
}

export const paymentService = {
  async initiateSTKPush(params: StkPushParams): Promise<StkPushResult> {
    try {
      const response = await fetch('/api/ncba/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('[paymentService] STK Push error:', error);
      return { success: false, error: error.message || 'Network error' };
    }
  },

  async querySTKStatus(paymentRequestId: string): Promise<StkQueryResult> {
    try {
      const response = await fetch('/api/ncba/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentRequestId }),
      });
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('[paymentService] STK Query error:', error);
      return { success: false, paid: false, failed: false, error: error.message || 'Network error' };
    }
  },

  async getPaymentStatus(bookingId: string): Promise<PaymentStatusResult> {
    try {
      const response = await fetch(`/api/ncba/payment-status/${bookingId}`);
      const data = await response.json();
      return data;
    } catch (error: any) {
      console.error('[paymentService] Status poll error:', error);
      return { success: false, bookingId, status: '', paymentStatus: '', paid: false, confirmed: false };
    }
  },

  async pollUntilPaid(paymentRequestId: string, bookingId: string, intervalMs = 5000, timeoutMs = 120000): Promise<'paid' | 'failed' | 'timeout'> {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = async () => {
        if (Date.now() - start > timeoutMs) {
          resolve('timeout');
          return;
        }
        const query = await this.querySTKStatus(paymentRequestId);
        if (query.paid) {
          resolve('paid');
          return;
        }
        if (query.failed) {
          resolve('failed');
          return;
        }
        const status = await this.getPaymentStatus(bookingId);
        if (status.paid && status.confirmed) {
          resolve('paid');
          return;
        }
        setTimeout(check, intervalMs);
      };
      check();
    });
  },
};
