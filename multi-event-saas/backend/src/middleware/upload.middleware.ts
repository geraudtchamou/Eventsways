import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import { AppError } from '../types/errors';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'eventflow-pro',
    format: async (req, file) => 'png', // supports promises as well
    transformation: [
      { width: 1920, height: 1920, crop: 'limit', quality: 'auto' },
      { fetch_format: 'auto' }
    ],
    public_id: (req, file) => `photo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
});

// Create multer upload instance
export const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 5 // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      return cb(new AppError('Only image files are allowed', 400));
    }

    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (!allowedExtensions.includes(ext)) {
      return cb(new AppError('Invalid file extension. Allowed: jpg, jpeg, png, gif, webp', 400));
    }

    cb(null, true);
  }
});

// Middleware for handling multiple file uploads
export const uploadMultiple = upload.array('photos', 10);

// Middleware for single file upload with custom field name
export const uploadSingle = (fieldName: string = 'file') => {
  return upload.single(fieldName);
};

// Error handler for multer
export const handleMulterError = (err: any, req: any, res: any, next: any) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('File too large. Maximum size is 10MB', 400));
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError('Too many files. Maximum is 5 files', 400));
    }
    return next(new AppError(`Upload error: ${err.message}`, 400));
  }
  
  if (err) {
    return next(new AppError(err.message || 'Upload failed', 400));
  }
  
  next();
};

// Helper function to delete file from Cloudinary
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`Deleted file from Cloudinary: ${publicId}`);
  } catch (error) {
    console.error('Error deleting file from Cloudinary:', error);
    throw new Error('Failed to delete file');
  }
}

// Helper function to get Cloudinary URL from public ID
export function getCloudinaryUrl(publicId: string, transformations?: any[]): string {
  return cloudinary.url(publicId, {
    transformation: transformations || []
  });
}
