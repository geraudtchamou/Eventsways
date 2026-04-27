import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';
import { chatMessageSchema } from '../types/schemas';
import { socketService } from '../services/socket.service';

export class ChatController {
  /**
   * Get all chat rooms for an event
   * GET /api/events/:eventId/chats/rooms
   */
  async getRooms(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      // Get distinct room types used in this event
      const messages = await prisma.chat.findMany({
        where: { eventId },
        select: {
          fromType: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' },
        distinct: ['fromType']
      });

      const rooms = [
        {
          id: 'general',
          name: 'General',
          type: 'general',
          description: 'Main chat for all attendees',
          messageCount: await prisma.chat.count({
            where: { eventId, toType: 'general' }
          }),
          lastActivity: messages.find(m => m.fromType === 'general')?.createdAt || null
        },
        {
          id: 'announcements',
          name: 'Announcements',
          type: 'announcements',
          description: 'Official event announcements',
          messageCount: await prisma.chat.count({
            where: { eventId, fromType: 'organizer', toType: 'all' }
          }),
          lastActivity: messages.find(m => m.fromType === 'organizer')?.createdAt || null
        },
        {
          id: 'qa',
          name: 'Q&A',
          type: 'qa',
          description: 'Ask questions to organizers',
          messageCount: await prisma.chat.count({
            where: { eventId, toType: 'organizer' }
          }),
          lastActivity: messages.find(m => m.toType === 'organizer')?.createdAt || null
        }
      ];

      res.json({
        success: true,
        data: { rooms }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get messages for a specific room
   * GET /api/events/:eventId/chats/messages/:roomType
   */
  async getMessages(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, roomType } = req.params;
      const { limit = '50', before } = req.query;

      const limitNum = parseInt(limit as string);

      const where: any = { eventId };

      // Filter by room type
      if (roomType === 'general') {
        where.toType = 'general';
      } else if (roomType === 'announcements') {
        where.fromType = 'organizer';
      } else if (roomType === 'qa') {
        where.toType = 'organizer';
      }

      // Pagination with cursor
      if (before) {
        where.createdAt = { lt: new Date(before as string) };
      }

      const messages = await prisma.chat.findMany({
        where,
        take: limitNum,
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              tableNumber: true,
              role: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Reverse to get chronological order
      messages.reverse();

      res.json({
        success: true,
        data: {
          messages,
          hasMore: messages.length === limitNum,
          nextCursor: messages.length > 0 ? messages[messages.length - 1].createdAt : null
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a chat message
   * POST /api/events/:eventId/chats/messages
   */
  async sendMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const validatedData = chatMessageSchema.parse(req.body);

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, allowChat: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      // Check if chat is enabled
      if (!event.allowChat) {
        throw new AppError('Chat is disabled for this event', 400);
      }

      // Get sender info
      let senderInfo;
      let fromType: 'guest' | 'organizer' | 'system';

      // Check if sender is organizer (from JWT)
      const user = (req as any).user;
      if (user?.role === 'organizer' || user?.organizationId) {
        fromType = 'organizer';
        senderInfo = {
          id: user.id,
          name: user.name || 'Organizer',
          isOrganizer: true
        };
      } else if (validatedData.guestId) {
        // Guest sending message
        const guest = await prisma.guest.findUnique({
          where: { id: validatedData.guestId },
          select: { id: true, name: true, tableNumber: true, role: true }
        });

        if (!guest) {
          throw new AppError('Guest not found', 404);
        }

        fromType = 'guest';
        senderInfo = guest;
      } else {
        throw new AppError('Sender information required', 400);
      }

      // Create message
      const message = await prisma.chat.create({
        data: {
          eventId,
          fromType,
          fromId: senderInfo.id,
          message: validatedData.message,
          toType: validatedData.toType || 'general',
          metadata: {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
          }
        },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              tableNumber: true,
              role: true
            }
          }
        }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'chat:message', {
        ...message,
        sender: {
          ...senderInfo,
          fromType
        }
      });

      // Auto-response for Q&A
      if (validatedData.toType === 'organizer') {
        socketService.emitToOrganization(
          user?.organizationId || 'all',
          'chat:qa-received',
          {
            eventId,
            eventName: event.name,
            message: message.message,
            from: senderInfo.name
          }
        );
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a message (moderator only)
   * DELETE /api/events/:eventId/chats/messages/:messageId
   */
  async deleteMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, messageId } = req.params;

      const message = await prisma.chat.findFirst({
        where: { id: messageId, eventId }
      });

      if (!message) {
        throw new AppError('Message not found', 404);
      }

      await prisma.chat.delete({
        where: { id: messageId }
      });

      // Emit real-time event
      socketService.emitToEvent(eventId, 'chat:message-deleted', {
        messageId
      });

      res.json({
        success: true,
        message: 'Message deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send announcement to all attendees
   * POST /api/events/:eventId/chats/announce
   */
  async sendAnnouncement(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { message, priority = 'normal' } = req.body;

      if (!message || message.trim().length === 0) {
        throw new AppError('Message is required', 400);
      }

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      // Create announcement message
      const announcement = await prisma.chat.create({
        data: {
          eventId,
          fromType: 'organizer',
          fromId: (req as any).user?.id || 'system',
          message,
          toType: 'all',
          metadata: {
            priority,
            isAnnouncement: true
          }
        }
      });

      // Emit real-time event to all connected clients
      socketService.emitToEvent(eventId, 'chat:announcement', {
        ...announcement,
        sender: {
          name: 'Event Organizer',
          isOrganizer: true
        }
      });

      // Also send push notifications if priority is high
      if (priority === 'high' || priority === 'urgent') {
        // TODO: Implement push notification service
        console.log(`Sending push notification for urgent announcement in event ${eventId}`);
      }

      res.status(201).json({
        success: true,
        message: 'Announcement sent successfully',
        data: announcement
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get chat statistics
   * GET /api/events/:eventId/chats/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      const [totalMessages, messagesByType, activeUsers, hourlyActivity] = await Promise.all([
        prisma.chat.count({ where: { eventId } }),
        prisma.chat.groupBy({
          by: ['fromType'],
          where: { eventId },
          _count: true
        }),
        prisma.chat.findMany({
          where: {
            eventId,
            createdAt: {
              gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
            }
          },
          select: {
            fromId: true,
            fromType: true
          },
          distinct: ['fromId']
        }),
        prisma.chat.groupBy({
          by: ['createdAt'],
          where: {
            eventId,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
            }
          },
          _count: true
        })
      ]);

      const messageBreakdown = messagesByType.reduce((acc, stat) => {
        acc[stat.fromType] = stat._count;
        return acc;
      }, {} as Record<string, number>);

      // Process hourly activity
      const hourlyBreakdown = Array(24).fill(0).map((_, hour) => {
        const hourStart = new Date(Date.now() - (23 - hour) * 60 * 60 * 1000);
        hourStart.setMinutes(0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(hourStart.getHours() + 1);

        const count = hourlyActivity.filter(stat => {
          const statTime = new Date(stat.createdAt);
          return statTime >= hourStart && statTime < hourEnd;
        }).reduce((sum, stat) => sum + stat._count, 0);

        return { hour, count };
      });

      res.json({
        success: true,
        data: {
          totalMessages,
          messagesByType: messageBreakdown,
          activeUsersLastHour: activeUsers.length,
          hourlyTrend: hourlyBreakdown,
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
   * Join a chat room (WebSocket handler helper)
   * This method validates room access and returns room info
   * GET /api/events/:eventId/chats/join/:roomType
   */
  async joinRoom(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, roomType } = req.params;

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true, allowChat: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      if (!event.allowChat) {
        throw new AppError('Chat is disabled for this event', 400);
      }

      // Validate room type
      const validRooms = ['general', 'announcements', 'qa'];
      if (!validRooms.includes(roomType)) {
        throw new AppError('Invalid room type', 400);
      }

      // Get recent messages for initial load
      const recentMessages = await prisma.chat.findMany({
        where: {
          eventId,
          ...(roomType === 'general' ? { toType: 'general' } : {}),
          ...(roomType === 'announcements' ? { fromType: 'organizer' } : {}),
          ...(roomType === 'qa' ? { toType: 'organizer' } : {})
        },
        take: 50,
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              tableNumber: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json({
        success: true,
        data: {
          roomId: `${eventId}-${roomType}`,
          roomType,
          eventName: event.name,
          messages: recentMessages.reverse(),
          permissions: {
            canSend: roomType !== 'announcements', // Only organizers can send to announcements
            canModerate: (req as any).user?.role === 'organizer'
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
