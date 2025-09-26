import os

# Simple module to expose git metadata (passed via environment at build/deploy time)
GIT_BRANCH = os.getenv("GIT_BRANCH", "unknown")
GIT_COMMIT = os.getenv("GIT_COMMIT", "unknown")
BUILD_TIME = os.getenv("BUILD_TIME", "unknown")

__all__ = ["GIT_BRANCH", "GIT_COMMIT", "BUILD_TIME"]
