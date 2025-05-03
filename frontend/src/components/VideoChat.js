import React, { useRef, useState, useEffect } from 'react';
import {firestore,auth,signInAnonymously,collection,doc,setDoc,updateDoc,onSnapshot,getDoc,addDoc } from '../firebase'; // Adjust the import path as necessary

const VideoChat = () => {
  const [callId, setCallId] = useState('');
  const [isCallStarted, setIsCallStarted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const pc = useRef(null);
  const localStream = useRef(null);
  const remoteStream = useRef(null);

  const servers = {
    iceServers: [
      {
        urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
      },
    ],
    iceCandidatePoolSize: 10,
  };

  // Authenticate user when component mounts
  useEffect(() => {
    const authenticateUser = async () => {
      try {
        await signInAnonymously(auth);
        
        // Listen for auth state changes
        const unsubscribe = auth.onAuthStateChanged(user => {
          if (user) {
            console.log('User authenticated with ID:', user.uid);
            setIsAuthenticated(true);
            setError(null);
          } else {
            console.log('User signed out');
            setIsAuthenticated(false);
          }
        });
        
        return () => unsubscribe(); // Clean up the listener
      } catch (error) {
        console.error('Authentication error:', error);
        setError('Failed to authenticate: ' + error.message);
      }
    };
    
    authenticateUser();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      initializePeerConnection();
    }
  }, [isAuthenticated]);

  const initializePeerConnection = () => {
    pc.current = new RTCPeerConnection(servers);
    remoteStream.current = new MediaStream();

    pc.current.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.current.addTrack(track);
      });
    };

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream.current;
    }
  };

  const startWebcam = async () => {
    try {
      localStream.current = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      localStream.current.getTracks().forEach((track) => {
        pc.current.addTrack(track, localStream.current);
      });

      localVideoRef.current.srcObject = localStream.current;
      setError(null);
    } catch (err) {
      console.error('Error accessing media devices:', err);
      setError('Failed to access camera/microphone: ' + err.message);
    }
  };

  const createCall = async () => {
    if (!isAuthenticated) {
      setError('Please wait for authentication to complete');
      return;
    }

    try {
      // Create references with the updated Firestore v9 syntax
      const callsCollection = collection(firestore, 'calls');
      const callDoc = doc(callsCollection);
      const offerCandidatesCollection = collection(callDoc, 'offerCandidates');
      const answerCandidatesCollection = collection(callDoc, 'answerCandidates');

      setCallId(callDoc.id);

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(offerCandidatesCollection, event.candidate.toJSON());
        }
      };

      const offerDescription = await pc.current.createOffer();
      await pc.current.setLocalDescription(offerDescription);

      const offer = {
        sdp: offerDescription.sdp,
        type: offerDescription.type,
        createdBy: auth.currentUser.uid,
        createdAt: new Date(),
      };

      await setDoc(callDoc, { offer });

      onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (!pc.current.currentRemoteDescription && data?.answer) {
          const answerDescription = new RTCSessionDescription(data.answer);
          pc.current.setRemoteDescription(answerDescription);
        }
      });

      onSnapshot(answerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const candidate = new RTCIceCandidate(change.doc.data());
            pc.current.addIceCandidate(candidate);
          }
        });
      });

      setIsCallStarted(true);
      setError(null);
    } catch (err) {
      console.error('Error creating call:', err);
      setError('Failed to create call: ' + err.message);
    }
  };

  const joinCall = async () => {
    if (!isAuthenticated) {
      setError('Please wait for authentication to complete');
      return;
    }
    
    if (!callId) {
      setError('Please enter a Call ID');
      return;
    }

    try {
      // Create references with the updated Firestore v9 syntax
      const callDoc = doc(firestore, 'calls', callId);
      const offerCandidatesCollection = collection(callDoc, 'offerCandidates');
      const answerCandidatesCollection = collection(callDoc, 'answerCandidates');

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          addDoc(answerCandidatesCollection, event.candidate.toJSON());
        }
      };

      const docSnap = await getDoc(callDoc);
      if (!docSnap.exists()) {
        setError('Call ID does not exist');
        return;
      }
      
      const callData = docSnap.data();

      const offerDescription = callData.offer;
      await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

      const answerDescription = await pc.current.createAnswer();
      await pc.current.setLocalDescription(answerDescription);

      const answer = {
        type: answerDescription.type,
        sdp: answerDescription.sdp,
        answeredBy: auth.currentUser.uid,
        answeredAt: new Date(),
      };

      await updateDoc(callDoc, { answer });

      onSnapshot(offerCandidatesCollection, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            pc.current.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });

      setIsCallStarted(true);
      setError(null);
    } catch (err) {
      console.error('Error joining call:', err);
      setError('Failed to join call: ' + err.message);
    }
  };

  return (
    <div>
      <h2>Video Chat</h2>
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <div>
        <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px' }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px' }} />
      </div>
      <div>
        <button onClick={startWebcam} disabled={!isAuthenticated}>Start Webcam</button>
        <button onClick={createCall} disabled={!isAuthenticated}>Create Call</button>
        <input
          value={callId}
          onChange={(e) => setCallId(e.target.value)}
          placeholder="Call ID"
          disabled={!isAuthenticated}
        />
        <button onClick={joinCall} disabled={!isAuthenticated}>Join Call</button>
      </div>
      {isCallStarted && <p>Call in progress...</p>}
      {!isAuthenticated && <p>Authenticating...</p>}
    </div>
  );
};

export default VideoChat;