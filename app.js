const KEY = 0x5A;
const sendBtn = document.getElementById("sendBtn");
const input = document.getElementById("messageInput");
const modeSelect = document.getElementById("modeSelect");
const statusText = document.getElementById("status");
const strobe = document.getElementById("screenStrobe");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const EMOJIS = {
  "🐴": "~1", "🐎": "~1",
  "🚨": "~2", "🆘": "~2",
  "❤️": "LOVE", "👍": "OK", "😊": "HAPPY", "🔥": "FIRE",
  "₹": "Rs.", "°": " deg", "×": "*", "÷": "/"
};

function cleanText(text) {
  let out = text;
  for (const [k, v] of Object.entries(EMOJIS)) {
    out = out.split(k).join(v);
  }
  return out.replace(/[^\x20-\x7E]/g, "").trim();
}

sendBtn.addEventListener("click", async () => {
  const msg = cleanText(input.value);
  if (!msg) return;

  sendBtn.disabled = true;
  const useScreen = modeSelect.value === "screen";
  let track = null;

  try {
    if (!useScreen) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }
      });
      track = stream.getVideoTracks();
    }

    const light = async (on) => {
      if (useScreen) {
        strobe.style.backgroundColor = on ? "#FFFFFF" : "#000000";
      } else {
        await track.applyConstraints({ advanced: [{ torch: on }] });
      }
    };

    if (useScreen) {
      strobe.style.display = "block";
      await sleep(300);
    }

    // Start bit
    await light(true);
    await sleep(600);
    await light(false);
    await sleep(220);

    // Data bits
    for (let i = 0; i < msg.length; i++) {
      const byteVal = msg.charCodeAt(i) ^ KEY;
      for (let b = 7; b >= 0; b--) {
        const bit = (byteVal >> b) & 1;
        await light(true);
        await sleep(bit ? 300 : 100);
        await light(false);
        await sleep(200);
      }
    }

    statusText.textContent = "Sent: " + msg;
  } catch (e) {
    statusText.textContent = "Error: Switch to Screen Flash";
  } finally {
    if (track) track.stop();
    strobe.style.display = "none";
    sendBtn.disabled = false;
  }
});
