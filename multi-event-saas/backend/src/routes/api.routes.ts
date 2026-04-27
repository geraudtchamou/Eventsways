import { Router } from 'express';
import { organizationController } from '../controllers/organization.controller';
import { eventController } from '../controllers/event.controller';
import { guestController } from '../controllers/guest.controller';
import { rsvpController } from '../controllers/rsvp.controller';
import { checkInController } from '../controllers/checkin.controller';
import { photoController } from '../controllers/photo.controller';
import { chatController } from '../controllers/chat.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

// ==================== ORGANIZATION ROUTES ====================
router.get(
  '/organizations',
  authenticate,
  organizationController.getOrganizations
);

router.post(
  '/organizations',
  authenticate,
  validateRequest('createOrganization'),
  organizationController.createOrganization
);

router.get(
  '/organizations/:orgId',
  authenticate,
  organizationController.getOrganization
);

router.put(
  '/organizations/:orgId',
  authenticate,
  authorize(['admin']),
  validateRequest('updateOrganization'),
  organizationController.updateOrganization
);

router.delete(
  '/organizations/:orgId',
  authenticate,
  authorize(['admin']),
  organizationController.deleteOrganization
);

router.get(
  '/organizations/:orgId/team',
  authenticate,
  organizationController.getTeamMembers
);

router.post(
  '/organizations/:orgId/team',
  authenticate,
  authorize(['admin']),
  organizationController.addTeamMember
);

router.delete(
  '/organizations/:orgId/team/:memberId',
  authenticate,
  authorize(['admin']),
  organizationController.removeTeamMember
);

router.get(
  '/organizations/:orgId/analytics',
  authenticate,
  organizationController.getAnalytics
);

// ==================== EVENT ROUTES ====================
router.get(
  '/events',
  authenticate,
  eventController.getEvents
);

router.post(
  '/events',
  authenticate,
  validateRequest('createEvent'),
  eventController.createEvent
);

router.get(
  '/events/:eventId',
  eventController.getEvent
);

router.put(
  '/events/:eventId',
  authenticate,
  validateRequest('updateEvent'),
  eventController.updateEvent
);

router.delete(
  '/events/:eventId',
  authenticate,
  authorize(['admin', 'organizer']),
  eventController.deleteEvent
);

router.post(
  '/events/:eventId/publish',
  authenticate,
  authorize(['admin', 'organizer']),
  eventController.publishEvent
);

router.post(
  '/events/:eventId/duplicate',
  authenticate,
  eventController.duplicateEvent
);

router.get(
  '/events/:eventId/theme',
  eventController.getEventTheme
);

router.put(
  '/events/:eventId/theme',
  authenticate,
  authorize(['admin', 'organizer']),
  eventController.updateEventTheme
);

router.get(
  '/events/:eventId/export',
  authenticate,
  eventController.exportEvent
);

// ==================== GUEST ROUTES ====================
router.get(
  '/events/:eventId/guests',
  authenticate,
  guestController.getGuests
);

router.post(
  '/events/:eventId/guests',
  authenticate,
  validateRequest('createGuest'),
  guestController.createGuest
);

router.get(
  '/events/:eventId/guests/:guestId',
  authenticate,
  guestController.getGuest
);

router.put(
  '/events/:eventId/guests/:guestId',
  authenticate,
  validateRequest('updateGuest'),
  guestController.updateGuest
);

router.delete(
  '/events/:eventId/guests/:guestId',
  authenticate,
  authorize(['admin', 'organizer']),
  guestController.deleteGuest
);

router.post(
  '/events/:eventId/guests/bulk',
  authenticate,
  validateRequest('bulkImportGuests'),
  guestController.bulkImportGuests
);

router.get(
  '/events/:eventId/guests/export',
  authenticate,
  guestController.exportGuests
);

router.post(
  '/events/:eventId/guests/remind',
  authenticate,
  guestController.sendReminders
);

// ==================== RSVP ROUTES ====================
router.get(
  '/events/:eventId/rsvps',
  authenticate,
  rsvpController.getRSVPs
);

router.get(
  '/events/:eventId/rsvps/stats',
  authenticate,
  rsvpController.getStats
);

router.get(
  '/events/:eventId/rsvps/:rsvpId',
  authenticate,
  rsvpController.getRSVP
);

router.put(
  '/events/:eventId/rsvps/:rsvpId',
  authenticate,
  validateRequest('updateRSVP'),
  rsvpController.updateRSVP
);

router.delete(
  '/events/:eventId/rsvps/:rsvpId',
  authenticate,
  authorize(['admin', 'organizer']),
  rsvpController.deleteRSVP
);

router.post(
  '/events/:eventId/rsvps/remind',
  authenticate,
  validateRequest('rsvpReminder'),
  rsvpController.sendReminders
);

// Public RSVP submission (via QR code)
router.post(
  '/rsvp/:qrCode',
  validateRequest('createRSVP'),
  rsvpController.submitRSVP
);

// ==================== CHECK-IN ROUTES ====================
router.post(
  '/checkin/validate',
  validateRequest('validateQR'),
  checkInController.validateQR
);

router.get(
  '/events/:eventId/checkins',
  authenticate,
  checkInController.getCheckIns
);

router.get(
  '/events/:eventId/checkins/stats',
  authenticate,
  checkInController.getStats
);

router.post(
  '/events/:eventId/checkins',
  authenticate,
  validateRequest('checkIn'),
  checkInController.checkIn
);

router.post(
  '/events/:eventId/checkins/bulk',
  authenticate,
  checkInController.bulkCheckIn
);

router.delete(
  '/events/:eventId/checkins/:checkInId',
  authenticate,
  authorize(['admin', 'organizer']),
  checkInController.undoCheckIn
);

router.get(
  '/events/:eventId/checkins/export',
  authenticate,
  checkInController.exportCheckIns
);

// ==================== PHOTO ROUTES ====================
router.get(
  '/events/:eventId/photos',
  photoController.getPhotos
);

router.get(
  '/events/:eventId/photos/stats',
  photoController.getStats
);

router.get(
  '/events/:eventId/photos/:photoId',
  photoController.getPhoto
);

router.post(
  '/events/:eventId/photos/upload',
  authenticate,
  upload.single('photo'),
  photoController.uploadPhoto
);

router.put(
  '/events/:eventId/photos/:photoId/approve',
  authenticate,
  authorize(['admin', 'organizer']),
  validateRequest('approvePhoto'),
  photoController.approvePhoto
);

router.post(
  '/events/:eventId/photos/bulk-approve',
  authenticate,
  authorize(['admin', 'organizer']),
  photoController.bulkApprove
);

router.delete(
  '/events/:eventId/photos/:photoId',
  authenticate,
  authorize(['admin', 'organizer']),
  photoController.deletePhoto
);

router.get(
  '/events/:eventId/photos/download',
  authenticate,
  photoController.downloadPhotos
);

// ==================== CHAT ROUTES ====================
router.get(
  '/events/:eventId/chats/rooms',
  authenticate,
  chatController.getRooms
);

router.get(
  '/events/:eventId/chats/messages/:roomType',
  authenticate,
  chatController.getMessages
);

router.post(
  '/events/:eventId/chats/messages',
  authenticate,
  validateRequest('chatMessage'),
  chatController.sendMessage
);

router.delete(
  '/events/:eventId/chats/messages/:messageId',
  authenticate,
  authorize(['admin', 'organizer']),
  chatController.deleteMessage
);

router.post(
  '/events/:eventId/chats/announce',
  authenticate,
  authorize(['admin', 'organizer']),
  chatController.sendAnnouncement
);

router.get(
  '/events/:eventId/chats/stats',
  authenticate,
  chatController.getStats
);

router.get(
  '/events/:eventId/chats/join/:roomType',
  authenticate,
  chatController.joinRoom
);

export default router;
