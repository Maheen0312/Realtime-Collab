import { firestore } from './firebase';  // Import Firebase functions

// Function to send a message to the room
const sendMessage = async (roomId, userId, messageContent) => {
  const messageRef = firestore.collection('rooms').doc(roomId).collection('messages').doc();
  await messageRef.set({
    userId: userId,
    content: messageContent,
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Optionally, update the messages array in the room document as well
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.update({
    messages: firebase.firestore.FieldValue.arrayUnion(messageRef.id),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
};
export { sendMessage };