import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, User, Classroom, Booking } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  user: User | null = null;

  // Classrooms
  classrooms: Classroom[] = [];
  newClassTitle = '';
  newClassDesc = '';
  newClassType: 'public_class' | 'private_tuition' | 'one_on_one' = 'public_class';
  newClassPrivate = false;
  newClassPasscode = '';
  newClassTime = '';

  // Bookings
  bookings: Booking[] = [];
  teachers: User[] = [];
  selectedTeacher: User | null = null;
  bookingTime = '';

  // Join Classroom Dialog
  joinClassId = '';
  joinClassPasscode = '';
  joinError = '';

  // UI tabs/states
  activeTab: 'classes' | 'bookings' | 'profile' = 'classes';
  showCreateModal = false;
  showBookModal = false;
  showJoinPrivateModal = false;

  // Profile Edit
  profileName = '';
  profileBio = '';
  profileSkillsStr = '';

  constructor(private apiService: ApiService, private router: Router) {
    this.user = this.apiService.getCurrentUser();
    if (!this.user) {
      this.router.navigate(['/login']);
    } else {
      this.profileName = this.user.name;
      this.profileBio = this.user.bio || '';
      this.profileSkillsStr = this.user.skills ? this.user.skills.join(', ') : '';
    }
  }

  ngOnInit() {
    if (this.user) {
      this.loadData();
    }
  }

  loadData() {
    if (!this.user) return;
    const userId = this.user._id;

    // Load classrooms
    this.apiService.getClassrooms(userId).subscribe({
      next: (res) => (this.classrooms = res),
      error: (err) => console.error(err),
    });

    // Load bookings
    this.apiService.getBookings(userId).subscribe({
      next: (res) => (this.bookings = res),
      error: (err) => console.error(err),
    });

    // Load teachers (for students)
    if (this.user.role === 'student') {
      this.apiService.getTeachers().subscribe({
        next: (res) => (this.teachers = res),
        error: (err) => console.error(err),
      });
    }
  }

  handleCreateClassroom() {
    if (!this.user || !this.newClassTitle || !this.newClassTime) return;

    this.apiService
      .createClassroom({
        title: this.newClassTitle,
        description: this.newClassDesc,
        creatorId: this.user._id,
        type: this.newClassType,
        isPrivate: this.newClassPrivate,
        passcode: this.newClassPrivate ? this.newClassPasscode : undefined,
        scheduledTime: new Date(this.newClassTime),
      })
      .subscribe({
        next: () => {
          this.showCreateModal = false;
          this.resetClassForm();
          this.loadData();
        },
        error: (err) => console.error(err),
      });
  }

  handleBookTeacher() {
    if (!this.user || !this.selectedTeacher || !this.bookingTime) return;

    this.apiService
      .createBooking({
        teacherId: this.selectedTeacher._id,
        studentId: this.user._id,
        scheduledTime: new Date(this.bookingTime),
      })
      .subscribe({
        next: () => {
          this.showBookModal = false;
          this.bookingTime = '';
          this.selectedTeacher = null;
          this.loadData();
        },
        error: (err) => console.error(err),
      });
  }

  handleBookingResponse(bookingId: string, status: 'confirmed' | 'cancelled') {
    this.apiService.updateBookingStatus(bookingId, status).subscribe({
      next: () => this.loadData(),
      error: (err) => console.error(err),
    });
  }

  handleJoinRoom(classroomId: string, passcode?: string) {
    if (!this.user) return;

    this.apiService.joinClassroom(classroomId, this.user._id, passcode).subscribe({
      next: (classroom) => {
        this.showJoinPrivateModal = false;
        this.joinClassId = '';
        this.joinClassPasscode = '';
        this.joinError = '';
        // If teacher, set class status to live when joining
        if (this.user?.role === 'teacher' && classroom.creatorId._id === this.user._id && classroom.status === 'scheduled') {
          this.apiService.updateClassroomStatus(classroomId, 'live').subscribe(() => {
            this.router.navigate(['/classroom', classroomId]);
          });
        } else {
          this.router.navigate(['/classroom', classroomId]);
        }
      },
      error: (err) => {
        this.joinError = err.error?.message || 'Failed to join. Invalid passcode?';
        console.error(err);
      },
    });
  }

  handleJoinPrivateSubmit() {
    if (!this.joinClassId) return;
    this.handleJoinRoom(this.joinClassId, this.joinClassPasscode);
  }

  openBookModal(teacher: User) {
    this.selectedTeacher = teacher;
    this.showBookModal = true;
  }

  updateProfile() {
    if (!this.user) return;
    const skills = this.profileSkillsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    this.apiService
      .updateProfile(this.user._id, this.profileName, this.profileBio, skills)
      .subscribe({
        next: (updatedUser) => {
          this.user = updatedUser;
          alert('Profile updated successfully!');
        },
        error: (err) => console.error(err),
      });
  }

  logout() {
    this.apiService.logout();
    this.router.navigate(['/login']);
  }

  private resetClassForm() {
    this.newClassTitle = '';
    this.newClassDesc = '';
    this.newClassType = 'public_class';
    this.newClassPrivate = false;
    this.newClassPasscode = '';
    this.newClassTime = '';
  }

  formatDate(dateStr: any): string {
    const d = new Date(dateStr);
    return d.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
