import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap } from 'rxjs';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher';
  bio?: string;
  skills?: string[];
}

export interface Classroom {
  _id: string;
  title: string;
  description?: string;
  creatorId: any; // User or id
  type: 'public_class' | 'private_tuition' | 'one_on_one';
  isPrivate: boolean;
  passcode?: string;
  status: 'scheduled' | 'live' | 'ended';
  scheduledTime: Date;
  participants: any[]; // User[] or id[]
  createdAt?: string;
}

export interface Booking {
  _id: string;
  teacherId: any;
  studentId: any;
  scheduledTime: Date;
  durationMinutes: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  classroomId?: any;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private apiUrl = 'http://localhost:3000/api';

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    // Restore session
    const storedUser = localStorage.getItem('studysync_user');
    if (storedUser) {
      try {
        this.currentUserSubject.next(JSON.parse(storedUser));
      } catch (e) {
        localStorage.removeItem('studysync_user');
      }
    }
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  login(email: string, name: string, role: 'student' | 'teacher'): Observable<User> {
    return this.http.post<User>(`${this.apiUrl}/users/login`, { email, name, role }).pipe(
      tap((user) => {
        localStorage.setItem('studysync_user', JSON.stringify(user));
        this.currentUserSubject.next(user);
      })
    );
  }

  logout() {
    localStorage.removeItem('studysync_user');
    this.currentUserSubject.next(null);
  }

  getUserProfile(id: string): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/users/${id}`);
  }

  updateProfile(id: string, name: string, bio: string, skills: string[]): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/users/${id}`, { name, bio, skills }).pipe(
      tap((updated) => {
        const current = this.getCurrentUser();
        if (current && current._id === id) {
          const newUser = { ...current, ...updated };
          localStorage.setItem('studysync_user', JSON.stringify(newUser));
          this.currentUserSubject.next(newUser);
        }
      })
    );
  }

  getTeachers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiUrl}/users/teachers`);
  }

  // Classrooms
  createClassroom(data: {
    title: string;
    description?: string;
    creatorId: string;
    type: string;
    isPrivate?: boolean;
    passcode?: string;
    scheduledTime: Date;
  }): Observable<Classroom> {
    return this.http.post<Classroom>(`${this.apiUrl}/classrooms`, data);
  }

  getClassrooms(userId: string): Observable<Classroom[]> {
    return this.http.get<Classroom[]>(`${this.apiUrl}/classrooms`, {
      params: { userId },
    });
  }

  getClassroom(id: string): Observable<Classroom> {
    return this.http.get<Classroom>(`${this.apiUrl}/classrooms/${id}`);
  }

  joinClassroom(id: string, userId: string, passcode?: string): Observable<Classroom> {
    return this.http.post<Classroom>(`${this.apiUrl}/classrooms/${id}/join`, {
      userId,
      passcode,
    });
  }

  updateClassroomStatus(id: string, status: 'scheduled' | 'live' | 'ended'): Observable<Classroom> {
    return this.http.put<Classroom>(`${this.apiUrl}/classrooms/${id}/status`, {
      status,
    });
  }

  // Bookings
  createBooking(data: {
    teacherId: string;
    studentId: string;
    scheduledTime: Date;
    durationMinutes?: number;
  }): Observable<Booking> {
    return this.http.post<Booking>(`${this.apiUrl}/bookings`, data);
  }

  getBookings(userId: string): Observable<Booking[]> {
    return this.http.get<Booking[]>(`${this.apiUrl}/bookings`, {
      params: { userId },
    });
  }

  updateBookingStatus(id: string, status: 'confirmed' | 'cancelled'): Observable<Booking> {
    return this.http.put<Booking>(`${this.apiUrl}/bookings/${id}/status`, {
      status,
    });
  }
}
