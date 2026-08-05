from httpx._decoders import TextChunker


assert TextChunker().decode("") == []
