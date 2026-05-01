import sys
import json
import logging
from fastembed import TextEmbedding

# Suppress noisy logs
logging.basicConfig(level=logging.ERROR)

def main():
    # Initialize model (will use cached version downloaded in Dockerfile)
    try:
        model = TextEmbedding(model_name="sentence-transformers/all-MiniLM-L6-v2")
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {str(e)}"}), flush=True)
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
            
        try:
            data = json.loads(line)
            
            # Ensure it's a list of strings
            if isinstance(data, str):
                texts = [data]
            elif isinstance(data, list) and all(isinstance(i, str) for i in data):
                texts = data
            else:
                print(json.dumps({"error": "Input must be a string or a list of strings."}), flush=True)
                continue
                
            # Generate embeddings
            embeddings_generator = model.embed(texts)
            
            # Convert to list of lists of floats
            embeddings = [list(e) for e in embeddings_generator]
            
            # Print single JSON line
            print(json.dumps(embeddings), flush=True)
            
        except json.JSONDecodeError:
            print(json.dumps({"error": "Invalid JSON format."}), flush=True)
        except Exception as e:
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
