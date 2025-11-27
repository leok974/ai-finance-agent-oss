# GPU Setup for Windows/WSL2 NVIDIA

## Prerequisites
- Docker Desktop with WSL2 engine enabled
- WSL integration enabled in Docker Desktop settings
- NVIDIA drivers installed on Windows host
- NVIDIA Container Toolkit (typically auto-installed)

## Configuration
Use `gpus: all` in docker-compose for reliable GPU passthrough:

```yaml
services:
  ollama:
    image: ollama/ollama:latest
    gpus: all
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=compute,utility
```

## Verification
Verify GPU access inside container:
```bash
docker compose exec ollama nvidia-smi
```

Expected output should show your GPU details (e.g., RTX 5070 Ti with VRAM info).

## Troubleshooting
- If `nvidia-smi` fails: Check Docker Desktop GPU support is enabled
- If `deploy.resources.reservations` doesn't work: Use `gpus: all` instead (Swarm vs Compose difference)
- Models in "low vram mode": Normal for <20GB VRAM; performance still improved vs CPU

## Performance Notes
- Ollama automatically detects and uses GPU for inference
- Single uvicorn worker recommended to avoid request pileup on single model
- Persistent volume prevents model re-downloads: `ollama-models:/root/.ollama`
