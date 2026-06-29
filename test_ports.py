import os
import time
import sys

# Add backend to path so we can import
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
from process_manager import ProcessManager

def mock_get_projects():
    return [{
        "id": "proj_1",
        "name": "Test Project",
        "path": os.getcwd(),
        "services": [
            {
                "id": "srv_1",
                "name": "Python Backend",
                "path": os.getcwd(),
                "command": "cmd.exe /c set PORT && cmd.exe /c set PYTHON_BACKEND_PORT && cmd.exe /c set FRONTEND_VITE_PORT",
            },
            {
                "id": "srv_2",
                "name": "Frontend Vite",
                "path": os.getcwd(),
                "command": "cmd.exe /c set PORT && cmd.exe /c set PYTHON_BACKEND_PORT && cmd.exe /c set FRONTEND_VITE_PORT",
            }
        ]
    }]

if __name__ == '__main__':
    pm = ProcessManager(api=None, get_projects_callback=mock_get_projects)

    print("--- Starting Python Backend ---")
    pm.start_service("proj_1", "srv_1")
    
    print("\n--- Starting Frontend ---")
    pm.start_service("proj_1", "srv_2")

    print("\nWaiting for processes to finish executing and log output...")
    time.sleep(3)

    print("\n--- Allocated Ports Dictionary ---")
    print(pm.allocated_ports)
    
    # Process manager stores logs
    print("\n--- Process Logs ---")
    for key, log_list in pm.logs.items():
        print(f"\nLogs for {key}:")
        for log in log_list:
            print(log.strip())
