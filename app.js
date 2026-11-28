const SECRET_KEY = 0x5A; // Must match Arduino SECRET_KEY
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const modeSelect = document.getElementById("modeSelect");
const statusText = document.getElementById("status");
const screenStrobe = document.getElementById("screenStrobe");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Hidden video element keeps Android camera pipeline alive so torch stays on
const hiddenVideo = document.createElement("video");
hiddenVideo.setAttribute("playsinline", "");
hiddenVideo.muted = true;
hiddenVideo.style.display = "none";
document.body.appendChild(hiddenVideo);

async function getUniversalTorchTrack() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return null;
  }

  // Helper to test if a given media stream supports torch
  const extractTorchTrack = async (stream) => {
    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    hiddenVideo.srcObject = stream;
    await hiddenVideo.play().catch(() => {});
    await sleep(150); // Allow camera hardware capabilities to initialize

    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) {
      return { track, stream };
    }

    // Some Android devices expose torch via ImageCapture even if getCapabilities lags
    if ("ImageCapture" in window) {
      try {
        const ic = new ImageCapture(track);
        const photoCaps = await ic.getPhotoCapabilities();
        if (photoCaps && photoCaps.fillLightMode && photoCaps.fillLightMode.includes("flash")) {
          return { track, stream };
        }
      } catch (_) {}
    }

    stream.getTracks().forEach((t) => t.stop());
    return null;
  };

  try {
    // 1. Try default rear environment camera first
    const envStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }
    });
    const envResult = await extractTorchTrack(envStream);
    if (envResult) return envResult;

    // 2. Scan all video inputs (handles multi-lens Android phones)
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");

    for (const dev of videoDevices) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: dev.deviceId } }
        });
        const res = await extractTorchTrack(s);
        if (res) return res;
      } catch (_) {}
    }
  } catch (_) {}

  return null;
}

sendBtn.addEventListener("click", async () => {
  const message = messageInput.value.trim();
  if (!message) {
    statusText.textContent = "Status: Enter a message first.";
    return;
  }

  sendBtn.disabled = true;
  const mode = modeSelect.value;
  let torchSession = null;
  let useScreen = mode === "screen";

  try {
    if (!useScreen) {
      statusText.textContent = "Status: Initializing mobile flashlight...";
      torchSession = await getUniversalTorchTrack();

      if (!torchSession) {
        if (mode === "flash") {
          throw new Error("Hardware LED not supported in this browser (e.g. iOS Safari). Select 'Auto' or 'Screen Flash'.");
        }
        useScreen = true;
      }
    }

    const setLight = async (on) => {
      if (useScreen) {
        screenStrobe.style.backgroundColor = on ? "#FFFFFF" : "#000000";
        screenStrobe.style.color = on ? "#FFFFFF" : "#222222";
      } else {
        await torchSession.track.applyConstraints({
          advanced: [{ torch: on }]
        });
      }
    };

    if (useScreen) {
      screenStrobe.style.display = "flex";
      statusText.textContent = "Status: Transmitting via Screen Flash...";
      await sleep(400);
    } else {
      statusText.textContent = "Status: Transmitting via Rear LED Flashlight...";
    }

    // 1. Start Bit (700ms ON, 250ms OFF)
    await setLight(true);
    await sleep(700);
    await setLight(false);
    await sleep(250);

    // 2. Transmit XOR-encrypted bits
    for (let i = 0; i < message.length; i++) {
      const encryptedByte = message.charCodeAt(i) ^ SECRET_KEY;

      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        const bit = (encryptedByte >> bitPos) & 1;

        await setLight(true);
        await sleep(bit === 1 ? 350 : 120);
        await setLight(false);
        await sleep(220);
      }
    }

    statusText.textContent = `Status: Sent "${message}" via ${useScreen ? "Screen Flash" : "Rear Flashlight"}.`;
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    if (torchSession) {
      await torchSession.track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      torchSession.stream.getTracks().forEach((t) => t.stop());
      hiddenVideo.srcObject = null;
    }
    screenStrobe.style.display = "none";
    sendBtn.disabled = false;
  }
});
