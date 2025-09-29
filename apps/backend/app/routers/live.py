from fastapi import APIRouter, Response, status

router = APIRouter()

@router.get("/live", status_code=status.HTTP_204_NO_CONTENT)
def live() -> Response:
    # Pure liveness: process started, router mounted.
    return Response(status_code=status.HTTP_204_NO_CONTENT)

__all__ = ["router"]
