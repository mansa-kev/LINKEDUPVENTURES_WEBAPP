import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { adminService } from '../../../services/adminService';

interface DirectContractDisplayProps {
  contract: any;
  bookingData: any;
  car: any;
  signatureData?: string;
}

export function DirectContractDisplay({ contract, bookingData, car, signatureData }: DirectContractDisplayProps) {
  if (!contract) {
    return (
      <div className="p-8 bg-yellow-100 border border-yellow-300 rounded-lg text-center">
        <h3 className="text-lg font-bold text-yellow-800 mb-2">No Contract Available</h3>
        <p className="text-yellow-700">Please upload an HTML contract template in the admin panel.</p>
      </div>
    );
  }

  const templateUrl = contract.preview_url || contract.pdf_url || contract.contract_url || contract.template_url;
  const isHtmlTemplate = !!templateUrl && templateUrl.includes('.html');

  // Format the date professionally
  const formatDate = (date: string) => {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getClientName = () => {
    // The data comes from Step2 as fullName field
    const fullName = bookingData?.fullName || 
                     bookingData?.full_name || 
                     `${bookingData?.firstName || ''} ${bookingData?.lastName || ''}`.trim() ||
                     'the Client';
    
    return fullName;
  };

  const getTotalCost = () => {
    // Try multiple possible total cost fields
    const totalCost = bookingData?.totalCost || 
                     bookingData?.total_amount || 
                     bookingData?.totalAmount || 
                     bookingData?.amount ||
                     bookingData?.total || 
                     0;
    return typeof totalCost === 'number' ? totalCost : parseFloat(totalCost) || 0;
  };

  const [htmlTemplate, setHtmlTemplate] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);

  useEffect(() => {
    if (isHtmlTemplate && templateUrl) {
      setLoadingHtml(true);
      
      Promise.all([
        fetch(templateUrl).then(res => res.text()),
        adminService.getAppSettings()
      ])
      .then(([text, settingsData]) => {
        const settings: Record<string, any> = {};
        if (settingsData) {
          settingsData.forEach(item => {
            settings[item.key] = item.value ?? item.logo_url ?? '';
          });
        }
        
        let replaced = text;
        replaced = replaced.replace(/\{\{clientName\}\}/g, getClientName());
        replaced = replaced.replace(/\{\{idNumber\}\}/g, bookingData?.idNumber || '_____________');
        replaced = replaced.replace(/\{\{clientPhone\}\}/g, bookingData?.phone || '_____________');
        replaced = replaced.replace(/\{\{clientPoBox\}\}/g, bookingData?.poBox || '_____________');
        replaced = replaced.replace(/\{\{carMake\}\}/g, car?.make || '');
        replaced = replaced.replace(/\{\{carModel\}\}/g, car?.model || '');
        replaced = replaced.replace(/\{\{licensePlate\}\}/g, car?.license_plate || '');
        replaced = replaced.replace(/\{\{color\}\}/g, car?.color || '_____________');
        replaced = replaced.replace(/\{\{startDate\}\}/g, formatDate(bookingData?.startDate));
        replaced = replaced.replace(/\{\{endDate\}\}/g, formatDate(bookingData?.endDate));
        replaced = replaced.replace(/\{\{totalAmount\}\}/g, getTotalCost().toLocaleString());
        replaced = replaced.replace(/\{\{dailyRate\}\}/g, car?.daily_rate?.toLocaleString() || '');
        
        // Inject company settings
        replaced = replaced.replace(/\{\{companyPoBox\}\}/g, settings['company_po_box'] || '2345');
        const companySig = settings['company_signature_url'] || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        const contractLogo = settings['contract_logo'] || settings['site_logo'] || settings['logo_url'] || '';
        replaced = replaced.replace(/\{\{companyLogoUrl\}\}/g, contractLogo || settings['site_logo'] || companySig);
        replaced = replaced.replace(/\{\{logoUrl\}\}/g, contractLogo || settings['site_logo'] || companySig);
        replaced = replaced.replace(/\{\{companySignatureUrl\}\}/g, companySig);
        replaced = replaced.replace(/\{\{companySignature\}\}/g, `<img src="${companySig}" alt="Company Signature" style="max-height: 80px;" />`);
        
        // Fix wording for mileage if present
        replaced = replaced.replace(/\(as confirmed at the pickup\)/gi, '(as confirmed during pickup)');
        
        setHtmlTemplate(replaced);
      })
      .catch(err => console.error('Failed to load HTML contract', err))
      .finally(() => setLoadingHtml(false));
    }
  }, [isHtmlTemplate, templateUrl, bookingData, car]);

  const clientSignature = signatureData || bookingData?.signatureData || bookingData?.liveSignatureData || '';
  const blankSignature = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  const renderedHtml = htmlTemplate
    ? htmlTemplate
        .replace(/\{\{clientSignatureUrl\}\}/g, clientSignature || blankSignature)
        .replace(/\{\{clientSignature\}\}/g, `<img src="${clientSignature || blankSignature}" alt="Client Signature" style="max-height: 80px;" />`)
    : '';

  return (
    <div className="bg-gradient-to-br from-card to-muted rounded-xl overflow-hidden shadow-xl border border-border">
      {/* Professional Header */}
      <div className="bg-primary p-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-black tracking-widest uppercase text-black">
            Rental Agreement
          </h1>
          <div className="text-sm font-medium text-black/70">
            Made and entered into on{" "}
            <span className="text-black font-bold">
              {formatDate(bookingData?.startDate || new Date())}
            </span>
            {" "}between:
          </div>
          <div className="bg-black/10 rounded-xl p-4 mt-3 border border-black/10 w-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="text-left">
                <div className="font-black text-black">LinkedUp Cars Rentals</div>
                <div className="text-black/60 text-xs">Hereinafter referred to as "the Company"</div>
              </div>
              <div className="text-right">
                <div className="font-black text-black">{getClientName()}</div>
                <div className="text-black/60 text-xs">Hereinafter referred to as "the Client"</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Optimized Contract Display - Mobile Full Screen */}
      <div className="p-2 sm:p-6 bg-card">
        <div className="bg-background rounded-lg shadow-lg overflow-hidden border border-border">
          {isHtmlTemplate ? (
            loadingHtml ? (
              <div className="w-full h-96 flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={32} />
              </div>
            ) : (
              <div 
                id="contract-html-container"
                className="p-8 sm:p-12 prose prose-sm sm:prose-base max-w-none bg-white text-black min-h-[500px]"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            )
          ) : (
            <div className="w-full h-96 flex items-center justify-center p-8 text-center">
              <div className="max-w-sm">
                <div className="text-red-500 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">HTML Contract Not Available</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Contract Manager must provide an HTML contract template.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Booking Summary - Mobile Responsive */}
      <div className="p-4 sm:p-6 bg-card border-t border-border">
        <h2 className="text-lg sm:text-xl font-bold mb-4 sm:mb-6 text-foreground flex items-center gap-2">
          <div className="w-1 h-5 sm:h-6 bg-blue-600 rounded-full"></div>
          Booking Summary & Terms
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Client Information */}
          <div className="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
            <h3 className="font-semibold text-foreground mb-2 sm:mb-3 text-xs sm:text-sm uppercase tracking-wide">Client Information</h3>
            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name:</span>
                <span className="font-medium text-foreground text-right">{getClientName()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium text-foreground text-right">{bookingData?.email || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Phone:</span>
                <span className="font-medium text-foreground text-right">{bookingData?.phone || 'N/A'}</span>
              </div>
            </div>
          </div>

          {/* Vehicle Information */}
          <div className="bg-muted/50 rounded-lg p-3 sm:p-4 border border-border">
            <h3 className="font-semibold text-foreground mb-2 sm:mb-3 text-xs sm:text-sm uppercase tracking-wide">Vehicle Information</h3>
            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Make/Model:</span>
                <span className="font-medium text-foreground text-right">{car?.make || 'N/A'} {car?.model || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">License:</span>
                <span className="font-medium text-foreground text-right">{car?.license_plate || 'N/A'}</span>
                              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Rate:</span>
                <span className="font-medium text-foreground text-right">KES {car?.daily_rate?.toLocaleString() || '0'}</span>
              </div>
            </div>
          </div>

          {/* Rental Period */}
          <div className="bg-muted/50 rounded-lg p-3 sm:p-4 md:col-span-2 lg:col-span-1 border border-border">
            <h3 className="font-semibold text-foreground mb-2 sm:mb-3 text-xs sm:text-sm uppercase tracking-wide">Rental Period</h3>
            <div className="space-y-1 sm:space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Start Date:</span>
                <span className="font-medium text-foreground text-right">{formatDate(bookingData?.startDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">End Date:</span>
                <span className="font-medium text-foreground text-right">{formatDate(bookingData?.endDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration:</span>
                <span className="font-medium text-foreground text-right">
                  {bookingData?.days || 'N/A'} days
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Total Cost - Mobile Responsive */}
        <div className="mt-4 sm:mt-6 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-4 sm:p-6 text-primary-foreground">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <div className="text-blue-100 text-xs sm:text-sm uppercase tracking-wide">Total Rental Cost</div>
              <div className="text-2xl sm:text-3xl font-bold mt-1">
                KES {getTotalCost().toLocaleString()}
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-blue-100 text-xs sm:text-sm">Security Deposit</div>
              <div className="text-lg sm:text-xl font-semibold">
                KES {car?.security_deposit?.toLocaleString() || '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Terms Confirmation - Mobile Responsive */}
        <div className="mt-4 sm:mt-6 bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4">
          <div className="flex items-start gap-2 sm:gap-3">
            <div className="text-amber-600 mt-0.5 sm:mt-1 flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 mb-1 sm:mb-2 text-sm">Important Notice</h3>
              <p className="text-xs sm:text-sm text-amber-800 leading-relaxed">
                By proceeding to payment, you acknowledge that you have read, understood, and agree to be bound by all terms and conditions outlined in this Rental Agreement. This constitutes a legally binding contract.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
