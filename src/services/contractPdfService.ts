import {
  ContractBookingData,
  ContractCar,
  loadFilledContractHtml,
  wrapContractHtmlForPdf,
  getClientNameFromBooking,
  getTotalCostFromBooking,
  formatContractDate,
  resolveContractVehicle,
} from '../utils/contractTemplate';
import { enhancedContractService, type ContractData, type SignedContract } from './enhancedContractService';

export interface GenerateContractPdfOptions {
  contract: any;
  bookingData: ContractBookingData;
  car: ContractCar;
  signatureData: string;
  vehicleModelId?: string | null;
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
  car: ContractCar,
  vehicleModelId?: string | null
): ContractData {
  const resolved = resolveContractVehicle(car, vehicleModelId);
  return {
    booking_id: bookingId,
    client_name: getClientNameFromBooking(bookingData),
    client_email: bookingData?.email || bookingData?.metadata?.guest_info?.email || '',
    client_phone: bookingData?.phone || bookingData?.metadata?.guest_info?.phone || '',
    car_make: resolved.isModelBooking ? resolved.displayName : resolved.make,
    car_model: resolved.isModelBooking ? '(or equivalent)' : resolved.model,
    license_plate: resolved.licensePlate,
    pickup_date: String(bookingData?.startDate || bookingData?.start_date || ''),
    dropoff_date: String(bookingData?.endDate || bookingData?.end_date || ''),
    daily_rate: resolved.dailyRate,
    total_amount: getTotalCostFromBooking(bookingData),
    security_deposit: resolved.securityDeposit,
    po_box: bookingData?.poBox || bookingData?.po_box,
    id_number: bookingData?.idNumber || bookingData?.id_number,
    color: resolved.color,
  };
}

export async function generateContractPdfBase64(
  options: GenerateContractPdfOptions
): Promise<string> {
  const { contract, bookingData, car, signatureData, vehicleModelId } = options;

  if (!signatureData || signatureData === 'signed_physically_in_person') {
    throw new Error('A client digital signature is required to generate the contract PDF.');
  }

  const filledHtml = await loadFilledContractHtml(contract, bookingData, car, signatureData, vehicleModelId);
  if (!filledHtml) {
    throw new Error('No active HTML contract template found. Upload one in Admin → Contract Manager.');
  }

  // Detect mobile to reduce canvas scale and prevent OOM crashes
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // Pass HTML string directly to html2pdf
  // It handles creating an offscreen iframe internally, completely avoiding all cropping/opacity bugs.
  const fullHtmlString = wrapContractHtmlForPdf(filledHtml);

  return new Promise((resolve, reject) => {
    try {
      const iframe = document.createElement('iframe');
      // Position offscreen to avoid layout disruption
      iframe.style.position = 'absolute';
      iframe.style.width = '794px';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.visibility = 'hidden';
      iframe.style.left = '-9999px';
      iframe.style.top = '-9999px';
      document.body.appendChild(iframe);

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(iframe);
        reject(new Error('Could not access iframe document'));
        return;
      }

      // Write full HTML structure (including <head> tags and stylesheets)
      doc.open();
      doc.write(fullHtmlString);
      doc.close();

      // Poll until all template images (such as the company logo) have fully loaded
      const checkLoaded = () => {
        const images = doc.getElementsByTagName('img');
        let allLoaded = true;
        for (let i = 0; i < images.length; i++) {
          if (!images[i].complete) {
            allLoaded = false;
            break;
          }
        }
        if (allLoaded) {
          import('html2pdf.js').then((module) => {
            const html2pdf = module.default;
            const pdfOptions = {
              ...PDF_OPTIONS,
              html2canvas: {
                ...PDF_OPTIONS.html2canvas,
                // Scale 1 on mobile to avoid out-of-memory crashes
                scale: isMobile ? 1 : 2,
                useCORS: true,
                allowTaint: true,
              },
            };

            html2pdf()
              .from(doc.body)
              .set(pdfOptions)
              .outputPdf('datauristring')
              .then((pdfBase64: string) => {
                document.body.removeChild(iframe);
                resolve(pdfBase64);
              })
              .catch((err: any) => {
                document.body.removeChild(iframe);
                reject(err);
              });
          }).catch((err) => {
            document.body.removeChild(iframe);
            reject(err);
          });
        } else {
          setTimeout(checkLoaded, 100);
        }
      };

      setTimeout(checkLoaded, 150);
    } catch (err) {
      reject(err);
    }
  });
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
  const contractData = buildContractData(bookingId, options.bookingData, options.car, options.vehicleModelId);

  return enhancedContractService.saveSignedContract(
    bookingId,
    options.signatureData,
    contractData,
    pdfBase64
  );
}

export async function regenerateAndSaveContract(
  bookingId: string,
  options: GenerateContractPdfOptions
): Promise<SignedContract> {
  const pdfBase64 = await generateContractPdfBase64(options);
  const contractData = buildContractData(bookingId, options.bookingData, options.car, options.vehicleModelId);
  return enhancedContractService.saveSignedContract(
    bookingId,
    options.signatureData,
    contractData,
    pdfBase64,
    null,
    true
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

export function formatContractSummaryLine(
  bookingData: ContractBookingData,
  car: ContractCar,
  vehicleModelId?: string | null
): string {
  const resolved = resolveContractVehicle(car, vehicleModelId);
  const vehicleLabel = resolved.isModelBooking
    ? resolved.displayName
    : `${resolved.make} ${resolved.model}`.trim();
  return `${getClientNameFromBooking(bookingData)} · ${vehicleLabel} · ${formatContractDate(bookingData?.startDate)} – ${formatContractDate(bookingData?.endDate)}`;
}
