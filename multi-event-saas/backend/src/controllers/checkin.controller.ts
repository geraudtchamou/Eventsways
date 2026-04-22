import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';
import { checkInSchema, validateQRSchema } from '../types/schemas';
import { socketService } from '../services/socket.service';

export class CheckInController {
  /**
   * Validate QR code and check in guest
   * POST /api/checkin/validate
   */
  async validateQR(req: Request, res: Response, next: NextFunction) {
    try {
      const validatedData = validateQRSchema.parse(req.body);
      const { qrCode, deviceId } = validatedData;

      // Find guest by QR code
      const guest = await prisma.guest.findUnique({
        where: { qrCode },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              date: true,
              status: true
            }
          },
          rsvp: {
            select: {
              status: true,
              plusOnes: true
            }
          },
          plusOnes: true
        }
      });

      if (!guest) {
        throw new AppError('Invalid QR code', 404);
      }

      // Verify event is active
      if (guest.event.status !== 'published') {
        throw new AppError('Event is not active', 400);
      }

      // Check RSVP status
      const rsvpStatus = guest.rsvp[0]?.status || 'pending';
      if (rsvpStatus === 'declined') {
        throw new AppError('RSVP declined', 403);
      }

      // Check if already checked in recently (prevent duplicates within 5 minutes)
      const recentCheckIn = await prisma.checkIn.findFirst({
        where: {
          guestId: guest.id,
          timestamp: {
            gte: new Date(Date.now() - 5 * 60 * 1000)
          }
        }
      });

      const alreadyCheckedIn = !!recentCheckIn;

      res.json({
        success: true,
        data: {
          valid: true,
          guest: {
            id: guest.id,
            name: guest.name,
            email: guest.email,
            phone: guest.phone,
            tableNumber: guest.tableNumber,
            role: guest.role
          },
          event: {
            id: guest.event.id,
            name: guest.event.name,
            date: guest.event.date
          },
          rsvpStatus,
          plusOnesAllowed: guest.rsvp[0]?.plusOnes?.length || 0,
          alreadyCheckedIn,
          message: alreadyCheckedIn 
            ? 'Guest already checked in' 
            : 'Guest ready for check-in'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Record check-in
   * POST /api/events/:eventId/checkins
   */
  async checkIn(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const validatedData = checkInSchema.parse(req.body);
      const { qrCode, deviceId, location, notes } = validatedData;

      // Find guest by QR code
      const guest = await prisma.guest.findUnique({
        where: { qrCode },
        include: {
          event: true,
          rsvp: true
        }
      });

      if (!guest) {
        throw new AppError('Invalid QR code', 404);
      }

      // Verify guest belongs to event
      if (guest.eventId !== eventId) {
        throw new AppError('Guest does not belong to this event', 400);
      }

      // Check RSVP status
      const rsvpStatus = guest.rsvp[0]?.status || 'pending';
      if (rsvpStatus === 'declined') {
        throw new AppError('Cannot check in guest with declined RSVP', 403);
      }

      // Record check-in
      const checkIn = await prisma.checkIn.create({
        data: {
          guestId: guest.id,
          deviceId: deviceId || null,
          location: location || null,
          notes: notes || null
        },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              email: true,
              tableNumber: true,
              role: true
            }
          }
        }
      });

      // Update guest's lastCheckIn
      await prisma.guest.update({
        where: { id: guest.id },
        data: {
          lastCheckIn: new Date()
        }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'checkin:created', {
        checkIn,
        guestName: guest.name,
        timestamp: new Date()
      });

      res.status(201).json({
        success: true,
        message: 'Check-in successful',
        data: checkIn
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all check-ins for an event
   * GET /api/events/:eventId/checkins
   */
  async getCheckIns(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { page = '1', limit = '50', date, guestId } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { guest: { eventId } };

      if (date) {
        const targetDate = new Date(date as string);
        targetDate.setHours(0, 0, 0, 0);
        const nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 1);

        where.timestamp = {
          gte: targetDate,
          lt: nextDate
        };
      }

      if (guestId) {
        where.guestId = guestId as string;
      }

      const [checkIns, total] = await Promise.all([
        prisma.checkIn.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            guest: {
              select: {
                id: true,
                name: true,
                email: true,
                tableNumber: true,
                role: true,
                qrCode: true
              }
            }
          },
          orderBy: { timestamp: 'desc' }
        }),
        prisma.checkIn.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          checkIns,
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
   * Get check-in statistics
   * GET /api/events/:eventId/checkins/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      const now = new Date();
      const eventStart = new Date(now);
      eventStart.setHours(0, 0, 0, 0);

      const [totalGuests, totalCheckIns, hourlyStats, tableStats] = await Promise.all([
        prisma.guest.count({ where: { eventId } }),
        prisma.checkIn.count({ where: { guest: { eventId } } }),
        prisma.checkIn.groupBy({
          by: ['timestamp'],
          where: {
            guest: { eventId },
            timestamp: {
              gte: eventStart
            }
          },
          _count: true
        }),
        prisma.guest.groupBy({
          by: ['tableNumber'],
          where: {
            eventId,
            checkIns: {
              some: {}
            }
          },
          _count: true
        })
      ]);

      // Process hourly stats
      const hourlyBreakdown = Array(24).fill(0).map((_, hour) => {
        const hourStart = new Date(eventStart);
        hourStart.setHours(hour, 0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(hour + 1, 0, 0, 0);

        const count = hourlyStats.filter(stat => {
          const statTime = new Date(stat.timestamp);
          return statTime >= hourStart && statTime < hourEnd;
        }).reduce((sum, stat) => sum + stat._count, 0);

        return { hour, count };
      });

      // Process table stats
      const tableBreakdown = tableStats.map(stat => ({
        tableNumber: stat.tableNumber,
        checkedInCount: stat._count,
        percentage: ((stat._count / totalGuests) * 100).toFixed(2)
      }));

      res.json({
        success: true,
        data: {
          totalGuests,
          totalCheckIns,
          checkedInPercentage: ((totalCheckIns / totalGuests) * 100).toFixed(2),
          hourlyTrend: hourlyBreakdown,
          tableStats: tableBreakdown,
          peakHour: hourlyBreakdown.reduce((max, curr) => 
            curr.count > max.count ? curr : max, hourlyBreakdown[0]
          )
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Undo check-in (admin only)
   * DELETE /api/events/:eventId/checkins/:checkInId
   */
  async undoCheckIn(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, checkInId } = req.params;

      const checkIn = await prisma.checkIn.findFirst({
        where: { 
          id: checkInId,
          guest: { eventId }
        },
        include: { guest: true }
      });

      if (!checkIn) {
        throw new AppError('Check-in record not found', 404);
      }

      await prisma.checkIn.delete({
        where: { id: checkInId }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'checkin:deleted', {
        checkInId,
        guestId: checkIn.guestId
      });

      res.json({
        success: true,
        message: 'Check-in undone successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk check-in (for manual entry)
   * POST /api/events/:eventId/checkins/bulk
   */
  async bulkCheckIn(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { guestIds, deviceId, location, notes } = req.body;

      if (!guestIds || !Array.isArray(guestIds) || guestIds.length === 0) {
        throw new AppError('No guest IDs provided', 400);
      }

      // Verify all guests belong to event
      const guests = await prisma.guest.findMany({
        where: {
          id: { in: guestIds },
          eventId
        },
        select: { id: true, name: true, rsvp: true }
      });

      if (guests.length !== guestIds.length) {
        throw new AppError('Some guests not found in this event', 400);
      }

      const checkIns = [];
      for (const guest of guests) {
        // Skip if declined RSVP
        if (guest.rsvp[0]?.status === 'declined') {
          continue;
        }

        const checkIn = await prisma.checkIn.create({
          data: {
            guestId: guest.id,
            deviceId: deviceId || null,
            location: location || null,
            notes: notes || null
          },
          include: {
            guest: {
              select: {
                id: true,
                name: true,
                tableNumber: true
              }
            }
          }
        });

        checkIns.push(checkIn);

        // Update guest's lastCheckIn
        await prisma.guest.update({
          where: { id: guest.id },
          data: { lastCheckIn: new Date() }
        });
      }

      // Emit real-time event
      socketService.emitToEvent(eventId, 'checkins:bulk-created', {
        count: checkIns.length
      });

      res.status(201).json({
        success: true,
        message: `Successfully checked in ${checkIns.length} guests`,
        data: { checkIns }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Export check-in data
   * GET /api/events/:eventId/checkins/export
   */
  async exportCheckIns(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { format = 'csv' } = req.query;

      const checkIns = await prisma.checkIn.findMany({
        where: { guest: { eventId } },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              tableNumber: true,
              role: true
            }
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      if (format === 'csv') {
        const csvRows = [
          ['Timestamp', 'Guest Name', 'Email', 'Phone', 'Table', 'Role', 'Device ID', 'Location']
        ];

        checkIns.forEach(ci => {
          csvRows.push([
            ci.timestamp.toISOString(),
            ci.guest.name,
            ci.guest.email || '',
            ci.guest.phone || '',
            ci.guest.tableNumber?.toString() || '',
            ci.guest.role || '',
            ci.deviceId || '',
            ci.location || ''
          ]);
        });

        const csvContent = csvRows.map(row => row.join(',')).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="checkins-${eventId}.csv"`);
        res.send(csvContent);
      } else {
        res.json({ success: true, data: checkIns });
      }
    } catch (error) {
      next(error);
    }
  }
}

export const checkInController = new CheckInController();
