/**
 * Generate URL-friendly slug from string
 */
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars
    .replace(/[\s_-]+/g, '-') // Replace spaces with dashes
    .replace(/^-+|-+$/g, '') // Trim dashes from ends
    .substring(0, 200); // Limit length
};

/**
 * Generate unique QR code string
 */
export const generateQRCode = (eventId: string, guestId: string): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `efp_${eventId}_${guestId}_${timestamp}_${random}`;
};

/**
 * Generate secure random token
 */
export const generateToken = (length: number = 32): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Format date for display
 */
export const formatDate = (date: Date, locale: string = 'en-US'): string => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

/**
 * Parse CSV content to array of objects
 */
export const parseCSV = (csvContent: string): Record<string, any>[] => {
  const lines = csvContent.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    const obj: Record<string, any> = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  });
};
