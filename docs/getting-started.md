# Getting Started

Follow these steps to get Servo up and running on your local machine.

## Prerequisites

Make sure you have installed on your system:
- **Node.js** (v18+)
- **Python** (3.x)

## 1. Install Dependencies

Servo comes with a pre-configured Python virtual environment `servo`. To install the necessary Python dependencies:

```bash
.\servo\Scripts\pip.exe install -r requirements.txt
```

## 2. Run the Application

By default, the Python backend (`app.py`) is configured with `DEBUG = False`. This means it will serve the pre-compiled production UI from `gui/dist/index.html`.

Launch the app using the virtual environment:
```bash
.\servo\Scripts\python.exe app.py
```

## Next Steps

- Learn how to manage your local environments in the [Managing Projects](user-guide/managing-projects.md) guide.
- Check out the [Hotkeys & PiP](user-guide/hotkeys-pip.md) guide to improve your workflow.
