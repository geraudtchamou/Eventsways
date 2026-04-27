import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';
import { generateQRCode } from '../utils/qr';
import { guestCreateSchema, guestUpdateSchema, guestBulkImportSchema } from '../types/schemas';
import { sendEmail } from '../services/email.service';
import { socketService } from '../services/socket.service';

export class GuestController {
  /**
   * Get all guests for an event with pagination and filtering
   * GET /api/events/:eventId/guests
   */
  async getGuests(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { page = '1', limit = '50', status, search, role } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = { eventId };

      if (status) {
        where.rsvp = {
          some: {
            status: status as string
          }
        };
      }

      if (role) {
        where.role = role as string;
      }

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const [guests, total] = await Promise.all([
        prisma.guest.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            rsvp: true,
            checkIns: {
              orderBy: { timestamp: 'desc' },
              take: 1
            },
            plusOnes: true
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.guest.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          guests,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single guest by ID
   * GET /api/events/:eventId/guests/:guestId
   */
  async getGuest(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, guestId } = req.params;

      const guest = await prisma.guest.findFirst({
        where: { id: guestId, eventId },
        include: {
          rsvp: true,
          checkIns: true,
          plusOnes: true,
          photos: true
        }
      });

      if (!guest) {
        throw new AppError('Guest not found', 404);
      }

      res.json({ success: true, data: guest });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new guest
   * POST /api/events/:eventId/guests
   */
  async createGuest(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const validatedData = guestCreateSchema.parse(req.body);

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, organizationId: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      // Generate QR code
      const qrCodeData = {
        eventId,
        guestId: '', // Will be filled after creation
        timestamp: Date.now()
      };
      const qrCode = await generateQRCode(qrCodeData);

      // Create guest
      const guest = await prisma.guest.create({
        data: {
          ...validatedData,
          eventId,
          qrCode,
          ...(validatedData.email && {
            rsvp: {
              create: {
                status: 'pending',
                notes: validatedData.notes || ''
              }
            }
          })
        },
        include: {
          rsvp: true,
          plusOnes: true
        }
      });

      // Update QR code with actual guest ID
      const updatedQrCodeData = {
        eventId,
        guestId: guest.id,
        timestamp: Date.now(),
        signature: Buffer.from(`${guest.id}-${eventId}-${process.env.JWT_SECRET || 'secret'}`).toString('base64')
      };
      const updatedQrCode = await generateQRCode(updatedQrCodeData);

      const updatedGuest = await prisma.guest.update({
        where: { id: guest.id },
        data: { qrCode: updatedQrCode },
        include: { rsvp: true, plusOnes: true }
      });

      // Send invitation email if email provided
      if (validatedData.email) {
        await sendEmail({
          to: validatedData.email,
          subject: `You're invited to ${event.name}!`,
          template: 'guest-invitation',
          data: {
            guestName: validatedData.name,
            eventName: event.name,
            qrCode: updatedQrCode,
            rsvpLink: `${process.env.FRONTEND_URL}/rsvp/${updatedQrCode}`
          }
        });
      }

      // Emit real-time event
      socketService.emitToEvent(eventId, 'guest:created', updatedGuest);

      res.status(201).json({ success: true, data: updatedGuest });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a guest
   * PUT /api/events/:eventId/guests/:guestId
   */
  async updateGuest(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, guestId } = req.params;
      const validatedData = guestUpdateSchema.parse(req.body);

      // Verify guest belongs to event
      const existingGuest = await prisma.guest.findFirst({
        where: { id: guestId, eventId }
      });

      if (!existingGuest) {
        throw new AppError('Guest not found', 404);
      }

      const guest = await prisma.guest.update({
        where: { id: guestId },
        data: validatedData,
        include: { rsvp: true, plusOnes: true }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'guest:updated', guest);

      res.json({ success: true, data: guest });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a guest
   * DELETE /api/events/:eventId/guests/:guestId
   */
  async deleteGuest(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, guestId } = req.params;

      // Verify guest belongs to event
      const existingGuest = await prisma.guest.findFirst({
        where: { id: guestId, eventId }
      });

      if (!existingGuest) {
        throw new AppError('Guest not found', 404);
      }

      await prisma.guest.delete({
        where: { id: guestId }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'guest:deleted', { id: guestId });

      res.json({ success: true, message: 'Guest deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk import guests
   * POST /api/events/:eventId/guests/bulk
   */
  async bulkImportGuests(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const validatedData = guestBulkImportSchema.parse(req.body);

      // Verify event exists and get details
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      const { guests } = validatedData;
      const createdGuests = [];

      // Process guests in batches
      for (const guestData of guests) {
        const qrCodeData = {
          eventId,
          guestId: '',
          timestamp: Date.now()
        };
        const qrCode = await generateQRCode(qrCodeData);

        const guest = await prisma.guest.create({
          data: {
            ...guestData,
            eventId,
            qrCode,
            ...(guestData.email && {
              rsvp: {
                create: {
                  status: 'pending',
                  notes: guestData.notes || ''
                }
              }
            })
          },
          include: { rsvp: true }
        });

        // Update QR code with actual guest ID
        const updatedQrCodeData = {
          eventId,
          guestId: guest.id,
          timestamp: Date.now(),
          signature: Buffer.from(`${guest.id}-${eventId}-${process.env.JWT_SECRET || 'secret'}`).toString('base64')
        };
        const updatedQrCode = await generateQRCode(updatedQrCodeData);

        const updatedGuest = await prisma.guest.update({
          where: { id: guest.id },
          data: { qrCode: updatedQrCode }
        });

        createdGuests.push(updatedGuest);

        // Send invitation email
        if (guestData.email) {
          await sendEmail({
            to: guestData.email,
            subject: `You're invited to ${event.name}!`,
            template: 'guest-invitation',
            data: {
              guestName: guestData.name,
              eventName: event.name,
              qrCode: updatedQrCode,
              rsvpLink: `${process.env.FRONTEND_URL}/rsvp/${updatedQrCode}`
            }
          });
        }
      }

      // Emit real-time event
      socketService.emitToEvent(eventId, 'guests:bulk-imported', { count: createdGuests.length });

      res.status(201).json({
        success: true,
        data: {
          imported: createdGuests.length,
          guests: createdGuests
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export guests to CSV
   * GET /api/events/:eventId/guests/export
   */
  async exportGuests(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { format = 'csv' } = req.query;

      const guests = await prisma.guest.findMany({
        where: { eventId },
        include: {
          rsvp: true,
          plusOnes: true,
          checkIns: {
            orderBy: { timestamp: 'desc' },
            take: 1
          }
        },
        orderBy: { name: 'asc' }
      });

      if (format === 'csv') {
        const csvRows = [
          ['Name', 'Email', 'Phone', 'Role', 'Table', 'RSVP Status', 'Plus Ones', 'Checked In', 'Dietary Preferences']
        ];

        guests.forEach(guest => {
          csvRows.push([
            guest.name,
            guest.email || '',
            guest.phone || '',
            guest.role || '',
            guest.tableNumber?.toString() || '',
            guest.rsvp?.[0]?.status || 'no-rsvp',
            guest.plusOnes?.length.toString() || '0',
            guest.checkIns?.[0] ? 'Yes' : 'No',
            guest.dietaryPreferences || ''
          ]);
        });

        const csvContent = csvRows.map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="guests-${eventId}.csv"`);
        res.send(csvContent);
      } else {
        res.json({ success: true, data: guests });
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send reminder to guests
   * POST /api/events/:eventId/guests/remind
   */
  async sendReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { guestIds, message, type = 'rsvp-reminder' } = req.body;

      let guests;
      if (guestIds && guestIds.length > 0) {
        guests = await prisma.guest.findMany({
          where: {
            id: { in: guestIds },
            eventId
          },
          include: { rsvp: true }
        });
      } else {
        // Send to all guests without RSVP
        guests = await prisma.guest.findMany({
          where: {
            eventId,
            rsvp: {
              none: {}
            }
          },
          include: { rsvp: true }
        });
      }

      if (guests.length === 0) {
        throw new AppError('No guests to send reminders to', 400);
      }

      let sentCount = 0;
      for (const guest of guests) {
        if (guest.email) {
          await sendEmail({
            to: guest.email,
            subject: type === 'rsvp-reminder' 
              ? `Reminder: Please RSVP for ${req.body.eventName || 'the event'}`
              : `Update about ${req.body.eventName || 'the event'}`,
            template: type === 'rsvp-reminder' ? 'rsvp-reminder' : 'general-update',
            data: {
              guestName: guest.name,
              eventName: req.body.eventName || 'the event',
              customMessage: message,
              rsvpLink: `${process.env.FRONTEND_URL}/rsvp/${guest.qrCode}`
            }
          });
          sentCount++;
        }
      }

      res.json({
        success: true,
        data: {
          sent: sentCount,
          total: guests.length
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const guestController = new GuestController();
