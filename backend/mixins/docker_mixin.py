from backend.logger import logger

class DockerMixin:
    def get_docker_containers(self):
        with self._process_manager.lock:
            return self._process_manager.docker_containers.copy()

    def stop_docker_container(self, container_name):
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(container_name)
            container.stop()
            return True
        except Exception as e:
            logger.error(f"Failed to stop docker container {container_name}: {e}")
            return False

    def start_docker_container(self, container_name):
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(container_name)
            container.start()
            return True
        except Exception as e:
            logger.error(f"Failed to start docker container {container_name}: {e}")
            return False

    def get_docker_container_logs(self, container_name):
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(container_name)
            # Get last 1000 lines
            logs = container.logs(tail=1000).decode('utf-8')
            return logs
        except Exception as e:
            logger.error(f"Failed to get docker container logs {container_name}: {e}")
            return str(e)
