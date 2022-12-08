import { Injectable } from '@angular/core';
import { State } from '../models/state';
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
export class StateService {
  public userUid = JSON.parse(localStorage.getItem('user')!).uid;
  public userStates: BehaviorSubject<any> = new BehaviorSubject({});

  constructor(public afs: AngularFirestore) { }

  async saveUserStates(name: string, forceGraphData: any) {
    //salva se nao tem state salvo

    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );
    //remove campo undefined
    forceGraphData.nodes.forEach((node: any) => { node.fy = 0 });

    const userData = JSON.parse(localStorage.getItem('user_collection')!);
    
    const links: any = [];
    for(let i = 0; i < forceGraphData.links.length; i++) {
      links.push({ source: forceGraphData.links[i].source.id, target: forceGraphData.links[i].target.id});
    }
    //cria novo estado
    const state: State =  {
      id: userData.numberOfAddedStates,
      name: name,
      date: new Date().toLocaleString(),
      nodes: forceGraphData.nodes,
      links:  links
    };
    
    const numberOfAddedStates = userData.numberOfAddedStates + 1;
    userData.numberOfAddedStates = numberOfAddedStates;
    userData.states.push(state);
    userRef.set(userData);
    this.setData(userData);
    return userData.states;
  }

  async updateUserStates(name: string, forceGraphData: any) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );
    //remove campo undefined
    forceGraphData.nodes.forEach((node: any) => { node.fy = 0 });
    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    const links: any = [];
    for(let i = 0; i < forceGraphData.links.length; i++) {
      links.push({ source: forceGraphData.links[i].source.id, target: forceGraphData.links[i].target.id});
    }

    for(let i = 0; i < userData.states.length; i++) {
      if(userData.states[i].name == name) {
        const state: State =  {
          id: userData.states[i].id,
          name: userData.states[i].name,
          date: userData.states[i].date,
          nodes: forceGraphData.nodes,
          links: links
        };
        userData.states[i] = state 
      }
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.states;
  }

  async destroyState(stateId: number) {
    this.userUid = JSON.parse(localStorage.getItem('user')!).uid;

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users_collection/${this.userUid}`
    );

    const userData = JSON.parse(localStorage.getItem('user_collection')!);

    for(let i = 0; i < userData.states.length; i++) {
      if(userData.states[i].id == stateId) {
        userData.states.splice(i, 1);
      }
    }

    userRef.set(userData);
    this.setData(userData);
    return userData.states;
  }

  getSavedState(stateId: number) {
    const userData = JSON.parse(localStorage.getItem('user_collection')!);
    for(let i = 0; i < userData.states.length; i++) {
      if(userData.states[i].id == stateId) {
        return userData.states[i];
      }
    }
  }

  setData(data: any) {
    localStorage.setItem('user_collection', JSON.stringify(data));
  }
}
