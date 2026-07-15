import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CollaborationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('CollaborationGateway');

  // Map to store active userId -> socket.id mapping
  private activeUsers = new Map<string, string>();

  // Map to store socket.id -> userId
  private socketToUser = new Map<string, string>();

  // Map to store socket.id -> classroomId
  private socketToRoom = new Map<string, string>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    const userId = this.socketToUser.get(client.id);
    const roomId = this.socketToRoom.get(client.id);

    if (userId && roomId) {
      // Notify others in room
      client.to(roomId).emit('user-left', { userId, socketId: client.id });
    }

    // Clean up maps
    if (userId) {
      this.activeUsers.delete(userId);
    }
    this.socketToUser.delete(client.id);
    this.socketToRoom.delete(client.id);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; userId: string; userName: string }
  ) {
    const { classroomId, userId, userName } = data;
    this.logger.log(`User ${userName} (${userId}) joining room ${classroomId}`);

    // Join the socket.io room
    client.join(classroomId);

    // Track user
    this.activeUsers.set(userId, client.id);
    this.socketToUser.set(client.id, userId);
    this.socketToRoom.set(client.id, classroomId);

    // Get all clients currently in the room to send back to the newly joined user
    // This helps in setting up WebRTC PeerConnections with existing peers
    const clientsInRoom = this.server.sockets.adapter.rooms.get(classroomId);
    const peerSocketIds: string[] = [];
    if (clientsInRoom) {
      clientsInRoom.forEach((socketId) => {
        if (socketId !== client.id) {
          peerSocketIds.push(socketId);
        }
      });
    }

    // Notify others in room
    client.to(classroomId).emit('user-joined', {
      userId,
      userName,
      socketId: client.id,
    });

    // Send the list of existing peers to the new user
    client.emit('all-peers', { peers: peerSocketIds });
  }

  @SubscribeMessage('send-signal')
  handleSendSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userToSignal: string; signal: any; callerId: string }
  ) {
    const { userToSignal, signal, callerId } = data;
    this.logger.log(`Forwarding signal from ${callerId} (socket: ${client.id}) to target socket ${userToSignal}`);
    this.server.to(userToSignal).emit('receive-signal', {
      signal,
      callerId: client.id,
    });
  }

  @SubscribeMessage('return-signal')
  handleReturnSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { signal: any; callerId: string }
  ) {
    const { signal, callerId } = data;
    this.logger.log(`Returning signal from ${client.id} to caller socket ${callerId}`);
    this.server.to(callerId).emit('signal-returned', {
      signal,
      id: client.id,
    });
  }

  @SubscribeMessage('draw')
  handleDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; drawData: any }
  ) {
    // Broadcast draw coordinates to all other clients in the classroom room
    client.to(data.classroomId).emit('draw', data.drawData);
  }

  @SubscribeMessage('clear-canvas')
  handleClearCanvas(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string }
  ) {
    client.to(data.classroomId).emit('clear-canvas');
  }

  @SubscribeMessage('chat-message')
  handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; userId: string; userName: string; text: string }
  ) {
    // Broadcast message to everyone in the room (including the sender for simple design,
    // or let sender add locally and broadcast to others. We'll send to all in room)
    this.server.to(data.classroomId).emit('chat-message', {
      userId: data.userId,
      userName: data.userName,
      text: data.text,
      timestamp: new Date(),
    });
  }

  @SubscribeMessage('code-change')
  handleCodeChange(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; code: string; language: string }
  ) {
    // Broadcast code edits to all other clients in the classroom room
    client.to(data.classroomId).emit('code-change', {
      code: data.code,
      language: data.language,
    });
  }

  @SubscribeMessage('launch-quiz')
  handleLaunchQuiz(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; question: string; options: string[] }
  ) {
    // Broadcast quiz details when teacher launches it
    client.to(data.classroomId).emit('quiz-launched', {
      question: data.question,
      options: data.options,
    });
  }

  @SubscribeMessage('submit-vote')
  handleSubmitVote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string; optionIndex: number; userId: string }
  ) {
    // Broadcast student vote submissions to all participants
    this.server.to(data.classroomId).emit('vote-submitted', {
      optionIndex: data.optionIndex,
      userId: data.userId,
    });
  }

  @SubscribeMessage('end-quiz')
  handleEndQuiz(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { classroomId: string }
  ) {
    // Broadcast ending of current quiz
    client.to(data.classroomId).emit('quiz-ended');
  }
}

