import React, { useRef, useState, useEffect } from 'react';
import { firestore, collection, doc, setDoc, updateDoc, onSnapshot, getDoc, addDoc } from '../firebase';

const VideoChat = () => {
  const [callId, setCallId] = useState('');
  const [isCallStarted, setIsCallStarted] = useState(false);
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

  useEffect(() => {
    pc.current = new RTCPeerConnection(servers);
    remoteStream.current = new MediaStream();

    pc.current.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.current.addTrack(track);
      });
    };

    remoteVideoRef.current.srcObject = remoteStream.current;
  }, []);

  const startWebcam = async () => {
    localStream.current = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localStream.current.getTracks().forEach((track) => {
      pc.current.addTrack(track, localStream.current);
    });

    localVideoRef.current.srcObject = localStream.current;
  };

  const createCall = async () => {
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
  };

  const joinCall = async () => {
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
    const callData = docSnap.data();

    const offerDescription = callData.offer;
    await pc.current.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
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
  };

  return (
    <div>
      <h2>Video Chat</h2>
      <div>
        <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px' }} />
        <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px' }} />
      </div>
      <div>
        <button onClick={startWebcam}>Start Webcam</button>
        <button onClick={createCall}>Create Call</button>
        <input
          value={callId}
          onChange={(e) => setCallId(e.target.value)}
          placeholder="Call ID"
        />
        <button onClick={joinCall}>Join Call</button>
      </div>
      {isCallStarted && <p>Call in progress...</p>}
    </div>
  );
};

export default VideoChat;