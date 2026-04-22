import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../types/errors';
import { photoUploadSchema, photoApproveSchema } from '../types/schemas';

export class PhotoController {
  /**
   * Get all photos for an event
   * GET /api/events/:eventId/photos
   */
  async getPhotos(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { page = '1', limit = '50', approved, guestId } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const where: any = { eventId };

      if (approved !== undefined) {
        where.approved = approved === 'true';
      }

      if (guestId) {
        where.guestId = guestId as string;
      }

      const [photos, total] = await Promise.all([
        prisma.photo.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            guest: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: { uploadedAt: 'desc' }
        }),
        prisma.photo.count({ where })
      ]);

      res.json({
        success: true,
        data: {
          photos,
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
   * Get a single photo
   * GET /api/events/:eventId/photos/:photoId
   */
  async getPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, photoId } = req.params;

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId },
        include: {
          guest: true
        }
      });

      if (!photo) {
        throw new AppError('Photo not found', 404);
      }

      res.json({ success: true, data: photo });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Upload a photo (creates photo record, actual upload handled by middleware)
   * POST /api/events/:eventId/photos/upload
   */
  async uploadPhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      
      // Validate request has file
      if (!req.file) {
        throw new AppError('No file uploaded', 400);
      }

      const validatedData = photoUploadSchema.parse(req.body);

      // Verify event exists
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { id: true, name: true }
      });

      if (!event) {
        throw new AppError('Event not found', 404);
      }

      // Get guest ID from token or body
      const guestId = validatedData.guestId || (req as any).user?.guestId;

      let finalGuestId = guestId;
      
      // If no guest ID provided and user is not authenticated as guest, create anonymous record
      if (!finalGuestId) {
        const anonymousGuest = await prisma.guest.create({
          data: {
            eventId,
            name: 'Anonymous Guest',
            email: null,
            phone: null,
            role: 'guest'
          }
        });
        finalGuestId = anonymousGuest.id;
      }

      // Create photo record
      const photo = await prisma.photo.create({
        data: {
          eventId,
          guestId: finalGuestId,
          url: (req.file as any).location, // Cloudinary URL from upload middleware
          thumbnailUrl: (req.file as any).thumbnailLocation,
          caption: validatedData.caption,
          approved: false, // Require approval by default
          metadata: {
            originalName: (req.file as any).originalname,
            size: (req.file as any).size,
            mimeType: (req.file as any).mimetype,
            width: validatedData.width,
            height: validatedData.height
          }
        },
        include: {
          guest: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Photo uploaded successfully',
        data: photo
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Approve a photo (organizer only)
   * PUT /api/events/:eventId/photos/:photoId/approve
   */
  async approvePhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, photoId } = req.params;
      const validatedData = photoApproveSchema.parse(req.body);

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });

      if (!photo) {
        throw new AppError('Photo not found', 404);
      }

      const updatedPhoto = await prisma.photo.update({
        where: { id: photoId },
        data: {
          approved: validatedData.approved,
          ...(validatedData.rejectionReason && {
            rejectionReason: validatedData.rejectionReason
          })
        },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      // Send notification to guest if rejected
      if (validatedData.approved === false && updatedPhoto.guest?.email) {
        // TODO: Implement email notification
        console.log(`Photo rejected for guest ${updatedPhoto.guest.email}: ${validatedData.rejectionReason}`);
      }

      res.json({
        success: true,
        message: `Photo ${validatedData.approved ? 'approved' : 'rejected'}`,
        data: updatedPhoto
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk approve photos
   * POST /api/events/:eventId/photos/bulk-approve
   */
  async bulkApprove(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { photoIds, approved, rejectionReason } = req.body;

      if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
        throw new AppError('No photo IDs provided', 400);
      }

      // Verify all photos belong to event
      const photos = await prisma.photo.findMany({
        where: {
          id: { in: photoIds },
          eventId
        }
      });

      if (photos.length !== photoIds.length) {
        throw new AppError('Some photos not found in this event', 400);
      }

      // Update all photos
      await prisma.photo.updateMany({
        where: {
          id: { in: photoIds }
        },
        data: {
          approved,
          ...(rejectionReason && { rejectionReason })
        }
      });

      const updatedPhotos = await prisma.photo.findMany({
        where: {
          id: { in: photoIds }
        },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        }
      });

      res.json({
        success: true,
        message: `Successfully ${approved ? 'approved' : 'rejected'} ${updatedPhotos.length} photos`,
        data: { photos: updatedPhotos }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a photo
   * DELETE /api/events/:eventId/photos/:photoId
   */
  async deletePhoto(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId, photoId } = req.params;

      const photo = await prisma.photo.findFirst({
        where: { id: photoId, eventId }
      });

      if (!photo) {
        throw new AppError('Photo not found', 404);
      }

      // TODO: Delete from Cloudinary using photo.url

      await prisma.photo.delete({
        where: { id: photoId }
      });

      res.json({
        success: true,
        message: 'Photo deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get photo statistics
   * GET /api/events/:eventId/photos/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;

      const [totalPhotos, approvedPhotos, pendingPhotos, photosByGuest] = await Promise.all([
        prisma.photo.count({ where: { eventId } }),
        prisma.photo.count({ where: { eventId, approved: true } }),
        prisma.photo.count({ where: { eventId, approved: false } }),
        prisma.photo.groupBy({
          by: ['guestId'],
          where: { eventId },
          _count: true,
          orderBy: { _count: 'desc' },
          take: 10
        })
      ]);

      // Get guest details for top contributors
      const topContributors = await Promise.all(
        photosByGuest.map(async (stat) => {
          const guest = await prisma.guest.findUnique({
            where: { id: stat.guestId! },
            select: { id: true, name: true, email: true }
          });
          return {
            guest: guest || { id: stat.guestId, name: 'Unknown', email: null },
            photoCount: stat._count
          };
        })
      );

      res.json({
        success: true,
        data: {
          totalPhotos,
          approvedPhotos,
          pendingPhotos,
          approvalRate: totalPhotos > 0 ? ((approvedPhotos / totalPhotos) * 100).toFixed(2) : '0',
          topContributors
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Download photos as ZIP (organizer only)
   * GET /api/events/:eventId/photos/download
   */
  async downloadPhotos(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventId } = req.params;
      const { approved } = req.query;

      const where: any = { eventId };
      if (approved !== undefined) {
        where.approved = approved === 'true';
      }

      const photos = await prisma.photo.findMany({
        where,
        select: {
          id: true,
          url: true,
          caption: true
        }
      });

      // TODO: Implement ZIP download using a library like archiver
      // For now, return list of URLs
      res.json({
        success: true,
        data: {
          count: photos.length,
          photos: photos.map(p => ({
            id: p.id,
            url: p.url,
            caption: p.caption
          }))
        },
        message: 'ZIP download functionality to be implemented with archiver library'
      });
    } catch (error) {
      next(error);
    }
  }
}

export const photoController = new PhotoController();
