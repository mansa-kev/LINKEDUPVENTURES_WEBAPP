import { supabase, handleSupabaseErrorWrapper as handleSupabaseError } from '../lib/supabase';
import { invalidateCachePrefix } from '../utils/queryCache';

export interface ContractData {
  client_name: string;
  car_make: string;
  car_model: string;
  pickup_date: string;
  dropoff_date: string;
  total_amount: number;
  booking_id: string;
  client_email: string;
  client_phone: string;
  license_plate: string;
  daily_rate: number;
  security_deposit: number;
  po_box?: string;
  id_number?: string;
  color?: string;
}

export interface SignedContract {
  id: string;
  booking_id: string;
  contract_url: string;
  signed_at: string;
  signature_data: string;
  agreement_status: 'pending' | 'signed' | 'rejected';
  payment_hold_status: 'pending' | 'authorized' | 'released';
  created_at: string;
}

export const enhancedContractService = {
  getMasterContract: async () => {
    try {
      const { data, error } = await supabase
        .from('contracts_master')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No active contract found
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in getMasterContract:', error);
      return null;
    }
  },

  saveSignedContract: async (
    bookingId: string,
    signatureData: string,
    contractData: ContractData,
    contractPdfBase64?: string | null
  ): Promise<SignedContract> => {
    try {
      let contractUrl = '';

      if (!contractPdfBase64) {
        throw new Error('Final contract PDF is required');
      }

      const base64Data = contractPdfBase64.split(',')[1] || contractPdfBase64;
      const pdfBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

      const fileName = `signed-contract-${bookingId}-${Date.now()}.pdf`;
      const filePath = `signed_contracts/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('public_assets')
        .upload(filePath, pdfBytes, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('public_assets')
        .getPublicUrl(filePath);

      contractUrl = publicUrl;

      const { data, error } = await supabase
        .from('signed_contracts')
        .insert([{
          booking_id: bookingId,
          contract_url: contractUrl,
          signature_data: signatureData,
          agreement_status: 'signed',
          payment_hold_status: 'pending',
          client_data: contractData
        }])
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('bookings')
        .update({
          contract_signed: true,
          contract_id: data.id,
          status: 'contract_signed'
        })
        .eq('id', bookingId);

      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('client_id')
        .eq('id', bookingId)
        .maybeSingle();

      const clientId = bookingRow?.client_id;
      if (clientId) {
        invalidateCachePrefix(`client:dashboard:${clientId}`);
        invalidateCachePrefix(`client:glovebox:${clientId}`);
        invalidateCachePrefix(`client:bookings:${clientId}`);
      }

      return data;
    } catch (error) {
      console.error('Error saving signed contract:', error);
      throw error;
    }
  },

  getSignedContracts: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('signed_contracts')
        .select(`
          *,
          bookings!inner(
            *,
            cars!inner(*)
          )
        `)
        .eq('bookings.client_id', userId)
        .order('signed_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching signed contracts:', error);
      return [];
    }
  },

  updateContractStatus: async (
    contractId: string,
    status: 'pending' | 'signed' | 'rejected'
  ): Promise<void> => {
    try {
      const { error } = await supabase
        .from('signed_contracts')
        .update({ agreement_status: status })
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating contract status:', error);
      throw error;
    }
  },

  triggerPaymentHold: async (contractId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('signed_contracts')
        .update({
          payment_hold_status: 'authorized',
          payment_hold_triggered_at: new Date().toISOString()
        })
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      console.error('Error triggering payment hold:', error);
      throw error;
    }
  },

  releasePaymentHold: async (contractId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('signed_contracts')
        .update({
          payment_hold_status: 'released',
          payment_hold_released_at: new Date().toISOString()
        })
        .eq('id', contractId);

      if (error) throw error;
    } catch (error) {
      console.error('Error releasing payment hold:', error);
      throw error;
    }
  },

  getContractByBooking: async (bookingId: string) => {
    try {
      const { data, error } = await supabase
        .from('signed_contracts')
        .select('*')
        .eq('booking_id', bookingId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error fetching contract by booking:', error);
      return null;
    }
  }
};
