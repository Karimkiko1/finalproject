# How to Run the React App

1. **Install dependencies**
   ```
   npm install
   ```

2. **Set up environment variables**
   Create a `.env` file in the `frontend` folder with:
   ```
   REACT_APP_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   REACT_APP_GOOGLE_API_KEY=your-google-api-key
   ```

3. **Start the development server**
   ```
   npm start
   ```

4. **Open the app**
   Go to [http://localhost:3000](http://localhost:3000) in your browser.

---

**Notes:**
- Use your Google Cloud OAuth Client ID and API Key (not the service account JSON).
- Restart the dev server after editing `.env`.

---

# Troubleshooting: App Not Starting

If `npm start` does nothing or hangs, try the following steps:

1. **Check for errors in the terminal.**
   - If you see errors, read them carefully. Missing dependencies? Try:
     ```
     npm install
     ```

2. **Check your `package.json` scripts.**
   - Make sure you have:
     ```json
     "scripts": {
       "start": "webpack serve --mode development --open",
       "build": "webpack --mode production"
     }
     ```
   - If you are using Create React App, the start script should be:
     ```json
     "start": "react-scripts start"
     ```

3. **If using Create React App:**
   - Make sure you have `react-scripts` installed:
     ```
     npm install react-scripts
     ```

4. **If using Webpack:**
   - Make sure you have `webpack`, `webpack-cli`, and `webpack-dev-server` installed.
   - Check for a `webpack.config.js` file in your `frontend` folder.

5. **Try deleting `node_modules` and reinstalling:**
   ```
   rm -rf node_modules
   npm install
   ```

6. **Check for port conflicts.**
   - Make sure nothing else is running on port 3000 or 8080.

7. **Check your `.env` file.**
   - Make sure it is in the `frontend` folder and variables are correct.

8. **Try running:**
   ```
   npm run build
   ```
   - If this fails, there may be a syntax or config error.

9. **Check for missing entry point.**
   - Make sure you have `src/index.js` and `public/index.html`.

10. **If you see nothing in the browser, check the browser console for errors.**

---

If you still have issues, please copy any error messages you see in the terminal or browser console and share them for further help.
