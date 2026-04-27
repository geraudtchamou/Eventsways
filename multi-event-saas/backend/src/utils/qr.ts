import QRCode from 'qrcode';

export interface QRCodeData {
  eventId: string;
  guestId: string;
  timestamp: number;
  signature?: string;
}

/**
 * Generate QR code as base64 PNG
 */
export async function generateQRCode(data: QRCodeData): Promise<string> {
  try {
    // Create QR code data string
    const qrString = JSON.stringify({
      e: data.eventId,
      g: data.guestId,
      t: data.timestamp,
      s: data.signature || ''
    });

    // Generate QR code as PNG data URL
    const qrCodeDataUrl = await QRCode.toDataURL(qrString, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    // Return just the base64 part (without data:image/png;base64, prefix)
    return qrCodeDataUrl.split(',')[1];
  } catch (error) {
    console.error('Error generating QR code:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Generate QR code as buffer (for file storage)
 */
export async function generateQRCodeBuffer(data: QRCodeData): Promise<Buffer> {
  try {
    const qrString = JSON.stringify({
      e: data.eventId,
      g: data.guestId,
      t: data.timestamp,
      s: data.signature || ''
    });

    const qrCodeBuffer = await QRCode.toBuffer(qrString, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    return qrCodeBuffer;
  } catch (error) {
    console.error('Error generating QR code buffer:', error);
    throw new Error('Failed to generate QR code');
  }
}

/**
 * Decode QR code data
 */
export function decodeQRCode(qrData: string): QRCodeData | null {
  try {
    const parsed = JSON.parse(qrData);
    
    // Handle both full format and shortened format
    if (parsed.eventId && parsed.guestId) {
      return parsed as QRCodeData;
    } else if (parsed.e && parsed.g) {
      return {
        eventId: parsed.e,
        guestId: parsed.g,
        timestamp: parsed.t,
        signature: parsed.s || ''
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error decoding QR code:', error);
    return null;
  }
}

/**
 * Verify QR code signature
 */
export function verifyQRSignature(data: QRCodeData): boolean {
  if (!data.signature) {
    return false;
  }

  try {
    const expectedSignature = Buffer.from(
      `${data.guestId}-${data.eventId}-${process.env.JWT_SECRET || 'secret'}`
    ).toString('base64');

    return data.signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying QR signature:', error);
    return false;
  }
}

/**
 * Check if QR code is expired (optional feature)
 */
export function isQRCodeExpired(timestamp: number, maxAgeMs: number = 24 * 60 * 60 * 1000): boolean {
  const now = Date.now();
  return now - timestamp > maxAgeMs;
}
