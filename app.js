const SECRET_KEY = 0x5A; // Must match Arduino SECRET_KEY
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const modeSelect = document.getElementById("modeSelect");
const statusText = document.getElementById("status");
const screenStrobe = document.getElementById("screenStrobe");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Scan all cameras to find any lens that supports hardware torch
async function findHardwareTorch() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;

  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    const tempTrack = tempStream.getVideoTracks()[0];
    if (tempTrack && tempTrack.getCapabilities && tempTrack.getCapabilities().torch) {
      return tempTrack;
    }
    if (tempTrack) tempTrack.stop();

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === "videoinput");

    for (const cam of cameras) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: cam.deviceId } }
        });
        const t = s.getVideoTracks()[0];
        if (t && t.getCapabilities && t.getCapabilities().torch) {
          return t;
        }
        if (t) t.stop();
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
  let track = null;
  let useScreen = mode === "screen";

  try {
    if (!useScreen) {
      statusText.textContent = "Status: Checking rear flashlight...";
      track = await findHardwareTorch();

      if (!track) {
        if (mode === "flash") {
          throw new Error("Rear flashlight not exposed on this phone. Switch Mode to Screen Flash.");
        }
        useScreen = true; // Automatic fallback so every phone works!
      }
    }

    const setLight = async (on) => {
      if (useScreen) {
        screenStrobe.style.backgroundColor = on ? "#FFFFFF" : "#000000";
        screenStrobe.style.color = on ? "#FFFFFF" : "#333333";
      } else {
        await track.applyConstraints({ advanced: [{ torch: on }] });
      }
    };

    if (useScreen) {
      screenStrobe.style.display = "flex";
      statusText.textContent = "Status: Transmitting via Screen Flash...";
      await sleep(400);
    } else {
      statusText.textContent = "Status: Transmitting via Rear Flashlight...";
    }

    // 1. Start Bit: 500ms ON, 100ms OFF
    await setLight(true);
    await sleep(500);
    await setLight(false);
    await sleep(100);

    // 2. Transmit each character as 8 XOR-encrypted bits
    for (let i = 0; i < message.length; i++) {
      const encryptedByte = message.charCodeAt(i) ^ SECRET_KEY;

      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        const bit = (encryptedByte >> bitPos) & 1;

        await setLight(true);
        await sleep(bit === 1 ? 200 : 100); // 1 = 200ms, 0 = 100ms
        await setLight(false);
        await sleep(100); // Inter-bit gap
      }
    }

    statusText.textContent = Status: Sent "${message}" via ${useScreen ? "Screen Flash" : "Rear Flashlight"}.;
  } catch (err) {
    statusText.textContent = Error: ${err.message};
  } finally {
    if (track) {
      await track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      track.stop();
    }
    screenStrobe.style.display = "none";
    sendBtn.disabled = false;
  }
});
