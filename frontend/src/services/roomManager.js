import { firestore } from './firebase';  // Import Firebase functions

// Function to create a room
const createRoom = async (userId) => {
  const roomRef = firestore.collection('rooms').doc();
  const roomId = roomRef.id;
  await roomRef.set({
    host: userId,
    participants: [userId],  // The user who created the room is the first participant
    iceCandidates: [],
    offer: null,
    answer: null,
    messages: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  // Add the room ID to the user's rooms array
  const userRef = firestore.collection('users').doc(userId);
  await userRef.update({
    rooms: firebase.firestore.FieldValue.arrayUnion(roomId),
  });

  return roomId;
};
export { createRoom };