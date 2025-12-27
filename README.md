# ThinkLoud MVP

## Prerequisites
- Python 3.10+
- Node.js & npm
- Expo Go app on your phone (or Simulator)

## 1. Backend Setup
The backend handles the "Gender Pronoun Correction" logic and data storage.

1. Navigate to the root directory.
2. Install Python dependencies (if not already installed):
   ```bash
   pip install fastapi uvicorn pydantic
   # If you need OpenAI for the LLM part (optional for MVP demo if using mocks)
   # pip install openai
   ```
3. Start the server:
   ```bash
   python app.py
   ```
   The server runs on `http://0.0.0.0:8000`.

## 2. Frontend Setup
The frontend is an Expo React Native app.

1. Navigate to the frontend directory:
   ```bash
   cd front
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npx expo start --clear
   ```
   (The `--clear` flag is important to fix any cache issues with Reanimated).

## 3. Usage Guide
1. **Home Screen**:
   - Tap the **Mic** icon to "Start Recording" (Visual demo).
   - Tap **Pause** or **Stop**.
   - After stopping, a **Text Input Modal** appears.
   - **Type/Dictate** your reflection (e.g., "他今天很开心，但是她有点难过").
   - Click **Process**.

2. **Review Screen**:
   - The app displays the processed text.
   - **Highlights**: Gender pronouns (TA, 他, 她) are highlighted in Gold.
   - **Edit**: Tap the text to manually edit.
   - **Refine with AI**: Tap the button to trigger the LLM refinement endpoint.
   - **Role Settings**: Tap "Role Settings" to update the character's gender/name in the database.

## Troubleshooting
- **Network Error**: Ensure your phone/simulator is on the same Wi-Fi as your computer.
  - If using Android Emulator, the code uses `10.0.2.2`.
  - If using iOS Simulator, it uses `localhost`.
  - If using a physical device, update `front/src/services/api.js` with your computer's local IP (e.g., `192.168.1.x`).
- **Reanimated Error**: If you see "Worklet mismatch", stop the server and run `npx expo start --clear`.
