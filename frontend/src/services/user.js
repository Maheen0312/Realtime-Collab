import { firestore } from '../firebase';  // Import Firebase functions

// Function to create a user after they sign up
const createUser = async (userId, userName, userEmail) => {
  const userRef = firestore.collection('users').doc(userId);
  await userRef.set({
    name: userName,
    email: userEmail,
    rooms: [],  // Initially, the user has no rooms
  });
};
 export { createUser };