import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { CreateEventSchema, UpdateEventSchema } from '../types/schemas';
import { generateSlug } from '../utils/slugify';

/**
 * Create a new event
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = CreateEventSchema.parse(req.body);
  
  // Generate slug if not provided
  const slug = data.slug || generateSlug(data.name);

  // Check slug uniqueness within organization
  const existing = await prisma.event.findFirst({
    where: {
      organizationId: req.organizationId,
      slug,
    },
  });

  if (existing) {
    throw new AppError('Event slug already exists', 409);
  }

  // Get default theme based on event type
  const defaultTheme = await prisma.themeTemplate.findFirst({
    where: {
      eventType: data.type.toUpperCase(),
      isDefault: true,
    },
  });

  const event = await prisma.event.create({
    data: {
      ...data,
      slug,
      organizationId: req.organizationId!,
      creatorId: req.user!.id,
      themeConfig: data.themeConfig || defaultTheme?.colors || {},
    },
    include: {
      organization: {
        select: {
          name: true,
          subdomain: true,
        },
      },
    },
  });

  logger.info({ 
    message: 'Event created', 
    eventId: event.id,
    userId: req.user?.id 
  });

  res.status(201).json({
    success: true,
    data: event,
  });
});

/**
 * List events for organization
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const type = req.query.type as string;
  const status = req.query.status as string;

  const where: any = {
    organizationId: req.organizationId,
  };

  if (type) {
    where.type = type.toUpperCase();
  }

  if (status) {
    where.status = status.toUpperCase();
  }

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        _count: {
          select: {
            guests: true,
            rsvps: true,
            checkins: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { startDate: 'desc' },
    }),
    prisma.event.count({ where }),
  ]);

  res.json({
    success: true,
    data: events,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get public event by slug (no auth required)
 */
export const getPublicEvent = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params;

  const event = await prisma.event.findFirst({
    where: {
      slug,
      status: 'PUBLISHED',
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      type: true,
      startDate: true,
      endDate: true,
      timezone: true,
      locationType: true,
      venueName: true,
      venueAddress: true,
      city: true,
      country: true,
      virtualUrl: true,
      themeConfig: true,
      allowPlusOnes: true,
      maxPlusOnes: true,
      registrationOpen: true,
      capacity: true,
      rsvpCount: true,
      organization: {
        select: {
          name: true,
          logoUrl: true,
          brandingConfig: true,
        },
      },
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Increment view count
  await prisma.event.update({
    where: { id: event.id },
    data: { viewCount: { increment: 1 } },
  });

  res.json({
    success: true,
    data: event,
  });
});

/**
 * Get event by ID
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
    include: {
      _count: {
        select: {
          guests: true,
          rsvps: true,
          checkins: true,
          photos: true,
          waitlist: true,
        },
      },
      analytics: true,
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  res.json({
    success: true,
    data: event,
  });
});

/**
 * Update event
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = UpdateEventSchema.parse(req.body);

  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  const updated = await prisma.event.update({
    where: { id },
    data,
  });

  res.json({
    success: true,
    data: updated,
  });
});

/**
 * Delete event
 */
export const deleteEvent = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  await prisma.event.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: 'Event deleted successfully',
  });
});

/**
 * Publish event
 */
export const publish = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  const updated = await prisma.event.update({
    where: { id },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  res.json({
    success: true,
    data: updated,
  });
});

/**
 * Duplicate event
 */
export const duplicate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, startDate } = req.body;

  const original = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
  });

  if (!original) {
    throw new AppError('Event not found', 404);
  }

  const duplicated = await prisma.event.create({
    data: {
      organizationId: original.organizationId,
      creatorId: req.user!.id,
      type: original.type,
      name: name || `${original.name} (Copy)`,
      slug: generateSlug(name || `${original.name}-${Date.now()}`),
      description: original.description,
      startDate: startDate ? new Date(startDate) : original.startDate,
      endDate: original.endDate,
      timezone: original.timezone,
      locationType: original.locationType,
      venueName: original.venueName,
      venueAddress: original.venueAddress,
      virtualUrl: original.virtualUrl,
      capacity: original.capacity,
      themeConfig: original.themeConfig,
      customFields: original.customFields,
      allowPlusOnes: original.allowPlusOnes,
      maxPlusOnes: original.maxPlusOnes,
      enableWaitlist: original.enableWaitlist,
      enableChat: original.enableChat,
      enablePhotos: original.enablePhotos,
      enableCheckin: original.enableCheckin,
    },
  });

  res.status(201).json({
    success: true,
    data: duplicated,
  });
});

/**
 * Export event data
 */
export const exportData = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const format = req.query.format as string || 'json';

  const event = await prisma.event.findFirst({
    where: {
      id,
      organizationId: req.organizationId,
    },
    include: {
      guests: {
        include: {
          rsvp: true,
          checkins: true,
        },
      },
      rsvps: true,
      waitlist: true,
    },
  });

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  if (format === 'csv') {
    // Convert to CSV
    const csv = convertToCSV(event.guests);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${event.slug}-guests.csv"`);
    return res.send(csv);
  }

  res.json({
    success: true,
    data: event,
  });
});

/**
 * Helper function to convert guests to CSV
 */
function convertToCSV(guests: any[]): string {
  const headers = ['Name', 'Email', 'Phone', 'Role', 'RSVP Status', 'Table Number'];
  const rows = guests.map(guest => [
    guest.name,
    guest.email || '',
    guest.phone || '',
    guest.role,
    guest.rsvp?.status || 'pending',
    guest.tableNumber || '',
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Export controller
export default {
  create,
  list,
  getPublicEvent,
  getById,
  update,
  delete: deleteEvent,
  publish,
  duplicate,
  exportData,
};
