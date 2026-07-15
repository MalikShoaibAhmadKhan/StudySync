import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SocketService {
  private socket!: Socket;
  private connected$ = new Subject<boolean>();

  constructor() {}

  connect() {
    if (this.socket && this.socket.connected) {
      return;
    }

    this.socket = io('http://localhost:3000', {
      transports: ['websocket'],
      autoConnect: true,
    });

    this.socket.on('connect', () => {
      this.connected$.next(true);
      console.log('Connected to socket server');
    });

    this.socket.on('disconnect', () => {
      this.connected$.next(false);
      console.log('Disconnected from socket server');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  joinRoom(classroomId: string, userId: string, userName: string) {
    this.connect();
    this.socket.emit('join-room', { classroomId, userId, userName });
  }

  sendMessage(classroomId: string, userId: string, userName: string, text: string) {
    this.socket.emit('chat-message', { classroomId, userId, userName, text });
  }

  onChatMessage(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('chat-message', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('chat-message');
    });
  }

  draw(classroomId: string, drawData: any) {
    this.socket.emit('draw', { classroomId, drawData });
  }

  onDraw(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('draw', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('draw');
    });
  }

  clearCanvas(classroomId: string) {
    this.socket.emit('clear-canvas', { classroomId });
  }

  onClearCanvas(): Observable<void> {
    return new Observable((observer) => {
      this.socket.on('clear-canvas', () => {
        observer.next();
      });
      return () => this.socket.off('clear-canvas');
    });
  }

  // WebRTC Signals
  onAllPeers(): Observable<{ peers: string[] }> {
    return new Observable((observer) => {
      this.socket.on('all-peers', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('all-peers');
    });
  }

  onUserJoined(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('user-joined', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('user-joined');
    });
  }

  onUserLeft(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('user-left', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('user-left');
    });
  }

  sendSignal(userToSignal: string, signal: any, callerId: string) {
    this.socket.emit('send-signal', { userToSignal, signal, callerId });
  }

  onReceiveSignal(): Observable<{ signal: any; callerId: string }> {
    return new Observable((observer) => {
      this.socket.on('receive-signal', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('receive-signal');
    });
  }

  returnSignal(signal: any, callerId: string) {
    this.socket.emit('return-signal', { signal, callerId });
  }

  onSignalReturned(): Observable<{ signal: any; id: string }> {
    return new Observable((observer) => {
      this.socket.on('signal-returned', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('signal-returned');
    });
  }

  // Shared Code Editor Emitters and Listeners
  sendCodeChange(classroomId: string, code: string, language: string) {
    if (this.socket) {
      this.socket.emit('code-change', { classroomId, code, language });
    }
  }

  onCodeChange(): Observable<{ code: string; language: string }> {
    return new Observable((observer) => {
      this.socket.on('code-change', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('code-change');
    });
  }

  // Polling / Quiz System Emitters and Listeners
  launchQuiz(classroomId: string, question: string, options: string[]) {
    if (this.socket) {
      this.socket.emit('launch-quiz', { classroomId, question, options });
    }
  }

  onQuizLaunched(): Observable<{ question: string; options: string[] }> {
    return new Observable((observer) => {
      this.socket.on('quiz-launched', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('quiz-launched');
    });
  }

  submitVote(classroomId: string, optionIndex: number, userId: string) {
    if (this.socket) {
      this.socket.emit('submit-vote', { classroomId, optionIndex, userId });
    }
  }

  onVoteSubmitted(): Observable<{ optionIndex: number; userId: string }> {
    return new Observable((observer) => {
      this.socket.on('vote-submitted', (data) => {
        observer.next(data);
      });
      return () => this.socket.off('vote-submitted');
    });
  }

  endQuiz(classroomId: string) {
    if (this.socket) {
      this.socket.emit('end-quiz', { classroomId });
    }
  }

  onQuizEnded(): Observable<void> {
    return new Observable((observer) => {
      this.socket.on('quiz-ended', () => {
        observer.next();
      });
      return () => this.socket.off('quiz-ended');
    });
  }
}

