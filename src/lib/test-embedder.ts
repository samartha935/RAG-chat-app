import { chunkText } from "./chunker";
import { generateEmbeddings } from "./embedder";

async function main() {
  console.log("--- 1. Testing Chunker ---");
  const sampleText = `Retrieval-Augmented Generation (RAG) is the process of optimizing the output of a large language model, so it references an authoritative knowledge base outside of its training data sources before generating a response.

This ensures that the model is using up-to-date and specific information. 
Our chunker will split this text so it fits neatly into the embedder's context window.

Let's make sure it handles newlines and overlaps properly!`;

  // Using a small max size to force it to split our short text
  const chunks = chunkText(sampleText, 150, 30);
  console.log(`Generated ${chunks.length} chunks:`);
  chunks.forEach((c, i) => console.log(`[Chunk ${i}] (${c.length} chars): ${c.replace(/\n/g, '\\n')}`));

  console.log("\n--- 2. Testing Embedder ---");
  console.log("Sending chunks to the Python Docker container...");
  
  const startTime = Date.now();
  try {
    const vectors = await generateEmbeddings(chunks);
    const duration = Date.now() - startTime;
    
    console.log(`\nReceived ${vectors.length} vectors back in ${duration}ms.`);
    vectors.forEach((v, i) => {
      console.log(`Vector [${i}] dimensions: ${v.length}, first 3 vals: [${v[0].toFixed(4)}, ${v[1].toFixed(4)}, ${v[2].toFixed(4)}...]`);
    });
    console.log("\n✅ Embedder and Chunker test successful!");
  } catch (error) {
    console.error("\n❌ Embedder test failed:", error);
  }
  
  // Force exit to close the child process spawn
  process.exit(0);
}

main();
