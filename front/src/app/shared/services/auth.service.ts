import { Injectable, NgZone } from '@angular/core';
import { User, UserCollection } from '../models/user';
import * as auth from 'firebase/auth';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { arrayUnion  } from '@angular/fire/firestore';
import {
  AngularFirestore,
  AngularFirestoreDocument,
} from '@angular/fire/compat/firestore';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  public currentUserData: any;
  userData: any; // Save logged in user data
  public userCollection: BehaviorSubject<any> = new BehaviorSubject({});
  constructor(
    public afs: AngularFirestore, // Inject Firestore service
    public afAuth: AngularFireAuth, // Inject Firebase auth service
    public router: Router,
    public ngZone: NgZone, // NgZone service to remove outside scope warning
  ) {
    /* Saving user data in localstorage when 
    logged in and setting up null when logged out */
    this.afAuth.authState.subscribe((user) => {
      if (user) {
        this.userData = user;
        localStorage.setItem('user', JSON.stringify(this.userData));
        JSON.parse(localStorage.getItem('user')!);
        this.router.navigate(['home']);
      } else {
        localStorage.setItem('user', 'null');
        JSON.parse(localStorage.getItem('user')!);
        localStorage.setItem('user_collection', 'null');
        JSON.parse(localStorage.getItem('user_collection')!);
      }
    });
  }
  // Sign in with email/password
  SignIn(email: string, password: string) {
    return this.afAuth
      .signInWithEmailAndPassword(email, password)
      .then((result) => {
        this.SetUserData(result.user);
        //@ts-ignore
        if(result.additionalUserInfo.isNewUser) {
          console.log('new user')
          this.SetUserCollectionDataDataOnFirstLogin(result.user);
        } else {
          this.SetUserCollectionData(result.user);
        }
        this.ngZone.run(() => {
          this.router.navigate(['home']);
        });
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }
  // Sign up with email/password
  SignUp(email: string, password: string) {
    return this.afAuth
      .createUserWithEmailAndPassword(email, password)
      .then((result) => {
        this.SendVerificationMail();
        this.SetUserData(result.user);
        //@ts-ignore
        if(result.additionalUserInfo.isNewUser) {
          console.log('new user')
          this.SetUserCollectionDataDataOnFirstLogin(result.user);
        } else {
          this.SetUserCollectionData(result.user);
        }
        /* Call the SendVerificaitonMail() function when new user sign 
        up and returns promise */
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }
  // Send email verfificaiton when new user sign up
  SendVerificationMail() {
    return this.afAuth.currentUser
      .then((u: any) => u.sendEmailVerification())
      .then(() => {
        this.router.navigate(['verify-email-address']);
      });
  }
  // Reset Forggot password
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
  // Returns true when user is looged in and email is verified
  get isLoggedIn(): boolean {
    const user = JSON.parse(localStorage.getItem('user')!);
    return user !== null && user.emailVerified !== false ? true : false;
  }
  // Sign in with Google
  GoogleAuth() {
    return this.AuthLogin(new auth.GoogleAuthProvider()).then((res: any) => {
      if (res) {
        this.router.navigate(['home']);
      }
    });
  }
  // Auth logic to run auth providers
  AuthLogin(provider: any) {
    return this.afAuth
      .signInWithPopup(provider)
      .then((result) => {
        this.SetUserData(result.user);
        //@ts-ignore
        if(result.additionalUserInfo.isNewUser) {
          console.log('new user')
          this.SetUserCollectionDataDataOnFirstLogin(result.user);
        } else {
          this.SetUserCollectionData(result.user);
        }
        this.ngZone.run(() => {
          this.router.navigate(['home']);
        });
      })
      .catch((error) => {
        window.alert(error);
      });
  }
  /* Setting up user data when sign in with username/password, 
  sign up with username/password and sign in with social auth  
  provider in Firestore database using AngularFirestore + AngularFirestoreDocument service */
  SetUserData(user: any) {
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users/${user.uid}`
    );

    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified
    };
    
    return userRef.set(userData, {
      merge: true,
    });
  }

  SetUserCollectionDataDataOnFirstLogin(user: any) {
    
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${user.uid}`
    );

    const userData: UserCollection = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
      numberOfAddedBuckets: 0,
      numberOfAddedStates: 0,
      buckets: [],
      states: []
    };
    
    this.setData(userData);
    return userRef.set(userData);
  }

  SetUserCollectionData(user: any) {
    
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${user.uid}`
    );

    userRef.valueChanges().pipe(take(1)).subscribe(res => {
      this.setData(res);
      userRef.set(res);
      this.userCollection.next(res);
    })
  }

  // Sign out
  SignOut() {
    return this.afAuth.signOut().then(() => {
      localStorage.removeItem('user');
      localStorage.removeItem('user_collection');
      this.router.navigate(['sign-in']);
    });
  }

  async getUserCollection() {
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userData.uid}`
    );
    return userRef.valueChanges();
  }

  setData(data: any) {
    localStorage.setItem('user_collection', JSON.stringify(data));
  }
}