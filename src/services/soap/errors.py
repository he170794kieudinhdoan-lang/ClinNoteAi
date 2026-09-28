class SoapFailure(Exception):  # noqa: N818 - shared API failure type
    def __init__(self, stage: str, code: str, message: str, status: int = 502, run_id: str | None = None):
        super().__init__(message)
        self.stage = stage
        self.code = code
        self.message = message
        self.status = status
        self.run_id = run_id

    def as_dict(self) -> dict:
        return {"stage": self.stage, "code": self.code, "message": self.message, "run_id": self.run_id}
