import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        clerkId: string;
        email: string;
        role?: string;
      };
      organizationId?: string;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('Unauthorized', 401);
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new AppError('Unauthorized', 401);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
      clerkId: string;
      email: string;
    };

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { clerkId: decoded.clerkId },
      select: {
        id: true,
        clerkId: true,
        email: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('Invalid token', 401));
    } else if (error instanceof jwt.TokenExpiredError) {
      next(new AppError('Token expired', 401));
    } else {
      next(error);
    }
  }
};

/**
 * Middleware to check if user has specific role
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    // TODO: Implement role checking logic
    // For now, pass through
    next();
  };
};

/**
 * Middleware to check if user is owner/admin of organization
 */
export const requireOrgAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const orgId = req.params.organizationId || req.body.organizationId;
    
    if (!orgId) {
      // If no org ID in request, check user's default org
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: req.user.id },
      });
      
      if (!membership) {
        throw new AppError('Organization not found', 404);
      }
      
      req.organizationId = membership.organizationId;
      next();
      return;
    }

    // Check if user is member of the organization
    const membership = await prisma.organizationMember.findFirst({
      where: {
        organizationId: orgId,
        userId: req.user.id,
      },
    });

    if (!membership) {
      throw new AppError('Access denied', 403);
    }

    req.organizationId = orgId;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to check event ownership
 */
export const requireEventAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError('Unauthorized', 401);
    }

    const eventId = req.params.eventId || req.body.eventId;
    
    if (!eventId) {
      next();
      return;
    }

    // Check if user has access to the event through organization
    const event = await prisma.event.findFirst({
      where: { id: eventId },
      include: {
        organization: {
          include: {
            members: {
              where: { userId: req.user.id },
            },
          },
        },
      },
    });

    if (!event) {
      throw new AppError('Event not found', 404);
    }

    // Check if user is creator or org member
    const isCreator = event.creatorId === req.user.id;
    const isOrgMember = event.organization.members.length > 0;

    if (!isCreator && !isOrgMember) {
      throw new AppError('Access denied', 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      clerkId: string;
    };

    const user = await prisma.user.findUnique({
      where: { clerkId: decoded.clerkId },
    });

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
};
