import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService, User, Classroom } from '../../services/api.service';
import { SocketService } from '../../services/socket.service';

interface RemoteFeed {
  socketId: string;
  userId: string;
  userName: string;
  stream: MediaStream;
}

@Component({
  selector: 'app-classroom',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './classroom.component.html',
  styleUrl: './classroom.component.css',
})
export class ClassroomComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('whiteboardCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('localVideo') localVideoRef!: ElementRef<HTMLVideoElement>;

  user: User | null = null;
  classroom: Classroom | null = null;
  classroomId: string = '';

  // Local media stream
  localStream: MediaStream | null = null;
  isMuted = false;
  isVideoOff = false;

  // WebRTC
  peers: { [socketId: string]: RTCPeerConnection } = {};
  remoteFeeds: RemoteFeed[] = [];

  // Chat
  chatMessages: { userName: string; text: string; timestamp: Date; isSelf: boolean }[] = [];
  newMessageText = '';

  // Whiteboard drawing state
  private canvasCtx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  brushColor = '#6c5ce7';
  brushSize = 4;

  // Socket subscriptions
  private subscriptions = new Subscription();

  // Ice configuration
  private rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private socketService: SocketService
  ) {
    this.user = this.apiService.getCurrentUser();
    if (!this.user) {
      this.router.navigate(['/login']);
    }
  }

  ngOnInit() {
    this.classroomId = this.route.snapshot.paramMap.get('id') || '';
    if (!this.classroomId || !this.user) {
      this.router.navigate(['/dashboard']);
      return;
    }

    // Load classroom details
    this.apiService.getClassroom(this.classroomId).subscribe({
      next: (res) => {
        this.classroom = res;
        this.initializeRoom();
      },
      error: (err) => {
        console.error(err);
        this.router.navigate(['/dashboard']);
      },
    });
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  ngOnDestroy() {
    this.leaveRoom();
  }

  async initializeRoom() {
    if (!this.user || !this.classroomId) return;

    // Get User Media (camera & microphone)
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (this.localVideoRef && this.localVideoRef.nativeElement) {
        this.localVideoRef.nativeElement.srcObject = this.localStream;
      }
    } catch (err) {
      console.warn('Failed to obtain camera and audio access:', err);
    }

    // Initialize sockets
    this.socketService.joinRoom(this.classroomId, this.user._id, this.user.name);

    // Setup socket listeners
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    // 1. Chat listener
    this.subscriptions.add(
      this.socketService.onChatMessage().subscribe((msg) => {
        this.chatMessages.push({
          userName: msg.userName,
          text: msg.text,
          timestamp: new Date(msg.timestamp),
          isSelf: msg.userId === this.user?._id,
        });
        setTimeout(() => this.scrollChatToBottom(), 50);
      })
    );

    // 2. Whiteboard listener
    this.subscriptions.add(
      this.socketService.onDraw().subscribe((drawData) => {
        this.drawRemote(drawData);
      })
    );

    this.subscriptions.add(
      this.socketService.onClearCanvas().subscribe(() => {
        this.clearCanvasLocally();
      })
    );

    // 3. WebRTC signalling listeners
    // A. Receive list of existing peers in the room
    this.subscriptions.add(
      this.socketService.onAllPeers().subscribe((data) => {
        data.peers.forEach((peerSocketId) => {
          const peerConn = this.createPeerConnection(peerSocketId, true);
          this.peers[peerSocketId] = peerConn;
        });
      })
    );

    // B. Peer joined
    this.subscriptions.add(
      this.socketService.onUserJoined().subscribe((data) => {
        // If someone joins, they will call us. So we wait for their offer.
        console.log('Peer joined classroom:', data.userName);
      })
    );

    // C. Receive RTC Signals (offer/answer/ice candidates)
    this.subscriptions.add(
      this.socketService.onReceiveSignal().subscribe(async (data) => {
        const { signal, callerId } = data;
        let peerConn = this.peers[callerId];

        if (!peerConn) {
          peerConn = this.createPeerConnection(callerId, false);
          this.peers[callerId] = peerConn;
        }

        if (signal.sdp) {
          await peerConn.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          if (signal.sdp.type === 'offer') {
            const answer = await peerConn.createAnswer();
            await peerConn.setLocalDescription(answer);
            this.socketService.returnSignal({ sdp: peerConn.localDescription }, callerId);
          }
        } else if (signal.candidate) {
          try {
            await peerConn.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate', e);
          }
        }
      })
    );

    // D. Returned Signals (answers)
    this.subscriptions.add(
      this.socketService.onSignalReturned().subscribe(async (data) => {
        const { signal, id } = data;
        const peerConn = this.peers[id];
        if (peerConn && signal.sdp) {
          await peerConn.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        }
      })
    );

    // E. Peer left
    this.subscriptions.add(
      this.socketService.onUserLeft().subscribe((data) => {
        this.closePeer(data.socketId);
      })
    );
  }

  // WebRTC core helpers
  createPeerConnection(peerSocketId: string, isCaller: boolean): RTCPeerConnection {
    const peerConn = new RTCPeerConnection(this.rtcConfig);

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        peerConn.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidates
    peerConn.onicecandidate = (event) => {
      if (event.candidate) {
        if (isCaller) {
          this.socketService.sendSignal(peerSocketId, { candidate: event.candidate }, this.user!._id);
        } else {
          this.socketService.returnSignal({ candidate: event.candidate }, peerSocketId);
        }
      }
    };

    // Tracks received
    peerConn.ontrack = (event) => {
      const remoteStream = event.streams[0];
      const existingFeed = this.remoteFeeds.find((f) => f.socketId === peerSocketId);

      if (!existingFeed) {
        this.remoteFeeds.push({
          socketId: peerSocketId,
          userId: '',
          userName: 'Remote Classmate',
          stream: remoteStream,
        });
      }
    };

    // If caller, send Offer
    if (isCaller) {
      peerConn.onnegotiationneeded = async () => {
        try {
          const offer = await peerConn.createOffer();
          await peerConn.setLocalDescription(offer);
          this.socketService.sendSignal(peerSocketId, { sdp: peerConn.localDescription }, this.user!._id);
        } catch (err) {
          console.error(err);
        }
      };
    }

    return peerConn;
  }

  closePeer(socketId: string) {
    if (this.peers[socketId]) {
      this.peers[socketId].close();
      delete this.peers[socketId];
    }
    this.remoteFeeds = this.remoteFeeds.filter((f) => f.socketId !== socketId);
  }

  // Media toggles
  toggleMute() {
    if (this.localStream) {
      this.isMuted = !this.isMuted;
      this.localStream.getAudioTracks().forEach((t) => (t.enabled = !this.isMuted));
    }
  }

  toggleVideo() {
    if (this.localStream) {
      this.isVideoOff = !this.isVideoOff;
      this.localStream.getVideoTracks().forEach((t) => (t.enabled = !this.isVideoOff));
    }
  }

  // Chat Actions
  sendChatMessage() {
    if (!this.newMessageText.trim() || !this.user) return;
    this.socketService.sendMessage(
      this.classroomId,
      this.user._id,
      this.user.name,
      this.newMessageText
    );
    this.newMessageText = '';
  }

  scrollChatToBottom() {
    const chatContainer = document.querySelector('.chat-history');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }

  // Whiteboard drawing logic
  private initCanvas() {
    const canvas = this.canvasRef.nativeElement;
    // Set display size
    canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = canvas.parentElement?.clientHeight || 450;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      this.canvasCtx = ctx;
      this.canvasCtx.lineJoin = 'round';
      this.canvasCtx.lineCap = 'round';
    }
  }

  startDrawing(e: MouseEvent) {
    this.isDrawing = true;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.lastX = e.clientX - rect.left;
    this.lastY = e.clientY - rect.top;
  }

  draw(e: MouseEvent) {
    if (!this.isDrawing) return;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const drawData = {
      x0: this.lastX,
      y0: this.lastY,
      x1: x,
      y1: y,
      color: this.brushColor,
      size: this.brushSize,
    };

    // Draw locally
    this.drawSegment(drawData);

    // Broadcast
    this.socketService.draw(this.classroomId, drawData);

    this.lastX = x;
    this.lastY = y;
  }

  stopDrawing() {
    this.isDrawing = false;
  }

  private drawSegment(data: { x0: number; y0: number; x1: number; y1: number; color: string; size: number }) {
    this.canvasCtx.beginPath();
    this.canvasCtx.moveTo(data.x0, data.y0);
    this.canvasCtx.lineTo(data.x1, data.y1);
    this.canvasCtx.strokeStyle = data.color;
    this.canvasCtx.lineWidth = data.size;
    this.canvasCtx.stroke();
    this.canvasCtx.closePath();
  }

  private drawRemote(data: any) {
    if (this.canvasCtx) {
      this.drawSegment(data);
    }
  }

  clearCanvas() {
    this.clearCanvasLocally();
    this.socketService.clearCanvas(this.classroomId);
  }

  private clearCanvasLocally() {
    const canvas = this.canvasRef.nativeElement;
    this.canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // End / Leave Room
  handleLeaveRoom() {
    this.leaveRoom();
    this.router.navigate(['/dashboard']);
  }

  handleEndClass() {
    if (confirm('Are you sure you want to end this class for everyone?')) {
      this.apiService.updateClassroomStatus(this.classroomId, 'ended').subscribe(() => {
        this.leaveRoom();
        this.router.navigate(['/dashboard']);
      });
    }
  }

  private leaveRoom() {
    // Stop local streams
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    // Close all connections
    Object.keys(this.peers).forEach((key) => {
      this.closePeer(key);
    });

    // Unsubscribe and disconnect socket
    this.subscriptions.unsubscribe();
    this.socketService.disconnect();
  }
}
