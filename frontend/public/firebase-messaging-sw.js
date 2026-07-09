importScripts(
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js'
);

importScripts(
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js'
);

firebase.initializeApp({
  apiKey: "AIzaSyBKat-tCeDuoRr-uzdOeoQXT6PpXHBWJno",
  authDomain: "plating-app-db29f.firebaseapp.com",
  projectId: "plating-app-db29f",
  storageBucket: "plating-app-db29f.firebasestorage.app",
  messagingSenderId: "455835477529"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[FCM Service Worker] Background message received:", payload);
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: '/assets/icon-192.png'
    }
  );
});
