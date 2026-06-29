import os
import time
import sys

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
                "name": "Frontend",
                "path": os.getcwd(),
                "command": "python -c \"import os; print('WINPTY ENV FRONTEND_PORT=' + os.environ.get('FRONTEND_PORT', 'missing'))\"",
            }
        ]
    }]

if __name__ == '__main__':
    pm = ProcessManager(api=None, get_projects_callback=mock_get_projects)

    print("--- Starting Service ---")
    pm.start_service("proj_1", "srv_1")
    
    time.sleep(3)
    
    print("\n--- Process Logs ---")
    for key, log_list in pm.logs.items():
        print(f"\nLogs for {key}:")
        for log in log_list:
            print(log.strip())
