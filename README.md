# FineMorse

Node.js / Electron CW receiver and audio Morse transmitter for the original Icom IC-7300 (default CI-V address `94h`).

## Run on Windows

Install Node.js 22 or newer and the Icom USB driver, then from this checkout:

```powershell
npm ci
npm start
```

Select the radio's USB audio **input**, click **Start listening**, then click the waterfall to select the incoming CW tone (200–1200 Hz). The waterfall scrolls down; its horizontal axis is frequency. The amplitude plot underneath uses height for signal level: left-click a height to set the threshold, right-click to restore auto. Keyboard users can use the threshold input and Auto threshold button.

Pulse lengths, provisional dot/dash symbols, estimated dot length and WPM appear live. The default 30-second history is re-decoded whenever the threshold or dot-duration slider changes. The slider disables automatic speed learning; re-enable the checkbox to resume learning. The history window can be adjusted from 5 to 120 seconds. Completed text older than that window is retained; a character spanning the boundary remains editable until it finishes. Unknown characters appear as `�`. This initial decoder works best on clean, isolated tones and standard Morse spacing; automatic speed estimation can be ambiguous with very few pulses. Click **Run CW demo** to try it without hardware.

## Radio transmission

1. Select the radio's Windows COM port. The app queries `Win32_SerialPortConfiguration` through PowerShell and imports available Windows baud, data-bit, parity and stop-bit settings. If Windows exposes no configuration, it shows a notice and keeps editable defaults of **19200, 8-N-1**. Confirm these match the radio's CI-V USB settings; automatic baud on the radio may require selecting an explicit rate. RTS/DTR hardware keying is disabled.
2. Connect the port. Select the Icom USB audio **output**, transmit WPM, tone and level. Start with low radio power and an appropriate test load.
3. Set the IC-7300 to **USB-D/SSB** with its data modulation source set to **USB**. This application sends audio Morse with CI-V PTT; it does not key the CW jack or select the radio's operating mode. It cannot send a CW carrier by feeding a tone into the radio while the radio is in CW mode.
4. Enable **radio PTT** when ready. Type a supported message and press **Enter**. With PTT disabled this plays a local audio preview through the selected output. Output selection uses Chromium's `AudioContext.setSinkId`; failure to select the device is reported before PTT is keyed.
5. **Stop / PTT off** cancels scheduled audio and requests receive mode. PTT is also released on normal completion, send errors and window close. A main-process watchdog requests PTT off if renderer heartbeats stop for two seconds. A serial disconnect or process/OS crash can prevent delivery of an off command; keep the radio's own transmit timeout configured.

PTT packets: `FE FE 94 E0 1C 00 01 FD` (TX) and `FE FE 94 E0 1C 00 00 FD` (RX). The CI-V address is editable. Serial connection means the port opened; this version does not verify a radio ACK, so it does not establish that the radio received PTT. Close other software that holds the port. CI-V USB echo-back OFF is recommended.

Supported transmit text: A–Z, 0–9, `. , ? / = + - @` and whitespace. Unsupported characters are rejected before transmission. Marks and gaps are scheduled against the audio clock with 5 ms amplitude ramps.

## Cloud development and checks

```sh
npm ci --cache /workspace/.npm-cache
npm test
npm run dev:web
```

The web development server listens on port 5173. The browser workflow provides decoding and audio preview; COM access is available only in Electron. A browser microphone requires a secure context and microphone permission. Hardware is not available in the cloud machine.

With the web server running in another terminal:

```sh
npm run test:ui
```

The UI smoke test uses `/usr/bin/chromium` on Linux; override `CHROMIUM_PATH` for another installation. On Windows install Playwright Chromium with `npx playwright install chromium` first. `SCREENSHOT_PATH` overrides the screenshot location. The Linux headless test passes `--no-sandbox` for the isolated cloud test runner; the Windows desktop application runs with its normal Chromium configuration.

Optional desktop smoke test: `npm run test:desktop` (requires a graphical display on Linux). The cloud instance was validated using a local Xvfb display; Electron's real preload IPC bridge and serial enumeration passed.

Validated: Morse encode/decode and spacing, noisy timing estimates at multiple speeds, retained pulse reclassification, threshold reclassification, provisional symbols, CI-V frame bytes, browser demo, threshold/right-click controls, speed revision, Enter transmission, cancel and synthetic SOS audio through the receive FFT, microphone start/stop, serial command flow and watchdog release with a mock transport. Physical Windows settings import, IC-7300 PTT and USB audio routing still require hardware validation.
