import uuid

from pydantic import BaseModel, ConfigDict


class PhraseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    text_es: str
    is_default: bool
