from typing import AsyncIterable

from fastapi import APIRouter, FastAPI
from pydantic import BaseModel


class Item(BaseModel):
    name: str


router = APIRouter()


@router.get("/events")
async def events() -> AsyncIterable[Item]:
    yield Item(name="public")


app = FastAPI()
app.include_router(router, prefix="/api")
response = app.openapi()["paths"]["/api/events"]["get"]["responses"]["200"]
assert response["content"]["application/jsonl"]["itemSchema"] == {
    "$ref": "#/components/schemas/Item"
}

