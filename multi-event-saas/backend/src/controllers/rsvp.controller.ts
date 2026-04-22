import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';
import { rsvpCreateSchema, rsvpUpdateSchema, rsvpReminderSchema } from '../types/schemas';
import { sendEmail, sendSMS } from '../services/notification.service';
import { socketService } from '../services/socket.service';

export class RSVPController {
  /**
   * Get all RSVPs for an event
   * GET /api/events/:eventId/rsvps
   */
  async getRSVPs(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { status, page = '1', limit = '50' } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { guest: { eventId } };

      if (status) {
        where.status = status as string;
      }

      const [rsvps, total] = await Promise.all([
        prisma.rSVP.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            guest: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            },
            plusOnes: true
          },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.rSVP.count({ where })
      ]);

      // Calculate stats
      const stats = await prisma.rSVP.groupBy({
        by: ['status'],
        where: { guest: { eventId } },
        _count: true
      });

      res.json({
        success: true,
        data: {
          rsvps,
          stats: stats.reduce((acc, stat) => {
            acc[stat.status] = stat._count;
            return acc;
          }, {} as Record<string, number>),
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
   * Get a single RSVP
   * GET /api/events/:eventId/rsvps/:rsvpId
   */
  async getRSVP(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, rsvpId } = req.params;

      const rsvp = await prisma.rSVP.findFirst({
        where: { id: rsvpId, guest: { eventId } },
        include: {
          guest: true,
          plusOnes: true
        }
      });

      if (!rsvp) {
        throw new AppError('RSVP not found', 404);
      }

      res.json({ success: true, data: rsvp });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create or update RSVP (public endpoint)
   * POST /api/rsvp/:qrCode
   */
  async submitRSVP(req: Request, res: Response, next: NextFunction) {
    try {
      const { qrCode } = req.params;
      const validatedData = rsvpCreateSchema.parse(req.body);

      // Verify QR code and get guest
      const guest = await prisma.guest.findUnique({
        where: { qrCode },
        include: { event: true, rsvp: true }
      });

      if (!guest) {
        throw new AppError('Invalid invitation code', 404);
      }

      // Check if event is still accepting RSVPs
      const now = new Date();
      if (guest.event.rsvpDeadline && now > guest.event.rsvpDeadline) {
        throw new AppError('RSVP deadline has passed', 400);
      }

      let rsvp;

      if (guest.rsvp.length > 0) {
        // Update existing RSVP
        rsvp = await prisma.rSVP.update({
          where: { id: guest.rsvp[0].id },
          data: {
            status: validatedData.status,
            notes: validatedData.notes,
            dietaryPreferences: validatedData.dietaryPreferences,
            songRequests: validatedData.songRequests,
            updatedAt: new Date()
          },
          include: { guest: true, plusOnes: true }
        });

        // Handle plus ones
        if (validatedData.plusOnes && validatedData.plusOnes.length > 0) {
          await prisma.plusOne.deleteMany({
            where: { rsvpId: rsvp.id }
          });

          await prisma.plusOne.createMany({
            data: validatedData.plusOnes.map((po: any) => ({
              rsvpId: rsvp.id,
              name: po.name
            }))
          });
        }
      } else {
        // Create new RSVP
        rsvp = await prisma.rSVP.create({
          data: {
            guestId: guest.id,
            status: validatedData.status,
            notes: validatedData.notes,
            dietaryPreferences: validatedData.dietaryPreferences,
            songRequests: validatedData.songRequests,
            plusOnes: {
              create: validatedData.plusOnes?.map((po: any) => ({
                name: po.name
              })) || []
            }
          },
          include: { guest: true, plusOnes: true }
        });
      }

      // Send confirmation
      if (guest.email) {
        await sendEmail({
          to: guest.email,
          subject: `RSVP Confirmed - ${guest.event.name}`,
          template: 'rsvp-confirmation',
          data: {
            guestName: guest.name,
            eventName: guest.event.name,
            status: rsvp.status,
            eventDetails: {
              date: guest.event.date,
              location: guest.event.location,
              timezone: guest.event.timezone
            }
          }
        });
      }

      // Emit real-time update
      socketService.emitToEvent(guest.eventId, 'rsvp:submitted', {
        rsvp,
        guestName: guest.name
      });

      res.json({
        success: true,
        message: 'RSVP submitted successfully',
        data: rsvp
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update RSVP status (organizer)
   * PUT /api/events/:eventId/rsvps/:rsvpId
   */
  async updateRSVP(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, rsvpId } = req.params;
      const validatedData = rsvpUpdateSchema.parse(req.body);

      const rsvp = await prisma.rSVP.findFirst({
        where: { id: rsvpId, guest: { eventId } },
        include: { guest: { include: { event: true } } }
      });

      if (!rsvp) {
        throw new AppError('RSVP not found', 404);
      }

      const updatedRSVP = await prisma.rSVP.update({
        where: { id: rsvpId },
        data: validatedData,
        include: { guest: true, plusOnes: true }
      });

      // Send notification if status changed
      if (validatedData.status && validatedData.status !== rsvp.status && rsvp.guest.email) {
        const statusMessages = {
          pending: 'Your RSVP is pending review',
          confirmed: 'Your RSVP has been confirmed!',
          declined: 'Your RSVP has been declined',
          waitlisted: 'You have been added to the waitlist'
        };

        await sendEmail({
          to: rsvp.guest.email,
          subject: `RSVP Update - ${rsvp.guest.event.name}`,
          template: 'rsvp-status-update',
          data: {
            guestName: rsvp.guest.name,
            eventName: rsvp.guest.event.name,
            status: validatedData.status,
            message: statusMessages[validatedData.status as keyof typeof statusMessages]
          }
        });
      }

      // Emit real-time update
      socketService.emitToEvent(eventId, 'rsvp:updated', updatedRSVP);

      res.json({ success: true, data: updatedRSVP });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete RSVP
   * DELETE /api/events/:eventId/rsvps/:rsvpId
   */
  async deleteRSVP(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, rsvpId } = req.params;

      const rsvp = await prisma.rSVP.findFirst({
        where: { id: rsvpId, guest: { eventId } }
      });

      if (!rsvp) {
        throw new AppError('RSVP not found', 404);
      }

      await prisma.rSVP.delete({
        where: { id: rsvpId }
      });

      // Emit real-time update
      socketService.emitToEvent(eventId, 'rsvp:deleted', { id: rsvpId });

      res.json({ success: true, message: 'RSVP deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send RSVP reminders
   * POST /api/events/:eventId/rsvps/remind
   */
  async sendReminders(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const validatedData = rsvpReminderSchema.parse(req.body);

      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, date: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      // Find guests based on filter
      let guests;
      if (validatedData.filter === 'pending') {
        guests = await prisma.guest.findMany({
          where: {
            eventId,
            rsvp: {
              none: {}
            }
          },
          include: { rsvp: true }
        });
      } else if (validatedData.filter === 'declined') {
        guests = await prisma.guest.findMany({
          where: {
            eventId,
            rsvp: {
              some: {
                status: 'declined'
              }
            }
          },
          include: { rsvp: true }
        });
      } else {
        // All guests
        guests = await prisma.guest.findMany({
          where: { eventId },
          include: { rsvp: true }
        });
      }

      if (guests.length === 0) {
        throw new AppError('No guests match the filter criteria', 400);
      }

      let emailSent = 0;
      let smsSent = 0;

      for (const guest of guests) {
        if (guest.email && validatedData.channels.includes('email')) {
          await sendEmail({
            to: guest.email,
            subject: validatedData.subject || `Reminder: ${event.name}`,
            template: 'rsvp-reminder',
            data: {
              guestName: guest.name,
              eventName: event.name,
              eventDate: event.date,
              customMessage: validatedData.message,
              rsvpLink: `${process.env.FRONTEND_URL}/rsvp/${guest.qrCode}`
            }
          });
          emailSent++;
        }

        if (guest.phone && validatedData.channels.includes('sms')) {
          await sendSMS({
            to: guest.phone,
            body: `${validatedData.message || `Hi ${guest.name}! Don't forget to RSVP for ${event.name}.`} Reply YES/NO`
          });
          smsSent++;
        }
      }

      res.json({
        success: true,
        data: {
          emailSent,
          smsSent,
          total: guests.length
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get RSVP statistics
   * GET /api/events/:eventId/rsvps/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      const [totalGuests, rsvpStats, dailyStats, dietaryStats] = await Promise.all([
        prisma.guest.count({ where: { eventId } }),
        prisma.rSVP.groupBy({
          by: ['status'],
          where: { guest: { eventId } },
          _count: true
        }),
        prisma.rSVP.groupBy({
          by: ['createdAt'],
          where: { 
            guest: { eventId },
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
            }
          },
          _count: true
        }),
        prisma.rSVP.groupBy({
          by: ['dietaryPreferences'],
          where: { 
            guest: { eventId },
            dietaryPreferences: { not: null }
          },
          _count: true
        })
      ]);

      const responseStats = rsvpStats.reduce((acc, stat) => {
        acc[stat.status] = stat._count;
        return acc;
      }, {} as Record<string, number>);

      res.json({
        success: true,
        data: {
          totalGuests,
          responded: Object.values(responseStats).reduce((a, b) => a + b, 0),
          pending: totalGuests - Object.values(responseStats).reduce((a, b) => a + b, 0),
          byStatus: responseStats,
          responseRate: ((Object.values(responseStats).reduce((a, b) => a + b, 0) / totalGuests) * 100).toFixed(2),
          dailyTrend: dailyStats.map(stat => ({
            date: stat.createdAt.toISOString().split('T')[0],
            count: stat._count
          })),
          dietaryRequirements: dietaryStats
            .filter(s => s.dietaryPreferences)
            .map(s => ({
              preference: s.dietaryPreferences,
              count: s._count
            }))
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const rsvpController = new RSVPController();
