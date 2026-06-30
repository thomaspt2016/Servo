# Development Guide

If you'd like to modify Servo's source code, contribute features, or just tinker around, follow this guide to set up the development environment.

## Debug Mode

By default, Servo loads the pre-compiled production build. To enable hot-reloading for the frontend, you must run it in Debug Mode.

1. Open `app.py`.
2. Find the debug flag (typically near the top of the file) and set it to `True`:
   ```python
   DEBUG = True
   ```

## Starting the Dev Servers

When `DEBUG = True`, the Python backend will attempt to load the frontend from the local Vite development server instead of static files.

**1. Start the React Frontend:**
```bash
cd gui
npm install
npm run dev
```

**2. Start the Python Backend:**
Open a new terminal window/tab:
```bash
.\servo\Scripts\python.exe app.py
```

Any changes you make to the React code (`gui/src/*`) will now hot-reload instantly in the Servo window!

## Building for Production

Once you are satisfied with your frontend changes, compile the assets so they can be bundled with the application.

```bash
cd gui
npm run build
```

Then, set `DEBUG = False` back in `app.py`. When you run the Python app, it will now load the newly compiled assets from `gui/dist`.
