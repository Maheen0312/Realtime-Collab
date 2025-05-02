import { firestore } from '../firebase';  // Import Firebase functions

// Function to create an offer and store it in Firestore
const createOffer = async (roomId, offer) => {
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.update({
    offer: offer,
  });
};

// Function to create an answer and store it in Firestore
const createAnswer = async (roomId, answer) => {
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.update({
    answer: answer,
  });
};

// Store ICE candidates
const storeIceCandidate = async (roomId, candidate) => {
  const roomRef = firestore.collection('rooms').doc(roomId);
  await roomRef.update({
    iceCandidates: firebase.firestore.FieldValue.arrayUnion(candidate),
  });
};
export { createOffer, createAnswer, storeIceCandidate };