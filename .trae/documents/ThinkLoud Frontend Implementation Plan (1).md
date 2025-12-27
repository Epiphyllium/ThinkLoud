I will implement the frontend web application in the `front/` directory using React + Vite. This ensures a modern, responsive, and interactive user experience that meets the high-fidelity design requirements (Glassmorphism, animations, complex state management).

### Project Structure
I will create the following structure in `front/`:
- **Build Tool**: Vite (fast, modern).
- **Framework**: React (component-based, good for state management).
- **Styling**: Standard CSS (or CSS Modules) to precisely match the specific "Design System" (gradients, blur, specific pixel values).

### Implementation Steps

1.  **Initialize Project**:
    - Create `front/` directory.
    - Setup `package.json` and `vite.config.js`.
    - Create entry points (`index.html`, `src/main.jsx`).

2.  **Design System Implementation (CSS)**:
    - Define CSS variables for the **Color System** (Mesh Gradients, Glassmorphism alphas).
    - Set up **Typography** (PingFang SC, SF Pro).
    - Implement **Visual Principles** (Backdrop Blur, Infinite Radius, Breathing animations).

3.  **Core Components**:
    - `App.jsx`: Main container and state orchestrator.
    - `Background.jsx`: Dynamic mesh gradient background.
    - `Recorder.jsx`: The central sphere/mic component with pulse animations.
    - `Controls.jsx`: The 3-button layout (Archive, Record/Pause/Stop, Profile).
    - `Transcript.jsx`: Real-time text display area with specific styling for pronouns.
    - `SummaryCard.jsx`: The result card shown after recording.

4.  **Logic & Integration**:
    - **Voice Recognition**: Use the browser's `Web Speech API` (SpeechRecognition) to convert voice to text in real-time.
    - **Real-time Processing**:
        - As text is captured, send it to `POST /entry/process_without_llm` (debounced) to get rapid pronoun corrections.
        - Highlight "he/she/it" (TA) and known database names as requested.
    - **Final Processing**:
        - When recording stops, send the full text to `POST /entry/process_with_llm` for deep semantic correction.
    - **Data Management**:
        - Handle manual updates via `POST /entry/update` (if user edits text).
        - Handle role updates via `POST /role/update`.

5.  **Verification**:
    - I will start the frontend development server.
    - I will assume the backend is running on port 8000 (I may need to start it or ask you to).
    - I will verify the UI matches the iPhone 13 dimensions and design specs.

### Dependencies
- `react`, `react-dom`
- `lucide-react` (for the icons like Microphone, Folder, User)
- `axios` (for API requests)
