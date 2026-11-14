# Echo Check+ (STEMergent Hacks 2026)

A browser tool that estimates a classroom's echo time (reverberation time, T20 in the 500, 1000 and 2000 Hz octave bands) from four hand claps, and compares it with the ANSI/ASA S12.60-2010 Part 1 limit (0.6 s up to 10,000 ft³, 0.7 s up to 20,000 ft³).

- **App:** `app/` (open `index.html` over HTTPS or localhost; the microphone needs a secure page).
- **Engine:** `engine/echo-engine.js` (no dependencies). Tests: `node engine/test/engine.test.js`.
- **Recorder test page:** `recorder/` (raw WAV capture for device tests).
- **Accuracy evidence:** `engine/REFERENCE_VALUES.md`.

It is a screening estimate, not a certified measurement. It cannot measure background-noise level (the microphone is not calibrated). All audio is analysed in the browser; nothing is uploaded.

This repository is the public hosting copy. Development happens in the team's private repository.
