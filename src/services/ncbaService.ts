import { logger } from '../utils/logger.js';

interface NcbaConfig {
  baseUrl: string;
  username: string;
  password: string;
  paybillNo: string;
  accountNo: string;
  network: string;
  transactionType: string;
  tokenMethod: 'GET' | 'POST';
}

interface NcbaStkRequest {
  phone: string;
  amount: number;
  accountNo?: string;
}

interface NcbaStkResponse {
  success: boolean;
  transactionId?: string;
  referenceId?: string;
  statusCode?: string;
  statusDescription?: string;
  raw?: any;
  error?: string;
}

interface NcbaQueryResponse {
  success: boolean;
  paid: boolean;
  failed: boolean;
  status?: string;
  description?: string;
  raw?: any;
  error?: string;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

function getConfig(): NcbaConfig {
  return {
    baseUrl: process.env.NCBA_BASE_URL || 'https://c2bapis.ncbagroup.com',
    username: process.env.NCBA_USERNAME || '',
    password: process.env.NCBA_PASSWORD || '',
    paybillNo: process.env.NCBA_PAYBILL_NO || '',
    accountNo: process.env.NCBA_ACCOUNT_NO || '',
    network: process.env.NCBA_NETWORK || 'Safaricom',
    transactionType: process.env.NCBA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
    tokenMethod: ((process.env.NCBA_TOKEN_METHOD || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET'),
  };
}

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-+]/g, '');
  if (cleaned.startsWith('0')) cleaned = `254${cleaned.slice(1)}`;
  else if (!cleaned.startsWith('254')) cleaned = `254${cleaned}`;
  return cleaned;
}

async function readJsonSafe(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { rawText: text };
  }
}

export const ncbaService = {
  formatPhone,

  getPublicConfig() {
    const config = getConfig();
    return {
      paybillNo: config.paybillNo,
      accountNo: config.accountNo,
      network: config.network,
      transactionType: config.transactionType,
    };
  },

  async getAccessToken(): Promise<string> {
    if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
      return cachedToken.token;
    }

    const config = getConfig();
    if (!config.username || !config.password) {
      throw new Error('NCBA credentials not configured. Set NCBA_USERNAME and NCBA_PASSWORD.');
    }

    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    const response = await fetch(`${config.baseUrl}/payments/api/v1/auth/token`, {
      method: config.tokenMethod,
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
    });

    const data = await readJsonSafe(response);
    if (!response.ok || !data.access_token) {
      throw new Error(`NCBA token request failed (${response.status}): ${data.message || data.rawText || 'Unknown error'}`);
    }

    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (Number(data.expires_in || 18000) * 1000),
    };

    return data.access_token;
  },

  async initiateSTKPush(request: NcbaStkRequest): Promise<NcbaStkResponse> {
    try {
      const config = getConfig();
      if (!config.paybillNo) throw new Error('NCBA_PAYBILL_NO is not configured.');
      if (!config.accountNo && !request.accountNo) throw new Error('NCBA_ACCOUNT_NO is not configured.');

      const token = await this.getAccessToken();
      const payload = {
        TelephoneNo: formatPhone(request.phone),
        Amount: String(Math.ceil(Number(request.amount))),
        PayBillNo: config.paybillNo,
        AccountNo: request.accountNo || config.accountNo,
        Network: config.network,
        TransactionType: config.transactionType,
      };

      logger.log('[NCBA] Initiating STK Push', { phone: payload.TelephoneNo, amount: payload.Amount, accountNo: payload.AccountNo });

      const response = await fetch(`${config.baseUrl}/payments/api/v1/stk-push/initiate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await readJsonSafe(response);
      const statusCode = String(data.StatusCode ?? '');
      const success = response.ok && statusCode === '0' && Boolean(data.TransactionID);

      return {
        success,
        transactionId: data.TransactionID || undefined,
        referenceId: data.ReferenceID || undefined,
        statusCode,
        statusDescription: data.StatusDescription || data.message || undefined,
        raw: data,
        error: success ? undefined : (data.StatusDescription || data.message || `NCBA STK request failed (${response.status})`),
      };
    } catch (error: any) {
      logger.error('[NCBA] STK Push error:', error);
      return { success: false, error: error.message || 'Failed to initiate NCBA STK Push' };
    }
  },

  async querySTKPush(transactionId: string): Promise<NcbaQueryResponse> {
    try {
      const config = getConfig();
      const token = await this.getAccessToken();
      const response = await fetch(`${config.baseUrl}/payments/api/v1/stk-push/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ TransactionID: transactionId }),
      });

      const data = await readJsonSafe(response);
      const normalized = String(data.status || '').toUpperCase();

      return {
        success: response.ok,
        paid: normalized === 'SUCCESS',
        failed: normalized === 'FAILED',
        status: data.status,
        description: data.description,
        raw: data,
        error: response.ok ? undefined : (data.message || data.description || `NCBA query failed (${response.status})`),
      };
    } catch (error: any) {
      logger.error('[NCBA] Query error:', error);
      return { success: false, paid: false, failed: false, error: error.message || 'Failed to query NCBA payment status' };
    }
  },
};
