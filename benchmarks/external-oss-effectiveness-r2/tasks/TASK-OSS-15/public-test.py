from pydantic import SecretStr


assert SecretStr("caf\u00e9") == SecretStr("caf\u00e9")
assert SecretStr("caf\u00e9") != SecretStr("cafe")

