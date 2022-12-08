// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

export const environment = {
  production: false,
  firebase: {
    apiKey: "AIzaSyDR_7-D6umd-hMNKHxq7IrHQzjTt4CwonE",
    authDomain: "projeto-mestrado-cb1e0.firebaseapp.com",
    projectId: "projeto-mestrado-cb1e0",
    storageBucket: "projeto-mestrado-cb1e0.appspot.com",
    messagingSenderId: "393813198931",
    appId: "1:393813198931:web:454d7acc6ba5c62dfbdea6",
    measurementId: "G-54F5HH9RPM"
  }
};


// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
