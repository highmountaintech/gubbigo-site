// Public Firebase Web SDK config — safe to publish. Firestore security rules
// (not this key) are what actually gate access; see GubbiGo/firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyALeVzs70xbz40DAvDquG9F8C0pdwMw4rU",
  authDomain: "gubbigo-firebase.firebaseapp.com",
  projectId: "gubbigo-firebase",
  storageBucket: "gubbigo-firebase.firebasestorage.app",
  messagingSenderId: "74116470837",
  appId: "1:74116470837:web:e7e3f31983df27d0fef97c",
};

// App Check for the delete-data form (reCAPTCHA Enterprise). The site key is public.
// Leave `siteKey` empty until the key exists in Google Cloud and the web app is
// registered under Firebase console -> App Check; the form then skips App Check and
// keeps working. Once a key is set and App Check is ENFORCED for Cloud Firestore,
// a form submission without a valid token is rejected by Firestore.
export const appCheckConfig = {
  siteKey: "",
};
