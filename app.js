const SECRET_KEY = 0x5A; // Must match Arduino SECRET_KEY
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const statusText = document.getElementById("status");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

sendBtn.addEventListener("click", async () => {
  const message = messageInput.value.trim();
  if (!message) {
    statusText.textContent = "Status: Enter a message first.";
    return;
  }

  sendBtn.disabled = true;
  statusText.textContent = "Status: Requesting flashlight access...";

  let track = null;

  try {
    // Request rear camera stream to access torch hardware
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    track = stream.getVideoTracks()[0];

    const capabilities = track.getCapabilities();
    if (!capabilities.torch) {
      throw new Error("Torch/Flashlight API not supported on this browser/device.");
    }

    const setTorch = async (on) => {
      await track.applyConstraints({ advanced: [{ torch: on }] });
    };

    statusText.textContent = "Status: Transmitting light pulses...";

    // 1. Start Bit: 500ms ON, 100ms OFF
    await setTorch(true);
    await sleep(500);
    await setTorch(false);
    await sleep(100);

    // 2. Transmit each character as 8 XOR-encrypted bits
    for (let i = 0; i < message.length; i++) {
      const encryptedByte = message.charCodeAt(i) ^ SECRET_KEY;

      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        const bit = (encryptedByte >> bitPos) & 1;

        await setTorch(true);
        await sleep(bit === 1 ? 200 : 100); // 1 = 200ms, 0 = 100ms
        await setTorch(false);
        await sleep(100); // Inter-bit gap
      }
    }

    statusText.textContent = `Status: Sent "${message}" successfully.`;
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
  } finally {
    // Always turn off flashlight and release camera hardware
    if (track) {
      await track.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      track.stop();
    }
    sendBtn.disabled = false;
  }
});
