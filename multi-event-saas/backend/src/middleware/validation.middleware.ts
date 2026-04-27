import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../types/errors';

/**
 * Middleware to validate request body/params/query using Zod schemas
 */
export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Validate request data
      const validatedData = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      // Attach validated data to request
      req.body = validatedData.body || req.body;
      req.params = validatedData.params || req.params;
      req.query = validatedData.query || req.query;

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError('Validation failed', 400, errors);
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate only request body
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        throw new AppError('Validation failed', 400, errors);
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate only request params
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError('Invalid parameters', 400);
      }
      next(error);
    }
  };
};

/**
 * Middleware to validate only query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError('Invalid query parameters', 400);
      }
      next(error);
    }
  };
};
