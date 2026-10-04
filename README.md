# TaalForge 🕉️

**TaalForge** is a modern, high-precision Classical Indian Music practice studio built for the browser. Whether you are practicing vocals, sitar, tabla, or kathak, TaalForge provides a professional-grade acoustic environment with drift-free rhythm and authentic instrument samples.

## 🌟 Core Features

*   **Professional Tanpura Drone:** Powered by authentic, high-quality studio MP3 recordings. Features independent channel controls, seamless crossfading, String 1 tuning (Pa, Ma, Ni), and micro-tuning (-50 to +50 cents) across octaves 2 to 4.
*   **Acoustic Tabla Engine:** Uses real tabla stroke samples (Dha, Dhin, Ta, Tin, etc.) instead of synthesized sounds for an authentic feel. Supports dynamic velocity phrasing and micro-timing (laya) to mimic human playing.
*   **Precision Web Audio Scheduler:** Built on a robust look-ahead worker algorithm. Zero audio drift, ensuring the metronome stays perfectly in time even if the browser main thread is busy.
*   **Visual Metronome:** An intuitive visual grid that breaks down the taal into vibhags (groupings), highlighting the Sam (beat 1), Tali (claps), and Khali (empty beats).
*   **Auxiliary Instruments:** Layer your practice with Manjira (cymbals), Sur Peti (harmonium drone), and Swar Mandal (harp glissando).
*   **Auto-Pitch Detection:** Use your microphone to sing or play a note, and TaalForge will automatically detect the pitch and tune the Tanpura and Sur Peti to match your root note.
*   **Focus / Practice HUD:** After 30 seconds of inactivity, the UI dims into a battery-saving, distraction-free HUD that displays a massive, pulsing beat counter and elapsed practice time.

## 🛠️ Tech Stack

*   **Frontend Framework:** React 18 + TypeScript + Vite
*   **Styling:** Tailwind CSS (Custom Dark Theme)
*   **State Management:** Zustand
*   **Audio Pipeline:** Native Web Audio API (`AudioContext`, `GainNode`, `ConvolverNode`)
*   **Scheduling:** Web Workers (Chris Wilson's Lookahead Scheduler)

## 🚀 Getting Started

To run TaalForge locally on your machine:

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd taal-forge
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`.

## 🔮 Roadmap / Future Features

TaalForge is actively evolving. Here are some of the planned features to take the app to the next level:

- [ ] **Recording of Tunes:** Allow users to build, save, and share their own custom tihais, kaidas, and tabla compositions directly within the app.
- [ ] **Song to Sargam Converter:** An AI-assisted analysis tool that listens to a recorded song or live microphone input and transcribes the melody into accurate Sargam notes (Sa, Re, Ga, Ma, etc.).
- [ ] **Expanded Raaga Library for Practicing:** Adding a comprehensive directory of Hindustani and Carnatic Raagas with automated Swar Mandal tunings, time-of-day suggestions, and characteristic phrases.
- [ ] **Advanced Tabla Styles:** Adding Vilambit (slow) and Drut (fast) variations for all taals to better accompany different stages of Khayal or instrumental performances.
- [ ] **MIDI Controller Support:** Map physical MIDI keyboards or drum pads to TaalForge's engine for live performances.

## 🙏 Acknowledgements

*   **Tanpura Audio:** High-quality MP3 drone samples sourced from [drshika/tanpura-app](https://github.com/drshika/tanpura-app).
*   **Tabla Audio:** Authentic acoustic tabla strokes sourced from [simran-sawhney/naad-beats](https://github.com/simran-sawhney/naad-beats).

---
*Built with precision and passion for Indian Classical Music.*
