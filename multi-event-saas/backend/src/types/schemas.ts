import { z } from 'zod';

// Event type enum
export const EventTypeEnum = z.enum([
  'wedding',
  'birthday',
  'conference',
  'meetup',
  'commemoration',
  'custom'
]);

// Event status enum
export const EventStatusEnum = z.enum([
  'draft',
  'published',
  'completed',
  'cancelled'
]);

// Location type enum
export const LocationTypeEnum = z.enum([
  'physical',
  'virtual',
  'hybrid'
]);

// RSVP status enum
export const RsvpStatusEnum = z.enum([
  'pending',
  'attending',
  'declined',
  'waitlisted'
]);

// Guest role enum
export const GuestRoleEnum = z.enum([
  'attendee',
  'vip',
  'speaker',
  'staff',
  'organizer'
]);

// Organization tier enum
export const TierEnum = z.enum([
  'free',
  'pro',
  'enterprise'
]);

// Schema for creating an organization
export const CreateOrganizationSchema = z.object({
  name: z.string().min(3).max(100),
  subdomain: z.string().min(3).max(50).regex(/^[a-z0-9-]+$/),
});

// Schema for updating an organization
export const UpdateOrganizationSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  logoUrl: z.string().url().optional(),
  brandingConfig: z.record(z.any()).optional(),
});

// Schema for creating an event
export const CreateEventSchema = z.object({
  type: EventTypeEnum,
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(200).regex(/^[a-z0-9-]+$/),
  description: z.string().max(5000).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  timezone: z.string().default('UTC'),
  locationType: LocationTypeEnum,
  venueName: z.string().max(200).optional(),
  venueAddress: z.string().max(500).optional(),
  virtualUrl: z.string().url().optional(),
  capacity: z.number().int().positive().optional(),
  themeConfig: z.record(z.any()).optional(),
  customFields: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'number', 'boolean', 'date']),
    required: z.boolean().default(false),
  })).optional(),
});

// Schema for updating an event
export const UpdateEventSchema = CreateEventSchema.partial();

// Schema for creating a guest
export const CreateGuestSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  role: GuestRoleEnum.default('attendee'),
  tableNumber: z.number().int().optional(),
  plusOnes: z.number().int().min(0).default(0),
  dietaryPrefs: z.array(z.string()).optional(),
  accessibilityNeeds: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

// Schema for bulk guest import
export const BulkGuestImportSchema = z.object({
  guests: z.array(CreateGuestSchema).min(1).max(10000),
});

// Schema for creating/updating RSVP
export const CreateRsvpSchema = z.object({
  status: RsvpStatusEnum,
  plusOnesCount: z.number().int().min(0).default(0),
  notes: z.string().max(1000).optional(),
  customAnswers: z.record(z.any()).optional(),
});

// Schema for QR validation
export const ValidateQrSchema = z.object({
  qrCode: z.string().min(1),
  eventId: z.string().uuid(),
  deviceId: z.string().optional(),
  locationLat: z.number().optional(),
  locationLng: z.number().optional(),
});

// Schema for creating a chat message
export const CreateChatMessageSchema = z.object({
  content: z.string().min(1).max(5000),
  messageType: z.enum(['text', 'image', 'file']).default('text'),
  roomType: z.string().max(50).default('general'),
  attachments: z.array(z.object({
    url: z.string().url(),
    name: z.string(),
    size: z.number().optional(),
  })).optional(),
});

// Schema for photo upload
export const PhotoUploadSchema = z.object({
  cloudinaryUrl: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
});

// Schema for waitlist join
export const JoinWaitlistSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200).optional(),
});

// Pagination schema
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(500).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

// Export types
export type CreateOrganizationInput = z.infer<typeof CreateOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof UpdateOrganizationSchema>;
export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type CreateGuestInput = z.infer<typeof CreateGuestSchema>;
export type BulkGuestImportInput = z.infer<typeof BulkGuestImportSchema>;
export type CreateRsvpInput = z.infer<typeof CreateRsvpSchema>;
export type ValidateQrInput = z.infer<typeof ValidateQrSchema>;
export type CreateChatMessageInput = z.infer<typeof CreateChatMessageSchema>;
export type PhotoUploadInput = z.infer<typeof PhotoUploadSchema>;
export type JoinWaitlistInput = z.infer<typeof JoinWaitlistSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
