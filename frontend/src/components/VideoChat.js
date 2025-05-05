import React, { useEffect, useRef, useState } from 'react';
import AgoraRTC from 'agora-rtc-sdk-ng';
import { Camera, Mic, MicOff, Monitor, Phone, Video, VideoOff, Grid, Layout } from 'lucide-react';

// Move credentials to environment variables in production
const APP_ID = '712f72b0c5ed413299df9bab345526f3';
// Note: Using a static token for development only - should be generated from your server
const TOKEN = '007eJxTYBCNrAvx06qOdnrhIttldk5feOunj21aQRteC6wXb/7k/0aBwdzQKM3cKMkg2TQ1xcTQ2MjSMiXNMikxydjE1NTILM34ar54RkMgI0PS5G/MjAwQCOJzMORklqUW5efnMjAAAFzlIEU=';
const CHANNEL = 'liveroom';

const AgoraVideoChat = ({ roomId = CHANNEL, onError }) => {
  const [connectionState, setConnectionState] = useState('disconnected'); // disconnected, connecting, connected
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [error, setError] = useState(null);
  const [remoteUsers, setRemoteUsers] = useState([]);
  const [layout, setLayout] = useState('grid'); // grid, sidebar
  const [tokenExpired, setTokenExpired] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const clientRef = useRef(null);
  const localVideoContainerRef = useRef(null);
  const localTrackRef = useRef({});
  const mainRemoteContainerRef = useRef(null);

  // Initialize Agora client
  useEffect(() => {
    try {
      clientRef.current = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      setupEventListeners();
    } catch (err) {
      handleError('Failed to initialize video client', err);
    }

    return () => {
      leaveChannel();
    };
  }, []);

  const setupEventListeners = () => {
    if (!clientRef.current) return;

    // Remote user joined
    clientRef.current.on('user-published', async (user, mediaType) => {
      try {
        await clientRef.current.subscribe(user, mediaType);
        
        if (mediaType === 'video') {
          setRemoteUsers(prev => {
            // Check if user already exists
            if (prev.find(u => u.uid === user.uid)) {
              return prev.map(u => u.uid === user.uid ? { ...u, hasVideo: true, videoTrack: user.videoTrack } : u);
            } else {
              return [...prev, { uid: user.uid, hasVideo: true, hasAudio: false, videoTrack: user.videoTrack }];
            }
          });
        }
        
        if (mediaType === 'audio') {
          user.audioTrack.play();
          setRemoteUsers(prev => {
            if (prev.find(u => u.uid === user.uid)) {
              return prev.map(u => u.uid === user.uid ? { ...u, hasAudio: true } : u);
            } else {
              return [...prev, { uid: user.uid, hasVideo: false, hasAudio: true }];
            }
          });
        }
      } catch (err) {
        handleError('Failed to subscribe to remote user', err);
      }
    });

    // Remote user left
    clientRef.current.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video') {
        setRemoteUsers(prev => prev.map(u => 
          u.uid === user.uid ? { ...u, hasVideo: false, videoTrack: null } : u
        ));
      }
      if (mediaType === 'audio') {
        setRemoteUsers(prev => prev.map(u => 
          u.uid === user.uid ? { ...u, hasAudio: false } : u
        ));
      }
    });

    // Remote user left the channel completely
    clientRef.current.on('user-left', (user) => {
      setRemoteUsers(prev => prev.filter(u => u.uid !== user.uid));
    });

    // Connection state changes
    clientRef.current.on('connection-state-change', (curState, prevState) => {
      console.log('Connection state changed:', prevState, '->', curState);
      setConnectionState(curState.toLowerCase());
      
      if (curState === 'DISCONNECTED') {
        setRemoteUsers([]);
      } else if (curState === 'CONNECTED') {
        // Reset reconnect attempts when successfully connected
        setReconnectAttempts(0);
      }
    });
    
    // Token privilege will expire
    clientRef.current.on('token-privilege-will-expire', async () => {
      console.warn('Token is about to expire. Attempting to renew...');
      try {
        // In a real app, you'd fetch a new token from your server
        // For this example, we'll just show an error since we're using static tokens
        setTokenExpired(true);
        setError('Your session is about to expire. Please refresh the page to continue.');
      } catch (err) {
        handleError('Failed to renew token', err);
      }
    });
    
    // TOKEN expired
    clientRef.current.on('token-privilege-did-expire', () => {
      console.error('Token expired');
      setTokenExpired(true);
      setError('Your session has expired. Please refresh the page to continue.');
      leaveChannel();
    });
  };

  // Join the video channel
  const joinChannel = async () => {
    if (connectionState === 'connecting' || tokenExpired) return;
    
    setConnectionState('connecting');
    setError(null);
    
    try {
      // Join the channel
      await clientRef.current.join(APP_ID, roomId || CHANNEL, TOKEN, null);
      
      // Create local tracks
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(
        { encoderConfig: { sampleRate: 48000, stereo: true, bitrate: 128 } },
        { 
          encoderConfig: { 
            width: 640, 
            height: 360, 
            frameRate: 30, 
            bitrateMax: 1000 
          }, 
          facingMode: 'user' 
        }
      );
      
      // Store local tracks
      localTrackRef.current = { audioTrack, videoTrack };
      
      // Play local video
      if (localVideoContainerRef.current && videoTrack) {
        videoTrack.play(localVideoContainerRef.current);
      }
      
      // Publish local tracks
      await clientRef.current.publish([audioTrack, videoTrack]);
      setConnectionState('connected');
    } catch (err) {
      setConnectionState('disconnected');
      
      // Handle specific error codes
      if (err.code === 'INVALID_OPERATION') {
        handleError('Failed to join - Channel might be full or unavailable', err);
      } else if (err.code === 'OPERATION_ABORTED') {
        handleError('Connection was interrupted', err);
      } else if (err.code === 'INVALID_PARAMS') {
        handleError('Invalid channel parameters', err);
      } else if (err.code === 'DYNAMIC_KEY_TIMEOUT') {
        setTokenExpired(true);
        handleError('Your session token has expired. Please refresh the page', err);
      } else {
        handleError('Failed to join video channel', err);
      }
      
      // Attempt reconnection for certain errors
      if (['NETWORK_ERROR', 'OPERATION_ABORTED'].includes(err.code)) {
        if (reconnectAttempts < 3) {
          const delay = Math.pow(2, reconnectAttempts) * 1000;
          console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
          setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            joinChannel();
          }, delay);
        }
      }
    }
  };

  // Leave the video channel
  const leaveChannel = async () => {
    if (connectionState === 'disconnected') return;
    
    try {
      const { audioTrack, videoTrack } = localTrackRef.current;
      
      // Stop and close audio track
      if (audioTrack) {
        audioTrack.stop();
        audioTrack.close();
      }
      
      // Stop and close video track
      if (videoTrack) {
        videoTrack.stop();
        videoTrack.close();
      }
      
      // Leave the channel
      if (clientRef.current) {
        await clientRef.current.leave();
      }
    } catch (err) {
      handleError('Error while leaving channel', err);
    } finally {
      localTrackRef.current = {};
      setRemoteUsers([]);
      setConnectionState('disconnected');
      setIsScreenSharing(false);
    }
  };

  // Toggle local video
  const toggleVideo = () => {
    const { videoTrack } = localTrackRef.current;
    if (videoTrack) {
      videoTrack.setEnabled(!videoEnabled);
      setVideoEnabled(!videoEnabled);
    }
  };

  // Toggle local audio
  const toggleAudio = () => {
    const { audioTrack } = localTrackRef.current;
    if (audioTrack) {
      audioTrack.setEnabled(!audioEnabled);
      setAudioEnabled(!audioEnabled);
    }
  };

  // Share screen
  const shareScreen = async () => {
    if (isScreenSharing) return;
    
    try {
      // Create screen track
      const screenTrack = await AgoraRTC.createScreenVideoTrack({
        encoderConfig: {
          width: 1920,
          height: 1080,
          frameRate: 15,
          bitrateMax: 2500
        }
      });
      
      // Unpublish camera track
      await clientRef.current.unpublish(localTrackRef.current.videoTrack);
      
      // Stop and close camera track
      localTrackRef.current.videoTrack.stop();
      localTrackRef.current.videoTrack.close();
      
      // Update local track reference
      localTrackRef.current.videoTrack = screenTrack;
      
      // Publish screen track
      await clientRef.current.publish(screenTrack);
      
      // Play screen track
      if (localVideoContainerRef.current) {
        screenTrack.play(localVideoContainerRef.current);
      }
      
      setIsScreenSharing(true);
      
      // Handle screen share ended
      screenTrack.on('track-ended', async () => {
        await stopScreenSharing();
      });
    } catch (err) {
      if (err.code === 'PERMISSION_DENIED') {
        handleError('Screen sharing permission denied by user', err);
      } else {
        handleError('Failed to share screen', err);
      }
    }
  };

  // Stop screen sharing
  const stopScreenSharing = async () => {
    if (!isScreenSharing) return;
    
    try {
      const screenTrack = localTrackRef.current.videoTrack;
      
      // Unpublish screen track
      if (screenTrack) {
        await clientRef.current.unpublish(screenTrack);
        screenTrack.stop();
        screenTrack.close();
      }
      
      // Create camera track
      const camTrack = await AgoraRTC.createCameraVideoTrack({
        encoderConfig: { 
          width: 640, 
          height: 360, 
          frameRate: 30, 
          bitrateMax: 1000 
        },
        facingMode: 'user'
      });
      
      // Update local track reference
      localTrackRef.current.videoTrack = camTrack;
      
      // Publish camera track
      await clientRef.current.publish(camTrack);
      
      // Play camera track
      if (localVideoContainerRef.current) {
        camTrack.play(localVideoContainerRef.current);
      }
      
      setIsScreenSharing(false);
    } catch (err) {
      handleError('Failed to stop screen sharing', err);
    }
  };

  // Error handling
  const handleError = (message, err) => {
    console.error(message, err);
    setError(`${message}: ${err?.message || 'Unknown error'}`);
    if (onError) onError(message, err);
  };

  // Toggle layout between grid and sidebar
  const toggleLayout = () => {
    setLayout(layout === 'grid' ? 'sidebar' : 'grid');
  };

  // Render avatar for video-disabled participants
  const renderAvatar = (size = 'medium') => {
    const sizeClass = size === 'large' ? 'h-16 w-16' : size === 'medium' ? 'h-8 w-8' : 'h-6 w-6';
    const bgClass = size === 'large' ? 'p-6' : size === 'medium' ? 'p-3' : 'p-2';
    
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`bg-gray-700 rounded-full ${bgClass}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className={`text-gray-400 ${sizeClass}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      </div>
    );
  };

  // Render remote user videos
  const renderRemoteUsers = () => {
    return remoteUsers.map(user => (
      <div 
        key={user.uid} 
        className="bg-gray-800 rounded-lg overflow-hidden relative"
        style={{
          aspectRatio: '16/9',
        }}
      >
        <div 
          id={`remote-video-${user.uid}`} 
          className="w-full h-full"
          ref={el => {
            if (el && user.hasVideo && user.videoTrack && !el.hasChildNodes()) {
              user.videoTrack.play(`remote-video-${user.uid}`);
            }
          }}
        />
        {!user.hasVideo && renderAvatar('medium')}
        <div className="absolute bottom-2 left-2 flex items-center space-x-1">
          <div className={`h-2 w-2 rounded-full ${user.hasAudio ? 'bg-green-500' : 'bg-red-500'}`}></div>
          <span className="text-xs text-white bg-black bg-opacity-50 px-1 rounded">User {user.uid.toString().substr(-4)}</span>
        </div>
      </div>
    ));
  };

  // Different layout rendering
  const renderVideoGrid = () => {
    let gridCols = "grid-cols-1";
    const totalParticipants = remoteUsers.length + 1; // Include local user
    
    if (totalParticipants === 2) {
      gridCols = "grid-cols-2";
    } else if (totalParticipants === 3) {
      gridCols = "grid-cols-2";
    } else if (totalParticipants === 4) {
      gridCols = "grid-cols-2";
    } else if (totalParticipants > 4) {
      gridCols = "grid-cols-3";
    }

    return (
      <div className={`grid gap-2 ${gridCols} h-full`}>
        {/* Local video */}
        <div className="bg-gray-800 rounded-lg overflow-hidden relative">
          <div 
            ref={localVideoContainerRef} 
            className="w-full h-full"
            style={{ aspectRatio: '16/9' }}
          />
          {!videoEnabled && renderAvatar('medium')}
          <div className="absolute bottom-2 left-2 flex items-center space-x-1">
            <div className={`h-2 w-2 rounded-full ${audioEnabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span className="text-xs text-white bg-black bg-opacity-50 px-1 rounded">You</span>
          </div>
        </div>
        
        {/* Remote videos */}
        {renderRemoteUsers()}
      </div>
    );
  };

  const renderSidebarLayout = () => {
    return (
      <div className="flex h-full gap-2">
        {/* Main video - either first remote user or local */}
        <div className="flex-1 bg-gray-800 rounded-lg overflow-hidden relative">
          {remoteUsers.length > 0 ? (
            <>
              <div 
                id={`main-remote-video`} 
                className="w-full h-full"
                ref={el => {
                  const mainUser = remoteUsers[0];
                  if (el && mainUser && mainUser.hasVideo && mainUser.videoTrack && !el.querySelector('.video-player')) {
                    mainUser.videoTrack.play(`main-remote-video`);
                  }
                }}
              />
              {remoteUsers[0] && !remoteUsers[0].hasVideo && renderAvatar('large')}
              <div className="absolute bottom-2 left-2 flex items-center space-x-1">
                <div className={`h-2 w-2 rounded-full ${remoteUsers[0] && remoteUsers[0].hasAudio ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs text-white bg-black bg-opacity-50 px-1 rounded">
                  User {remoteUsers[0] ? remoteUsers[0].uid.toString().substr(-4) : ''}
                </span>
              </div>
            </>
          ) : (
            <>
              <div 
                ref={el => {
                  if (el) {
                    localVideoContainerRef.current = el;
                    if (localTrackRef.current.videoTrack) {
                      localTrackRef.current.videoTrack.play(el);
                    }
                  }
                }}
                className="w-full h-full"
              />
              {!videoEnabled && renderAvatar('large')}
              <div className="absolute bottom-2 left-2 flex items-center space-x-1">
                <div className={`h-2 w-2 rounded-full ${audioEnabled ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs text-white bg-black bg-opacity-50 px-1 rounded">You</span>
              </div>
            </>
          )}
        </div>
        
        {/* Sidebar with other videos */}
        <div className="w-64 space-y-2 overflow-y-auto flex flex-col">
          {/* Local video thumbnail */}
          {remoteUsers.length > 0 && (
            <div className="bg-gray-800 rounded-lg overflow-hidden relative h-48">
              <div 
                className="w-full h-full"
                ref={el => {
                  if (el && localTrackRef.current.videoTrack && !el.querySelector('.video-player')) {
                    localVideoContainerRef.current = el;
                    localTrackRef.current.videoTrack.play(el);
                  }
                }}
              />
              {!videoEnabled && renderAvatar('small')}
              <div className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-60 px-1 rounded text-white">
                You
              </div>
            </div>
          )}
          
          {/* Additional remote users (skip the first one) */}
          {remoteUsers.slice(1).map(user => (
            <div key={user.uid} className="bg-gray-800 rounded-lg overflow-hidden relative h-48">
              <div 
                id={`sidebar-remote-${user.uid}`} 
                className="w-full h-full"
                ref={el => {
                  if (el && user.hasVideo && user.videoTrack && !el.querySelector('.video-player')) {
                    user.videoTrack.play(`sidebar-remote-${user.uid}`);
                  }
                }}
              />
              {!user.hasVideo && renderAvatar('small')}
              <div className="absolute bottom-1 left-1 text-xs bg-black bg-opacity-60 px-1 rounded text-white">
                User {user.uid.toString().substr(-4)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Check if we have permission to access camera and mic
  const checkMediaPermissions = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      return true;
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        handleError('Camera and microphone permissions denied. Please allow access to join the video chat.', err);
      } else if (err.name === 'NotFoundError') {
        handleError('No camera or microphone found. Please connect a device to join the video chat.', err);
      } else {
        handleError('Failed to access media devices', err);
      }
      return false;
    }
  };

  // Enhanced join that checks permissions first
  const handleJoin = async () => {
    const hasPermissions = await checkMediaPermissions();
    if (hasPermissions) {
      joinChannel();
    }
  };

  return (
    <div className="bg-gray-900 text-white rounded-lg overflow-hidden flex flex-col h-full">
      <div className="p-3 bg-gray-800 flex justify-between items-center border-b border-gray-700">
        <h2 className="text-lg font-medium">Video Chat: {roomId}</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleLayout}
            className="p-2 rounded-full hover:bg-gray-700 text-gray-300"
            title="Toggle Layout"
          >
            {layout === 'grid' ? <Layout className="h-5 w-5" /> : <Grid className="h-5 w-5" />}
          </button>
          <div className={`h-2 w-2 rounded-full mr-1 flex-shrink-0 
            ${connectionState === 'connected' ? 'bg-green-500' : 
              connectionState === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}
          ></div>
          <span className="text-sm">
            {connectionState === 'connected' ? 'Connected' : 
             connectionState === 'connecting' ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-600 p-2 text-sm flex justify-between items-center">
          <span>{error}</span>
          <button 
            className="ml-2 bg-white text-red-600 px-2 py-0.5 rounded text-xs"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 p-2 overflow-hidden">
        {layout === 'grid' ? renderVideoGrid() : renderSidebarLayout()}
      </div>

      <div className="p-3 bg-gray-800 border-t border-gray-700">
        <div className="flex justify-center space-x-3">
          {connectionState === 'disconnected' ? (
            <button
              onClick={handleJoin}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-full flex items-center"
              disabled={connectionState === 'connecting' || tokenExpired}
            >
              <Camera className="w-5 h-5 mr-1" />
              Join Video
            </button>
          ) : (
            <>
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full ${videoEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                title={videoEnabled ? 'Turn Off Video' : 'Turn On Video'}
              >
                {videoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
              
              <button
                onClick={toggleAudio}
                className={`p-3 rounded-full ${audioEnabled ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 hover:bg-gray-700'}`}
                title={audioEnabled ? 'Mute Audio' : 'Unmute Audio'}
              >
                {audioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              </button>
              
              <button
                onClick={isScreenSharing ? stopScreenSharing : shareScreen}
                className={`p-3 rounded-full ${isScreenSharing ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                title={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
              >
                <Monitor className="w-5 h-5" />
              </button>
              
              <button
                onClick={leaveChannel}
                className="p-3 bg-red-600 hover:bg-red-700 rounded-full"
                title="Leave Call"
              >
                <Phone className="w-5 h-5 transform rotate-135" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgoraVideoChat;