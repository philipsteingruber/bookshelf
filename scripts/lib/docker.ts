import Docker from "dockerode";

export const CONTAINER_NAME = "calibre-web-automated";

export const docker = new Docker();

export async function stopContainer(): Promise<void> {
  const container = docker.getContainer(CONTAINER_NAME);
  try {
    await container.stop();
    console.log(`Stopped ${CONTAINER_NAME}.`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 304) {
      console.log(`${CONTAINER_NAME} was already stopped.`);
      return;
    }
    console.error(`Failed to stop ${CONTAINER_NAME}:`, err);
    process.exit(1);
  }
}

export async function startContainer(): Promise<void> {
  const container = docker.getContainer(CONTAINER_NAME);
  try {
    await container.start();
    console.log(`Started ${CONTAINER_NAME}.`);
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 304) {
      console.log(`${CONTAINER_NAME} was already running.`);
      return;
    }
    console.error(`Failed to restart ${CONTAINER_NAME} — restart it manually:`, err);
  }
}
