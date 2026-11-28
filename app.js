const SECRET_KEY = 0x5A; // Must match Arduino SECRET_KEY
const sendBtn = document.getElementById("sendBtn");
const messageInput = document.getElementById("messageInput");
const modeSelect = document.getElementById("modeSelect");
const statusText = document.getElementById("status");
const screenStrobe = document.getElementById("screenStrobe");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SPECIAL_REACTIONS = {
  "🐴": "~1", "🐎": "~1",
  "🚨": "~2", "🆘": "~2",
  "❤️": "~3", "❤": "~3", "💖": "~3", "💕": "~3",
  "👍": "~4", "✅": "~4", "👌": "~4",
  "💡": "~5", "🔦": "~5",
  "🔥": "~6", "💥": "~6"
};

const UNIVERSAL_EMOJIS = {
  "😀": "SMILE", "😁": "GRIN", "😂": "LAUGH", "🤣": "LOL", "😊": "HAPPY",
  "😍": "LOVE IT", "😎": "COOL", "😢": "SAD", "😭": "CRY", "😡": "ANGRY",
  "😱": "SHOCK", "😴": "SLEEP", "🤔": "THINKING", "🙏": "NAMASTE", "👏": "CLAP",
  "👋": "HELLO", "✌️": "VICTORY", "💪": "STRONG", "🎉": "PARTY", "🎂": "BIRTHDAY",
  "🏆": "TROPHY", "⭐": "STAR", "🌟": "BRIGHT", "⚡": "POWER", "☀️": "SUN",
  "🌧️": "RAIN", "❄️": "COLD", "🌈": "RAINBOW", "🌍": "EARTH", "🐶": "DOG",
  "🐱": "CAT", "🦁": "LION", "🐯": "TIGER", "🐘": "ELEPHANT", "🐒": "MONKEY",
  "🐦": "BIRD", "🐍": "SNAKE", "🐟": "FISH", "🦋": "BUTTERFLY", "🚗": "CAR",
  "🚌": "BUS", "🚂": "TRAIN", "✈️": "AIRPLANE", "🚀": "ROCKET", "🚑": "AMBULANCE",
  "🚒": "FIRE TRUCK", "🚓": "POLICE", "🚲": "BICYCLE", "🚢": "SHIP", "🏥": "HOSPITAL",
  "🏫": "COLLEGE", "🏠": "HOME", "🏭": "FACTORY", "⛽": "FUEL", "📱": "MOBILE",
  "💻": "LAPTOP", "🔋": "BATTERY", "📡": "SIGNAL", "🔒": "LOCKED", "🔓": "UNLOCKED",
  "⚠️": "WARNING", "🚫": "STOP", "❓": "QUESTION", "❗": "ALERT", "🍎": "APPLE",
  "🍌": "BANANA", "🍕": "PIZZA", "☕": "COFFEE", "💧": "WATER", "⚽": "FOOTBALL",
  "🏏": "CRICKET", "🎵": "MUSIC", "🎓": "GRADUATE", "🇮🇳": "INDIA"
};

const SPECIAL_SYMBOLS = {
  "“": "\"", "”": "\"", "‘": "'", "’": "'",
  "—": "-", "–": "-", "…": "...",
  "₹": "Rs.", "€": "EUR", "£": "GBP", "¥": "YEN",
  "°": " deg", "±": "+/-", "×": "*", "÷": "/",
  "≤": "<=", "≥": ">=", "≠": "!=", "≈": "~=",
  "∞": "INF", "√": "sqrt", "π": "pi", "Ω": "Ohm", "µ": "u",
  "©": "(c)", "®": "(R)", "™": "(TM)", "•": "*"
};

function encodeForLiFi(text) {
  let result = text;
  for (const [emoji, token] of Object.entries(SPECIAL_REACTIONS)) {
    result = result.split(emoji).join(token);
  }
  for (const [emoji, word] of Object.entries(UNIVERSAL_EMOJIS)) {
    result = result.split(emoji).join(word);
  }
  for (const [sym, ascii] of Object.entries(SPECIAL_SYMBOLS)) {
    result = result.split(sym).join(ascii);
  }
  result = result.replace(/[^\x20-\x7E]/g, "").trim();
  return result || "MSG";
}

const hiddenVideo = document.createElement("video");
hiddenVideo.setAttribute("playsinline", "");
hiddenVideo.muted = true;
hiddenVideo.style.display = "none";
document.body.appendChild(hiddenVideo);

async function getUniversalTorchTrack() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;

  const extractTorchTrack = async (stream) => {
    const track = stream.getVideoTracks()[0];
    if (!track) return null;

    hiddenVideo.srcObject = stream;
    await hiddenVideo.play().catch(() => {});
    await sleep(150);

    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (caps.torch) return { track, stream };

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
    const envStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }
    });
    const envResult = await extractTorchTrack(envStream);
    if (envResult) return envResult;

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
  const rawMessage = messageInput.value.trim();
  if (!rawMessage) {
    statusText.textContent = "Status: Enter a message, symbol, or emoji first.";
    return;
  }

  const payload = encodeForLiFi(rawMessage);

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
          throw new Error("Hardware LED not supported in this browser. Select 'Auto' or 'Screen Flash'.");
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

    // 1. 2x Fast Start Bit (350ms ON, 130ms OFF)
    await setLight(true);
    await sleep(350);
    await setLight(false);
    await sleep(130);

    // 2. Transmit XOR-encrypted bits (1 = 180ms, 0 = 60ms, gap = 110ms)
    for (let i = 0; i < payload.length; i++) {
      const encryptedByte = payload.charCodeAt(i) ^ SECRET_KEY;

      for (let bitPos = 7; bitPos >= 0; bitPos--) {
        const bit = (encryptedByte >> bitPos) & 1;

        await setLight(true);
        await sleep(bit === 1 ? 180 : 60);
        await setLight(false);
        await sleep(110);
      }
    }

    statusText.textContent = `Status: Sent "${rawMessage}" -> "${payload}" via ${useScreen ? "Screen Flash" : "Rear Flashlight"}.`;
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
