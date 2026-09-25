import { keys } from "./keys";

export const environment = {
  production: true,
  imagesUrl: "http://localhost:8001/dataset/llm",
  apiUrl: "http://localhost:8001",
  firebase: {
    apiKey: keys.firebaseApiKey,
    authDomain: "projeto-mestrado-cb1e0.firebaseapp.com",
    projectId: "projeto-mestrado-cb1e0",
    storageBucket: "projeto-mestrado-cb1e0.appspot.com",
    messagingSenderId: "393813198931",
    appId: "1:393813198931:web:454d7acc6ba5c62dfbdea6",
    measurementId: "G-54F5HH9RPM"
  }
};
