I have analyzed the provided `app.py` and the requirements. The backend is ready and exposes endpoints for text processing (`/entry/process_without_llm`, `/entry/process_with_llm`) and updates.

**Important Note on Voice Recognition:**
The provided backend endpoints accept **text** input (`text: str`), not audio files.
To achieve the "Voice Recording" requirement in the frontend without an existing audio-to-text backend service:

1. I will implement the **Visual Recording UI** (Mic button, animations, waves) as requested.
2. For the actual data, I will implement a **Dictation/Simulation** mode where the app captures text (via keyboard dictation or a debug input) to send to the backend. This ensures the "Gender Pronoun Correction" logic can be demonstrated effectively with the provided backend.

### Plan: Frontend Implementation (Expo + React Native)

**1. Project Setup**

* Initialize a new Expo project in the `front` directory.

* Install necessary dependencies:

  * `expo-linear-gradient` (for the Mesh Gradient).

  * `expo-blur` (for Glassmorphism).

  * `expo-av` (for recording logic/permissions).

  * `react-native-reanimated` (for breathing/wave animations).

  * `react-native-svg` (for icons and visual assets).

  * `axios` (for connecting to `localhost:8000`).

**2. UI/UX Implementation**

* **Design System:** Implement the specific Color System (#4BA5FF to #87E032), Typography (PingFang/SF Pro), and Spacing.

* **Components:**

  * `GradientBackground`: Dynamic mesh gradient.

  * `GlassContainer`: Reusable component for buttons/cards with blur effect.

  * `BreathingMic`: Animated microphone component for the recording state.

  * `Waveform`: Visual feedback during recording.

**3. Feature Implementation**

* **Screen 1: Home/Recorder**

  * **State 1 (Idle):** Large Mic icon, "Archive" and "Profile" buttons.

  * **State 2 (Recording):** Animated waves, "Pause" and "Stop" buttons.

  * **State 3 (Processing):** Loading state while calling `process_without_llm`.

* **Screen 2: Review/Result**

  * Display the transcribed text.

  * **Highlight Logic:** Bold gender pronouns and highlight database-matched names.

  * **Interaction:** Click text to edit (calls `/entry/update`), click name to update role details.

  * **LLM Refinement:** Button/Auto-trigger to call `/entry/process_with_llm` for advanced correction.

**4. Integration**

* Connect the Frontend to the Python Backend (`http://localhost:8000`).

* Handle the data flow: Input -> `process_without_llm` -> Display -> `process_with_llm` -> Final Display.

I will begin by initializing the frontend project and setting up the core UI components.
