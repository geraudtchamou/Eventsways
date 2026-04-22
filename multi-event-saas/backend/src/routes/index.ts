import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { eventController } from '../controllers/event.controller';
import { guestController } from '../controllers/guest.controller';
import { rsvpController } from '../controllers/rsvp.controller';
import { checkinController } from '../controllers/checkin.controller';
import { photoController } from '../controllers/photo.controller';
import { chatController } from '../controllers/chat.controller';
import { analyticsController } from '../controllers/analytics.controller';
import { waitlistController } from '../controllers/waitlist.controller';
import { paymentController } from '../controllers/payment.controller';
import { themeController } from '../controllers/theme.controller';
import { organizationController } from '../controllers/organization.controller';

import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validation.middleware';
import { rateLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================
router.post('/auth/webhook', authController.handleClerkWebhook);
router.get('/auth/me', authenticate, authController.getCurrentUser);
router.post('/auth/logout', authenticate, authController.logout);

// ============================================
// ORGANIZATION ROUTES
// ============================================
router.post('/organizations', authenticate, validateRequest, organizationController.create);
router.get('/organizations', authenticate, organizationController.list);
router.get('/organizations/:id', authenticate, organizationController.getById);
router.get('/organizations/subdomain/:subdomain', organizationController.getBySubdomain);
router.put('/organizations/:id', authenticate, validateRequest, organizationController.update);
router.delete('/organizations/:id', authenticate, organizationController.delete);
router.post('/organizations/:id/members', authenticate, validateRequest, organizationController.addMember);
router.delete('/organizations/:orgId/members/:userId', authenticate, organizationController.removeMember);
router.get('/organizations/:id/analytics', authenticate, organizationController.getAnalytics);

// ============================================
// EVENT ROUTES
// ============================================
router.post('/events', authenticate, validateRequest, eventController.create);
router.get('/events', authenticate, eventController.list);
router.get('/events/public/:slug', eventController.getPublicEvent);
router.get('/events/:id', authenticate, eventController.getById);
router.put('/events/:id', authenticate, validateRequest, eventController.update);
router.delete('/events/:id', authenticate, eventController.delete);
router.post('/events/:id/publish', authenticate, eventController.publish);
router.post('/events/:id/duplicate', authenticate, eventController.duplicate);
router.get('/events/:id/export', authenticate, eventController.exportData);

// Event Theme Routes (Dynamic Theming)
router.get('/events/:id/theme', themeController.getEventTheme);
router.put('/events/:id/theme', authenticate, validateRequest, themeController.updateTheme);
router.get('/themes/templates', themeController.getTemplates);
router.get('/themes/templates/:eventType', themeController.getTemplatesByType);

// ============================================
// GUEST ROUTES
// ============================================
router.post('/events/:eventId/guests', authenticate, validateRequest, guestController.create);
router.post('/events/:eventId/guests/bulk', authenticate, validateRequest, guestController.bulkCreate);
router.get('/events/:eventId/guests', authenticate, guestController.list);
router.get('/events/:eventId/guests/:id', authenticate, guestController.getById);
router.put('/events/:eventId/guests/:id', authenticate, validateRequest, guestController.update);
router.delete('/events/:eventId/guests/:id', authenticate, guestController.delete);
router.post('/events/:eventId/guests/import', authenticate, guestController.importFromCSV);
router.get('/events/:eventId/guests/export', authenticate, guestController.exportToCSV);
router.get('/guests/:id/qr', authenticate, guestController.generateQRCode);

// ============================================
// RSVP ROUTES
// ============================================
router.post('/events/:eventId/rsvps', authenticate, validateRequest, rsvpController.create);
router.get('/events/:eventId/rsvps', authenticate, rsvpController.list);
router.get('/events/:eventId/rsvps/:guestId', authenticate, rsvpController.getByGuest);
router.put('/events/:eventId/rsvps/:guestId', authenticate, validateRequest, rsvpController.update);
router.delete('/events/:eventId/rsvps/:guestId', authenticate, rsvpController.delete);
router.get('/rsvp/:token', rsvpController.getPublicRsvp);
router.post('/rsvp/:token/submit', validateRequest, rsvpController.submitPublicRsvp);
router.post('/events/:eventId/rsvps/reminders', authenticate, rsvpController.sendReminders);

// ============================================
// WAITLIST ROUTES
// ============================================
router.post('/events/:eventId/waitlist', validateRequest, waitlistController.join);
router.get('/events/:eventId/waitlist', authenticate, waitlistController.list);
router.put('/events/:eventId/waitlist/:id/promote', authenticate, waitlistController.promote);
router.delete('/events/:eventId/waitlist/:id', authenticate, waitlistController.remove);
router.get('/waitlist/:token/confirm', waitlistController.confirmFromWaitlist);

// ============================================
// CHECK-IN ROUTES
// ============================================
router.post('/checkin/validate', authenticate, validateRequest, checkinController.validateQR);
router.post('/checkin/record', authenticate, validateRequest, checkinController.recordCheckIn);
router.get('/events/:eventId/checkins', authenticate, checkinController.list);
router.get('/events/:eventId/checkins/stats', authenticate, checkinController.getStats);
router.post('/checkin/manual', authenticate, validateRequest, checkinController.manualCheckIn);

// ============================================
// PHOTO ROUTES
// ============================================
router.post('/events/:eventId/photos/upload', authenticate, photoController.uploadPhoto);
router.get('/events/:eventId/photos', photoController.list);
router.get('/events/:eventId/photos/:id', photoController.getById);
router.put('/events/:eventId/photos/:id/approve', authenticate, photoController.approvePhoto);
router.put('/events/:eventId/photos/:id/reject', authenticate, photoController.rejectPhoto);
router.delete('/events/:eventId/photos/:id', authenticate, photoController.delete);
router.post('/photos/:id/like', photoController.likePhoto);

// ============================================
// CHAT ROUTES
// ============================================
router.get('/events/:eventId/chats', authenticate, chatController.listRooms);
router.get('/events/:eventId/chats/:roomId/messages', authenticate, chatController.getMessages);
router.post('/events/:eventId/chats/:roomId/messages', authenticate, validateRequest, chatController.sendMessage);
router.put('/messages/:messageId', authenticate, chatController.editMessage);
router.delete('/messages/:messageId', authenticate, chatController.deleteMessage);
router.post('/messages/:messageId/react', authenticate, chatController.addReaction);

// ============================================
// ANALYTICS ROUTES
// ============================================
router.get('/events/:eventId/analytics', authenticate, analyticsController.getEventAnalytics);
router.get('/events/:eventId/analytics/rsvp', authenticate, analyticsController.getRsvpMetrics);
router.get('/events/:eventId/analytics/checkin', authenticate, analyticsController.getCheckinMetrics);
router.get('/events/:eventId/analytics/engagement', authenticate, analyticsController.getEngagementMetrics);
router.get('/analytics/heatmap/:eventId', authenticate, analyticsController.getAttendanceHeatmap);
router.get('/analytics/sources/:eventId', authenticate, analyticsController.getTrafficSources);

// ============================================
// PAYMENT & SUBSCRIPTION ROUTES
// ============================================
router.post('/payments/create-checkout', authenticate, paymentController.createCheckoutSession);
router.post('/payments/create-portal', authenticate, paymentController.createPortalSession);
router.post('/payments/webhook', paymentController.handleStripeWebhook);
router.get('/subscription', authenticate, paymentController.getCurrentSubscription);
router.get('/subscription/history', authenticate, paymentController.getPaymentHistory);

// ============================================
// UTILITY ROUTES
// ============================================
router.post('/upload/signature', authenticate, photoController.getUploadSignature);
router.get('/countries', (req, res) => res.json(require('../utils/countries.json')));
router.get('/timezones', (req, res) => res.json(require('../utils/timezones.json')));

export default router;
