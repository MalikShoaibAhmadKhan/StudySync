import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  email: string = '';
  name: string = '';
  role: 'student' | 'teacher' = 'student';
  errorMsg: string = '';
  isLoading: boolean = false;

  constructor(private apiService: ApiService, private router: Router) {
    // If already logged in, redirect to dashboard
    if (this.apiService.getCurrentUser()) {
      this.router.navigate(['/dashboard']);
    }
  }

  onSubmit() {
    if (!this.email || !this.name) {
      this.errorMsg = 'Please fill in all fields';
      return;
    }

    this.errorMsg = '';
    this.isLoading = true;

    this.apiService.login(this.email, this.name, this.role).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMsg = 'Failed to login. Please try again.';
        console.error(err);
      },
    });
  }

  loginAsDummy(role: 'student' | 'teacher') {
    if (role === 'student') {
      this.name = 'Alex Student';
      this.email = 'student@studysync.com';
      this.role = 'student';
    } else {
      this.name = 'Dr. Smith (Tutor)';
      this.email = 'teacher@studysync.com';
      this.role = 'teacher';
    }
    this.onSubmit();
  }
}
