import { Injectable, NgZone } from '@angular/core';
import * as auth from 'firebase/auth';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  public currentUserData: any;
  userData: any;
  private lastUid: string | null = null;
  constructor(
    public afAuth: AngularFireAuth,
    public router: Router,
    public ngZone: NgZone,
  ) {

    this.afAuth.authState.subscribe((user) => {
      if (user) {
        if (this.lastUid !== null && this.lastUid !== user.uid && this.router.url.startsWith('/home')) {
          // another account signed in (e.g. from another tab): drop everything loaded for the previous one.
          // Only on home: sign-in/sign-up replace an unverified account directly, and reloading there breaks the flow.
          location.reload();
          return;
        }
        this.lastUid = user.uid;
        this.userData = user;
        localStorage.setItem('user', JSON.stringify(this.userData));
        JSON.parse(localStorage.getItem('user')!);
        this.router.navigate(['home']);
      } else {
        localStorage.setItem('user', 'null');
        JSON.parse(localStorage.getItem('user')!);
        // leave home only when a signed-in user goes away, never on a first null emission
        // (sign-in, register, forgot-password and verify-email must work while signed out)
        const wasSignedIn = this.lastUid !== null;
        this.lastUid = null;
        if (wasSignedIn) {
          this.ngZone.run(() => {
            this.router.navigate(['sign-in']);
          });
        }
      }
    });
  }

  SignIn(email: string, password: string) {
    return this.afAuth
      .signInWithEmailAndPassword(email, password)
      .then(() => {
        this.ngZone.run(() => {
          this.router.navigate(['home']);
        });
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }

  SignUp(email: string, password: string) {
    return this.afAuth
      .createUserWithEmailAndPassword(email, password)
      .then(() => {
        this.SendVerificationMail();
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }

  SendVerificationMail() {
    return this.afAuth.currentUser
      .then((u: any) => u.sendEmailVerification())
      .then(() => {
        this.router.navigate(['verify-email-address']);
      });
  }

  ForgotPassword(passwordResetEmail: string) {
    return this.afAuth
      .sendPasswordResetEmail(passwordResetEmail)
      .then(() => {
        window.alert('Password reset email sent, check your inbox.');
      })
      .catch((error) => {
        window.alert(error);
      });
  }

  get isLoggedIn(): boolean {
    const user = JSON.parse(localStorage.getItem('user')!);
    return user !== null && user.emailVerified !== false ? true : false;
  }

  GoogleAuth() {
    return this.AuthLogin(new auth.GoogleAuthProvider()).then((res: any) => {
      if (res) {
        this.router.navigate(['home']);
      }
    });
  }

  AuthLogin(provider: any) {
    return this.afAuth
      .signInWithPopup(provider)
      .then(() => {
        this.ngZone.run(() => {
          this.router.navigate(['home']);
        });
      })
      .catch((error) => {
        window.alert(error);
      });
  }

  SignOut() {
    return this.afAuth.signOut().then(() => {
      localStorage.removeItem('user');
      localStorage.removeItem('user_collection');
      this.router.navigate(['sign-in']);
    });
  }
}
