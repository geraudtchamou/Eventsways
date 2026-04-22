import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { logger } from '../config/logger';

let io: SocketIOServer;

/**
 * Setup Socket.IO for real-time features
 */
export const setupSocketIO = (server: HTTPServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Middleware for authentication
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth.token;
    const eventId = socket.handshake.query.eventId as string;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    // TODO: Verify JWT token here
    // For now, pass through
    socket.data.eventId = eventId;
    next();
  });

  io.on('connection', (socket: Socket) => {
    logger.info({ 
      message: 'Client connected', 
      socketId: socket.id,
      eventId: socket.data.eventId 
    });

    // Join event room
    const eventId = socket.data.eventId;
    if (eventId) {
      socket.join(`event:${eventId}`);
      logger.info(`Socket ${socket.id} joined event:${eventId}`);
    }

    // ============================================
    // CHAT ROOMS
    // ============================================
    socket.on('chat:join', (roomId: string) => {
      socket.join(`chat:${roomId}`);
      logger.info(`Socket ${socket.id} joined chat:${roomId}`);
      
      // Notify others
      socket.to(`chat:${roomId}`).emit('chat:user_joined', {
        roomId,
        userId: socket.data.userId,
        timestamp: new Date(),
      });
    });

    socket.on('chat:leave', (roomId: string) => {
      socket.leave(`chat:${roomId}`);
      
      // Notify others
      socket.to(`chat:${roomId}`).emit('chat:user_left', {
        roomId,
        userId: socket.data.userId,
        timestamp: new Date(),
      });
    });

    socket.on('chat:message', (data: { roomId: string; message: any }) => {
      // Broadcast to room
      socket.to(`chat:${data.roomId}`).emit('chat:message', data);
      
      // Save to database (handled by controller)
      logger.info({ 
        message: 'Chat message received', 
        roomId: data.roomId 
      });
    });

    // ============================================
    // RSVP UPDATES
    // ============================================
    socket.on('rsvp:update', (data: { eventId: string; rsvp: any }) => {
      // Broadcast to event organizers
      socket.to(`event:${data.eventId}:admin`).emit('rsvp:update', data);
    });

    // ============================================
    // CHECK-IN REAL-TIME
    // ============================================
    socket.on('checkin:recorded', (data: { eventId: string; guest: any }) => {
      // Broadcast to event dashboard
      socket.to(`event:${data.eventId}:dashboard`).emit('checkin:live', data);
    });

    // ============================================
    // PHOTO UPLOADS
    // ============================================
    socket.on('photo:uploaded', (data: { eventId: string; photo: any }) => {
      // Broadcast to event attendees
      socket.to(`event:${data.eventId}`).emit('photo:new', data);
    });

    // ============================================
    // WAITLIST UPDATES
    // ============================================
    socket.on('waitlist:updated', (data: { eventId: string; position: number }) => {
      socket.to(`event:${data.eventId}`).emit('waitlist:change', data);
    });

    // ============================================
    // DISCONNECT
    // ============================================
    socket.on('disconnect', () => {
      logger.info({ 
        message: 'Client disconnected', 
        socketId: socket.id,
        eventId: socket.data.eventId 
      });
    });

    // Error handling
    socket.on('error', (error: Error) => {
      logger.error({ 
        message: 'Socket error', 
        socketId: socket.id,
        error: error.message 
      });
    });
  });

  logger.info('✅ Socket.IO initialized');
  
  return io;
};

/**
 * Get Socket.IO instance
 */
export const getIO = (): SocketIOServer => {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call setupSocketIO first.');
  }
  return io;
};

/**
 * Emit event to specific room
 */
export const emitToRoom = (room: string, event: string, data: any) => {
  if (io) {
    io.to(room).emit(event, data);
  }
};

/**
 * Emit event to all clients in an event
 */
export const emitToEvent = (eventId: string, event: string, data: any) => {
  emitToRoom(`event:${eventId}`, event, data);
};

/**
 * Emit event to admins of an event
 */
export const emitToEventAdmins = (eventId: string, event: string, data: any) => {
  emitToRoom(`event:${eventId}:admin`, event, data);
};

/**
 * Broadcast chat message
 */
export const broadcastChatMessage = (roomId: string, message: any) => {
  emitToRoom(`chat:${roomId}`, 'chat:message', message);
};
