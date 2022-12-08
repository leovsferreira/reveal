export interface User {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    emailVerified: boolean;
}

export interface UserCollection {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string;
    emailVerified: boolean;
    numberOfAddedBuckets: number;
    numberOfAddedStates: number;
    buckets: any[];
    states: any[];    
}