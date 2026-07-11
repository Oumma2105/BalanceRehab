# BalanceRehab ESP32 Balance Board

This firmware streams four ultrasonic sensor readings from an ESP32 to the
BalanceRehab FastAPI backend over USB serial first.

## Serial Protocol

Open the ESP32 serial port at:

```text
115200 baud
```

The sketch writes one clean JSON object per line using the current directional
sensor layout:

```json
{"t":12345,"front":12.412,"rear":12.980,"left":12.822,"right":12.103,"status":"ok","quality":{"front":"ok","rear":"ok","left":"ok","right":"ok"}}
```

Fields:

- `t`: ESP32 timestamp in milliseconds.
- `front`, `rear`, `left`, `right`: filtered raw distance readings in centimeters.
- `status`: `ok` or `sensor_warning`.
- `quality`: per-sensor health for the four directional sensors.
- `errors`: present when a sensor is out of range or timing out.

The backend performs baseline subtraction, AP/ML sway proxy estimation,
smoothing, storage, and aggregate metrics. It also still accepts the previous
corner format (`fl`, `fr`, `rl`, `rr`) if you later move to corner-mounted
sensors. These are estimated board sway indicators, not force-plate
center-of-pressure measurements.

## Sensor Wiring

Default pins in `BalanceRehabBoard.ino`:

| Sensor | Trigger | Echo |
|---|---:|---:|
| Front | GPIO 5 | GPIO 18 |
| Rear | GPIO 17 | GPIO 16 |
| Left | GPIO 19 | GPIO 21 |
| Right | GPIO 23 | GPIO 22 |

Power depends on your ultrasonic module. Many HC-SR04 modules use 5V echo;
protect ESP32 GPIO with a voltage divider or use 3.3V-safe ultrasonic modules.

## Arduino IDE Setup

Install the ESP32 board support package, flash the sketch, and open Serial
Monitor at `115200` to confirm JSON lines are streaming.

## Test Flow

1. Start backend:

   ```powershell
   cd backend
   venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
   ```

2. Open Settings > ESP32 USB serial.
3. Scan ports, select the ESP32 COM port, keep baud rate at `115200`, and connect.
4. Run Start calibration for 3-5 seconds while the board is still.
5. Start an ESP32 USB serial assessment and watch the live sway graphs update.

## Notes

This remains an educational rehabilitation-support prototype. The ultrasonic
readings estimate board motion; they are not force-plate center-of-pressure
measurements.
