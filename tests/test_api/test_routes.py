import pytest


@pytest.mark.asyncio
async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_chat_empty_message(client):
    response = await client.post("/api/v1/chat", json={"message": ""})
    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_agent_status(client):
    response = await client.get("/api/v1/status")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_consultation_soap_flow(client):
    from src.database import engine
    from src.models.base import Base
    import src.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    try:
        import uuid
        from src.database import SessionLocal
        from src.models.patient import Patient
        from src.models.user import User
        from src.models.consultation import Consultation
        
        db = SessionLocal()
        patient = Patient(patient_code="P-TEST-SOAP", full_name="Nguyễn Văn A")
        doctor = User(email="doctor@test.com", full_name="Bác sĩ Kiều Đoàn", role="doctor")
        db.add_all([patient, doctor])
        db.commit()
        
        consultation = Consultation(patient_id=patient.id, doctor_id=doctor.id, status="PROCESSING")
        db.add(consultation)
        db.commit()
        c_id = consultation.id
        db.close()

        # 1. GET when no soap exists -> 404
        res = await client.get(f"/api/v1/consultations/{c_id}/soap")
        assert res.status_code == 404

        # 2. POST save draft SOAP
        run_id = str(uuid.uuid4())
        save_res = await client.post(
            f"/api/v1/consultations/{c_id}/soap",
            json={
                "soap_run_id": run_id,
                "version": 1,
                "status": "DRAFT",
                "subjective": "Đau gối trái",
                "objective": "Sưng nhẹ",
                "assessment": "Thoái hóa khớp",
                "plan": "Nghỉ ngơi",
            },
        )
        assert save_res.status_code == 200
        data = save_res.json()
        assert data["soap_run_id"] == run_id
        assert data["status"] == "DRAFT"

        # 3. GET should now return the saved SOAP
        get_res = await client.get(f"/api/v1/consultations/{c_id}/soap")
        assert get_res.status_code == 200
        get_data = get_res.json()
        assert get_data["soap_run_id"] == run_id
        assert get_data["subjective"] == "Đau gối trái"

        # 4. POST approve SOAP (FINAL)
        approve_res = await client.post(
            f"/api/v1/consultations/{c_id}/soap",
            json={
                "soap_run_id": run_id,
                "version": 2,
                "status": "FINAL",
                "subjective": "Đau gối trái",
                "objective": "Sưng nhẹ",
                "assessment": "Thoái hóa khớp",
                "plan": "Nghỉ ngơi",
            },
        )
        assert approve_res.status_code == 200
        assert approve_res.json()["status"] == "FINAL"
        assert approve_res.json()["approved_at"] is not None

        # 5. Verify consultation status updated to COMPLETED
        db = SessionLocal()
        updated_c = db.query(Consultation).filter(Consultation.id == c_id).first()
        assert updated_c.status == "COMPLETED"
        db.close()
    finally:
        Base.metadata.drop_all(bind=engine)



