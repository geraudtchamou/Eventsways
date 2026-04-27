import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { AppError, asyncHandler } from '../middleware/error.middleware';
import { CreateOrganizationSchema, UpdateOrganizationSchema } from '../types/schemas';
import type { CreateOrganizationInput, UpdateOrganizationInput } from '../types/schemas';

/**
 * Create a new organization
 */
export const create = asyncHandler(async (req: Request, res: Response) => {
  const data = CreateOrganizationSchema.parse(req.body);
  
  // Check if subdomain is already taken
  const existing = await prisma.organization.findUnique({
    where: { subdomain: data.subdomain },
  });

  if (existing) {
    throw new AppError('Subdomain already taken', 409);
  }

  const organization = await prisma.organization.create({
    data: {
      ...data,
      slug: data.subdomain.toLowerCase().replace(/-/g, '-'),
    },
  });

  logger.info({ 
    message: 'Organization created', 
    organizationId: organization.id,
    userId: req.user?.id 
  });

  res.status(201).json({
    success: true,
    data: organization,
  });
});

/**
 * List organizations for current user
 */
export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const organizations = await prisma.organization.findMany({
    where: {
      members: {
        some: {
          userId: req.user!.id,
        },
      },
    },
    include: {
      _count: {
        select: {
          events: true,
          members: true,
        },
      },
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const total = await prisma.organization.count({
    where: {
      members: {
        some: {
          userId: req.user!.id,
        },
      },
    },
  });

  res.json({
    success: true,
    data: organizations,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * Get organization by ID
 */
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const organization = await prisma.organization.findFirst({
    where: {
      id,
      members: {
        some: {
          userId: req.user!.id,
        },
      },
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              imageUrl: true,
            },
          },
        },
      },
      _count: {
        select: {
          events: true,
        },
      },
    },
  });

  if (!organization) {
    throw new AppError('Organization not found', 404);
  }

  res.json({
    success: true,
    data: organization,
  });
});

/**
 * Get organization by subdomain (public access)
 */
export const getBySubdomain = asyncHandler(async (req: Request, res: Response) => {
  const { subdomain } = req.params;

  const organization = await prisma.organization.findUnique({
    where: { subdomain },
    select: {
      id: true,
      name: true,
      subdomain: true,
      logoUrl: true,
      brandingConfig: true,
      tier: true,
    },
  });

  if (!organization) {
    throw new AppError('Organization not found', 404);
  }

  res.json({
    success: true,
    data: organization,
  });
});

/**
 * Update organization
 */
export const update = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = UpdateOrganizationSchema.parse(req.body);

  // Verify ownership/access
  const existing = await prisma.organization.findFirst({
    where: {
      id,
      members: {
        some: {
          userId: req.user!.id,
          role: { in: ['OWNER', 'ADMIN'] },
        },
      },
    },
  });

  if (!existing) {
    throw new AppError('Organization not found or access denied', 404);
  }

  const organization = await prisma.organization.update({
    where: { id },
    data,
  });

  res.json({
    success: true,
    data: organization,
  });
});

/**
 * Delete organization
 */
export const deleteOrg = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Verify ownership
  const existing = await prisma.organization.findFirst({
    where: {
      id,
      members: {
        some: {
          userId: req.user!.id,
          role: 'OWNER',
        },
      },
    },
  });

  if (!existing) {
    throw new AppError('Organization not found or access denied', 404);
  }

  await prisma.organization.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: 'Organization deleted successfully',
  });
});

/**
 * Add member to organization
 */
export const addMember = asyncHandler(async (req: Request, res: Response) => {
  const { id: organizationId } = req.params;
  const { email, role } = req.body;

  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new AppError('User not found', 404);
  }

  // Add membership
  const membership = await prisma.organizationMember.create({
    data: {
      organizationId,
      userId: user.id,
      role: role || 'MEMBER',
    },
  });

  res.status(201).json({
    success: true,
    data: membership,
  });
});

/**
 * Remove member from organization
 */
export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const { orgId, userId } = req.params;

  await prisma.organizationMember.deleteMany({
    where: {
      organizationId: orgId,
      userId,
    },
  });

  res.json({
    success: true,
    message: 'Member removed successfully',
  });
});

/**
 * Get organization analytics
 */
export const getAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const stats = await prisma.$queryRaw`
    SELECT 
      COUNT(DISTINCT e.id) as total_events,
      COUNT(DISTINCT g.id) as total_guests,
      COUNT(DISTINCT r.id) as total_rsvps,
      SUM(CASE WHEN r.status = 'ATTENDING' THEN 1 ELSE 0 END) as attending_count
    FROM "Event" e
    LEFT JOIN "Guest" g ON e.id = g."eventId"
    LEFT JOIN "Rsvp" r ON g.id = r."guestId"
    WHERE e."organizationId" = ${id}
  `;

  res.json({
    success: true,
    data: stats[0],
  });
});

// Export with renamed delete function
export default {
  create,
  list,
  getById,
  getBySubdomain,
  update,
  delete: deleteOrg,
  addMember,
  removeMember,
  getAnalytics,
};
