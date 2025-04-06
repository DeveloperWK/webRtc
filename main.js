let peerConnection,
  localStream,
  remoteStream,
  dataChannel,
  originalVideoTrack,
  screenStream;
let isAudioMuted = false;
let isScreenSharing = false;
const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.1.google.com:19302", "stun:stun2.1.google.com:19302"],
    },
  ],
};

let init = async () => {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    document.getElementById("user-1").srcObject = localStream;
  } catch (error) {
    console.error("Media Error", error);
    alert("Failed to access Camera/Microphone");
  }
};
const statusEl = document.getElementById("status");
const updateStatus = (text) => {
  statusEl.innerText = text;
};

const createPeerConnection = async (sdpType) => {
  peerConnection = new RTCPeerConnection(servers);
  remoteStream = new MediaStream();
  document.getElementById("user-2").srcObject = remoteStream;

  // Add local tracks to the connection
  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  // Add incoming remote tracks to the remoteStream
  peerConnection.ontrack = async (e) => {
    e.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  // ✅ ICE gathering complete — save localDescription
  peerConnection.onicegatheringstatechange = () => {
    if (peerConnection.iceGatheringState === "complete") {
      document.getElementById(sdpType).value = JSON.stringify(
        peerConnection.localDescription
      );
    }
  };

  // ✅ Show ICE connection status in UI
  peerConnection.oniceconnectionstatechange = () => {
    updateStatus(`ICE: ${peerConnection.iceConnectionState}`);
    if (peerConnection.iceConnectionState === "connected") {
      console.log("Connected");
    }
  };

  // ✅ Set up data channel
  if (sdpType === "offer-sdp") {
    dataChannel = peerConnection.createDataChannel("chat");
    setupDataChannel(); // Only offer side creates the channel
  } else {
    peerConnection.ondatachannel = (e) => {
      dataChannel = e.channel;
      setupDataChannel(); // Answer side listens for it
    };
  }
};
const setupDataChannel = () => {
  dataChannel.onmessage = (event) => {
    const message = event.data;
    console.log("Received via DataChannel:", message);

    if (message === "close") {
      alert("Peer ended the call.");
      closeConnection();
    }
  };
};

let createOffer = async () => {
  await createPeerConnection("offer-sdp");
  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onmessage = (e) => {
    console.log("Peer Message", e.data);
  };
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
};
let createAnswer = async () => {
  await createPeerConnection("answer-sdp");
  const offer = document.getElementById("offer-sdp").value;
  if (!offer) return alert("Retrieve offer from peer first...");
  await peerConnection.setRemoteDescription(JSON.parse(offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
};
let addAnswer = async () => {
  let answer = document.getElementById("answer-sdp").value;
  if (!answer) return alert("Retrieve answer from peer first...");
  // answer = JSON.parse(answer);
  if (!peerConnection.currentRemoteDescription) {
    await peerConnection.setRemoteDescription(JSON.parse(answer));
  }
};
const closeConnection = () => {
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send("close");
  }

  // Close Peer Connection
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  // Stop and clear local stream
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    document.getElementById("user-1").srcObject = null;
    localStream = null;
  }

  // Stop and clear remote stream
  if (remoteStream) {
    remoteStream.getTracks().forEach((track) => track.stop());
    document.getElementById("user-2").srcObject = null;
    remoteStream = null;
  }

  // Clear SDP text areas
  document.getElementById("offer-sdp").value = "";
  document.getElementById("answer-sdp").value = "";

  // Reset screen sharing
  isScreenSharing = false;
  screenStream = null;
  originalVideoTrack = null;
  document.getElementById("toggle-screen").innerText = "Share Screen";
  document.getElementById("screen-status").style.display = "none";

  // Reset mute state
  isAudioMuted = false;
  const muteBtn = document.getElementById("toggle-audio");
  if (muteBtn) muteBtn.innerText = "Mute";
  if (dataChannel && dataChannel.readyState === "open") {
    dataChannel.send("close");
  }
  updateStatus("Connection closed");
};

const toggleScreenSharing = async () => {
  const button = document.getElementById("toggle-screen");
  const status = document.getElementById("screen-status");

  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      const screenTrack = screenStream.getVideoTracks()[0];
      originalVideoTrack = localStream.getVideoTracks()[0];

      const sender = peerConnection
        .getSenders()
        .find((s) => s.track.kind === "video");
      if (sender) sender.replaceTrack(screenTrack);

      screenTrack.onended = () => stopScreenSharing();

      isScreenSharing = true;
      button.innerText = "Stop Screen";
      status.style.display = "block";
      updateStatus("Screen sharing started");
    } catch (e) {
      console.error("Screen sharing failed", e);
      alert("Screen sharing failed");
    }
  } else {
    stopScreenSharing();
  }
};

const stopScreenSharing = () => {
  const button = document.getElementById("toggle-screen");
  const status = document.getElementById("screen-status");

  if (originalVideoTrack) {
    const sender = peerConnection
      .getSenders()
      .find((s) => s.track.kind === "video");
    if (sender) sender.replaceTrack(originalVideoTrack);
  }

  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  isScreenSharing = false;
  button.innerText = "Share Screen";
  status.style.display = "none";
  updateStatus("Returned to camera");
};

const toggleAudio = () => {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return alert("No audio track available.");
  isAudioMuted = !isAudioMuted;
  audioTrack.enabled = !isAudioMuted;
  document.getElementById("toggle-audio").innerText = isAudioMuted
    ? "Unmute"
    : "Mute";
};

document.getElementById("create-offer").addEventListener("click", createOffer);
document
  .getElementById("create-answer")
  .addEventListener("click", createAnswer);
document.getElementById("add-answer").addEventListener("click", addAnswer);
document
  .getElementById("close-connection")
  .addEventListener("click", closeConnection);
document.getElementById("toggle-audio").addEventListener("click", toggleAudio);
document
  .getElementById("toggle-screen")
  .addEventListener("click", toggleScreenSharing);

init();
