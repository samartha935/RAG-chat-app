import { spawn, ChildProcess } from "child_process";

type EmbeddingTask = {
  texts: string[];
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
};

class EmbedderQueue {
  private process: ChildProcess | null = null;
  private queue: EmbeddingTask[] = [];
  private isProcessing = false;

  private startProcess() {
    if (this.process) return;

    this.process = spawn("docker", ["run", "-i", "--rm", "rag-embedder"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";

    this.process.stdout?.on("data", (data) => {
      buffer += data.toString();

      // fastembed in Python will output one JSON line per request
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep the last incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;

        const currentTask = this.queue[0];
        if (!currentTask) {
          console.warn("[Embedder] Received data but no task in queue");
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          if (parsed.error) {
            currentTask.reject(new Error(parsed.error));
          } else {
            currentTask.resolve(parsed);
          }
        } catch {
          currentTask.reject(new Error("Failed to parse embedder output: " + line));
        } finally {
          this.queue.shift(); // Remove the completed task
          this.isProcessing = false;
          this.processNext(); // Process next item in queue
        }
      }
    });

    this.process.stderr?.on("data", (data) => {
      console.error("[Embedder Stderr]", data.toString());
    });

    this.process.on("close", (code) => {
      console.log(`[Embedder] Process exited with code ${code}`);
      this.process = null;

      // If there are still items in the queue, restart the process
      if (this.queue.length > 0) {
        this.startProcess();
        this.isProcessing = false;
        this.processNext();
      }
    });
  }

  private processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    if (!this.process) {
      this.startProcess();
    }

    const task = this.queue[0];
    const payload = JSON.stringify(task.texts) + "\n";
    this.process?.stdin?.write(payload);
  }

  /**
   * Generates embeddings for an array of texts.
   */
  public embed(texts: string[]): Promise<number[][]> {
    return new Promise((resolve, reject) => {
      this.queue.push({ texts, resolve, reject });
      this.processNext();
    });
  }
}

// Singleton instance
export const embedder = new EmbedderQueue();

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return embedder.embed(texts);
}
