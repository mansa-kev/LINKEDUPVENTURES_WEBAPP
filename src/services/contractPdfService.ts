import {
  ContractBookingData,
  ContractCar,
  loadFilledContractHtml,
  wrapContractHtmlForPdf,
  getClientNameFromBooking,
  getTotalCostFromBooking,
  formatContractDate,
} from '../utils/contractTemplate';
import { enhancedContractService, type ContractData, type SignedContract } from './enhancedContractService';

export interface GenerateContractPdfOptions {
  contract: any;
  bookingData: ContractBookingData;
  car: ContractCar;
  signatureData: string;
}

const PDF_OPTIONS = {
  margin: 10,
  filename: 'contract.pdf',
  image: { type: 'jpeg' as const, quality: 0.98 },
  html2canvas: { scale: 2, useCORS: true, allowTaint: true },
  jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
};

export function buildContractData(
  bookingId: string,
  bookingData: ContractBookingData,
  car: ContractCar
): ContractData {
  return {
    booking_id: bookingId,
    client_name: getClientNameFromBooking(bookingData),
    client_email: bookingData?.email || bookingData?.metadata?.guest_info?.email || '',
    client_phone: bookingData?.phone || bookingData?.metadata?.guest_info?.phone || '',
    car_make: car?.make || '',
    car_model: car?.model || '',
    license_plate: car?.license_plate || '',
    pickup_date: String(bookingData?.startDate || bookingData?.start_date || ''),
    dropoff_date: String(bookingData?.endDate || bookingData?.end_date || ''),
    daily_rate: Number(car?.daily_rate || 0),
    total_amount: getTotalCostFromBooking(bookingData),
    security_deposit: Number(car?.security_deposit || 0),
    po_box: bookingData?.poBox || bookingData?.po_box,
    id_number: bookingData?.idNumber || bookingData?.id_number,
    color: car?.color,
  };
}

export async function generateContractPdfBase64(
  options: GenerateContractPdfOptions
): Promise<string> {
  const { contract, bookingData, car, signatureData } = options;

  if (!signatureData || signatureData === 'signed_physically_in_person') {
    throw new Error('A client digital signature is required to generate the contract PDF.');
  }

  const filledHtml = await loadFilledContractHtml(contract, bookingData, car, signatureData);
  if (!filledHtml) {
    throw new Error('No active HTML contract template found. Upload one in Admin → Contract Manager.');
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = wrapContractHtmlForPdf(filledHtml);
  wrapper.style.padding = '20px';
  wrapper.style.fontFamily = 'Arial, Helvetica, sans-serif';
  wrapper.style.color = '#111';
  wrapper.style.background = '#fff';
  wrapper.style.width = '794px';

  document.body.appendChild(wrapper);

  try {
    const html2pdf = (await import('html2pdf.js')).default;
    return await html2pdf().from(wrapper).set(PDF_OPTIONS).outputPdf('datauristring');
  } finally {
    document.body.removeChild(wrapper);
  }
}

export async function generateAndSaveContract(
  bookingId: string,
  options: GenerateContractPdfOptions
): Promise<SignedContract> {
  const existing = await enhancedContractService.getContractByBooking(bookingId);
  if (existing?.contract_url) {
    return existing;
  }

  const pdfBase64 = await generateContractPdfBase64(options);
  const contractData = buildContractData(bookingId, options.bookingData, options.car);

  return enhancedContractService.saveSignedContract(
    bookingId,
    options.signatureData,
    contractData,
    pdfBase64
  );
}

export function buildBookingSummaryForContract(booking: any, car: any): ContractBookingData {
  const meta = booking?.metadata || {};
  const guest = meta.guest_info || {};
  return {
    fullName: guest.full_name || booking?.client?.full_name,
    email: guest.email || booking?.client?.email,
    phone: guest.phone || booking?.client?.phone_number,
    idNumber: guest.id_number || guest.license_number,
    startDate: booking?.start_date,
    endDate: booking?.end_date,
    totalAmount: booking?.total_price ?? booking?.total_amount,
    days: booking?.rental_days,
    signatureData: meta.signature_url || meta.signature || meta.documents?.signatureUrl,
    signatureUrl: meta.signature_url || meta.signature || meta.documents?.signatureUrl,
  };
}

export function formatContractSummaryLine(bookingData: ContractBookingData, car: ContractCar): string {
  return `${getClientNameFromBooking(bookingData)} · ${car?.make || ''} ${car?.model || ''} · ${formatContractDate(bookingData?.startDate)} – ${formatContractDate(bookingData?.endDate)}`;
}
