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

  // Workspace Tabs
  activeWorkspaceTab: 'whiteboard' | 'editor' | 'quizzes' = 'whiteboard';

  // Collaborative Code/Note Editor
  editorCode = 'Welcome to the Collaborative Notepad & Code Editor!\nType here and it will sync in real-time.\n\nSelect a language drop-down above (e.g. Markdown) to enable preview mode!';
  editorLanguage = 'markdown';
  private isIncomingRemoteCode = false;

  // Quiz / Polling System
  quizQuestion = '';
  quizOptions: string[] = ['', ''];
  activeQuiz: {
    question: string;
    options: string[];
    votes: number[];
    hasVoted: boolean;
    votedIndex?: number;
    totalVotes: number;
  } | null = null;
  classroom: Classroom | null = null;
  classroomId: string = '';

  // Confirmations
  showEndClassConfirm = false;

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
        setTimeout(() => this.initCanvas(), 100);
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

    // F. Collaborative Code Editor listener
    this.subscriptions.add(
      this.socketService.onCodeChange().subscribe((data) => {
        this.isIncomingRemoteCode = true;
        this.editorCode = data.code;
        this.editorLanguage = data.language;
        // Reset flag after change cycles
        setTimeout(() => this.isIncomingRemoteCode = false, 50);
      })
    );

    // G. Quiz Launched listener
    this.subscriptions.add(
      this.socketService.onQuizLaunched().subscribe((data) => {
        this.activeQuiz = {
          question: data.question,
          options: data.options,
          votes: new Array(data.options.length).fill(0),
          hasVoted: false,
          totalVotes: 0,
        };
      })
    );

    // H. Quiz Vote submitted listener
    this.subscriptions.add(
      this.socketService.onVoteSubmitted().subscribe((data) => {
        if (this.activeQuiz) {
          this.activeQuiz.votes[data.optionIndex]++;
          this.activeQuiz.totalVotes++;
        }
      })
    );

    // I. Quiz ended listener
    this.subscriptions.add(
      this.socketService.onQuizEnded().subscribe(() => {
        this.activeQuiz = null;
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
    if (!this.canvasRef) {
      return;
    }
    const canvas = this.canvasRef.nativeElement;
    if (!canvas) {
      return;
    }
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
    this.showEndClassConfirm = true;
  }

  confirmEndClass() {
    this.showEndClassConfirm = false;
    this.apiService.updateClassroomStatus(this.classroomId, 'ended').subscribe({
      next: () => {
        this.leaveRoom();
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Error ending class:', err);
        alert('Failed to end class: ' + (err.error?.message || err.message));
      }
    });
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

  // Code editor actions
  onCodeEditorInput() {
    if (this.isIncomingRemoteCode) return;
    this.socketService.sendCodeChange(this.classroomId, this.editorCode, this.editorLanguage);
  }

  onLanguageChange() {
    this.socketService.sendCodeChange(this.classroomId, this.editorCode, this.editorLanguage);
  }

  // Quiz/Poll teacher actions
  addQuizOption() {
    if (this.quizOptions.length < 6) {
      this.quizOptions.push('');
    }
  }

  removeQuizOption(index: number) {
    if (this.quizOptions.length > 2) {
      this.quizOptions.splice(index, 1);
    }
  }

  handleLaunchQuiz() {
    const question = this.quizQuestion.trim();
    const options = this.quizOptions.map(o => o.trim()).filter(o => o.length > 0);

    if (!question || options.length < 2) {
      alert('Please fill out the question and at least two options.');
      return;
    }

    this.activeQuiz = {
      question,
      options,
      votes: new Array(options.length).fill(0),
      hasVoted: false,
      totalVotes: 0,
    };

    this.socketService.launchQuiz(this.classroomId, question, options);
  }

  handleVoteSubmit(optionIndex: number) {
    if (!this.activeQuiz || this.activeQuiz.hasVoted || !this.user) return;

    this.activeQuiz.hasVoted = true;
    this.activeQuiz.votedIndex = optionIndex;
    this.socketService.submitVote(this.classroomId, optionIndex, this.user._id);
  }

  handleEndQuiz() {
    this.activeQuiz = null;
    this.quizQuestion = '';
    this.quizOptions = ['', ''];
    this.socketService.endQuiz(this.classroomId);
  }

  getOptionPercentage(index: number): number {
    if (!this.activeQuiz || this.activeQuiz.totalVotes === 0) return 0;
    return Math.round((this.activeQuiz.votes[index] / this.activeQuiz.totalVotes) * 100);
  }

  getMarkdownPreview(): string {
    if (this.editorLanguage === 'html') {
      return this.editorCode;
    }
    
    // Simple markdown-like parser for notes/markdown
    let text = this.editorCode || '';
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Headers
    text = text.replace(/^# (.*?)$/gm, '<h1 class="preview-h1">$1</h1>');
    text = text.replace(/^## (.*?)$/gm, '<h2 class="preview-h2">$1</h2>');
    text = text.replace(/^### (.*?)$/gm, '<h3 class="preview-h3">$1</h3>');
    text = text.replace(/^- (.*?)$/gm, '<li class="preview-li">$1</li>');
    
    // Bold / Italic
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.*?)`/g, '<code class="preview-code">$1</code>');
    
    // Newlines
    text = text.replace(/\n/g, '<br>');
    
    return text;
  }
}
