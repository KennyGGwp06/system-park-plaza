import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Esta configuración identifica la aplicación web ante Firebase; no contiene
// secretos de servidor. El acceso sensible sigue validándose en el backend.
const firebaseConfig = {
  apiKey: "AIzaSyA3tM_dHfDNHOrDjKAAf6U8eOsZ4U8ka3c",
  authDomain: "logincon-936a3.firebaseapp.com",
  projectId: "logincon-936a3",
  storageBucket: "logincon-936a3.firebasestorage.app",
  messagingSenderId: "935728940227",
  appId: "1:935728940227:web:2a7ccc901f192ec32e8e76"
};

const app = initializeApp(firebaseConfig);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  const result = await signInWithPopup(getAuth(app), provider);
  return result.user;
}
