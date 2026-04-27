import { Request, Response, NextFunction } from 'express';
import { logger } from '@config/logger';

// Standard API response interface
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

// Paginated response interface
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// API Error interface
export interface ApiError {
  code: string;
  message: string;
  details?: Array<{
    field: string;
    message: string;
  }>;
  requestId?: string;
}

// Custom error class
export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: Array<{ field: string; message: string }>;
  isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Error types
export const ErrorCodes = {
  // Authentication errors (4xx)
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  
  // Validation errors (4xx)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  
  // Resource errors (4xx)
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_EXISTS: 'RESOURCE_EXISTS',
  
  // Rate limit errors (4xx)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Payment errors (4xx)
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REQUIRED: 'PAYMENT_REQUIRED',
  
  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

// Factory methods for common errors
export const errors = {
  unauthorized: (message = 'Unauthorized access') => 
    new AppError(message, 401, ErrorCodes.UNAUTHORIZED),
  
  forbidden: (message = 'Access denied') => 
    new AppError(message, 403, ErrorCodes.FORBIDDEN),
  
  notFound: (resource = 'Resource') => 
    new AppError(`${resource} not found`, 404, ErrorCodes.NOT_FOUND),
  
  conflict: (message = 'Resource already exists') => 
    new AppError(message, 409, ErrorCodes.CONFLICT),
  
  validation: (details: Array<{ field: string; message: string }>) => 
    new AppError('Validation failed', 400, ErrorCodes.VALIDATION_ERROR, details),
  
  rateLimit: () => 
    new AppError('Too many requests', 429, ErrorCodes.RATE_LIMIT_EXCEEDED),
  
  paymentFailed: (message = 'Payment processing failed') => 
    new AppError(message, 400, ErrorCodes.PAYMENT_FAILED),
  
  internal: (message = 'Internal server error') => 
    new AppError(message, 500, ErrorCodes.INTERNAL_ERROR),
};

// Global error handler middleware
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}`;
  
  // Log error
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId,
  });
  
  // Handle operational errors
  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    
    return res.status(err.statusCode).json(response);
  }
  
  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCodes.DATABASE_ERROR,
        message: 'Database operation failed',
        requestId,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    
    return res.status(500).json(response);
  }
  
  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const zodError = err as any;
    const details = zodError.errors.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    
    const response: ApiResponse = {
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details,
        requestId,
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
    
    return res.status(400).json(response);
  }
  
  // Handle unknown errors
  const response: ApiResponse = {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message,
      requestId,
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  
  return res.status(500).json(response);
};

// Async handler wrapper to catch async errors
export const asyncHandler = (fn: Function) => 
  (req: Request, res: Response, next: NextFunction) => 
    Promise.resolve(fn(req, res, next)).catch(next);

// Success response helper
export const successResponse = <T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: Record<string, any>
) => {
  const requestId = res.get('X-Request-Id') || `req_${Date.now()}`;
  
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
  
  return res.status(statusCode).json(response);
};

// Paginated response helper
export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
) => {
  const totalPages = Math.ceil(total / limit);
  const requestId = res.get('X-Request-Id') || `req_${Date.now()}`;
  
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
  
  return res.status(200).json(response);
};
