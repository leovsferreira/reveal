import { Injectable } from '@angular/core';
import { Bucket} from '../models/bucket';
import { arrayUnion  } from '@angular/fire/firestore';
import {
  AngularFirestore,
  AngularFirestoreDocument,
} from '@angular/fire/compat/firestore';
import { BehaviorSubject } from 'rxjs';
import { take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class BucketService {
  public userUid = JSON.parse(localStorage.getItem('user')!).uid;
  public userBuckets: BehaviorSubject<any> = new BehaviorSubject({});

  constructor(public afs: AngularFirestore) { }

  async updateUserBuckets(name: string) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    const numberOfAddedBuckets = userData.numberOfAddedBuckets + 1;
    userData.numberOfAddedBuckets = numberOfAddedBuckets;

    const bucket: Bucket =  {
      id: numberOfAddedBuckets,
      name: name,
      date: new Date().toLocaleString(),
      imageUrls: [],
      inUse: 1,
      isSaved: 0
    };

    userData.buckets.push(bucket);
    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }


  async saveUserBucket(bucketId: number) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.buckets.length; i++) {
      if(userData.buckets[i].id == bucketId) userData.buckets[i].isSaved = 1;
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }

  async closeUserBucket(bucketId: number) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.buckets.length; i++) {
      if(userData.buckets[i].id == bucketId) userData.buckets[i].inUse = 0;
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }

  async destroyUserBucket(bucketId: number) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.buckets.length; i++) {
      if(userData.buckets[i].id == bucketId) {
        userData.buckets.splice(i, 1);
      }
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }

  async openUserBucket(bucketId: number) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.buckets.length; i++) {
      if(userData.buckets[i].id == bucketId) {
        userData.buckets[i].inUse = 1;
      }
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }

  async addImageToBucket(bucketId: number, imageUrl: string) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.buckets.length; i++) {
      if(userData.buckets[i].id == bucketId) userData.buckets[i].imageUrls.push(imageUrl);
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.buckets;
  }

  setData(data: any) {
    localStorage.setItem('user_collection', JSON.stringify(data));
  }
}
