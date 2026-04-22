import nodemailer from 'nodemailer';
import twilio from 'twilio';

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Twilio client for SMS/WhatsApp
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template: string;
  data: Record<string, any>;
  from?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: Array<{ filename: string; path: string }>;
}

export interface SMSOptions {
  to: string;
  body: string;
  from?: string;
}

/**
 * Render email template with data
 * In production, use a proper template engine like Handlebars or Pug
 */
function renderTemplate(templateName: string, data: Record<string, any>): { html: string; text: string } {
  const templates: Record<string, (data: Record<string, any>) => string> = {
    'guest-invitation': (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .qr-code { text-align: center; margin: 20px 0; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited! 🎉</h1>
            </div>
            <div class="content">
              <p>Dear ${data.guestName},</p>
              <p>You are cordially invited to attend <strong>${data.eventName}</strong>.</p>
              <p>Please click the button below to RSVP:</p>
              <div style="text-align: center;">
                <a href="${data.rsvpLink}" class="button">RSVP Now</a>
              </div>
              <div class="qr-code">
                <p>Or scan this QR code:</p>
                <img src="data:image/png;base64,${data.qrCode}" alt="QR Code" style="max-width: 200px;" />
              </div>
              <p>We look forward to seeing you there!</p>
              <div class="footer">
                <p>This invitation was sent by EventFlow Pro</p>
                <p>If you have any questions, please contact the event organizer.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,

    'rsvp-confirmation': (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .status { display: inline-block; padding: 8px 20px; border-radius: 20px; font-weight: bold; margin: 20px 0; }
            .confirmed { background: #d4edda; color: #155724; }
            .pending { background: #fff3cd; color: #856404; }
            .declined { background: #f8d7da; color: #721c24; }
            .event-details { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>RSVP Confirmed! ✓</h1>
            </div>
            <div class="content">
              <p>Dear ${data.guestName},</p>
              <p>Thank you for your response!</p>
              <div style="text-align: center;">
                <span class="status ${data.status}">${data.status.toUpperCase()}</span>
              </div>
              ${data.status === 'confirmed' ? `
                <div class="event-details">
                  <h3>Event Details</h3>
                  <p><strong>Event:</strong> ${data.eventName}</p>
                  <p><strong>Date:</strong> ${new Date(data.eventDetails.date).toLocaleDateString()}</p>
                  <p><strong>Location:</strong> ${data.eventDetails.location || 'TBD'}</p>
                  <p><strong>Timezone:</strong> ${data.eventDetails.timezone || 'Local Time'}</p>
                </div>
                <p>We can't wait to see you there!</p>
              ` : ''}
              <p>You will receive another email with more details closer to the event date.</p>
            </div>
          </div>
        </body>
      </html>
    `,

    'rsvp-reminder': (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .button { display: inline-block; background: #f5576c; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
            .event-date { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Reminder: Please RSVP! ⏰</h1>
            </div>
            <div class="content">
              <p>Hi ${data.guestName},</p>
              <p>This is a friendly reminder that we haven't received your RSVP yet for <strong>${data.eventName}</strong>.</p>
              ${data.customMessage ? `<p>${data.customMessage}</p>` : ''}
              <div class="event-date">
                <strong>Event Date:</strong> ${new Date(data.eventDate).toLocaleDateString()}
              </div>
              <p>Please let us know if you can make it by clicking the button below:</p>
              <div style="text-align: center;">
                <a href="${data.rsvpLink}" class="button">RSVP Now</a>
              </div>
              <p>Thank you!</p>
            </div>
          </div>
        </body>
      </html>
    `,

    'rsvp-status-update': (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .message { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #4facfe; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>RSVP Update</h1>
            </div>
            <div class="content">
              <p>Dear ${data.guestName},</p>
              <p>Your RSVP status for <strong>${data.eventName}</strong> has been updated.</p>
              <div class="message">
                <p><strong>Status:</strong> ${data.status.toUpperCase()}</p>
                <p>${data.message}</p>
              </div>
              <p>If you have any questions, please contact the event organizer.</p>
            </div>
          </div>
        </body>
      </html>
    `,

    'general-update': (data) => `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #fa709a 0%, #fee140 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Event Update 📢</h1>
            </div>
            <div class="content">
              <p>Hi ${data.guestName},</p>
              <p>Here's an update about <strong>${data.eventName}</strong>:</p>
              <p>${data.customMessage || 'Please check the event page for more details.'}</p>
              <p>Thank you!</p>
            </div>
          </div>
        </body>
      </html>
    `
  };

  const htmlTemplate = templates[templateName] || templates['general-update'];
  const html = htmlTemplate(data);
  
  // Simple text version (strip HTML tags)
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  return { html, text };
}

/**
 * Send email
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('Email credentials not configured. Skipping email send.');
      console.log(`Would send email to: ${options.to}, Subject: ${options.subject}`);
      return;
    }

    const { html, text } = renderTemplate(options.template, options.data);

    const mailOptions = {
      from: options.from || process.env.EMAIL_FROM || 'EventFlow Pro <noreply@eventflow.pro>',
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.subject,
      text,
      html,
      attachments: options.attachments
    };

    await emailTransporter.sendMail(mailOptions);
    console.log(`Email sent successfully to ${options.to}`);
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${(error as Error).message}`);
  }
}

/**
 * Send SMS via Twilio
 */
export async function sendSMS(options: SMSOptions): Promise<void> {
  try {
    if (!twilioClient) {
      console.warn('Twilio credentials not configured. Skipping SMS send.');
      console.log(`Would send SMS to: ${options.to}, Body: ${options.body}`);
      return;
    }

    const fromNumber = options.from || process.env.TWILIO_PHONE_NUMBER;

    if (!fromNumber) {
      throw new Error('Twilio phone number not configured');
    }

    await twilioClient.messages.create({
      body: options.body,
      from: fromNumber,
      to: options.to
    });

    console.log(`SMS sent successfully to ${options.to}`);
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw new Error(`Failed to send SMS: ${(error as Error).message}`);
  }
}

/**
 * Send WhatsApp message via Twilio
 */
export async function sendWhatsApp(options: SMSOptions & { mediaUrl?: string }): Promise<void> {
  try {
    if (!twilioClient) {
      console.warn('Twilio credentials not configured. Skipping WhatsApp send.');
      console.log(`Would send WhatsApp to: ${options.to}, Body: ${options.body}`);
      return;
    }

    const fromNumber = options.from || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!fromNumber) {
      throw new Error('Twilio WhatsApp number not configured');
    }

    await twilioClient.messages.create({
      body: options.body,
      from: `whatsapp:${fromNumber}`,
      to: `whatsapp:${options.to}`,
      ...(options.mediaUrl && { mediaUrl: [options.mediaUrl] })
    });

    console.log(`WhatsApp message sent successfully to ${options.to}`);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw new Error(`Failed to send WhatsApp message: ${(error as Error).message}`);
  }
}

/**
 * Send bulk emails with rate limiting
 */
export async function sendBulkEmails(
  emails: EmailOptions[],
  batchSize: number = 10,
  delayMs: number = 1000
): Promise<void> {
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    await Promise.all(batch.map(email => sendEmail(email)));
    
    if (i + batchSize < emails.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
