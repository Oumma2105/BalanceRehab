from app.services.serial_acquisition import SerialAcquisitionService


def test_disconnect_clears_previous_error():
    service = SerialAcquisitionService()
    service._state.status = "error"
    service._state.error = "Could not open COM99: boom"

    status = service.disconnect()

    assert status["connected"] is False
    assert status["status"] == "disconnected"
    assert status["error"] is None


def test_status_reports_disconnected_by_default():
    service = SerialAcquisitionService()
    status = service.status()
    assert status["connected"] is False
    assert status["error"] is None
