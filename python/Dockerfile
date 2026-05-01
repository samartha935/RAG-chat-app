FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the model so it's baked into the image
# This prevents downloading it every time the container starts
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2')"

# Copy the script
COPY embed.py .

# Run with unbuffered output (-u) so we get responses immediately in Node.js
CMD ["python", "-u", "embed.py"]
