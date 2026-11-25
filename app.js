const SECRET_KEY = 0x5A; // Must match Arduino SECRET_KEY
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const modeSelect = document.getElementById("modeSelect");
const statusText = document.getElementById("status");
const screenStrobe = document.getElementById("screenStrobe");

// Drift-free wait using high-resolution clock
const preciseSleep = async (ms) => {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const remaining = end - performance.now();
    if (remaining > 15) {
      await new Promise((r) => setTimeout(r, remaining - 10));
    }
  }
};

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
  const message = messageInput.value; // Keep spaces if user types multi-word sentences
  if (!message || message.trim().length === 0) {
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
        useScreen = true;
      }
    }

    const setLight = async (on) => {
      if (useScreen) {
        screenStrobe.style.backgroundColor = on ? "#FFFFFF" : "#000000";
        screenStrobe.style.color = on ? "#FFFFFF" : "#000000";
      } else {
        await track.applyConstraints({ advanced: [{ torch: on }] });
      }
    };

    const sendPulse = async (onMs, offMs) => {
      await setLight(true);
      await preciseSleep(onMs);
      await setLight(false);
      await preciseSleep(offMs);
    };

    if (useScreen) {
      await setLight(false);
      screenStrobe.style.display = "flex";
      statusText.textContent = "Status: Transmitting via Screen Flash...";
      await preciseSleep(500);
    } else {
      statusText.textContent = "Status: Transmitting via Rear Flashlight...";
      await preciseSleep(300);
    }

    // 1. Start Header Pulse: 800ms ON, 250ms OFF
    await sendPulse(800, 250);

    // 2. Reference '1' Calibration Pulse: 400ms ON, 250ms OFF
    // (Arduino measures this exact pulse to auto-set the 0 vs 1 threshold!)
    await sendPulse(400, 250);

    // 3. Transmit all characters (letters, numbers, spaces, symbols)
    for (let i = 0; i < message.length; i++) {
      const encryptedByte = message.charCodeAt(i) ^ SECRET_KEY;

      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        const bit = (encryptedByte >> bitPos) & 1;
        // '1' = 400ms ON, '0' = 140ms ON, 250ms OFF recovery gap
        await sendPulse(bit === 1 ? 400 : 140, 250);
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
